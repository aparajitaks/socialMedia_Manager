/**
 * Meta Platform Adapter
 * 
 * Handles OAuth and account connection for Facebook Pages and Instagram Business accounts.
 * Meta is treated as a provider that can yield multiple account types.
 */

import { PlatformAdapter, PlatformCapabilities, OAuthAuthorizationResult, OAuthCallbackResult, DiscoveredAccount, TokenRefreshResult, ConnectionVerificationResult, OAuthError, TokenExpiredError, AccountNotFoundError, PermissionDeniedError, RateLimitError, PlatformAPIError } from '../index.js';
import { PlatformType } from '../../types/index.js';
import { encryptToken, decryptToken } from '../../crypto.js';

const META_APP_GROUPS = [
  ['META_CLIENT_ID', 'META_CLIENT_SECRET'],
  ['META_APP_ID', 'META_APP_SECRET'],
];
const META_APP_DESCRIPTION = 'META_CLIENT_ID + META_CLIENT_SECRET (or META_APP_ID + META_APP_SECRET)';

function getMetaRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const configured = process.env.META_REDIRECT_URI;
  return configured || `${appUrl}/api/accounts/facebook/callback`;
}

function getMetaCredentials(): { clientId: string; clientSecret: string } | null {
  for (const group of META_APP_GROUPS) {
    const clientId = process.env[group[0]];
    const clientSecret = process.env[group[1]];
    if (clientId && clientSecret) {
      return { clientId, clientSecret };
    }
  }
  return null;
}

export class MetaAdapter implements PlatformAdapter {
  getPlatform(): PlatformType {
    return 'meta';
  }

  getCapabilities(account?: any): PlatformCapabilities {
    // Meta capabilities differ between Facebook Pages and Instagram Business
    const isInstagram = account?.platform === 'instagram';
    
    if (isInstagram) {
      return {
        publishText: false,
        publishImage: true,
        publishVideo: true,
        publishCarousel: true,
        publishStory: true,
        publishReel: true,
        publishShort: false,
        publishDocument: false,
        publishLink: false,
        firstComment: true,
        hashtags: true,
        mentions: true,
        analytics: true,
        comments: true,
        inbox: true,
        directMessages: false,
        webhooks: true,
      };
    }
    
    // Facebook Page capabilities
    return {
      publishText: true,
      publishImage: true,
      publishVideo: true,
      publishCarousel: false,
      publishStory: false,
      publishReel: false,
      publishShort: false,
      publishDocument: false,
      publishLink: true,
      firstComment: false,
      hashtags: false,
      mentions: true,
      analytics: true,
      comments: true,
      inbox: false,
      directMessages: false,
      webhooks: true,
    };
  }

