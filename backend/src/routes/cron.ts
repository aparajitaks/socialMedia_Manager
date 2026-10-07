import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db.js';
import { getPublisher } from '../publishers/index.js';
import { encryptToken } from '../crypto.js';

const router = Router();

// Middleware: Require shared cron secret header or Bearer token (P0 #6)
export function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      (req.headers['x-cron-secret'] as string) ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (!provided || provided !== secret) {
      return res.status(401).json({ error: 'Unauthorized: missing or invalid cron secret header' });
    }
    return next();
  }

  // In production, CRON_SECRET is strictly mandatory to prevent open access to cron triggers
  if (process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'CRON_SECRET environment variable is required to execute cron endpoints in production.' });
  }

  next();
}

router.use(requireCronSecret);

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

// POST /api/cron/refresh-tokens (P0 #8: Only refresh tokens expiring in 7 days, correct columns, preserve refresh token)
router.post('/refresh-tokens', async (req: Request, res: Response) => {
  try {
    const accounts = await db.getSocialAccounts();
    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

    // Filter accounts: only refresh tokens expiring in 7 days or already expired
    const eligibleAccounts = accounts.filter((account) => {
      if (!account.token_expires_at) return false;
      const expiry = new Date(account.token_expires_at).getTime();
      return expiry <= sevenDaysFromNow;
    });

    const refreshed = [];

    for (const account of eligibleAccounts) {
      try {
        const publisher = getPublisher(account.platform);
        const result = await publisher.refreshToken(account);

        const updatePayload: any = {
          access_token_encrypted: result.access_token.includes(':')
            ? result.access_token
            : encryptToken(result.access_token),
          token_expires_at: result.token_expires_at || account.token_expires_at,
        };

        // Only update refresh token if platform returned a new one (never wipe valid refresh tokens!)
        if (result.refresh_token) {
          updatePayload.refresh_token_encrypted = result.refresh_token.includes(':')
            ? result.refresh_token
            : encryptToken(result.refresh_token);
        }

        await db.updateSocialAccount(account.id, updatePayload);
        refreshed.push({ id: account.id, platform: account.platform, refreshed: true });
      } catch (err: any) {
        refreshed.push({ id: account.id, platform: account.platform, refreshed: false, error: err.message });
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      accounts_checked: accounts.length,
      accounts_eligible: eligibleAccounts.length,
      refreshed: refreshed.filter((r) => r.refreshed).length,
      results: refreshed
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
