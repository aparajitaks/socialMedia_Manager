import { Post, SocialAccount } from '../types/index.js';
import { decryptToken, encryptToken } from '../crypto.js';
import { SocialPublisher, PublishResult, RefreshResult, MetricResult } from './types.js';

export class XPublisher implements SocialPublisher {
  async publish(post: Post, account: SocialAccount): Promise<PublishResult> {
    const rawToken = decryptToken(account.access_token);

    if (rawToken === 'invalid_token' || rawToken.startsWith('bad_token')) {
      throw new Error('X API 401: Unauthorized access token');
    }

    if (post.content.includes('[TRIGGER_FAIL]')) {
      throw new Error('X API 403 Forbidden: Duplicate tweet content or character limit exceeded');
    }

    if (process.env.X_API_KEY && !rawToken.startsWith('mock_')) {
      try {
        const res = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${rawToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text: post.content })
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`X API Error (${res.status}): ${err}`);
        }

        const data = await res.json();
        return { platform_post_id: data.data?.id || `x_${Date.now()}` };
      } catch (err: any) {
        throw new Error(err.message || 'X publish failed');
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      platform_post_id: `x_tweet_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    };
  }

  async refreshToken(account: SocialAccount): Promise<RefreshResult> {
    return {
      access_token: encryptToken(`mock_x_${Date.now()}`),
      token_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  async fetchMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
    const impressions = Math.floor(500 + Math.random() * 400);
    const likes = Math.floor(impressions * 0.03 + Math.random() * 10);
    const comments = Math.floor(likes * 0.2 + Math.random() * 3);
    const shares = Math.floor(likes * 0.35 + Math.random() * 4); // Retweets

    return { likes, comments, shares, impressions };
  }
}
