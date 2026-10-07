import { Post, SocialAccount } from '../../types/index.js';
import { MetricResult } from '../types.js';
import { requireRealMetrics } from '../credentials.js';

/**
 * Real LinkedIn engagement (method URN + socialActionCounts aggregates) is not
 * implemented in this build. The previous version returned plausible-looking
 * random numbers, and the scheduler stored them as measured engagement.
 *
 * Without a real call the only honest answer is an error: the caller records
 * nothing and the dashboard stays empty rather than wrong. Fabricated numbers
 * are available in sandbox mode only, where they are labelled as such.
 */
export async function fetchLinkedInMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
  requireRealMetrics('LinkedIn');

  const impressions = Math.floor(450 + Math.random() * 300);
  const likes = Math.floor(impressions * 0.05 + Math.random() * 10);
  const comments = Math.floor(likes * 0.2);
  const shares = Math.floor(likes * 0.1);

  console.warn(`⚠️ SANDBOX_MODE: invented LinkedIn engagement for post ${post?.id} — these are not real metrics`);
  return { likes, comments, shares, impressions };
}
