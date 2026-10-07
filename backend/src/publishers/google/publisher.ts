import { Post, SocialAccount } from '../../types/index.js';
import { decryptToken, encryptToken } from '../../crypto.js';
import { SocialPublisher, PublishResult, RefreshResult, MetricResult } from '../types.js';
import { fetchGoogleMetrics } from './metrics.js';
import { requireLiveCredentials, requireRealAccessToken, sandboxFailureHook, AccountNeedsReconnectError, isSandboxAccessToken } from '../credentials.js';

export class GooglePublisher implements SocialPublisher {
  async publish(post: Post, account: SocialAccount): Promise<PublishResult> {
    // Gate first: never fall through to a fabricated local-post name.
    requireLiveCredentials('Google Business Profile', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
    const rawToken = requireRealAccessToken(
      'Google Business Profile',
      decryptToken(account.access_token || account.access_token_encrypted || '')
    );

    sandboxFailureHook(rawToken === 'invalid_token' || rawToken.startsWith('bad_token'), 'Google Business API 401: Token invalid or credentials expired');
    sandboxFailureHook(post.content.includes('[TRIGGER_FAIL]'), 'Google Business Profile Error: Location ID not found or account unverified');

    try {
      const response = await fetch(
        `https://mybusiness.googleapis.com/v4/accounts/${account.external_account_id}/locations/-/localPosts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${rawToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            languageCode: 'en-US',
            summary: post.content,
            topicType: 'STANDARD',
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Google Business API Error (${response.status}): ${err}`);
      }

      const data = await response.json();
      if (!data.name) {
        throw new Error(`Google Business API returned no local post name: ${JSON.stringify(data)}`);
      }
      return {
        success: true,
        externalPostId: data.name,
        platform_post_id: data.name,
      };
    } catch (err: any) {
      throw new Error(err.message || 'Google Business Profile publish failed');
    }
  }

  async refreshToken(account: SocialAccount): Promise<RefreshResult> {
    requireLiveCredentials('Google Business Profile', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
    const refreshTokenEnc = account.refresh_token || account.refresh_token_encrypted;
    const rawRefreshToken = refreshTokenEnc ? decryptToken(refreshTokenEnc) : null;

    // No real refresh token means no real refresh: flag the account instead of
    // handing out a substitute token that would silently "work".
    if (!rawRefreshToken || isSandboxAccessToken(rawRefreshToken)) {
      throw new AccountNeedsReconnectError('Google Business Profile');
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: String(process.env.GOOGLE_CLIENT_ID),
        client_secret: String(process.env.GOOGLE_CLIENT_SECRET),
        refresh_token: rawRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`Google token refresh returned no access_token: ${JSON.stringify(data)}`);
    }

    return {
      access_token: encryptToken(data.access_token),
      token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    };
  }

  async fetchMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
    return fetchGoogleMetrics(post, account);
  }
}
