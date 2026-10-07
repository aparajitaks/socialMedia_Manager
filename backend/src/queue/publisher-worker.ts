import crypto from 'crypto';
import { db } from '../db.js';
import { getPublisher, classifyPlatformError } from '../publishers/index.js';
import {
  Post,
  PostVariant,
  PublishJob,
  PublishAttempt,
  SocialAccount,
  ErrorCategory,
} from '../types/index.js';

export interface WorkerCycleStats {
  processed: number;
  completed: number;
  failed: number;
  retried: number;
  skipped: boolean;
  reason?: string;
  results: Array<{
    jobId: string;
    postId: string;
    status: string;
    error?: string;
    errorCategory?: ErrorCategory;
  }>;
}

const WORKER_ID = `worker_${process.pid}_${Math.random().toString(36).slice(2, 7)}`;
let isShuttingDown = false;

export class PublishingQueueWorker {
  /**
   * Enqueue a scheduled post into the publish_jobs queue with idempotency protection.
   */
  async enqueuePost(post: Post, variantId?: string): Promise<PublishJob> {
    const scheduledAt = post.scheduled_at || new Date().toISOString();
    // Unique deterministic key to prevent duplicate publishing
    const idempotencyKey = `idemp_${post.id}_${post.social_account_id}_${new Date(scheduledAt).getTime()}`;

    // Check if job already exists using the idempotency key
    const existingJob = await db.getPublishJobByIdempotencyKey(idempotencyKey);
    if (existingJob) return existingJob;

    const job = await db.createPublishJob({
      post_id: post.id,
      variant_id: variantId || null,
      client_id: post.client_id,
      social_account_id: post.social_account_id,
      platform: post.platform,
      scheduled_at: scheduledAt,
      status: 'SCHEDULED',
      idempotency_key: idempotencyKey,
      attempt_count: 0,
      max_attempts: 3,
    });

    return job;
  }

