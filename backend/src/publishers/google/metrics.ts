import { Post, SocialAccount } from '../../types/index.js';
import { MetricResult } from '../types.js';
import { requireRealMetrics } from '../credentials.js';

/**
 * Real Google Business Profile engagement (LocalPostInsights) is not
 * implemented in this build, so inventing numbers here would put them straight
 * into the metrics table via the sync loop. Sandbox mode only, loudly labelled.
 */
export async function fetchGoogleMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
  requireRealMetrics('Google Business Profile');

  const impressions = Math.floor(220 + Math.random() * 150);
  const likes = Math.floor(impressions * 0.04 + Math.random() * 6);
  const comments = Math.floor(likes * 0.15);
  const shares = Math.floor(likes * 0.05);

  console.warn(`⚠️ SANDBOX_MODE: invented Google Business Profile engagement for post ${post?.id} — these are not real metrics`);
  return { likes, comments, shares, impressions };
}