  async getAuthorizationUrl(state: string, options?: Record<string, any>): Promise<OAuthAuthorizationResult> {
    const credentials = getMetaCredentials();
    if (!credentials) {
      throw new OAuthError(
        `Meta OAuth credentials not configured. Please set ${META_APP_DESCRIPTION}.`,
        'meta'
      );
    }

    if (!/^\d+$/.test(credentials.clientId)) {
      throw new OAuthError(
        'META_CLIENT_ID must be a numeric App ID from Meta for Developers.',
        'meta'
      );
    }

    const redirectUri = getMetaRedirectUri();
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
    });

    return {
      authorizationUrl: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`,
      state,
    };
  }

  async handleOAuthCallback(code: string, state: string, options?: Record<string, any>): Promise<OAuthCallbackResult> {
    const credentials = getMetaCredentials();
    if (!credentials) {
      throw new OAuthError(
        `Meta OAuth credentials not configured. Please set ${META_APP_DESCRIPTION}.`,
        'meta'
      );
    }

    const redirectUri = getMetaRedirectUri();

    // Exchange code for short-lived token
    const exchangeRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${credentials.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${credentials.clientSecret}&code=${code}`
    );

    if (!exchangeRes.ok) {
      const err = await exchangeRes.text();
      throw new OAuthError(`Meta token exchange failed (${exchangeRes.status}): ${err}`, 'meta');
    }

    const shortTokenData = await exchangeRes.json();
    const shortToken = shortTokenData.access_token;

    // Exchange for long-lived token
    let accessToken = shortToken;
    let expiresIn = shortTokenData.expires_in;

    try {
      const longRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${credentials.clientId}&client_secret=${credentials.clientSecret}&fb_exchange_token=${shortToken}`
      );
      if (longRes.ok) {
        const longData = await longRes.json();
        accessToken = longData.access_token;
        expiresIn = longData.expires_in;
      }
    } catch (err) {
      console.warn('Meta long-lived token exchange failed, using short-lived token:', err);
    }

    // Discover accounts
    const accounts = await this.discoverAccounts(accessToken);

    return {
      accessToken,
      expiresIn,
      accounts,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    // Meta doesn't use refresh tokens - uses long-lived tokens that can be extended
    throw new OAuthError('Meta uses long-lived tokens that can be extended, not refreshed with a refresh token. Re-authenticate the account.', 'meta');
  }

  async validateConnection(accessToken: string, platformAccountId: string): Promise<ConnectionVerificationResult> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${platformAccountId}?fields=id,name,picture&access_token=${accessToken}`
      );

      if (!res.ok) {
        if (res.status === 401) {
          return { status: 'TOKEN_EXPIRED', error: 'Token has expired' };
        }
        if (res.status === 404) {
          return { status: 'DISCONNECTED', error: 'Account not found' };
        }
        const err = await res.text();
        return { status: 'ERROR', error: `Validation failed: ${err}` };
      }

      const data = await res.json();
      return {
        status: 'CONNECTED',
        displayName: data.name,
        profileImageUrl: data.picture?.data?.url,
      };
    } catch (error: any) {
      return { status: 'ERROR', error: error.message };
    }
  }

  async disconnect(accessToken: string, platformAccountId: string): Promise<void> {
    // Meta doesn't provide a token revocation endpoint
    // The token will expire naturally
    console.log(`Meta account ${platformAccountId} marked as disconnected. Token will expire naturally.`);
  }

  async getAccountProfile(accessToken: string, platformAccountId: string): Promise<DiscoveredAccount> {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${platformAccountId}?fields=id,name,username,picture,category&access_token=${accessToken}`
    );

    if (!res.ok) {
      throw new PlatformAPIError(`Failed to fetch account profile: ${await res.text()}`, 'meta', res.status);
    }

    const data = await res.json();
    
    return {
      platformAccountId: data.id,
      displayName: data.name,
      username: data.username,
      profileImageUrl: data.picture?.data?.url,
      accountType: data.category?.includes('Page') ? 'ORGANIZATION_PAGE' : 'BUSINESS',
      metadata: { category: data.category },
    };
  }

  private async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,access_token,instagram_business_account{id,username,name,picture}&access_token=${accessToken}`
    );

    if (!res.ok) {
      throw new PlatformAPIError(`Failed to discover Meta accounts: ${await res.text()}`, 'meta', res.status);
    }

    const data = await res.json();
    const pages = data.data || [];

    const discovered: DiscoveredAccount[] = [];

    for (const page of pages) {
      // Facebook Page
      discovered.push({
        platformAccountId: page.id,
        displayName: page.name,
        username: page.username,
        profileImageUrl: page.picture?.data?.url,
        accountType: 'ORGANIZATION_PAGE',
        metadata: {
          category: page.category,
          pageAccessToken: page.access_token,
          platform: 'facebook',
        },
      });

      // Instagram Business Account (if linked)
      if (page.instagram_business_account?.id) {
        discovered.push({
          platformAccountId: page.instagram_business_account.id,
          displayName: `@${page.instagram_business_account.username}`,
          username: page.instagram_business_account.username,
          profileImageUrl: page.instagram_business_account.picture?.data?.url,
          accountType: 'BUSINESS',
          metadata: {
            linkedFacebookPageId: page.id,
            platform: 'instagram',
          },
        });
      }
    }

    return discovered;
  }
}
