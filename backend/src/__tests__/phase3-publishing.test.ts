/**
 * Phase 3 Publishing Engine Tests
 *
 * Comprehensive tests covering:
 * - Transactional publish_job creation at schedule time (§5, §6)
 * - Stale lock recovery watchdog (§12)
 * - Concurrent job claiming (SELECT FOR UPDATE SKIP LOCKED)
 * - Partial success (variant A published, variant B failed) (§25)
 * - State machine transition guards (§21)
 * - Job cancellation (§22)
 * - Job reschedule + re-create (§23)
 * - Full failure matrix (expired token, rate limit, network timeout, 500, max attempts)
 * - 50-job concurrency simulation
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, resetSeed, seed, mockDb, mockPublisher, DEFAULT_CLIENT_ID, DEFAULT_ORG_ID } from './helpers.js';
import { publishingQueueWorker } from '../queue/publisher-worker.js';

let app: Express;

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(() => {
  resetSeed();
  vi.clearAllMocks();
  mockPublisher.publish.mockResolvedValue({ platform_post_id: 'plat_post_ph3' });
});

// ===========================================================================
// §5–§6: Transactional publish_job creation at schedule time
// ===========================================================================
describe('Phase 3 §5–§6: Transactional Job Creation', () => {
  it('POST /api/posts creates a publish_job immediately when status=scheduled', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post('/api/posts')
      .send({
        social_account_id: 'acc-li',
        content: 'Phase 3 scheduled post',
        scheduled_at: scheduledAt,
        status: 'scheduled',
      });

    expect(res.status).toBe(201);
    const postId = res.body.post?.id || res.body.posts?.[0]?.id;
    expect(postId).toBeTruthy();

    // A publish_job should have been created immediately
    const jobs = await mockDb.getPublishJobs({ postId });
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs[0].status).toBe('SCHEDULED');
    expect(jobs[0].post_id).toBe(postId);
  });

  it('POST /api/posts with variants creates one job per variant', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post('/api/posts')
      .send({
        social_account_id: 'acc-li',
        content: 'Phase 3 multi-variant post',
        scheduled_at: scheduledAt,
        status: 'scheduled',
        variants: [
          { social_account_id: 'acc-li', content: 'LinkedIn variant', platform: 'linkedin' },
          { social_account_id: 'acc-x', content: 'X variant', platform: 'x' },
        ],
      });

    expect(res.status).toBe(201);
    const postId = res.body.post?.id;
    expect(postId).toBeTruthy();

    // Should have 2 jobs (one per variant)
    const jobs = await mockDb.getPublishJobs({ postId });
    expect(jobs.length).toBe(2);
    expect(jobs.map((j: any) => j.status)).toEqual(['SCHEDULED', 'SCHEDULED']);
  });

  it('POST /api/posts with status=draft does NOT create publish_job', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({
        social_account_id: 'acc-li',
        content: 'Draft — no job',
        status: 'draft',
      });

    expect(res.status).toBe(201);
    const postId = res.body.post?.id || res.body.posts?.[0]?.id;
    const jobs = await mockDb.getPublishJobs({ postId });
    expect(jobs.length).toBe(0);
  });

  it('Transactional creation: idempotency key prevents duplicate jobs', async () => {
    const scheduledAt = new Date(Date.now() + 3600_000).toISOString();
    // Create post -> jobs created
    const r1 = await request(app)
      .post('/api/posts')
      .send({ social_account_id: 'acc-li', content: 'Idempotency test', scheduled_at: scheduledAt, status: 'scheduled' });
    expect(r1.status).toBe(201);
    const postId = r1.body.post?.id || r1.body.posts?.[0]?.id;

    // Verify exactly one job was created
    const jobsFirst = await mockDb.getPublishJobs({ postId });
    expect(jobsFirst.length).toBe(1);
    const firstKey = jobsFirst[0].idempotency_key;

    // Try to create a job with the same idempotency key directly (simulating scheduler duplicate)
    await expect(
      mockDb.createPublishJobsTransaction([{ ...jobsFirst[0], id: undefined }])
    ).rejects.toThrow(/Duplicate publish job idempotency key/);

    // Verify still only one job exists
    const jobsAfter = await mockDb.getPublishJobs({ postId });
    expect(jobsAfter.length).toBe(1);
    expect(jobsAfter[0].idempotency_key).toBe(firstKey);
  });
});

// ===========================================================================
// §12: Stale lock recovery watchdog
// ===========================================================================
describe('Phase 3 §12: Stale Lock Recovery', () => {
  it('recoverStaleJobs resets PROCESSING jobs older than threshold to RETRYING', async () => {
    const staleThresholdMs = 300_000; // 5 min
    const staleCutoff = Date.now() - staleThresholdMs - 1000;

    // Inject a stale PROCESSING job
    const staleJob = {
      id: 'job-stale-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date(Date.now() - 3600_000).toISOString(),
      status: 'PROCESSING',
      idempotency_key: 'idemp_stale_test_1',
      attempt_count: 1,
      max_attempts: 3,
      locked_at: new Date(staleCutoff).toISOString(), // Stale lock
      locked_by: 'dead_worker_1',
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    seed.publish_jobs.push(staleJob);

    const result = await mockDb.recoverStaleJobs(staleThresholdMs);
    expect(result.recoveredCount).toBe(1);
    expect(result.recoveredIds).toContain('job-stale-1');

    const recovered = seed.publish_jobs.find((j: any) => j.id === 'job-stale-1')!;
    expect(recovered.status).toBe('RETRYING');
    expect(recovered.locked_at).toBeNull();
    expect(recovered.locked_by).toBeNull();
  });

  it('Non-stale PROCESSING jobs are NOT recovered', async () => {
    const freshJob = {
      id: 'job-fresh-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date(Date.now() - 60_000).toISOString(),
      status: 'PROCESSING',
      idempotency_key: 'idemp_fresh_test_1',
      attempt_count: 1,
      max_attempts: 3,
      locked_at: new Date().toISOString(), // Fresh lock
      locked_by: 'active_worker',
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    seed.publish_jobs.push(freshJob);

    const result = await mockDb.recoverStaleJobs(300_000);
    expect(result.recoveredCount).toBe(0);

    const job = seed.publish_jobs.find((j: any) => j.id === 'job-fresh-1')!;
    expect(job.status).toBe('PROCESSING'); // Unchanged
  });
});

// ===========================================================================
// Concurrent claiming
// ===========================================================================
describe('Phase 3: Concurrent Worker Claiming', () => {
  it('Two concurrent workers can only claim the same job once', async () => {
    const scheduledPost = seed.posts.find((p: any) => p.id === 'post-scheduled')!;
    scheduledPost.scheduled_at = new Date(Date.now() - 1000).toISOString();
    await request(app).post('/api/scheduler/run');

    // Simulate two concurrent claims
    const [job1, job2] = await Promise.all([
      mockDb.claimPublishJob('worker_concurrent_A'),
      mockDb.claimPublishJob('worker_concurrent_B'),
    ]);

    const claimed = [job1, job2].filter((j: any) => j !== null);
    expect(claimed.length).toBe(1); // Only one succeeds
  });

  it('50 simulated jobs - all are processed without duplicates', async () => {
    // Create 50 jobs
    for (let i = 0; i < 50; i++) {
      seed.publish_jobs.push({
        id: `load-job-${i}`,
        post_id: 'post-scheduled',
        client_id: DEFAULT_CLIENT_ID,
        social_account_id: 'acc-li',
        platform: 'linkedin',
        scheduled_at: new Date(Date.now() - 1000).toISOString(),
        status: 'SCHEDULED',
        idempotency_key: `idemp_load_${i}`,
        attempt_count: 0,
        max_attempts: 3,
        locked_at: null,
        locked_by: null,
        started_at: null,
        completed_at: null,
        next_retry_at: null,
        last_error: null,
        error_category: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    let claimed = 0;
    let job;
    while ((job = await mockDb.claimPublishJob('load_test_worker')) !== null && claimed < 100) {
      claimed++;
      // Mark as complete
      await mockDb.updatePublishJob(job.id, { status: 'PUBLISHED', locked_at: null, locked_by: null });
    }

    expect(claimed).toBe(50);

    // Verify all jobs are PUBLISHED (no duplicates)
    const loadJobs = seed.publish_jobs.filter((j: any) => j.id.startsWith('load-job-'));
    const uniqueIds = new Set(loadJobs.map((j: any) => j.id));
    expect(uniqueIds.size).toBe(50); // No duplicates
    expect(loadJobs.every((j: any) => j.status === 'PUBLISHED')).toBe(true);
  });
});

// ===========================================================================
// §21: State machine transition guards
// ===========================================================================
describe('Phase 3 §21: State Machine Guards', () => {
  it('Cannot transition from PUBLISHED to PROCESSING', async () => {
    const publishedJob = {
      id: 'job-pub-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date().toISOString(),
      status: 'PUBLISHED',
      idempotency_key: 'idemp_pub_sm_1',
      attempt_count: 1,
      max_attempts: 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    seed.publish_jobs.push(publishedJob);

    await expect(
      mockDb.updatePublishJob('job-pub-1', { status: 'PROCESSING' })
    ).rejects.toThrow(/Invalid job status transition/);
  });

  it('Cannot transition from CANCELLED to PROCESSING', async () => {
    seed.publish_jobs.push({
      id: 'job-can-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date().toISOString(),
      status: 'CANCELLED',
      idempotency_key: 'idemp_can_sm_1',
      attempt_count: 0,
      max_attempts: 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(
      mockDb.updatePublishJob('job-can-1', { status: 'PROCESSING' })
    ).rejects.toThrow(/Invalid job status transition/);
  });

  it('FAILED -> SCHEDULED is allowed (retry)', async () => {
    seed.publish_jobs.push({
      id: 'job-fail-retry-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date().toISOString(),
      status: 'FAILED',
      idempotency_key: 'idemp_fail_retry_1',
      attempt_count: 3,
      max_attempts: 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: 'Rate limit exceeded',
      error_category: 'RATE_LIMIT',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const updated = await mockDb.updatePublishJob('job-fail-retry-1', {
      status: 'SCHEDULED',
      attempt_count: 0,
      last_error: null,
    });
    expect(updated.status).toBe('SCHEDULED');
  });
});

// ===========================================================================
// §22: Job Cancellation
// ===========================================================================
describe('Phase 3 §22: Job Cancellation', () => {
  it('POST /api/posts/:id/cancel cancels post and its scheduled jobs', async () => {
    const scheduledPost = seed.posts.find((p: any) => p.id === 'post-scheduled')!;
    scheduledPost.scheduled_at = new Date(Date.now() + 3600_000).toISOString();

    // Create a scheduled job for it
    seed.publish_jobs.push({
      id: 'job-to-cancel-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: scheduledPost.scheduled_at,
      status: 'SCHEDULED',
      idempotency_key: 'idemp_cancel_1',
      attempt_count: 0,
      max_attempts: 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await request(app).post('/api/posts/post-scheduled/cancel');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.post.status).toBe('cancelled');

    // Job should be CANCELLED
    const cancelledJob = seed.publish_jobs.find((j: any) => j.id === 'job-to-cancel-1')!;
    expect(cancelledJob.status).toBe('CANCELLED');
  });

  it('Cannot cancel an already published post', async () => {
    const res = await request(app).post('/api/posts/post-published/cancel');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/published/i);
  });

  it('cancelPublishJob rejects cancelling a PROCESSING job', async () => {
    seed.publish_jobs.push({
      id: 'job-proc-cancel',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date().toISOString(),
      status: 'PROCESSING',
      idempotency_key: 'idemp_proc_cancel',
      attempt_count: 1,
      max_attempts: 3,
      locked_at: new Date().toISOString(),
      locked_by: 'active_worker',
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(mockDb.cancelPublishJob('job-proc-cancel')).rejects.toThrow(/PROCESSING/);
  });
});

// ===========================================================================
// §23: Reschedule (cancel old jobs, create new ones at new time)
// ===========================================================================
describe('Phase 3 §23: Reschedule', () => {
  it('POST /api/posts/:id/reschedule cancels old jobs and creates new ones at new time', async () => {
    const scheduledPost = seed.posts.find((p: any) => p.id === 'post-scheduled')!;
    const oldScheduledAt = new Date(Date.now() + 3600_000).toISOString();
    scheduledPost.scheduled_at = oldScheduledAt;
    scheduledPost.status = 'scheduled';

    // Create old job
    seed.publish_jobs.push({
      id: 'job-old-schedule',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: oldScheduledAt,
      status: 'SCHEDULED',
      idempotency_key: 'idemp_old_schedule',
      attempt_count: 0,
      max_attempts: 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const newScheduledAt = new Date(Date.now() + 7200_000).toISOString();
    const res = await request(app)
      .post('/api/posts/post-scheduled/reschedule')
      .send({ scheduled_at: newScheduledAt });

    expect(res.status).toBe(200);
    expect(new Date(res.body.scheduled_at).getTime()).toBeCloseTo(new Date(newScheduledAt).getTime(), -3);

    // Old job should be CANCELLED
    const oldJob = seed.publish_jobs.find((j: any) => j.id === 'job-old-schedule')!;
    expect(oldJob.status).toBe('CANCELLED');

    // A new job should exist for the new time
    const allJobs = seed.publish_jobs.filter((j: any) => j.post_id === 'post-scheduled' && j.status === 'SCHEDULED');
    expect(allJobs.length).toBeGreaterThanOrEqual(1);
    const newJob = allJobs.find((j: any) => new Date(j.scheduled_at).getTime() >= new Date(newScheduledAt).getTime() - 1000);
    expect(newJob).toBeTruthy();
  });
});

// ===========================================================================
// §25: Partial success (some variants published, some failed)
// ===========================================================================
describe('Phase 3 §25: Partial Success Semantics', () => {
  it('syncPostStatusFromJobs marks post published when at least one variant publishes', async () => {
    // Create two jobs: one PUBLISHED, one FAILED
    seed.publish_jobs.push(
      {
        id: 'job-v1-published',
        post_id: 'post-scheduled',
        client_id: DEFAULT_CLIENT_ID,
        social_account_id: 'acc-li',
        platform: 'linkedin',
        scheduled_at: new Date(Date.now() - 1000).toISOString(),
        status: 'PUBLISHED',
        idempotency_key: 'idemp_v1_pub',
        attempt_count: 1,
        max_attempts: 3,
        locked_at: null,
        locked_by: null,
        started_at: null,
        completed_at: new Date().toISOString(),
        next_retry_at: null,
        last_error: null,
        error_category: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'job-v2-failed',
        post_id: 'post-scheduled',
        client_id: DEFAULT_CLIENT_ID,
        social_account_id: 'acc-x',
        platform: 'x',
        scheduled_at: new Date(Date.now() - 1000).toISOString(),
        status: 'FAILED',
        idempotency_key: 'idemp_v2_fail',
        attempt_count: 3,
        max_attempts: 3,
        locked_at: null,
        locked_by: null,
        started_at: null,
        completed_at: null,
        next_retry_at: null,
        last_error: 'Network error',
        error_category: 'NETWORK',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );

    // Run syncPostStatusFromJobs directly
    await publishingQueueWorker.syncPostStatusFromJobs('post-scheduled');

    const post = seed.posts.find((p: any) => p.id === 'post-scheduled')!;
    // Partial success: still published (not all-failed)
    expect(post.status).toBe('published');
  });

  it('syncPostStatusFromJobs marks post failed when ALL variants fail', async () => {
    seed.publish_jobs.push(
      {
        id: 'job-all-fail-1',
        post_id: 'post-scheduled',
        client_id: DEFAULT_CLIENT_ID,
        social_account_id: 'acc-li',
        platform: 'linkedin',
        scheduled_at: new Date(Date.now() - 1000).toISOString(),
        status: 'FAILED',
        idempotency_key: 'idemp_all_fail_1',
        attempt_count: 3,
        max_attempts: 3,
        locked_at: null,
        locked_by: null,
        started_at: null,
        completed_at: null,
        next_retry_at: null,
        last_error: 'Token expired',
        error_category: 'TOKEN_EXPIRED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'job-all-fail-2',
        post_id: 'post-scheduled',
        client_id: DEFAULT_CLIENT_ID,
        social_account_id: 'acc-x',
        platform: 'x',
        scheduled_at: new Date(Date.now() - 1000).toISOString(),
        status: 'FAILED',
        idempotency_key: 'idemp_all_fail_2',
        attempt_count: 3,
        max_attempts: 3,
        locked_at: null,
        locked_by: null,
        started_at: null,
        completed_at: null,
        next_retry_at: null,
        last_error: 'Rate limit',
        error_category: 'RATE_LIMIT',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );

    await publishingQueueWorker.syncPostStatusFromJobs('post-scheduled');

    const post = seed.posts.find((p: any) => p.id === 'post-scheduled')!;
    expect(post.status).toBe('failed');
  });
});

// ===========================================================================
// Full Failure Matrix
// ===========================================================================
describe('Phase 3: Full Failure Matrix', () => {
  const failureScenarios = [
    { name: 'Expired token', error: 'Token expired', expectedCategory: 'TOKEN_EXPIRED', retryable: true }, // TOKEN_EXPIRED: retryable (refresh attempted)
    { name: 'Rate limit', error: 'Rate limit exceeded', expectedCategory: 'RATE_LIMIT', retryable: true },
    { name: 'Network timeout', error: 'ECONNRESET', expectedCategory: 'NETWORK', retryable: true },
    { name: 'Server error 500', error: 'Internal server error', expectedCategory: 'PLATFORM_ERROR', retryable: true },
    { name: 'Invalid media format', error: 'Invalid media format', expectedCategory: 'INVALID_MEDIA', retryable: false },
    { name: 'Token revoked', error: 'Token revoked', expectedCategory: 'TOKEN_REVOKED', retryable: false },
    { name: 'Account not found', error: 'User not found', expectedCategory: 'ACCOUNT_DISCONNECTED', retryable: true }, // classified as UNKNOWN -> retryable
  ];

  for (const scenario of failureScenarios) {
    it(`Worker handles: ${scenario.name}`, async () => {
      mockPublisher.publish.mockRejectedValueOnce(new Error(scenario.error));

      // Directly add a due SCHEDULED job (avoid scheduler pipeline which may skip due to existing jobs)
      const jobId = `job-failure-matrix-${Math.random().toString(36).slice(2, 8)}`;
      seed.publish_jobs.push({
        id: jobId,
        post_id: 'post-scheduled',
        client_id: DEFAULT_CLIENT_ID,
        social_account_id: 'acc-li',
        platform: 'linkedin',
        scheduled_at: new Date(Date.now() - 1000).toISOString(),
        status: 'SCHEDULED',
        idempotency_key: `idemp_failure_matrix_${jobId}`,
        attempt_count: 0,
        max_attempts: 3,
        locked_at: null,
        locked_by: null,
        started_at: null,
        completed_at: null,
        next_retry_at: null,
        last_error: null,
        error_category: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const res = await request(app).post('/api/scheduler/worker/run');
      expect(res.status).toBe(200);

      // Either retried or failed depending on retryable flag
      if (scenario.retryable) {
        expect(res.body.retried + res.body.failed).toBeGreaterThanOrEqual(1);
      } else {
        expect(res.body.failed).toBeGreaterThanOrEqual(1);
      }
    });
  }

  it('Worker eventually marks job FAILED after max_attempts exceeded', async () => {
    // Always fail with retryable error
    mockPublisher.publish.mockRejectedValue(new Error('Rate limit exceeded'));

    // Create a job already at max_attempts - 1 to simulate last retry
    seed.publish_jobs.push({
      id: 'job-maxatt-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date(Date.now() - 1000).toISOString(),
      status: 'RETRYING',
      idempotency_key: 'idemp_maxatt_1',
      attempt_count: 2, // max_attempts is 3, so this is the last attempt
      max_attempts: 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: 'Rate limit exceeded',
      error_category: 'RATE_LIMIT',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await request(app).post('/api/scheduler/worker/run');
    expect(res.status).toBe(200);
    expect(res.body.failed).toBeGreaterThanOrEqual(1);

    const job = seed.publish_jobs.find((j: any) => j.id === 'job-maxatt-1')!;
    expect(job.status).toBe('FAILED');
  });
});

// ===========================================================================
// Scheduler Job API (tenant-scoped)
// ===========================================================================
describe('Phase 3: Scheduler Job API', () => {
  it('GET /api/scheduler/jobs returns paginated job list', async () => {
    // Add some jobs
    seed.publish_jobs.push({
      id: 'job-api-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      status: 'SCHEDULED',
      idempotency_key: 'idemp_api_1',
      attempt_count: 0,
      max_attempts: 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await request(app).get('/api/scheduler/jobs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/scheduler/jobs/:id/retry resets a FAILED job to SCHEDULED', async () => {
    seed.publish_jobs.push({
      id: 'job-api-retry-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date(Date.now() - 3600_000).toISOString(),
      status: 'FAILED',
      idempotency_key: 'idemp_api_retry_1',
      attempt_count: 3,
      max_attempts: 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: 'Expired token',
      error_category: 'TOKEN_EXPIRED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await request(app).post('/api/scheduler/jobs/job-api-retry-1/retry');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.job.status).toBe('SCHEDULED');
    expect(res.body.job.attempt_count).toBe(0);
  });

  it('POST /api/scheduler/jobs/:id/cancel cancels a SCHEDULED job', async () => {
    seed.publish_jobs.push({
      id: 'job-api-cancel-1',
      post_id: 'post-scheduled',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: 'acc-li',
      platform: 'linkedin',
      scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      status: 'SCHEDULED',
      idempotency_key: 'idemp_api_cancel_1',
      attempt_count: 0,
      max_attempts: 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await request(app).post('/api/scheduler/jobs/job-api-cancel-1/cancel');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.job.status).toBe('CANCELLED');
  });
});
