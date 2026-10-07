import crypto from 'crypto';
import { db } from '../db.js';
import { getPublisher, classifyPlatformError } from '../publishers/index.js';
import { decryptToken } from '../crypto.js';
import {
  Post,
  PostVariant,
  PublishJob,
  PublishAttempt,
  SocialAccount,
  ErrorCategory,
  PostStatus,
} from '../types/index.js';

export interface WorkerCycleStats {
  processed: number;
  completed: number;
  failed: number;
  retried: number;
  recovered?: number;
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

export class PublishingQueueWorker {
  public workerId: string;
  public staleThresholdMs: number;
  public isShuttingDown: boolean = false;

  constructor(options?: { workerId?: string; staleThresholdMs?: number }) {
    this.workerId = options?.workerId || `worker_${process.pid}_${Math.random().toString(36).slice(2, 7)}`;
    this.staleThresholdMs = options?.staleThresholdMs || parseInt(process.env.WORKER_STALE_THRESHOLD_MS || '300000', 10);
  }

  /**
   * Enqueue a scheduled post into the publish_jobs queue with idempotency protection.
   */
  async enqueuePost(post: Post, variantId?: string): Promise<PublishJob> {
    const scheduledAt = post.scheduled_at || new Date().toISOString();
    // Unique deterministic key to prevent duplicate publishing (§19)
    const idempotencyKey = `idemp_${post.id}_${variantId || post.social_account_id}_${new Date(scheduledAt).getTime()}`;

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
   * Post Status Synchronization (§24, §25)
   * Computes parent post status based on all child publish jobs.
   */
  async syncPostStatusFromJobs(postId: string): Promise<void> {
    const post = await db.getPost(postId);
    if (!post) return;

    const allJobs = await db.getPublishJobs({ postId });
    if (allJobs.length === 0) return;

    const isJobDone = (j: PublishJob) => j.status === 'PUBLISHED' || j.status === 'COMPLETED';
    const isJobFailed = (j: PublishJob) => j.status === 'FAILED';
    const isJobProcessing = (j: PublishJob) => j.status === 'PROCESSING';
    const isJobRetrying = (j: PublishJob) => j.status === 'RETRYING';
    const isJobScheduled = (j: PublishJob) => j.status === 'SCHEDULED' || j.status === 'QUEUED';

    const doneCount = allJobs.filter(isJobDone).length;
    const failedCount = allJobs.filter(isJobFailed).length;
    const processingCount = allJobs.filter(isJobProcessing).length;
    const retryingCount = allJobs.filter(isJobRetrying).length;
    const scheduledCount = allJobs.filter(isJobScheduled).length;

    let targetStatus: PostStatus = post.status;
    let publishedAt: string | null = post.published_at || null;

    if (doneCount === allJobs.length) {
      targetStatus = 'published';
      publishedAt = publishedAt || new Date().toISOString();
    } else if (processingCount > 0) {
      targetStatus = 'publishing';
    } else if (doneCount > 0 && failedCount > 0 && doneCount + failedCount === allJobs.length) {
      // Partial success (§25): at least one variant published, don't rollback
      targetStatus = 'published';
      publishedAt = publishedAt || new Date().toISOString();
    } else if (failedCount === allJobs.length) {
      targetStatus = 'failed';
    } else if (retryingCount > 0) {
      targetStatus = 'retrying';
    } else if (scheduledCount > 0 && doneCount === 0) {
      targetStatus = 'scheduled';
    }

    await db.updatePost(postId, {
      status: targetStatus,
      published_at: publishedAt,
    });
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

    // Account status check (§30)
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

    // Decrypt access token server-side (§29: never leak to frontend or logs)
    let token = account.access_token || '';
    if (!token && (account.encrypted_access_token || (account as any).access_token_encrypted)) {
      try {
        const cipher = account.encrypted_access_token || (account as any).access_token_encrypted;
        token = decryptToken(cipher);
      } catch (decErr: any) {
        console.error(`[Worker ${this.workerId}] Failed to decrypt token for account ${account.id}:`, decErr.message);
      }
    }

    const accountForPublish = {
      ...account,
      access_token: token,
    };

    // Proactive token refresh if expiring within 24 hours
    if (
      account.token_expires_at &&
      new Date(account.token_expires_at).getTime() < Date.now() + 24 * 60 * 60 * 1000
    ) {
      try {
        const refreshRes = await publisher.refreshToken(accountForPublish);
        if (refreshRes) {
          await db.updateSocialAccount(account.id, {
            access_token: refreshRes.access_token,
            token_expires_at: refreshRes.token_expires_at || account.token_expires_at,
          });
          accountForPublish.access_token = refreshRes.access_token;
        }
      } catch (refErr: any) {
        console.warn(`[Worker ${this.workerId}] Proactive token refresh error for account ${account.id}:`, refErr.message);
      }
    }

    // Execute publish
    try {
      // Pre-publishing content & media revalidation (§31, §32)
      if (publisher.validatePost) {
        const validation = publisher.validatePost(postToPublish, accountForPublish);
        if (!validation.valid) {
          throw new Error(`Pre-publish validation failed: ${validation.errors.join('; ')}`);
        }
      }

      console.log(`[Worker ${this.workerId}] Publishing job ${job.id} on ${job.platform} for post ${post.id}...`);
      const publishResult = await publisher.publish(postToPublish, accountForPublish);
      const extId =
        publishResult.externalPostId ||
        publishResult.platform_post_id ||
        `pub_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const completedAt = new Date().toISOString();

      // Record successful attempt with clean payload (§20, §29)
      await db.createPublishAttempt({
        job_id: job.id,
        attempt_number: (job.attempt_count || 0) + 1,
        status: 'SUCCESS',
        response_payload: { externalPostId: extId },
      });

      // Mark job published/completed
      await db.updatePublishJob(job.id, {
        status: 'PUBLISHED',
        completed_at: completedAt,
        locked_at: null,
        locked_by: null,
        last_error: null,
      });

      // If variant, mark variant published
      if (job.variant_id) {
        await db.updatePostVariant(job.variant_id, {
          status: 'published',
          external_post_id: extId,
        });
      } else {
        // No variant — write platform_post_id directly onto the post
        await db.updatePost(post.id, {
          platform_post_id: extId,
        });
      }

      // Sync overall post status (updates status + published_at)
      await this.syncPostStatusFromJobs(post.id);

      console.log(`[Worker ${this.workerId}] Succeeded publishing job ${job.id} -> external ID ${extId}`);
      return { success: true };
    } catch (pubErr: any) {
      const classified = classifyPlatformError(pubErr);
      const attemptCount = (job.attempt_count || 0) + 1;
      const maxAttempts = job.max_attempts || 3;

      console.warn(`[Worker ${this.workerId}] Failed publishing job ${job.id}: category=${classified.category}, retryable=${classified.retryable}`);

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

      // Retry logic (§18): if retryable and under max attempts
      if (classified.retryable && attemptCount < maxAttempts) {
        // Exponential backoff: bounded (1m, 2m, 4m, 8m... max 60m)
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
        // Permanent failure — update post with error details first, then sync
        await db.updatePost(post.id, {
          status: 'failed',
          error_message: classified.message,
          error_reason: classified.message,
          error_category: classified.category,
        });

        await db.updatePublishJob(job.id, {
          status: 'FAILED',
          attempt_count: attemptCount,
          last_error: classified.message,
          error_category: classified.category,
          locked_at: null,
          locked_by: null,
        });

        if (job.variant_id) {
          await db.updatePostVariant(job.variant_id, {
            status: 'failed',
            error_message: classified.message,
            error_category: classified.category,
          });
        }

        await this.syncPostStatusFromJobs(post.id);

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
    if (this.isShuttingDown) {
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
      // 1. Stale Job Recovery watchdog (§12)
      const recovery = await db.recoverStaleJobs(this.staleThresholdMs);
      if (recovery.recoveredCount > 0) {
        console.log(`[Worker ${this.workerId}] Watchdog recovered ${recovery.recoveredCount} stale job(s): ${recovery.recoveredIds.join(', ')}`);
        stats.recovered = recovery.recoveredCount;
      }

      // 2. Ensure any due legacy posts without jobs are enqueued
      const duePosts = await db.getDueScheduledPosts();
      for (const p of duePosts) {
        await this.enqueuePost(p);
      }

      // 3. Process jobs one at a time using atomic claiming (§9, §10)
      let job;
      let processedCount = 0;
      const maxJobsPerCycle = 100; // Bounded batch per cycle

      while (processedCount < maxJobsPerCycle && !this.isShuttingDown) {
        // Atomically claim a due job with FOR UPDATE SKIP LOCKED
        job = await db.claimPublishJob(this.workerId, this.staleThresholdMs);

        if (!job) {
          // No more due jobs available
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
            // Check status of updated job
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
          console.error(`[Worker ${this.workerId}] Unexpected error processing job ${job.id}:`, err);
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
      console.error(`[Worker ${this.workerId}] Error in processDueJobs:`, err);
      return {
        ...stats,
        skipped: true,
        reason: err.message,
      };
    }
  }

  /**
   * Gracefully shutdown the worker.
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    console.log(`Worker ${this.workerId} shutting down...`);
  }

  /**
   * Get worker health status.
   */
  getHealth(): { workerId: string; isShuttingDown: boolean } {
    return {
      workerId: this.workerId,
      isShuttingDown: this.isShuttingDown,
    };
  }
}

export const publishingQueueWorker = new PublishingQueueWorker();
