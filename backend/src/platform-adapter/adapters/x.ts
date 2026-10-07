/**
 * X (Twitter) Platform Adapter
 * 
 * Handles OAuth 2.0 with PKCE and account connection for X accounts.
 */

import crypto from 'crypto';
import { PlatformAdapter, PlatformCapabilities, OAuthAuthorizationResult, OAuthCallbackResult, DiscoveredAccount, TokenRefreshResult, ConnectionVerificationResult, OAuthError, TokenExpiredError, AccountNotFoundError, PermissionDeniedError, RateLimitError, PlatformAPIError } from '../index.js';
import { PlatformType } from '../../types/index.js';

function getXRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return process.env.X_REDIRECT_URI || `${appUrl}/api/accounts/x/callback`;
}

function getXCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.X_CLIENT_ID || process.env.X_API_KEY;
  const clientSecret = process.env.X_CLIENT_SECRET || process.env.X_API_SECRET;
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return null;
}

export class XAdapter implements PlatformAdapter {
  private codeVerifier?: string;

  getPlatform(): PlatformType {
    return 'x';
  }

  getCapabilities(account?: any): PlatformCapabilities {
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
      hashtags: true,
      mentions: true,
      analytics: false, // Not yet implemented
      comments: false, // Not yet implemented
      inbox: false,
      directMessages: false,
      webhooks: true,
    };
  }

  async getAuthorizationUrl(state: string, options?: Record<string, any>): Promise<OAuthAuthorizationResult> {
    const credentials = getXCredentials();
    if (!credentials) {
      throw new OAuthError(
        'X OAuth credentials not configured. Please set X_CLIENT_ID and X_CLIENT_SECRET.',
        'x'
      );
    }

    const redirectUri = getXRedirectUri();

    // Generate PKCE code_verifier (43-128 chars, unreserved chars only)
    this.codeVerifier = crypto.randomBytes(40).toString('base64url');
    // code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
    const codeChallenge = crypto.createHash('sha256').update(this.codeVerifier).digest('base64url');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: credentials.clientId,
      redirect_uri: redirectUri,
      scope: 'tweet.read tweet.write users.read offline.access',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    return {
      authorizationUrl: `https://twitter.com/i/oauth2/authorize?${params.toString()}`,
      state,
    };
  }

  async handleOAuthCallback(code: string, state: string, options?: Record<string, any>): Promise<OAuthCallbackResult> {
    const credentials = getXCredentials();
    if (!credentials) {
      throw new OAuthError(
        'X OAuth credentials not configured. Please set X_CLIENT_ID and X_CLIENT_SECRET.',
        'x'
      );
    }

    const redirectUri = getXRedirectUri();
    const codeVerifier = options?.code_verifier || this.codeVerifier;

    if (!codeVerifier) {
      throw new OAuthError('PKCE code_verifier not found. Authorization may have been initiated elsewhere.', 'x');
    }

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        client_id: credentials.clientId,
        code_verifier: codeVerifier,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new OAuthError(`X token exchange failed (${res.status}): ${err}`, 'x');
    }

    const data = await res.json();

    // Discover user account
    const accounts = await this.discoverAccounts(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      accounts,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const credentials = getXCredentials();
    if (!credentials) {
      throw new OAuthError(
        'X OAuth credentials not configured. Please set X_CLIENT_ID and X_CLIENT_SECRET.',
        'x'
      );
    }

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: credentials.clientId,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new TokenExpiredError(`X token refresh failed (${res.status}): ${err}`, 'x');
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new OAuthError('X token refresh returned no access_token', 'x');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    };
  }

  async validateConnection(accessToken: string, platformAccountId: string): Promise<ConnectionVerificationResult> {
    try {
      const res = await fetch('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          return { status: 'TOKEN_EXPIRED', error: 'Token has expired' };
        }
        if (res.status === 403) {
          return { status: 'REAUTH_REQUIRED', error: 'Access forbidden' };
        }
        const err = await res.text();
        return { status: 'ERROR', error: `Validation failed: ${err}` };
      }

      const data = await res.json();
      if (data.data?.id !== platformAccountId) {
        return { status: 'REAUTH_REQUIRED', error: 'Account ID mismatch' };
      }

      return {
        status: 'CONNECTED',
        displayName: `@${data.data.username}`,
        username: data.data.username,
        profileImageUrl: data.data.profile_image_url,
      };
    } catch (error: any) {
      return { status: 'ERROR', error: error.message };
    }
  }

  async disconnect(accessToken: string, platformAccountId: string): Promise<void> {
    // X doesn't provide a token revocation endpoint
    console.log(`X account ${platformAccountId} marked as disconnected. Token will expire naturally.`);
  }

  async getAccountProfile(accessToken: string, platformAccountId: string): Promise<DiscoveredAccount> {
    const res = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new PlatformAPIError(`Failed to fetch X account profile: ${await res.text()}`, 'x', res.status);
    }

    const data = await res.json();
    
    return {
      platformAccountId: data.data.id,
      displayName: data.data.name,
      username: data.data.username,
      profileImageUrl: data.data.profile_image_url,
      accountType: 'PERSONAL',
      metadata: {
        verified: data.data.verified,
        protected: data.data.protected,
      },
    };
  }

  private async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
    const res = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new PlatformAPIError(`Failed to discover X account: ${await res.text()}`, 'x', res.status);
    }

    const data = await res.json();

    return [
      {
        platformAccountId: data.data.id,
        displayName: data.data.name,
        username: data.data.username,
        profileImageUrl: data.data.profile_image_url,
        accountType: 'PERSONAL',
        metadata: {
          verified: data.data.verified,
          protected: data.data.protected,
        },
      },
    ];
  }
}
