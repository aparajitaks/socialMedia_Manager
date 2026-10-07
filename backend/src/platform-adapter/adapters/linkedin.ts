/**
 * LinkedIn Platform Adapter
 * 
 * Handles OAuth and account connection for LinkedIn Company Pages.
 * Supports both personal profiles and organization pages.
 */

import { PlatformAdapter, PlatformCapabilities, OAuthAuthorizationResult, OAuthCallbackResult, DiscoveredAccount, TokenRefreshResult, ConnectionVerificationResult, OAuthError, TokenExpiredError, AccountNotFoundError, PermissionDeniedError, RateLimitError, PlatformAPIError } from '../index.js';
import { PlatformType } from '../../types/index.js';

function getLinkedInRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return process.env.LINKEDIN_REDIRECT_URI || `${appUrl}/api/accounts/linkedin/callback`;
}

function getLinkedInCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return null;
}

export class LinkedInAdapter implements PlatformAdapter {
  getPlatform(): PlatformType {
    return 'linkedin';
  }

  getCapabilities(account?: any): PlatformCapabilities {
    // Capabilities may differ between personal profiles and organization pages
    const isOrganization = account?.platform_account_id?.startsWith('urn:li:organization:');
    
    if (isOrganization) {
      return {
        publishText: true,
        publishImage: true,
        publishVideo: true,
        publishCarousel: false,
        publishStory: false,
        publishReel: false,
        publishShort: false,
        publishDocument: true,
        publishLink: true,
        firstComment: false,
        hashtags: true,
        mentions: true,
        analytics: true,
        comments: true,
        inbox: false,
        directMessages: false,
        webhooks: true,
      };
    }
    
    // Personal profile capabilities (more limited)
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
      analytics: true,
      comments: true,
      inbox: false,
      directMessages: false,
      webhooks: true,
    };
  }

  async getAuthorizationUrl(state: string, options?: Record<string, any>): Promise<OAuthAuthorizationResult> {
    const credentials = getLinkedInCredentials();
    if (!credentials) {
      throw new OAuthError(
        'LinkedIn OAuth credentials not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.',
        'linkedin'
      );
    }

    const redirectUri = getLinkedInRedirectUri();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: credentials.clientId,
      redirect_uri: redirectUri,
      state,
      scope: 'openid profile email w_member_social w_organization_social r_organization_social',
    });

    return {
      authorizationUrl: `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
      state,
    };
  }

  async handleOAuthCallback(code: string, state: string, options?: Record<string, any>): Promise<OAuthCallbackResult> {
    const credentials = getLinkedInCredentials();
    if (!credentials) {
      throw new OAuthError(
        'LinkedIn OAuth credentials not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.',
        'linkedin'
      );
    }

    const redirectUri = getLinkedInRedirectUri();

    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new OAuthError(`LinkedIn token exchange failed (${res.status}): ${err}`, 'linkedin');
    }

    const data = await res.json();

    // Discover organizations
    const accounts = await this.discoverAccounts(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      accounts,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const credentials = getLinkedInCredentials();
    if (!credentials) {
      throw new OAuthError(
        'LinkedIn OAuth credentials not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.',
        'linkedin'
      );
    }

    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new TokenExpiredError(`LinkedIn token refresh failed (${res.status}): ${err}`, 'linkedin');
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new OAuthError('LinkedIn token refresh returned no access_token', 'linkedin');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    };
  }

  async validateConnection(accessToken: string, platformAccountId: string): Promise<ConnectionVerificationResult> {
    try {
      const res = await fetch(
        `https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&state=APPROVED`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) {
        if (res.status === 401) {
          return { status: 'TOKEN_EXPIRED', error: 'Token has expired' };
        }
        const err = await res.text();
        return { status: 'ERROR', error: `Validation failed: ${err}` };
      }

      const data = await res.json();
      const hasAccess = data.elements?.some((el: any) => 
        el.organizationalTarget === platformAccountId || 
        el.organizationalTarget?.endsWith(platformAccountId)
      );

      if (!hasAccess) {
        return { status: 'REAUTH_REQUIRED', error: 'No longer have access to this organization' };
      }

      // Fetch org details
      const orgId = platformAccountId.includes(':') ? platformAccountId.split(':').pop() : platformAccountId;
      const orgRes = await fetch(`https://api.linkedin.com/v2/organizations/${orgId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (orgRes.ok) {
        const orgData = await orgRes.json();
        return {
          status: 'CONNECTED',
          displayName: orgData.localizedName,
        };
      }

      return { status: 'CONNECTED' };
    } catch (error: any) {
      return { status: 'ERROR', error: error.message };
    }
  }

  async disconnect(accessToken: string, platformAccountId: string): Promise<void> {
    // LinkedIn doesn't provide a token revocation endpoint
    console.log(`LinkedIn account ${platformAccountId} marked as disconnected. Token will expire naturally.`);
  }

  async getAccountProfile(accessToken: string, platformAccountId: string): Promise<DiscoveredAccount> {
    const orgId = platformAccountId.includes(':') ? platformAccountId.split(':').pop() : platformAccountId;
    
    const res = await fetch(`https://api.linkedin.com/v2/organizations/${orgId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new PlatformAPIError(`Failed to fetch LinkedIn account profile: ${await res.text()}`, 'linkedin', res.status);
    }

    const data = await res.json();
    
    return {
      platformAccountId: platformAccountId,
      displayName: data.localizedName,
      accountType: 'ORGANIZATION_PAGE',
      metadata: {
        vanityName: data.vanityName,
        logoUrl: data.logoV2?.original?.elements?.[0]?.identifiers?.[0]?.identifier,
      },
    };
  }

  private async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
    const aclsRes = await fetch(
      'https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&state=APPROVED',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!aclsRes.ok) {
      throw new PlatformAPIError(`Failed to discover LinkedIn organizations: ${await aclsRes.text()}`, 'linkedin', aclsRes.status);
    }

    const aclsData = await aclsRes.json();
    const elements = aclsData.elements || [];

    const discovered: DiscoveredAccount[] = [];

    for (const el of elements) {
      const orgUrn = el.organizationalTarget;
      if (!orgUrn || !orgUrn.startsWith('urn:li:organization:')) continue;

      const orgId = orgUrn.split(':').pop();
      
      try {
        const orgRes = await fetch(`https://api.linkedin.com/v2/organizations/${orgId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (orgRes.ok) {
          const orgData = await orgRes.json();
          discovered.push({
            platformAccountId: orgUrn,
            displayName: orgData.localizedName,
            username: orgData.vanityName,
            accountType: 'ORGANIZATION_PAGE',
            metadata: {
              vanityName: orgData.vanityName,
              logoUrl: orgData.logoV2?.original?.elements?.[0]?.identifiers?.[0]?.identifier,
            },
          });
        }
      } catch (err) {
        console.warn(`Failed to fetch details for org ${orgUrn}:`, err);
      }
    }

    return discovered;
  }
}
