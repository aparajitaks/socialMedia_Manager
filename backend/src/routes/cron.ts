import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { getPublisher } from '../publishers/index.js';

const router = Router();

// POST /api/cron/metrics and alias /api/cron/fetch-metrics
router.post(['/metrics', '/fetch-metrics'], async (req: Request, res: Response) => {
  try {
    const publishedPosts = await db.getPosts({ status: 'published' });
    const collected = [];

    for (const post of publishedPosts) {
      if (!post.platform_post_id) continue;
      const account = await db.getSocialAccountById(post.social_account_id);
      if (!account) continue;

      try {
        const publisher = getPublisher(post.platform);
        const metric = await publisher.fetchMetrics(post, account);
        const record = await db.createPostMetric({
          post_id: post.id,
          likes: metric.likes,
          comments: metric.comments,
          shares: metric.shares,
          impressions: metric.impressions
        });
        collected.push(record);
      } catch (err: any) {
        console.error(`Failed to sync metrics for post ${post.id}:`, err.message);
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      posts_analyzed: publishedPosts.length,
      new_metrics_recorded: collected.length,
      metricsCollected: collected
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/cron/refresh-tokens
router.post('/refresh-tokens', async (req: Request, res: Response) => {
  try {
    const accounts = await db.getSocialAccounts();
    const refreshed = [];

    for (const account of accounts) {
      try {
        const publisher = getPublisher(account.platform);
        const result = await publisher.refreshToken(account);

        await db.updateSocialAccount(account.id, {
          access_token: result.access_token,
          refresh_token: result.refresh_token,
          token_expires_at: result.token_expires_at
        });

        refreshed.push({ id: account.id, platform: account.platform, refreshed: true });
      } catch (err: any) {
        refreshed.push({ id: account.id, platform: account.platform, refreshed: false, error: err.message });
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      accounts_checked: accounts.length,
      refreshed: refreshed.filter((r) => r.refreshed).length,
      results: refreshed
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
