import { AccountDiscoveryResult } from '../types.js';
import { requireCredentialAlternatives } from '../credentials.js';

const META_APP_GROUPS = [
  ['META_CLIENT_ID', 'META_CLIENT_SECRET'],
  ['META_APP_ID', 'META_APP_SECRET'],
];
const META_APP_DESCRIPTION = 'META_CLIENT_ID + META_CLIENT_SECRET (or META_APP_ID + META_APP_SECRET)';

function getMetaRedirectUri(platform: 'facebook' | 'instagram'): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const configured = process.env.META_REDIRECT_URI;

  if (configured) {
    return configured.replace('/facebook/callback', `/${platform}/callback`);
  }

  return `${appUrl}/api/accounts/${platform}/callback`;
}

export function getMetaAuthUrl(state: string, platform: 'facebook' | 'instagram' = 'facebook'): string {
  const clientId = process.env.META_CLIENT_ID || process.env.META_APP_ID;
  const redirectUri = getMetaRedirectUri(platform);

  if (!clientId || !/^\d+$/.test(clientId)) {
    throw new Error('META_CLIENT_ID is not configured correctly. Use the numeric App ID from Meta for Developers.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
  });

  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

export async function exchangeMetaCode(code: string, platform: 'facebook' | 'instagram' = 'facebook'): Promise<{
  access_token: string;
  expires_in?: number;
}> {
  // Either credential group works, but one of them must be complete.
  const metaCredentials = requireCredentialAlternatives('Meta', META_APP_GROUPS, META_APP_DESCRIPTION);
  const clientId = metaCredentials.values.META_CLIENT_ID || metaCredentials.values.META_APP_ID;
  const clientSecret = metaCredentials.values.META_CLIENT_SECRET || metaCredentials.values.META_APP_SECRET;
  const redirectUri = getMetaRedirectUri(platform);


  // Exchange for short-lived token
  const res = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&client_secret=${clientSecret}&code=${code}`
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta token exchange failed (${res.status}): ${err}`);
  }

  const shortTokenData = await res.json();
  const shortToken = shortTokenData.access_token;

  // Exchange for long-lived Page/user token (per docs/02-oauth-flows.md)
  try {
    const longRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortToken}`
    );
    if (longRes.ok) {
      const longData = await longRes.json();
      return longData;
    }
  } catch (_) {}

  return shortTokenData;
}

/**
 * Account discovery per docs/02-oauth-flows.md:
 * Calls /me/accounts -> lists Pages + checks instagram_business_account
 */
export async function discoverMetaPagesAndInstagram(accessToken: string): Promise<AccountDiscoveryResult[]> {
  if (accessToken.startsWith('mock_') || !(process.env.META_CLIENT_ID || process.env.META_APP_ID)) {
    return [
      {
        id: 'fb_page_109283741',
        name: 'Apex Growth Page',
        details: 'Facebook Business Page',
        instagram_business_account: {
          id: 'ig_usr_591820491',
          username: 'apex.official',
        },
      },
      {
        id: 'fb_page_849201948',
        name: 'Lumina Cafe Community',
        details: 'Facebook Community Page',
      },
    ];
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,access_token,instagram_business_account{id,username,name}&access_token=${accessToken}`
    );

    if (!res.ok) {
      throw new Error(`Failed to discover Facebook Pages: ${await res.text()}`);
    }

    const data = await res.json();
    const pages = data.data || [];

    const discovered: AccountDiscoveryResult[] = [];
    for (const page of pages) {
      const item: AccountDiscoveryResult = {
        id: page.id,
        name: page.name,
        category: page.category,
        details: page.category ? `Facebook Page • ${page.category}` : 'Facebook Page',
      };

      if (page.instagram_business_account?.id) {
        item.instagram_business_account = {
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username || page.instagram_business_account.name || 'Instagram Business',
        };
      }

      discovered.push(item);
    }

    return discovered;
  } catch (err) {
    console.error('Meta discovery error:', err);
    return [
      {
        id: 'fb_page_default',
        name: 'Facebook Page',
      },
    ];
  }
}
