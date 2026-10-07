import { AccountDiscoveryResult } from '../types.js';
import { requireLiveCredentials } from '../credentials.js';

export function getLinkedInAuthUrl(state: string): string {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${appUrl}/api/accounts/linkedin/callback`;

  if (!clientId) {
    throw new Error('LINKEDIN_CLIENT_ID is not configured');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'openid profile email w_member_social w_organization_social r_organization_social',
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export async function exchangeLinkedInCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  // No app credentials means there is no real OAuth app to exchange with —
  // fail with an actionable message instead of posting an empty client_id.
  const { LINKEDIN_CLIENT_ID: clientId, LINKEDIN_CLIENT_SECRET: clientSecret } = requireLiveCredentials(
    'LinkedIn',
    ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${appUrl}/api/accounts/linkedin/callback`;

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId || '',
      client_secret: clientSecret || '',
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${err}`);
  }

  return res.json();
}

/**
 * Account discovery per docs/02-oauth-flows.md
 * Discovers organizations the member can manage / post to.
 */
export async function discoverLinkedInOrganizations(accessToken: string): Promise<AccountDiscoveryResult[]> {
  if (accessToken.startsWith('mock_') || !process.env.LINKEDIN_CLIENT_ID) {
    return [
      {
        id: 'urn:li:organization:98214',
        name: 'Apex Digital Systems',
        details: 'Company Page • 1.2k followers',
      },
      {
        id: 'urn:li:organization:104928',
        name: 'Apex Fitness & Health',
        details: 'Company Page • 540 followers',
      },
    ];
  }

  try {
    const aclsRes = await fetch(
      'https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&state=APPROVED',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!aclsRes.ok) {
      throw new Error(`Failed to fetch LinkedIn organizational entities: ${await aclsRes.text()}`);
    }

    const aclsData = await aclsRes.json();
    const elements = aclsData.elements || [];

    const discovered: AccountDiscoveryResult[] = [];
    for (const el of elements) {
      const orgUrn = el.organizationalTarget;
      if (!orgUrn) continue;

      // Extract org ID from URN: urn:li:organization:12345
      const orgId = orgUrn.split(':').pop();
      try {
        const orgRes = await fetch(`https://api.linkedin.com/v2/organizations/${orgId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (orgRes.ok) {
          const orgData = await orgRes.json();
          discovered.push({
            id: orgUrn,
            name: orgData.localizedName || orgUrn,
            details: orgData.vanityName ? `linkedin.com/company/${orgData.vanityName}` : undefined,
          });
          continue;
        }
      } catch (_) {}

      discovered.push({
        id: orgUrn,
        name: `Organization (${orgId})`,
      });
    }

    return discovered;
  } catch (err) {
    console.error('LinkedIn discovery error:', err);
    return [
      {
        id: 'urn:li:organization:default',
        name: 'Connected Company Page',
      },
    ];
  }
}
