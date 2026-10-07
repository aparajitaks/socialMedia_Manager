import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { publishingQueueWorker } from '../queue/publisher-worker.js';
import { requireAuth } from './auth.js';

const router = Router();

/**
 * Core Scheduler Run Cycle:
 * 1. Checks due scheduled posts
 * 2. Creates publish_jobs for posts that don't have them yet
 * 3. Does NOT directly publish - that's the worker's responsibility
 *
 * The scheduler is now a job creation service only.
 * The worker (publisher-worker.ts) handles the actual publishing.
 */
export async function runSchedulerCycle() {
  const results = [];

  try {
    // Get due scheduled posts
    const duePosts = await db.getDueScheduledPosts();

    for (const post of duePosts) {
      // Check if a publish job already exists for this post
      const scheduledAt = post.scheduled_at || new Date().toISOString();
      const idempotencyKey = `idemp_${post.id}_${post.social_account_id}_${new Date(scheduledAt).getTime()}`;

      // Check existing jobs by idempotency key
      const existingJob = await db.getPublishJobByIdempotencyKey(idempotencyKey);

      if (existingJob) {
        // Job already exists, skip
        results.push({
          id: post.id,
          status: 'job_exists',
          jobId: existingJob.id,
          message: 'Publish job already exists',
        });
        continue;
      }

      // Create a new publish job
      const job = await publishingQueueWorker.enqueuePost(post);

      // Update post status to indicate it's queued for publishing
      await db.updatePost(post.id, { status: 'queued' });

      results.push({
        id: post.id,
        status: 'job_created',
        jobId: job.id,
        scheduled_at: job.scheduled_at,
        message: 'Publish job created',
      });
    }

    return {
      processed: results.length,
      jobs_created: results.filter((r) => r.status === 'job_created').length,
      jobs_skipped: results.filter((r) => r.status === 'job_exists').length,
      processed_count: results.filter((r) => r.status === 'job_created').length, // frontend compat
      timestamp: new Date().toISOString(),
      results,
    };
  } catch (err: any) {
    console.error('Scheduler cycle error:', err);
    throw err;
  }
}

import { requireCronSecret } from './cron.js';

// POST /api/scheduler/run (Protected: requires cron secret in production)
// This endpoint only creates jobs - the worker processes them
router.post('/run', requireCronSecret, async (req: Request, res: Response) => {
  try {
    const outcome = await runSchedulerCycle();
    res.json(outcome);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scheduler/worker/run (Protected: triggers the worker to process jobs)
// This is the endpoint that actually processes queued jobs
router.post('/worker/run', requireCronSecret, async (req: Request, res: Response) => {
  try {
    const outcome = await publishingQueueWorker.processDueJobs();
    res.json(outcome);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scheduler/jobs — inspect publishing queue (tenant-scoped for authenticated users)
router.get('/jobs', requireAuth, async (req: Request, res: Response) => {
  try {
    const callerOrgId: string | undefined = (req as any).organizationId;
    const { status, postId, clientId, limit } = req.query;

    let filterClientId = clientId as string | undefined;

    // If org-scoped, constrain to clients belonging to the org
    if (callerOrgId && !filterClientId) {
      const orgClients = await db.getClients(callerOrgId);
      if (orgClients.length === 0) {
        return res.json([]);
      }
      // Return jobs for all org clients
      const allJobs = (
        await Promise.all(
          orgClients.map((c) =>
            db.getPublishJobs({ clientId: c.id, status: status as string | undefined, limit: limit ? Number(limit) : undefined })
          )
        )
      )
        .flat()
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
      return res.json(postId ? allJobs.filter((j) => j.post_id === postId) : allJobs);
    }

    const jobs = await db.getPublishJobs({
      clientId: filterClientId,
      postId: postId as string | undefined,
      status: status as string | undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scheduler/jobs/:id/cancel — Cancel a specific publish job (§22)
router.post('/jobs/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const callerOrgId: string | undefined = (req as any).organizationId;
    const job = await db.cancelPublishJob(req.params.id, callerOrgId);
    res.json({ success: true, job });
  } catch (err: any) {
    if (err.message?.includes('not found')) return res.status(404).json({ error: err.message });
    if (err.message?.includes('Unauthorized')) return res.status(403).json({ error: err.message });
    if (err.message?.includes('Cannot cancel')) return res.status(409).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scheduler/jobs/:id/retry — Retry a permanently FAILED publish job (§18)
router.post('/jobs/:id/retry', requireAuth, async (req: Request, res: Response) => {
  try {
    const callerOrgId: string | undefined = (req as any).organizationId;
    const job = await db.getPublishJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Publish job not found' });

    // Tenant check
    if (callerOrgId) {
      const client = await db.getClient(job.client_id);
      if (!client || client.organization_id !== callerOrgId) {
        return res.status(403).json({ error: 'Unauthorized: job does not belong to your organization' });
      }
    }

    if (job.status !== 'FAILED' && job.status !== 'CANCELLED') {
      return res.status(409).json({ error: `Can only retry FAILED or CANCELLED jobs (current: ${job.status})` });
    }

    // Reset to SCHEDULED at 1 second from now
    const nextScheduledAt = new Date(Date.now() + 1000).toISOString();
    const retried = await db.updatePublishJob(req.params.id, {
      status: 'SCHEDULED',
      scheduled_at: nextScheduledAt,
      attempt_count: 0,
      last_error: null,
      error_category: null,
      next_retry_at: null,
      locked_at: null,
      locked_by: null,
    });

    res.json({ success: true, job: retried });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scheduler/worker/health — check worker health
router.get('/worker/health', requireCronSecret, async (req: Request, res: Response) => {
  try {
    const health = publishingQueueWorker.getHealth();
    res.json(health);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
