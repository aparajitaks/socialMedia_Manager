import { Post, SocialAccount } from '../../types/index.js';
import { MetricResult } from '../types.js';
import { requireRealMetrics } from '../credentials.js';

/**
 * Real Meta insights (impressions / engagement on the published object) are not
 * implemented in this build. Returning random engagement here used to fill the
 * metrics table with numbers nobody measured, so it now requires sandbox mode.
 */
export async function fetchMetaMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
  const isIg = account.platform === 'instagram';
  requireRealMetrics(isIg ? 'Instagram' : 'Facebook');

  const impressions = isIg ? Math.floor(600 + Math.random() * 400) : Math.floor(350 + Math.random() * 250);
  const likes = isIg ? Math.floor(impressions * 0.08 + Math.random() * 15) : Math.floor(impressions * 0.04 + Math.random() * 8);
  const comments = Math.floor(likes * (isIg ? 0.15 : 0.1));
  const shares = Math.floor(likes * (isIg ? 0.2 : 0.08));

  console.warn(`⚠️ SANDBOX_MODE: invented ${isIg ? 'Instagram' : 'Facebook'} engagement for post ${post?.id} — these are not real metrics`);
  return { likes, comments, shares, impressions };
}
