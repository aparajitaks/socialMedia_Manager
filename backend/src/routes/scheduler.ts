import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { getPublisher } from '../publishers/index.js';

const router = Router();
let isRunning = false;

// POST /api/scheduler/run
router.post('/run', async (req: Request, res: Response) => {
  if (isRunning) {
    return res.status(409).json({ message: 'Scheduler run is already in progress' });
  }

  isRunning = true;
  const results = [];

  try {
    const duePosts = await db.getDueScheduledPosts();

    for (const post of duePosts) {
      await db.updatePost(post.id, { status: 'publishing' });

      try {
        const account = await db.getSocialAccountById(post.social_account_id);
        if (!account) {
          throw new Error(`Connected account with id ${post.social_account_id} not found`);
        }

        const publisher = getPublisher(post.platform);
        const publishResult = await publisher.publish(post, account);

        const updated = await db.updatePost(post.id, {
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: publishResult.platform_post_id,
          error_reason: null
        });

        results.push({ id: post.id, status: 'published', platform_post_id: publishResult.platform_post_id, post: updated });
      } catch (err: any) {
        const failedPost = await db.updatePost(post.id, {
          status: 'failed',
          error_reason: err.message || 'Unknown network publishing error'
        });

        results.push({ id: post.id, status: 'failed', error: err.message, post: failedPost });
      }
    }

    res.json({
      processed: results.length,
      processed_count: results.length,
      timestamp: new Date().toISOString(),
      results
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  } finally {
    isRunning = false;
  }
});

export default router;
