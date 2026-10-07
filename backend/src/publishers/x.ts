import { Post, SocialAccount } from '../types/index.js';
import { decryptToken } from '../crypto.js';
import { SocialPublisher, PublishResult, RefreshResult, MetricResult } from './types.js';
import {
  requireLiveCredentials,
  requireRealAccessToken,
  sandboxFailureHook,
  AccountNeedsReconnectError,
  MetricsNotAvailableError,
  isSandboxMode,
  isSandboxAccessToken,
} from './credentials.js';

export class XPublisher implements SocialPublisher {
  async publish(post: Post, account: SocialAccount): Promise<PublishResult> {
    // Gate first: never fall through to a fabricated tweet id.
    requireLiveCredentials('X', ['X_API_KEY', 'X_API_SECRET']);
    const rawToken = requireRealAccessToken('X', decryptToken(account.access_token || account.access_token_encrypted || ''));

    sandboxFailureHook(rawToken === 'invalid_token' || rawToken.startsWith('bad_token'), 'X API 401: Unauthorized access token');
    sandboxFailureHook(post.content.includes('[TRIGGER_FAIL]'), 'X API 403 Forbidden: Duplicate tweet content or character limit exceeded');

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
      const id = data.data?.id;
      if (!id) {
        throw new Error(`X API returned no tweet id: ${JSON.stringify(data)}`);
      }
      return { success: true, externalPostId: id, platform_post_id: id };
    } catch (err: any) {
      throw new Error(err.message || 'X publish failed');
    }
  }

  async refreshToken(account: SocialAccount): Promise<RefreshResult> {
    requireLiveCredentials('X', ['X_API_KEY', 'X_API_SECRET']);
    const rawRefreshToken = account.refresh_token || account.refresh_token_encrypted
      ? decryptToken((account.refresh_token || account.refresh_token_encrypted) as string)
      : null;

    if (!rawRefreshToken || isSandboxAccessToken(rawRefreshToken)) {
      throw new AccountNeedsReconnectError('X');
    }

    // X token refresh needs the OAuth2 client id, which this build does not
    // configure. Say so instead of minting a token that would look valid.
    throw new Error(
      `X token refresh is not implemented in this build (account ${account.id}). ` +
        `Reconnect the account to obtain a fresh access token.`
    );
  }

  async fetchMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
    if (isSandboxMode()) {
      const impressions = Math.floor(200 + Math.random() * 300);
      const likes = Math.floor(impressions * 0.04);
      console.warn(`⚠️ SANDBOX_MODE: invented X engagement for post ${post?.id} — these are not real metrics`);
      return { likes, comments: Math.floor(likes * 0.2), shares: Math.floor(likes * 0.1), impressions };
    }

    // No engagement-reading integration exists yet. Refuse rather than invent
    // impressions/likes, which would show up as real performance in reports.
    throw new MetricsNotAvailableError('X');
  }
}
