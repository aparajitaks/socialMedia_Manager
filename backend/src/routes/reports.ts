import { Router, Request, Response } from 'express';
import { db, DEFAULT_CLIENT_ID } from '../db.js';

const router = Router();

// GET /api/reports/summary — Aggregate performance report
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.clientId || req.query.client_id) as string || DEFAULT_CLIENT_ID;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const posts = await db.getPosts({ clientId, status: 'published', from, to });
    const platformSummaries = await db.getMetricsSummary(clientId, undefined, from, to);
    const accounts = await db.getSocialAccounts(clientId);

    // Collect individual post metrics to find top posts
    const postPerformances = [];
    for (const post of posts) {
      const metrics = await db.getPostMetrics(post.id);
      const latest = metrics[0] || { likes: 0, comments: 0, shares: 0, impressions: 0 };
      const totalEngagement = latest.likes + latest.comments + latest.shares;
      const rate = latest.impressions > 0 ? (totalEngagement / latest.impressions) * 100 : 0;

      postPerformances.push({
        id: post.id,
        platform: post.platform,
        content: post.content.slice(0, 100),
        published_at: post.published_at || post.created_at,
        likes: latest.likes,
        comments: latest.comments,
        shares: latest.shares,
        impressions: latest.impressions,
        total_engagement: totalEngagement,
        engagement_rate_pct: Math.round(rate * 10) / 10,
      });
    }

    // Sort to get top 5 posts
    postPerformances.sort((a, b) => b.total_engagement - a.total_engagement);
    const topPosts = postPerformances.slice(0, 5);

    // Aggregate totals
    const grandTotals = platformSummaries.reduce(
      (acc, curr) => ({
        total_impressions: acc.total_impressions + curr.total_impressions,
        total_likes: acc.total_likes + curr.total_likes,
        total_comments: acc.total_comments + curr.total_comments,
        total_shares: acc.total_shares + curr.total_shares,
        total_engagement: acc.total_engagement + curr.total_likes + curr.total_comments + curr.total_shares,
      }),
      { total_impressions: 0, total_likes: 0, total_comments: 0, total_shares: 0, total_engagement: 0 }
    );

    const overallEngagementRate =
      grandTotals.total_impressions > 0
        ? Math.round((grandTotals.total_engagement / grandTotals.total_impressions) * 1000) / 10
        : 0;

    res.json({
      client_id: clientId,
      generated_at: new Date().toISOString(),
      period: { from: from || 'All Time', to: to || 'Now' },
      totals: {
        ...grandTotals,
        average_engagement_rate_pct: overallEngagementRate,
        published_posts_count: posts.length,
        connected_accounts_count: accounts.length,
      },
      platform_breakdown: platformSummaries,
      top_posts: topPosts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
