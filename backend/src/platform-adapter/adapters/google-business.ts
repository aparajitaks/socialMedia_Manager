/**
 * Google Business Profile Platform Adapter
 * 
 * Handles OAuth and account connection for Google Business Profile locations.
 */

import { PlatformAdapter, PlatformCapabilities, OAuthAuthorizationResult, OAuthCallbackResult, DiscoveredAccount, TokenRefreshResult, ConnectionVerificationResult, OAuthError, TokenExpiredError, AccountNotFoundError, PermissionDeniedError, RateLimitError, PlatformAPIError } from '../index.js';
import { PlatformType } from '../../types/index.js';

function getGoogleRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/accounts/google_business/callback`;
}

function getGoogleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return null;
}

export class GoogleBusinessAdapter implements PlatformAdapter {
  getPlatform(): PlatformType {
    return 'google_business';
  }

  getCapabilities(account?: any): PlatformCapabilities {
    return {
      publishText: true,
      publishImage: true,
      publishVideo: false,
      publishCarousel: false,
      publishStory: false,
      publishReel: false,
      publishShort: false,
      publishDocument: false,
      publishLink: true,
      firstComment: false,
      hashtags: false,
      mentions: false,
      analytics: true,
      comments: true,
      inbox: false,
      directMessages: false,
      webhooks: true,
    };
  }

  async getAuthorizationUrl(state: string, options?: Record<string, any>): Promise<OAuthAuthorizationResult> {
    const credentials = getGoogleCredentials();
    if (!credentials) {
      throw new OAuthError(
        'Google Business OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        'google_business'
      );
    }

    const redirectUri = getGoogleRedirectUri();
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/business.manage',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return {
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
    };
  }

  async handleOAuthCallback(code: string, state: string, options?: Record<string, any>): Promise<OAuthCallbackResult> {
    const credentials = getGoogleCredentials();
    if (!credentials) {
      throw new OAuthError(
        'Google Business OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        'google_business'
      );
    }

    const redirectUri = getGoogleRedirectUri();

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new OAuthError(`Google token exchange failed (${res.status}): ${err}`, 'google_business');
    }

    const data = await res.json();

    // Discover locations
    const accounts = await this.discoverAccounts(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      accounts,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const credentials = getGoogleCredentials();
    if (!credentials) {
      throw new OAuthError(
        'Google Business OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        'google_business'
      );
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new TokenExpiredError(`Google token refresh failed (${res.status}): ${err}`, 'google_business');
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new OAuthError('Google token refresh returned no access_token', 'google_business');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    };
  }

  async validateConnection(accessToken: string, platformAccountId: string): Promise<ConnectionVerificationResult> {
    try {
      // Extract account and location IDs from platform_account_id
      // Format: accounts/{accountId}/locations/{locationId}
      const parts = platformAccountId.split('/');
      if (parts.length < 4) {
        return { status: 'ERROR', error: 'Invalid platform account ID format' };
      }

      const locationId = parts[parts.length - 1];
      const accountId = parts[1];

      const res = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations/${locationId}?readMask=name,title`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) {
        if (res.status === 401) {
          return { status: 'TOKEN_EXPIRED', error: 'Token has expired' };
        }
        if (res.status === 403) {
          return { status: 'REAUTH_REQUIRED', error: 'Access forbidden' };
        }
        if (res.status === 404) {
          return { status: 'DISCONNECTED', error: 'Location not found' };
        }
        const err = await res.text();
        return { status: 'ERROR', error: `Validation failed: ${err}` };
      }

      const data = await res.json();
      return {
        status: 'CONNECTED',
        displayName: data.title,
      };
    } catch (error: any) {
      return { status: 'ERROR', error: error.message };
    }
  }

  async disconnect(accessToken: string, platformAccountId: string): Promise<void> {
    // Google doesn't provide a token revocation endpoint
    console.log(`Google Business location ${platformAccountId} marked as disconnected. Token will expire naturally.`);
  }

  async getAccountProfile(accessToken: string, platformAccountId: string): Promise<DiscoveredAccount> {
    const parts = platformAccountId.split('/');
    if (parts.length < 4) {
      throw new PlatformAPIError('Invalid platform account ID format', 'google_business');
    }

    const locationId = parts[parts.length - 1];
    const accountId = parts[1];

    const res = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations/${locationId}?readMask=name,title,storefrontAddress,profilePhotos`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      throw new PlatformAPIError(`Failed to fetch Google Business location profile: ${await res.text()}`, 'google_business', res.status);
    }

    const data = await res.json();
    
    return {
      platformAccountId: platformAccountId,
      displayName: data.title,
      accountType: 'BUSINESS',
      metadata: {
        address: data.storefrontAddress?.addressLines?.join(', '),
        profilePhotoUrl: data.profilePhotos?.[0]?.photoUrl,
      },
    };
  }

  private async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
    // 1. Fetch Google Business accounts
    const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!accRes.ok) {
      throw new PlatformAPIError(`Failed to fetch Google Business accounts: ${await accRes.text()}`, 'google_business', accRes.status);
    }

    const accData = await accRes.json();
    const accounts = accData.accounts || [];

    const discovered: DiscoveredAccount[] = [];

    // 2. Fetch locations for each account
    for (const acc of accounts) {
      const locRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title,storefrontAddress`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!locRes.ok) continue;

      const locData = await locRes.json();
      for (const loc of locData.locations || []) {
        discovered.push({
          platformAccountId: `${acc.name}/${loc.name}`,
          displayName: loc.title || 'Google Business Location',
          accountType: 'BUSINESS',
          metadata: {
            address: loc.storefrontAddress?.addressLines?.join(', '),
          },
        });
      }
    }

    return discovered;
  }
}
