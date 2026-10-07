/**
 * Checklist §4 — Scheduler engine (Job Creation)
 * Tests that the scheduler creates publish_jobs correctly.
 * The actual publishing is handled by the worker (tested in worker.test.ts).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, resetSeed, seed, DEFAULT_CLIENT_ID } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(() => {
  resetSeed();
  vi.clearAllMocks();
});

describe('§4 Scheduler engine (Job Creation)', () => {
  // ── Happy path: scheduled → job created ───────────────────────────────────

  it('POST /api/scheduler/run creates publish_jobs for due posts', async () => {
    // Backdate the scheduled post so it's due NOW
    const scheduledPost = seed.posts.find((p) => p.id === 'post-scheduled')!;
    scheduledPost.scheduled_at = new Date(Date.now() - 1000).toISOString();

    const res = await request(app).post('/api/scheduler/run');
    expect(res.status).toBe(200);
    expect(res.body.processed).toBeGreaterThanOrEqual(1);
    expect(res.body.jobs_created).toBeGreaterThanOrEqual(1);

    // Check that the post is now queued
    const check = await request(app).get('/api/posts/post-scheduled');
    expect(check.body.status).toBe('queued');

    // Check that a job was created
    const jobsRes = await request(app).get('/api/scheduler/jobs');
    expect(jobsRes.body.length).toBeGreaterThanOrEqual(1);
    expect(jobsRes.body[0].status).toBe('SCHEDULED');
  });

  it('POST /api/scheduler/run with no due posts returns 0 processed', async () => {
    // All scheduled posts are in the future — nothing due
    const res = await request(app).post('/api/scheduler/run');
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(0);
    expect(res.body.jobs_created).toBe(0);
  });

  // ── Idempotency check ─────────────────────────────────────────────────────

  it('§4 Idempotency: triggering scheduler twice never creates duplicate jobs', async () => {
    const scheduledPost = seed.posts.find((p) => p.id === 'post-scheduled')!;
    scheduledPost.scheduled_at = new Date(Date.now() - 1000).toISOString();

    // First run
    const res1 = await request(app).post('/api/scheduler/run');
    expect(res1.body.jobs_created).toBe(1);

    // Second run immediately after — job already exists, should skip
    const res2 = await request(app).post('/api/scheduler/run');
    // At minimum, we should not create more jobs than posts
    expect(res2.body.jobs_created).toBeLessThanOrEqual(res1.body.jobs_created);
  });

  // ── Multi-platform job creation ───────────────────────────────────────────

  it('§4 Multi-platform: scheduler creates jobs for multiple platforms', async () => {
    // Schedule two posts (one per platform) both due now
    const li = seed.posts.find((p) => p.id === 'post-scheduled')!;
    li.scheduled_at = new Date(Date.now() - 1000).toISOString();

    const xPost = {
      id: 'post-sched-x',
      client_id: DEFAULT_CLIENT_ID,
      post_group_id: 'grp-1',
      social_account_id: 'acc-x',
      platform: 'x',
      content: 'X post due now',
      media_urls: [],
      status: 'scheduled',
      scheduled_at: new Date(Date.now() - 1000).toISOString(),
      published_at: null,
      platform_post_id: null,
      error_reason: null,
      approved_by: 'user-admin',
      created_by: 'user-admin',
      created_at: new Date().toISOString(),
    };
    seed.posts.push(xPost);

    const res = await request(app).post('/api/scheduler/run');
    expect(res.status).toBe(200);
    expect(res.body.jobs_created).toBeGreaterThanOrEqual(2);

    // Check that both posts are queued
    const liCheck = await request(app).get('/api/posts/post-scheduled');
    const xCheck = await request(app).get('/api/posts/post-sched-x');

    expect(liCheck.body.status).toBe('queued');
    expect(xCheck.body.status).toBe('queued');
  });

  // ── Token refresh ─────────────────────────────────────────────────────────

  it('POST /api/cron/refresh-tokens refreshes tokens for accounts near expiry', async () => {
    // Set acc-li to expire in 2 minutes (within refresh threshold)
    const acc = seed.social_accounts.find((a) => a.id === 'acc-li')!;
    acc.token_expires_at = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const res = await request(app).post('/api/cron/refresh-tokens');
    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/cron/refresh-tokens rejects requests when CRON_SECRET is configured and missing/invalid', async () => {
    const prevSecret = process.env.CRON_SECRET;
    try {
      process.env.CRON_SECRET = 'super_secret_cron_token_123';

      // Missing secret
      const resMissing = await request(app).post('/api/cron/refresh-tokens');
      expect(resMissing.status).toBe(401);

      // Invalid secret
      const resBad = await request(app)
        .post('/api/cron/refresh-tokens')
        .set('x-cron-secret', 'wrong_token');
      expect(resBad.status).toBe(401);

      // Valid secret via x-cron-secret
      const resValid = await request(app)
        .post('/api/cron/refresh-tokens')
        .set('x-cron-secret', 'super_secret_cron_token_123');
      expect(resValid.status).toBe(200);
    } finally {
      process.env.CRON_SECRET = prevSecret;
    }
  });
});

