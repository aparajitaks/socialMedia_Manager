import { Post, SocialAccount } from '../../types/index.js';
import { decryptToken, encryptToken } from '../../crypto.js';
import { SocialPublisher, PublishResult, RefreshResult, MetricResult } from '../types.js';
import { fetchLinkedInMetrics } from './metrics.js';
import { requireLiveCredentials, requireRealAccessToken, sandboxFailureHook, AccountNeedsReconnectError, isSandboxAccessToken } from '../credentials.js';

export class LinkedInPublisher implements SocialPublisher {
  async publish(post: Post, account: SocialAccount): Promise<PublishResult> {
    // Gate first: never fall through to a fabricated share URN.
    requireLiveCredentials('LinkedIn', ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']);
    const rawToken = requireRealAccessToken(
      'LinkedIn',
      decryptToken(account.access_token || account.access_token_encrypted || '')
    );

    sandboxFailureHook(rawToken === 'invalid_token' || rawToken.startsWith('bad_token'), 'LinkedIn API 401: Token invalid or expired');
    sandboxFailureHook(post.content.includes('[TRIGGER_FAIL]'), 'LinkedIn API Error: Character limit exceeded or organization access denied');

    try {
      const externalAccountId = account.external_account_id || account.platform_account_id;
      const orgUrn = externalAccountId?.startsWith('urn:li:')
        ? externalAccountId
        : `urn:li:organization:${externalAccountId}`;

      const payload: any = {
        author: orgUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: post.content,
            },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rawToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`LinkedIn API Error (${response.status}): ${err}`);
      }

      const data = await response.json();
      if (!data.id) {
        throw new Error(`LinkedIn ugcPosts returned no share id: ${JSON.stringify(data)}`);
      }
      return {
        success: true,
        externalPostId: data.id,
        platform_post_id: data.id,
      };
    } catch (err: any) {
      throw new Error(err.message || 'LinkedIn publish failed');
    }
  }

  async refreshToken(account: SocialAccount): Promise<RefreshResult> {
    requireLiveCredentials('LinkedIn', ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']);
    const refreshTokenEnc = account.refresh_token || account.refresh_token_encrypted;
    const rawRefreshToken = refreshTokenEnc ? decryptToken(refreshTokenEnc) : null;

    // A refresh that cannot really happen must not mint a substitute token —
    // it has to leave the account flagged so the user reconnects.
    if (!rawRefreshToken || isSandboxAccessToken(rawRefreshToken)) {
      throw new AccountNeedsReconnectError('LinkedIn');
    }

    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: rawRefreshToken,
        client_id: String(process.env.LINKEDIN_CLIENT_ID),
        client_secret: String(process.env.LINKEDIN_CLIENT_SECRET),
      }),
    });

    if (!res.ok) {
      throw new Error(`LinkedIn token refresh failed (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`LinkedIn token refresh returned no access_token: ${JSON.stringify(data)}`);
    }

    return {
      access_token: encryptToken(data.access_token),
      token_expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString(),
    };
  }

  async fetchMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
    return fetchLinkedInMetrics(post, account);
  }
}