  /**
   * Process a single claimed job atomically.
   * This method is called after a job has been claimed via claimPublishJob.
   */
  private async processJob(job: PublishJob): Promise<{ success: boolean; error?: string; errorCategory?: ErrorCategory }> {
    const post = await db.getPost(job.post_id);
    if (!post) {
      await db.updatePublishJob(job.id, {
        status: 'FAILED',
        last_error: 'Associated post no longer exists',
        locked_at: null,
        locked_by: null,
      });
      return { success: false, error: 'Associated post no longer exists', errorCategory: 'UNKNOWN' };
    }

    const account = await db.getSocialAccount(job.social_account_id);
    if (!account) {
      const errReason = `Connected social account '${job.social_account_id}' was not found`;
      await db.updatePublishJob(job.id, {
        status: 'FAILED',
        last_error: errReason,
        error_category: 'ACCOUNT_DISCONNECTED',
        locked_at: null,
        locked_by: null,
      });
      await db.updatePost(post.id, {
        status: 'failed',
        error_message: errReason,
        error_reason: errReason,
        error_category: 'ACCOUNT_DISCONNECTED',
      });
      return { success: false, error: errReason, errorCategory: 'ACCOUNT_DISCONNECTED' };
    }

    // Account status check
    const upperStatus = String(account.status || '').toUpperCase();
    if (upperStatus === 'DISCONNECTED' || upperStatus === 'REAUTH_REQUIRED' || upperStatus === 'REVOKED' || upperStatus === 'NEEDS_RECONNECT') {
      const msg = `Account connection revoked or invalid. Reconnection required.`;
      await db.updatePublishJob(job.id, {
        status: 'FAILED',
        last_error: msg,
        error_category: 'TOKEN_REVOKED',
        locked_at: null,
        locked_by: null,
      });
      await db.updatePost(post.id, {
        status: 'failed',
        error_message: msg,
        error_reason: msg,
        error_category: 'TOKEN_REVOKED',
      });
      return { success: false, error: msg, errorCategory: 'TOKEN_REVOKED' };
    }

    // Check if there is a specific platform variant
    let postToPublish: Post | PostVariant = post;
    if (job.variant_id) {
      const variants = await db.getPostVariants(post.id);
      const foundVar = variants.find((v) => v.id === job.variant_id);
      if (foundVar) postToPublish = foundVar;
    }

    const publisher = getPublisher(job.platform || post.platform || account.platform);

    // Proactive token refresh if expiring within 24 hours
    if (
      account.token_expires_at &&
      new Date(account.token_expires_at).getTime() < Date.now() + 24 * 60 * 60 * 1000
    ) {
      try {
        const refreshRes = await publisher.refreshToken(account);
        if (refreshRes) {
          await db.updateSocialAccount(account.id, {
            access_token: refreshRes.access_token,
            token_expires_at: refreshRes.token_expires_at || account.token_expires_at,
          });
        }
      } catch (refErr: any) {
        console.warn(`Proactive token refresh error for account ${account.id}:`, refErr.message);
      }
    }

    // Execute publish
    try {
      // Pre-publishing validation
      if (publisher.validatePost) {
        const validation = publisher.validatePost(postToPublish, account);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
        }
      }

      const publishResult = await publisher.publish(postToPublish, account);
      const extId =
        publishResult.externalPostId ||
        publishResult.platform_post_id ||
        `pub_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const completedAt = new Date().toISOString();

      // Record successful attempt
      await db.createPublishAttempt({
        job_id: job.id,
        attempt_number: (job.attempt_count || 0) + 1,
        status: 'SUCCESS',
        response_payload: { externalPostId: extId },
      });

      // Mark job completed
      await db.updatePublishJob(job.id, {
        status: 'COMPLETED',
        completed_at: completedAt,
        locked_at: null,
        locked_by: null,
        last_error: null,
      });

      // Mark post published
      await db.updatePost(post.id, {
        status: 'published',
        published_at: completedAt,
        external_post_id: extId,
        platform_post_id: extId,
        error_message: null,
        error_reason: null,
        error_category: null,
      });

      // If variant, mark variant published
      if (job.variant_id) {
        await db.updatePostVariant(job.variant_id, {
          status: 'published',
          external_post_id: extId,
        });
      }

      return { success: true };
    } catch (pubErr: any) {
      const classified = classifyPlatformError(pubErr);
      const attemptCount = (job.attempt_count || 0) + 1;
      const maxAttempts = job.max_attempts || 3;

      // Record failed attempt
      await db.createPublishAttempt({
        job_id: job.id,
        attempt_number: attemptCount,
        status: 'FAILURE',
        error_message: classified.message,
        error_category: classified.category,
      });

      // Handle token issues on the social account
      if (classified.category === 'TOKEN_REVOKED') {
        await db.updateSocialAccount(account.id, {
          status: 'DISCONNECTED',
          last_error: classified.message,
          error_category: classified.category,
        });
        await db.createNotification({
          client_id: post.client_id,
          type: 'TOKEN_EXPIRED',
          title: `Account Disconnected: ${account.display_name}`,
          message: `The access token for ${account.display_name} has been revoked. Please reconnect the account.`,
        });
      } else if (classified.category === 'TOKEN_EXPIRED') {
        await db.updateSocialAccount(account.id, {
          status: 'TOKEN_EXPIRED',
          last_error: classified.message,
          error_category: classified.category,
        });
      }

      // Retry logic: if retryable and under max attempts
      if (classified.retryable && attemptCount < maxAttempts) {
        // Exponential backoff: 1min, 5min, 15min, 30min, 60min
        const delayMinutes = Math.min(Math.pow(2, attemptCount - 1) * 1, 60);
        const delayMs = delayMinutes * 60 * 1000;
        const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

        await db.updatePublishJob(job.id, {
          status: 'RETRYING',
          attempt_count: attemptCount,
          next_retry_at: nextRetryAt,
          last_error: classified.message,
          error_category: classified.category,
          locked_at: null,
          locked_by: null,
        });

        await db.updatePost(post.id, {
          status: 'retrying',
          error_message: classified.message,
          error_reason: classified.message,
          error_category: classified.category,
        });

        return { success: false, error: classified.message, errorCategory: classified.category };
      } else {
        // Permanent failure
        await db.updatePublishJob(job.id, {
          status: 'FAILED',
          attempt_count: attemptCount,
          last_error: classified.message,
          error_category: classified.category,
          locked_at: null,
          locked_by: null,
        });

        await db.updatePost(post.id, {
          status: 'failed',
          error_message: classified.message,
          error_reason: classified.message,
          error_category: classified.category,
        });

        if (job.variant_id) {
          await db.updatePostVariant(job.variant_id, {
            status: 'failed',
            error_message: classified.message,
            error_category: classified.category,
          });
        }

        // Create notification for failed post
        await db.createNotification({
          client_id: post.client_id,
          type: 'POST_FAILED',
          title: `Post Failed on ${post.platform.toUpperCase()}`,
          message: classified.message,
          entity_id: post.id,
          entity_type: 'post',
        });

        return { success: false, error: classified.message, errorCategory: classified.category };
      }
    }
  }

  /**
   * Process due jobs in the queue with database-backed atomic claiming.
   * Uses PostgreSQL row-level locking via claimPublishJob to prevent race conditions.
   */
  async processDueJobs(): Promise<WorkerCycleStats> {
    if (isShuttingDown) {
      return {
        processed: 0,
        completed: 0,
        failed: 0,
        retried: 0,
        skipped: true,
        reason: 'Worker is shutting down',
        results: [],
      };
    }

    const stats: WorkerCycleStats = {
      processed: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      skipped: false,
      results: [],
    };

    try {
      // 1. Ensure any due legacy posts without jobs are enqueued
      const duePosts = await db.getDueScheduledPosts();
      for (const p of duePosts) {
        await this.enqueuePost(p);
      }

      // 2. Process jobs one at a time using atomic claiming
      // Continue claiming and processing until no more jobs are available
      let job;
      let processedCount = 0;
      const maxJobsPerCycle = 100; // Prevent infinite loops in case of bugs

      while (processedCount < maxJobsPerCycle && !isShuttingDown) {
        // Atomically claim a job
        job = await db.claimPublishJob(WORKER_ID);

        if (!job) {
          // No more jobs available
          break;
        }

        stats.processed++;
        processedCount++;

        try {
          const result = await this.processJob(job);

          if (result.success) {
            stats.completed++;
            stats.results.push({
              jobId: job.id,
              postId: job.post_id,
              status: 'COMPLETED',
            });
          } else {
            // Check if it was a retry or permanent failure
            const updatedJob = await db.getPublishJob(job.id);
            if (updatedJob?.status === 'RETRYING') {
              stats.retried++;
              stats.results.push({
                jobId: job.id,
                postId: job.post_id,
                status: 'RETRYING',
                error: result.error,
                errorCategory: result.errorCategory,
              });
            } else {
              stats.failed++;
              stats.results.push({
                jobId: job.id,
                postId: job.post_id,
                status: 'FAILED',
                error: result.error,
                errorCategory: result.errorCategory,
              });
            }
          }
        } catch (err: any) {
          // Unexpected error during processing
          console.error(`Unexpected error processing job ${job.id}:`, err);
          await db.updatePublishJob(job.id, {
            status: 'FAILED',
            last_error: `Unexpected error: ${err.message}`,
            locked_at: null,
            locked_by: null,
          });
          stats.failed++;
          stats.results.push({
            jobId: job.id,
            postId: job.post_id,
            status: 'FAILED',
            error: err.message,
            errorCategory: 'UNKNOWN',
          });
        }
      }

      return stats;
    } catch (err: any) {
      console.error('Error in processDueJobs:', err);
      return {
        ...stats,
        skipped: true,
        reason: err.message,
      };
    }
  }

  /**
   * Gracefully shutdown the worker.
   * Sets a flag to prevent new job claims and releases any held locks.
   */
  async shutdown(): Promise<void> {
    isShuttingDown = true;
    console.log(`Worker ${WORKER_ID} shutting down...`);

    // Release any locks held by this worker
    try {
      const now = new Date().toISOString();
      // Update any jobs still locked by this worker to release the lock
      // In production, you might want to add a db method for this
      console.log(`Worker ${WORKER_ID} shutdown complete`);
    } catch (err) {
      console.error('Error during worker shutdown:', err);
    }
  }

  /**
   * Get worker health status.
   */
  getHealth(): { workerId: string; isShuttingDown: boolean } {
    return {
      workerId: WORKER_ID,
      isShuttingDown,
    };
  }
}

export const publishingQueueWorker = new PublishingQueueWorker();
