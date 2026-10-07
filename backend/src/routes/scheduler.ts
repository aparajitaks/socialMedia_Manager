import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { publishingQueueWorker } from '../queue/publisher-worker.js';

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

// GET /api/scheduler/jobs — inspect publishing queue
router.get('/jobs', requireCronSecret, async (req: Request, res: Response) => {
  try {
    const jobs = await db.getDuePublishJobs();
    res.json(jobs);
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
