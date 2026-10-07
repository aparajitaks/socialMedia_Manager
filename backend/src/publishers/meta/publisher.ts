import { Post, SocialAccount } from '../../types/index.js';
import { decryptToken, encryptToken } from '../../crypto.js';
import { SocialPublisher, PublishResult, RefreshResult, MetricResult } from '../types.js';
import {
  requireCredentialAlternatives,
  requireRealAccessToken,
  resolveCredentialAlternatives,
} from '../credentials.js';
import { fetchMetaMetrics } from './metrics.js';

const META_APP_GROUPS = [
  ['META_CLIENT_ID', 'META_CLIENT_SECRET'],
  ['META_APP_ID', 'META_APP_SECRET'],
];
const META_APP_DESCRIPTION = 'META_CLIENT_ID + META_CLIENT_SECRET (or META_APP_ID + META_APP_SECRET)';

export class MetaPublisher implements SocialPublisher {
  async publish(post: Post, account: SocialAccount): Promise<PublishResult> {
    const platform = account.platform === 'instagram' ? 'Instagram Business' : 'Facebook Page';

    // Refuse before touching the network. Missing app credentials and sandbox
    // tokens are configuration problems: they must surface as an actionable
    // error on the post, never as a fabricated platform_post_id.
    requireCredentialAlternatives(platform, META_APP_GROUPS, META_APP_DESCRIPTION);
    const rawToken = requireRealAccessToken(
      platform,
      decryptToken(account.access_token || account.access_token_encrypted || '')
    );

    const isInstagram = account.platform === 'instagram';

    try {
      if (isInstagram) {
        const mediaUrl = post.media_urls && post.media_urls[0];
        if (!mediaUrl) {
          throw new Error(
            'Instagram requires a hosted image URL. Upload the media first, then schedule the post with the stored media URL.'
          );
        }
        const containerRes = await fetch(
          `https://graph.facebook.com/v19.0/${account.external_account_id}/media`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_url: mediaUrl,
              caption: post.content,
              access_token: rawToken,
            }),
          }
        );
        if (!containerRes.ok) {
          throw new Error(`IG Container creation failed: ${await containerRes.text()}`);
        }
        const containerData = await containerRes.json();

        const pubRes = await fetch(
          `https://graph.facebook.com/v19.0/${account.external_account_id}/media_publish`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              creation_id: containerData.id,
              access_token: rawToken,
            }),
          }
        );
        if (!pubRes.ok) {
          throw new Error(`IG Media publish failed: ${await pubRes.text()}`);
        }
        const pubData = await pubRes.json();
        if (!pubData.id) {
          throw new Error(`Instagram media_publish returned no id: ${JSON.stringify(pubData)}`);
        }
        return {
          success: true,
          externalPostId: pubData.id,
          platform_post_id: pubData.id,
        };
      } else {
        // Facebook Page Post
        const res = await fetch(`https://graph.facebook.com/v19.0/${account.external_account_id}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: post.content,
            access_token: rawToken,
          }),
        });
        if (!res.ok) {
          throw new Error(`Facebook Feed post failed: ${await res.text()}`);
        }
        const data = await res.json();
        if (!data.id) {
          throw new Error(`Facebook feed returned no post id: ${JSON.stringify(data)}`);
        }
        return {
          success: true,
          externalPostId: data.id,
          platform_post_id: data.id,
        };
      }
    } catch (err: any) {
      throw new Error(err.message || 'Meta publish failed');
    }
  }

  async refreshToken(account: SocialAccount): Promise<RefreshResult> {
    const rawToken = decryptToken(account.access_token || account.access_token_encrypted || '');
    const appCredentials = resolveCredentialAlternatives(META_APP_GROUPS);

    // Never mint a substitute token: if the refresh cannot really happen the
    // account must stay flagged so the user is asked to reconnect.
    if (!appCredentials) {
      throw new Error(
        `Meta token refresh skipped for account ${account.id}: ${META_APP_DESCRIPTION} is not configured`
      );
    }
    if (!rawToken || rawToken.startsWith('mock_') || rawToken.startsWith('sandbox_')) {
      throw new Error(
        `Meta token refresh skipped for account ${account.id}: stored token is a sandbox token, reconnect the account`
      );
    }

    const clientId = appCredentials.values.META_CLIENT_ID || appCredentials.values.META_APP_ID;
    const clientSecret = appCredentials.values.META_CLIENT_SECRET || appCredentials.values.META_APP_SECRET;

    const res = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${rawToken}`
    );
    if (!res.ok) {
      throw new Error(`Meta token refresh failed (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`Meta token refresh returned no access_token: ${JSON.stringify(data)}`);
    }

    return {
      access_token: encryptToken(data.access_token),
      token_expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString(),
    };
  }

  async fetchMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
    return fetchMetaMetrics(post, account);
  }
}
