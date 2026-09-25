import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { PlatformType } from '../types/index.js';
import { encryptToken } from '../crypto.js';
import crypto from 'crypto';

const router = Router();

// In-memory CSRF state store (replace with Redis/DB for multi-instance deployments)
const oauthStateStore = new Map<string, { platform: string; expires: number }>();

function generateState(platform: string): string {
  const state = crypto.randomBytes(16).toString('hex');
  oauthStateStore.set(state, { platform, expires: Date.now() + 10 * 60 * 1000 }); // 10-min TTL
  // Purge expired states
  for (const [k, v] of oauthStateStore.entries()) {
    if (v.expires < Date.now()) oauthStateStore.delete(k);
  }
  return state;
}

function validateState(state: string, platform: string): boolean {
  const entry = oauthStateStore.get(state);
  if (!entry) return false;
  if (entry.expires < Date.now()) {
    oauthStateStore.delete(state);
    return false;
  }
  oauthStateStore.delete(state); // one-time use
  return entry.platform === platform;
}

// ---------------------------------------------------------------------------
// GET /api/accounts
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await db.getSocialAccounts();
    const sanitized = accounts.map(({ access_token, refresh_token, ...safe }) => safe);
    res.json(sanitized);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/accounts/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request, res: Response) => {
  // Avoid matching /:id for paths that should hit route-specific handlers below
  if (['connect', 'callback'].includes(req.params.id)) {
    return res.status(400).json({ error: 'Invalid account ID' });
  }
  try {
    const account = await db.getSocialAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const { access_token, refresh_token, ...safe } = account;
    res.json(safe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/accounts/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteSocialAccount(req.params.id);
    res.json({ success: true, message: 'Account disconnected successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/accounts  (manual token / long-lived-token connect)
// ---------------------------------------------------------------------------
router.post(['/', '/connect'], async (req: Request, res: Response) => {
  try {
    const { platform, display_name, external_account_id, access_token: inputAccessToken } = req.body;

    if (!platform) return res.status(400).json({ error: 'platform is required' });
    if (!inputAccessToken?.trim()) {
      return res.status(400).json({ error: 'access_token is required. Paste a valid long-lived token from your platform\'s developer dashboard.' });
    }

    const finalDisplayName = display_name?.trim() || `${platform.toUpperCase()} Account`;
    const finalExtId = external_account_id?.trim() || `ext_${platform}_${Date.now()}`;

    let encryptedToken: string;
    let expiresAt: string;

    // For Meta tokens starting with EAA, exchange for long-lived immediately
    if ((platform === 'facebook' || platform === 'instagram') &&
        inputAccessToken.startsWith('EAA') &&
        process.env.META_APP_ID && process.env.META_APP_SECRET) {
      try {
        const url = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${inputAccessToken}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          encryptedToken = encryptToken(data.access_token || inputAccessToken);
          expiresAt = new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString();
        } else {
          encryptedToken = encryptToken(inputAccessToken);
          expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
        }
      } catch {
        encryptedToken = encryptToken(inputAccessToken);
        expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      }
    } else {
      encryptedToken = encryptToken(inputAccessToken);
      expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    }

    const newAccount = await db.createSocialAccount({
      platform: platform as PlatformType,
      display_name: finalDisplayName,
      access_token: encryptedToken,
      refresh_token: null,
      external_account_id: finalExtId,
      token_expires_at: expiresAt,
      connected_by: null
    });

    const { access_token: _tok, refresh_token: _refTok, ...safe } = newAccount;
    res.status(201).json(safe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/accounts/:platform/connect  — initiate OAuth redirect
// ---------------------------------------------------------------------------
router.get('/:platform/connect', (req: Request, res: Response) => {
  const platform = req.params.platform as PlatformType;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${req.protocol}://${req.get('host')}/api/accounts/${platform}/callback`;

  // Simulation mode for development without real OAuth apps
  if (req.query.simulate === 'true' || req.query.mock === 'true') {
    return res.redirect(`/api/accounts/${platform}/callback?code=mock_code_${Date.now()}`);
  }

  const metaAppId = process.env.META_APP_ID || process.env.META_CLIENT_ID;
  const linkedInClientId = process.env.LINKEDIN_CLIENT_ID;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const xClientId = process.env.X_CLIENT_ID || process.env.X_API_KEY;

  const state = generateState(platform);

  let authUrl = '';
  switch (platform) {
    case 'linkedin':
      if (!linkedInClientId) {
        return res.redirect(`${appUrl}/?error=LinkedIn+client+ID+not+configured`);
      }
      authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${linkedInClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=w_member_social%20w_organization_social%20r_basicprofile%20r_organization_social&state=${state}`;
      break;

    case 'facebook':
    case 'instagram':
      if (!metaAppId) {
        return res.redirect(`${appUrl}/?error=Meta+App+ID+not+configured`);
      }
      authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management&response_type=code&state=${state}`;
      break;

    case 'google_business':
      if (!googleClientId) {
        return res.redirect(`${appUrl}/?error=Google+client+ID+not+configured`);
      }
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/business.manage&access_type=offline&prompt=consent&state=${state}`;
      break;

    case 'x':
      if (!xClientId) {
        return res.redirect(`${appUrl}/?error=X+API+key+not+configured`);
      }
      authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${xClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tweet.read%20tweet.write%20users.read%20offline.access&code_challenge=challenge&code_challenge_method=plain&state=${state}`;
      break;

    default:
      return res.status(400).json({ error: `Unsupported platform: ${platform}` });
  }

  res.redirect(authUrl);
});

// ---------------------------------------------------------------------------
// GET /api/accounts/:platform/callback  — exchange code for token
// ---------------------------------------------------------------------------
router.get('/:platform/callback', async (req: Request, res: Response) => {
  const platform = req.params.platform as PlatformType;
  const code = req.query.code as string;
  const state = req.query.state as string;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${req.protocol}://${req.get('host')}/api/accounts/${platform}/callback`;

  if (!code) {
    return res.redirect(`${appUrl}/?error=Missing+authorization+code`);
  }

  // Validate CSRF state (skip for simulation codes)
  if (!code.startsWith('mock_') && state && !validateState(state, platform)) {
    return res.redirect(`${appUrl}/?error=Invalid+OAuth+state+parameter+(CSRF+check+failed)`);
  }

  try {
    let finalToken = `token_${platform}_${Date.now()}`;
    let finalRefreshToken: string | null = null;
    let finalDisplayName = `${platform.toUpperCase()} Connected`;
    let finalExtId = `ext_${Date.now()}`;
    let tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    // ------ META (Facebook & Instagram) ------
    if ((platform === 'facebook' || platform === 'instagram') && !code.startsWith('mock_')) {
      const metaAppId = process.env.META_APP_ID || process.env.META_CLIENT_ID;
      const metaAppSecret = process.env.META_APP_SECRET || process.env.META_CLIENT_SECRET;

      if (metaAppId && metaAppSecret) {
        try {
          // Short-lived token
          const tokenRes = await fetch(
            `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${metaAppSecret}&code=${code}`
          );
          if (!tokenRes.ok) throw new Error(`Meta token exchange failed: ${await tokenRes.text()}`);
          const tokenData = await tokenRes.json();

          // Exchange for 60-day long-lived token
          const longRes = await fetch(
            `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${tokenData.access_token}`
          );
          const longData = longRes.ok ? await longRes.json() : tokenData;
          finalToken = longData.access_token || tokenData.access_token;
          if (longData.expires_in) {
            tokenExpiresAt = new Date(Date.now() + longData.expires_in * 1000).toISOString();
          }

          // Fetch pages to get name & ID
          const pageRes = await fetch(
            `https://graph.facebook.com/v19.0/me/accounts?fields=name,access_token,instagram_business_account{id,username,name}&access_token=${finalToken}`
          );
          if (pageRes.ok) {
            const pageData = await pageRes.json();
            const firstPage = pageData.data?.[0];
            if (platform === 'instagram' && firstPage?.instagram_business_account) {
              const ig = firstPage.instagram_business_account;
              finalDisplayName = `@${ig.username || ig.name || 'instagram_account'}`;
              finalExtId = ig.id;
            } else if (firstPage) {
              finalDisplayName = firstPage.name || 'Facebook Page';
              finalExtId = firstPage.id;
              // Use page-level token for better post permissions
              if (firstPage.access_token) finalToken = firstPage.access_token;
            }
          }
        } catch (err: any) {
          console.warn('Meta OAuth exchange warning:', err.message);
        }
      }
    }

    // ------ LINKEDIN ------
    if (platform === 'linkedin' && !code.startsWith('mock_')) {
      const clientId = process.env.LINKEDIN_CLIENT_ID;
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

      if (clientId && clientSecret) {
        try {
          const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret
          });
          const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });
          if (!tokenRes.ok) throw new Error(`LinkedIn token exchange failed: ${await tokenRes.text()}`);
          const tokenData = await tokenRes.json();
          finalToken = tokenData.access_token;
          if (tokenData.refresh_token) finalRefreshToken = tokenData.refresh_token;
          if (tokenData.expires_in) {
            tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
          }

          // Fetch org/profile info
          const profileRes = await fetch('https://api.linkedin.com/v2/me', {
            headers: { 'Authorization': `Bearer ${finalToken}` }
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            finalDisplayName = `${profile.localizedFirstName || ''} ${profile.localizedLastName || ''}`.trim() || 'LinkedIn User';
            finalExtId = profile.id || finalExtId;
          }
        } catch (err: any) {
          console.warn('LinkedIn OAuth exchange warning:', err.message);
        }
      }
    }

    // ------ GOOGLE BUSINESS ------
    if (platform === 'google_business' && !code.startsWith('mock_')) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (clientId && clientSecret) {
        try {
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code'
            })
          });
          if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
          const tokenData = await tokenRes.json();
          finalToken = tokenData.access_token;
          if (tokenData.refresh_token) finalRefreshToken = tokenData.refresh_token;
          if (tokenData.expires_in) {
            tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
          }

          // Fetch account list
          const accountsRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
            headers: { 'Authorization': `Bearer ${finalToken}` }
          });
          if (accountsRes.ok) {
            const accountsData = await accountsRes.json();
            const first = accountsData.accounts?.[0];
            if (first) {
              finalDisplayName = first.accountName || 'Google Business Profile';
              finalExtId = first.name?.replace('accounts/', '') || finalExtId;
            }
          }
        } catch (err: any) {
          console.warn('Google OAuth exchange warning:', err.message);
        }
      }
    }

    // ------ X (Twitter) ------
    if (platform === 'x' && !code.startsWith('mock_')) {
      const clientId = process.env.X_CLIENT_ID || process.env.X_API_KEY;
      const clientSecret = process.env.X_CLIENT_SECRET || process.env.X_API_SECRET;

      if (clientId && clientSecret) {
        try {
          const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
          const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              code,
              grant_type: 'authorization_code',
              redirect_uri: redirectUri,
              code_verifier: 'challenge' // Must match code_challenge in authorize request
            })
          });
          if (!tokenRes.ok) throw new Error(`X token exchange failed: ${await tokenRes.text()}`);
          const tokenData = await tokenRes.json();
          finalToken = tokenData.access_token;
          if (tokenData.refresh_token) finalRefreshToken = tokenData.refresh_token;
          if (tokenData.expires_in) {
            tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
          }

          // Fetch user info
          const userRes = await fetch('https://api.twitter.com/2/users/me', {
            headers: { 'Authorization': `Bearer ${finalToken}` }
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            finalDisplayName = `@${userData.data?.username || 'x_user'}`;
            finalExtId = userData.data?.id || finalExtId;
          }
        } catch (err: any) {
          console.warn('X OAuth exchange warning:', err.message);
        }
      }
    }

    // Save the account
    await db.createSocialAccount({
      platform,
      display_name: finalDisplayName,
      access_token: encryptToken(finalToken),
      refresh_token: finalRefreshToken ? encryptToken(finalRefreshToken) : null,
      external_account_id: finalExtId,
      token_expires_at: tokenExpiresAt,
      connected_by: null
    });

    res.redirect(`${appUrl}/?connected=${platform}`);
  } catch (error: any) {
    console.error(`OAuth callback error for ${platform}:`, error.message);
    res.redirect(`${appUrl}/?error=${encodeURIComponent(error.message)}`);
  }
});

export default router;
