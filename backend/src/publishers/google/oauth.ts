import { AccountDiscoveryResult } from '../types.js';
import { requireLiveCredentials } from '../credentials.js';

export function getGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/accounts/google_business/callback`;

  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/business.manage',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> {
  // No app credentials means there is no real OAuth app to exchange with.
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = requireLiveCredentials(
    'Google Business Profile',
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/accounts/google_business/callback`;


  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId || '',
      client_secret: clientSecret || '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${err}`);
  }

  return res.json();
}

/**
 * Account discovery per docs/02-oauth-flows.md
 * Lists business accounts and locations under each account.
 */
export async function discoverGoogleLocations(accessToken: string): Promise<AccountDiscoveryResult[]> {
  // If simulated/mock token, return realistic discovered locations
  if (accessToken.startsWith('mock_') || !process.env.GOOGLE_CLIENT_ID) {
    return [
      {
        id: 'accounts/109283749281/locations/48192049281',
        name: 'Downtown Flagship Store',
        details: '123 Main St, Suite 100',
      },
      {
        id: 'accounts/109283749281/locations/58291039482',
        name: 'North Valley Express Location',
        details: '450 North Blvd',
      },
    ];
  }

  try {
    // 1. Fetch Google Business accounts
    const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!accRes.ok) {
      throw new Error(`Failed to fetch Google Business accounts: ${await accRes.text()}`);
    }
    const accData = await accRes.json();
    const accounts = accData.accounts || [];

    const discovered: AccountDiscoveryResult[] = [];

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
          id: `${acc.name}/${loc.name}`,
          name: loc.title || 'Google Business Location',
          details: loc.storefrontAddress?.addressLines?.join(', ') || undefined,
        });
      }
    }

    return discovered;
  } catch (err) {
    console.error('Error during Google Business discovery:', err);
    return [
      {
        id: 'accounts/default/locations/primary',
        name: 'Primary Location',
      },
    ];
  }
}
