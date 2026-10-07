import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db, DEFAULT_CLIENT_ID } from '../db.js';
import { PlatformType, SocialAccount } from '../types/index.js';
import { encryptToken, decryptToken } from '../crypto.js';
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  discoverGoogleLocations,
  getLinkedInAuthUrl,
  exchangeLinkedInCode,
  discoverLinkedInOrganizations,
  getMetaAuthUrl,
  exchangeMetaCode,
  discoverMetaPagesAndInstagram,
} from '../publishers/index.js';

const router = Router();

function isValidMetaAppId(value?: string | null): boolean {
  return !!value && /^\d+$/.test(value);
}

// ---------------------------------------------------------------------------
// GET /api/accounts/config-status
// ---------------------------------------------------------------------------
router.get('/config-status', (req: Request, res: Response) => {
  res.json({
    linkedin: !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
    meta: !!((process.env.META_APP_ID || process.env.META_CLIENT_ID) && (process.env.META_APP_SECRET || process.env.META_CLIENT_SECRET)),
    facebook: !!((process.env.META_APP_ID || process.env.META_CLIENT_ID) && (process.env.META_APP_SECRET || process.env.META_CLIENT_SECRET)),
    instagram: !!((process.env.META_APP_ID || process.env.META_CLIENT_ID) && (process.env.META_APP_SECRET || process.env.META_CLIENT_SECRET)),
    google_business: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    x: !!((process.env.X_CLIENT_ID || process.env.X_API_KEY) && (process.env.X_CLIENT_SECRET || process.env.X_API_SECRET)),
  });
});

// ---------------------------------------------------------------------------
// GET /api/accounts  — list accounts (optionally filtered by ?client_id=...)
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id || req.query.clientId) as string | undefined;
    const accounts = await db.getSocialAccounts(clientId);
    const sanitized = accounts.map(({ access_token, access_token_encrypted, refresh_token, refresh_token_encrypted, ...safe }) => ({
      ...safe,
      display_name: safe.display_name || safe.external_account_name || safe.external_account_id,
      connected_at: safe.created_at,
    }));
    res.json(sanitized);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/accounts/:id  — fetch single account metadata
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request, res: Response) => {
  if (['connect', 'callback', 'config-status'].includes(req.params.id)) {
    return res.status(400).json({ error: 'Invalid account ID' });
  }
  try {
    const account = await db.getSocialAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const { access_token, access_token_encrypted, refresh_token, refresh_token_encrypted, ...safe } = account;
    res.json(safe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/accounts/:id  — disconnect account
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
// POST /api/accounts/:id/verify  — Live network token verification
// ---------------------------------------------------------------------------
router.post('/:id/verify', async (req: Request, res: Response) => {
  try {
    const account = await db.getSocialAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const rawToken = decryptToken(account.access_token_encrypted || (account as any).access_token);
    if (!rawToken) {
      return res.status(400).json({ error: 'No access token available for this account' });
    }

    let verifiedName = account.display_name || account.external_account_name || account.external_account_id;
    let verifiedId = account.external_account_id;
    let details: Record<string, any> = {};

    // 1. Meta (Facebook / Instagram)
    if (account.platform === 'facebook' || account.platform === 'instagram') {
      if (rawToken.startsWith('mock_') || rawToken.startsWith('token_')) {
        details = { mode: 'sandbox', note: 'Sandbox / Simulation Token' };
      } else {
        const pageResp = await fetch(
          `https://graph.facebook.com/v19.0/${account.external_account_id}?fields=id,name,category&access_token=${rawToken}`
        );
        if (!pageResp.ok) {
          const meResp = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${rawToken}`);
          if (!meResp.ok) {
            const errText = await pageResp.text();
            await db.updateSocialAccount(account.id, {
              status: 'REAUTH_REQUIRED',
              last_error: `Meta token invalid or expired: ${errText}`,
              last_synced_at: new Date().toISOString(),
            });
            return res.status(400).json({
              success: false,
              status: 'REAUTH_REQUIRED',
              error: `Meta live verification failed (${pageResp.status}): ${errText}`,
            });
          }
          const meData = await meResp.json();
          verifiedName = meData.name || verifiedName;
          verifiedId = meData.id || verifiedId;
        } else {
          const pageData = await pageResp.json();
          verifiedName = pageData.name || verifiedName;
          verifiedId = pageData.id || verifiedId;
          details = { category: pageData.category };
        }
      }
    }
    // 2. LinkedIn
    else if (account.platform === 'linkedin') {
      if (rawToken.startsWith('mock_') || rawToken.startsWith('token_')) {
        details = { mode: 'sandbox', note: 'Sandbox / Simulation Token' };
      } else {
        const resp = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${rawToken}` },
        });
        if (!resp.ok) {
          const meResp = await fetch('https://api.linkedin.com/v2/me', {
            headers: { Authorization: `Bearer ${rawToken}` },
          });
          if (!meResp.ok) {
            const errText = await resp.text();
            await db.updateSocialAccount(account.id, {
              status: 'REAUTH_REQUIRED',
              last_error: `LinkedIn token invalid: ${errText}`,
              last_synced_at: new Date().toISOString(),
            });
            return res.status(400).json({
              success: false,
              status: 'REAUTH_REQUIRED',
              error: `LinkedIn verification failed: ${errText}`,
            });
          }
          const meData = await meResp.json();
          verifiedName = `${meData.localizedFirstName || ''} ${meData.localizedLastName || ''}`.trim() || verifiedName;
        } else {
          const userData = await resp.json();
          verifiedName = userData.name || verifiedName;
          verifiedId = userData.sub || verifiedId;
        }
      }
    }
    // 3. Google Business
    else if (account.platform === 'google_business') {
      if (rawToken.startsWith('mock_') || rawToken.startsWith('token_')) {
        details = { mode: 'sandbox', note: 'Sandbox / Simulation Token' };
      } else {
        const resp = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
          headers: { Authorization: `Bearer ${rawToken}` },
        });
        if (!resp.ok) {
          const errText = await resp.text();
          await db.updateSocialAccount(account.id, {
            status: 'REAUTH_REQUIRED',
            last_error: `Google Business token invalid: ${errText}`,
            last_synced_at: new Date().toISOString(),
          });
          return res.status(400).json({
            success: false,
            status: 'REAUTH_REQUIRED',
            error: `Google verification failed: ${errText}`,
          });
        }
        const accData = await resp.json();
        const first = accData.accounts?.[0];
        if (first?.accountName) {
          verifiedName = first.accountName;
        }
      }
    }
    // 4. X (Twitter)
    else if (account.platform === 'x') {
      if (rawToken.startsWith('mock_') || rawToken.startsWith('token_')) {
        details = { mode: 'sandbox', note: 'Sandbox / Simulation Token' };
      } else {
        const resp = await fetch('https://api.twitter.com/2/users/me', {
          headers: { Authorization: `Bearer ${rawToken}` },
        });
        if (!resp.ok) {
          const errText = await resp.text();
          await db.updateSocialAccount(account.id, {
            status: 'REAUTH_REQUIRED',
            last_error: `X token invalid: ${errText}`,
            last_synced_at: new Date().toISOString(),
          });
          return res.status(400).json({
            success: false,
            status: 'REAUTH_REQUIRED',
            error: `X verification failed: ${errText}`,
          });
        }
        const xData = await resp.json();
        if (xData.data?.username) {
          verifiedName = `@${xData.data.username}`;
          verifiedId = xData.data.id;
        }
      }
    }

    const updated = await db.updateSocialAccount(account.id, {
      status: 'CONNECTED',
      last_error: null,
      last_synced_at: new Date().toISOString(),
      display_name: verifiedName,
      external_account_name: verifiedName,
      external_account_id: verifiedId,
    });

    res.json({
      success: true,
      status: 'CONNECTED',
      message: `Verified live connection with ${account.platform.toUpperCase()}!`,
      display_name: verifiedName,
      external_account_id: verifiedId,
      last_synced_at: updated.last_synced_at,
      details,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/accounts  (manual token connection / long-lived token)
// ---------------------------------------------------------------------------
router.post(['/', '/connect'], async (req: Request, res: Response) => {
  try {
    const { platform, client_id, display_name, external_account_id, access_token: inputAccessToken } = req.body;

    if (!platform) return res.status(400).json({ error: 'platform is required' });
    const clientId = client_id || DEFAULT_CLIENT_ID;
    const tokenToUse = inputAccessToken?.trim() || `token_${platform}_${Date.now()}`;
    let finalDisplayName = display_name?.trim() || `${platform.toUpperCase()} Account`;
    let finalExtId = external_account_id?.trim() || `ext_${platform}_${Date.now()}`;
    let tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    // Auto-verify with live platform if it's a real token
    if (tokenToUse.startsWith('EAA') && (platform === 'facebook' || platform === 'instagram')) {
      try {
        const metaAppId = process.env.META_APP_ID || process.env.META_CLIENT_ID;
        const metaAppSecret = process.env.META_APP_SECRET || process.env.META_CLIENT_SECRET;
        if (metaAppId && metaAppSecret) {
          const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${tokenToUse}`;
          const exResp = await fetch(exchangeUrl);
          if (exResp.ok) {
            const exData = await exResp.json();
            if (exData.expires_in) {
              tokenExpiresAt = new Date(Date.now() + exData.expires_in * 1000).toISOString();
            }
          }
        }
        // Fetch page details
        const meResp = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${tokenToUse}`);
        if (meResp.ok) {
          const meData = await meResp.json();
          if (meData.name && !display_name) finalDisplayName = meData.name;
          if (meData.id && !external_account_id) finalExtId = meData.id;
        }
      } catch (err: any) {
        console.warn('Meta token inspection note:', err.message);
      }
    }

    const created = await db.upsertSocialAccount({
      client_id: clientId,
      platform: platform as PlatformType,
      display_name: finalDisplayName,
      external_account_name: finalDisplayName,
      external_account_id: finalExtId,
      access_token_encrypted: encryptToken(tokenToUse),
      token_expires_at: tokenExpiresAt,
      status: 'CONNECTED',
      last_synced_at: new Date().toISOString(),
    });

    const safe = { ...created } as any;
    delete safe.access_token;
    delete safe.access_token_encrypted;
    delete safe.refresh_token;
    delete safe.refresh_token_encrypted;
    res.status(201).json(safe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/accounts/:platform/connect  — Initiate Real OAuth 2.0 Flow
// ---------------------------------------------------------------------------
router.get('/:platform/connect', async (req: Request, res: Response) => {
  const platform = req.params.platform as PlatformType;
  const validPlatforms: PlatformType[] = ['google_business', 'linkedin', 'facebook', 'instagram', 'x'];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({ error: `Unsupported platform: ${platform}` });
  }

  const clientId = (req.query.clientId || req.query.client_id) as string || DEFAULT_CLIENT_ID;
  const returnTo = (req.query.returnTo as string) || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${req.protocol}://${req.get('host')}/api/accounts/${platform}/callback`;

  // Simulation mode requested explicitly (permitted only in non-production environments)
  if (req.query.simulate === 'true' || req.query.mock === 'true') {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'OAuth simulation mode is disabled in production.' });
    }
    const state = crypto.randomBytes(24).toString('hex');
    await db.saveOAuthState({
      state,
      client_id: clientId,
      platform: platform as PlatformType,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      return_to: returnTo || null,
    });
    return res.redirect(`/api/accounts/${platform}/callback?code=mock_code_${Date.now()}&state=${state}&client_id=${clientId}&returnTo=${encodeURIComponent(returnTo)}`);
  }

  // Check platform credentials
  const hasMeta = !!((process.env.META_APP_ID || process.env.META_CLIENT_ID) && (process.env.META_APP_SECRET || process.env.META_CLIENT_SECRET));
  const metaClientId = process.env.META_APP_ID || process.env.META_CLIENT_ID;
  const metaClientSecret = process.env.META_APP_SECRET || process.env.META_CLIENT_SECRET;
  const hasValidMeta = isValidMetaAppId(metaClientId) && !!metaClientSecret;
  const hasLinkedIn = !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasX = !!((process.env.X_CLIENT_ID || process.env.X_API_KEY) && (process.env.X_CLIENT_SECRET || process.env.X_API_SECRET));

  const platformLabels: Record<string, string> = {
    linkedin: 'LinkedIn',
    facebook: 'Facebook',
    instagram: 'Instagram',
    google_business: 'Google Business Profile',
    x: 'X (Twitter)',
  };

  const isConfigured =
    platform === 'linkedin' ? hasLinkedIn :
    (platform === 'facebook' || platform === 'instagram') ? hasValidMeta :
    platform === 'google_business' ? hasGoogle :
    platform === 'x' ? hasX : false;

  if (!isConfigured) {
    const errorMsg = platform === 'facebook' || platform === 'instagram'
      ? 'Please configure a valid numeric Meta App ID and App Secret in Settings before connecting Facebook or Instagram.'
      : `Please configure your ${platformLabels[platform] || platform} OAuth credentials in Settings before connecting real accounts.`;
    return res.redirect(`${appUrl}/?error=${encodeURIComponent(errorMsg)}&section=settings&platform=${platform}`);
  }

  // Generate cryptographically secure random state & store with client_id
  const state = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute window

  await db.saveOAuthState({
    state,
    client_id: clientId,
    platform,
    expires_at: expiresAt,
    return_to: returnTo || null,
  });

  let authUrl = '';
  switch (platform) {
    case 'linkedin':
      authUrl = getLinkedInAuthUrl(state);
      break;

    case 'facebook':
    case 'instagram':
      authUrl = getMetaAuthUrl(state, platform);
      break;

    case 'google_business':
      authUrl = getGoogleAuthUrl(state);
      break;

    case 'x': {
      const xClientId = process.env.X_CLIENT_ID || process.env.X_API_KEY;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const xRedirectUri = `${appUrl}/api/accounts/x/callback`;
      // Generate PKCE code_verifier (43-128 chars, unreserved chars only)
      const codeVerifier = crypto.randomBytes(40).toString('base64url');
      // code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      // Patch the existing OAuth state record to include the code_verifier
      await db.saveOAuthState({
        state,
        client_id: clientId,
        platform,
        expires_at: expiresAt,
        code_verifier: codeVerifier,
        return_to: returnTo || null,
      });
      authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${xClientId}&redirect_uri=${encodeURIComponent(xRedirectUri)}&scope=tweet.read%20tweet.write%20users.read%20offline.access&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`;
      break;
    }

    default:
      return res.status(400).json({ error: `Unsupported platform: ${platform}` });
  }

  res.redirect(authUrl);
});

// ---------------------------------------------------------------------------
// GET /api/accounts/:platform/callback  — OAuth Callback & Account Discovery
// ---------------------------------------------------------------------------
router.get('/:platform/callback', async (req: Request, res: Response) => {
  const platform = req.params.platform as PlatformType;
  const { code, state, error, error_description } = req.query;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  let returnTo = (req.query.returnTo as string) || '';

  if (error) {
    const desc = String(error_description || error);
    console.error(`OAuth error from ${platform}:`, desc);
    return res.redirect(`${appUrl}/?error=${encodeURIComponent(`Authentication failed: ${desc}`)}&section=accounts`);
  }

  if (!code) {
    return res.redirect(`${appUrl}/?error=Missing+authorization+code&section=accounts`);
  }

  const isMock = String(code).startsWith('mock_code_') || req.query.simulate === 'true';

  // Issue 4: mock_code_ / simulate=true blocked in production
  if (isMock && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Mock OAuth simulation is disabled in production.' });
  }

  // Issue 3: OAuth CSRF check is mandatory — reject if state is missing or unknown
  if (!state) {
    return res.redirect(`${appUrl}/?error=${encodeURIComponent('Missing OAuth state parameter (CSRF verification failed). Please try again.')}&section=accounts`);
  }

  const storedState = await db.getOAuthState(String(state));
  if (!storedState) {
    return res.redirect(`${appUrl}/?error=${encodeURIComponent('Invalid or expired OAuth session (CSRF verification failed). Please try again.')}&section=accounts`);
  }

  // Derive client_id and returnTo strictly from stored state to prevent tenant hijacking
  const clientId = storedState.client_id;
  returnTo = storedState.return_to || returnTo;
  await db.deleteOAuthState(String(state));

  try {
    let finalToken = `token_${platform}_${Date.now()}`;
    let finalRefreshToken: string | null = null;
    let expiresAt: string | null = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Live Token Exchange
    if (!isMock) {
      if (platform === 'linkedin') {
        const tokens = await exchangeLinkedInCode(String(code));
        finalToken = tokens.access_token;
        finalRefreshToken = tokens.refresh_token || null;
        if (tokens.expires_in) expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      } else if (platform === 'facebook' || platform === 'instagram') {
        const tokens = await exchangeMetaCode(String(code), platform);
        finalToken = tokens.access_token;
        if (tokens.expires_in) expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      } else if (platform === 'google_business') {
        const tokens = await exchangeGoogleCode(String(code));
        finalToken = tokens.access_token;
        finalRefreshToken = tokens.refresh_token || null;
        if (tokens.expires_in) expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      } else if (platform === 'x') {
        const xClientId = process.env.X_CLIENT_ID || process.env.X_API_KEY;
        const xClientSecret = process.env.X_CLIENT_SECRET || process.env.X_API_SECRET;
        const xAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const xRedirectUri = `${xAppUrl}/api/accounts/x/callback`;
        // Retrieve the per-session PKCE verifier that was stored when the flow started
        const storedXState = state ? await db.getOAuthState(String(state)) : null;
        const xCodeVerifier = storedXState?.code_verifier || 'challenge';
        const credentials = Buffer.from(`${xClientId}:${xClientSecret}`).toString('base64');
        const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            code: String(code),
            grant_type: 'authorization_code',
            redirect_uri: xRedirectUri,
            code_verifier: xCodeVerifier,
          }),
        });
        if (!tokenRes.ok) throw new Error(`X token exchange failed: ${await tokenRes.text()}`);
        const tokenData = await tokenRes.json();
        finalToken = tokenData.access_token;
        finalRefreshToken = tokenData.refresh_token || null;
        if (tokenData.expires_in) expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
      }
    }

    // 2. Account Discovery and Real Page/Profile Linking
    if (platform === 'linkedin') {
      const orgs = await discoverLinkedInOrganizations(finalToken);
      const chosen = orgs[0] || { id: 'urn:li:organization:primary', name: 'LinkedIn Company Page' };

      await db.upsertSocialAccount({
        client_id: clientId,
        platform: 'linkedin',
        external_account_id: chosen.id,
        external_account_name: chosen.name,
        display_name: chosen.name,
        access_token_encrypted: encryptToken(finalToken),
        refresh_token_encrypted: finalRefreshToken ? encryptToken(finalRefreshToken) : null,
        token_expires_at: expiresAt,
        status: 'CONNECTED',
        last_synced_at: new Date().toISOString(),
      });
    } else if (platform === 'facebook' || platform === 'instagram') {
      const pages = await discoverMetaPagesAndInstagram(finalToken);
      const chosen = pages[0] || { id: `fb_page_${Date.now()}`, name: 'Facebook Page' };

      if (platform === 'facebook') {
        await db.upsertSocialAccount({
          client_id: clientId,
          platform: 'facebook',
          external_account_id: chosen.id,
          external_account_name: chosen.name,
          display_name: chosen.name,
          access_token_encrypted: encryptToken(finalToken),
          token_expires_at: expiresAt,
          status: 'CONNECTED',
          last_synced_at: new Date().toISOString(),
        });

        if (chosen.instagram_business_account?.id) {
          await db.upsertSocialAccount({
            client_id: clientId,
            platform: 'instagram',
            external_account_id: chosen.instagram_business_account.id,
            external_account_name: `@${chosen.instagram_business_account.username || 'instagram_account'}`,
            display_name: `@${chosen.instagram_business_account.username || 'instagram_account'}`,
            access_token_encrypted: encryptToken(finalToken),
            token_expires_at: expiresAt,
            status: 'CONNECTED',
            last_synced_at: new Date().toISOString(),
          });
        }
      } else {
        const instagramAccount = chosen.instagram_business_account || {
          id: chosen.id,
          username: chosen.name?.replace(/^@/, '').toLowerCase().replace(/\s+/g, '.') || 'instagram_account',
        };

        await db.upsertSocialAccount({
          client_id: clientId,
          platform: 'instagram',
          external_account_id: instagramAccount.id,
          external_account_name: `@${instagramAccount.username || 'instagram_account'}`,
          display_name: `@${instagramAccount.username || 'instagram_account'}`,
          access_token_encrypted: encryptToken(finalToken),
          token_expires_at: expiresAt,
          status: 'CONNECTED',
          last_synced_at: new Date().toISOString(),
        });
      }
    } else if (platform === 'google_business') {
      const locations = await discoverGoogleLocations(finalToken);
      const chosen = locations[0] || { id: `loc_${Date.now()}`, name: 'Google Business Profile' };

      await db.upsertSocialAccount({
        client_id: clientId,
        platform: 'google_business',
        external_account_id: chosen.id,
        external_account_name: chosen.name,
        display_name: chosen.name,
        access_token_encrypted: encryptToken(finalToken),
        refresh_token_encrypted: finalRefreshToken ? encryptToken(finalRefreshToken) : null,
        token_expires_at: expiresAt,
        status: 'CONNECTED',
        last_synced_at: new Date().toISOString(),
      });
    } else if (platform === 'x') {
      let displayName = 'X Profile';
      let extId = `x_usr_${Date.now()}`;
      if (!isMock) {
        try {
          const userRes = await fetch('https://api.twitter.com/2/users/me', {
            headers: { Authorization: `Bearer ${finalToken}` },
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            displayName = `@${userData.data?.username || 'x_user'}`;
            extId = userData.data?.id || extId;
          }
        } catch {}
      }
      await db.upsertSocialAccount({
        client_id: clientId,
        platform: 'x',
        external_account_id: extId,
        external_account_name: displayName,
        display_name: displayName,
        access_token_encrypted: encryptToken(finalToken),
        refresh_token_encrypted: finalRefreshToken ? encryptToken(finalRefreshToken) : null,
        token_expires_at: expiresAt,
        status: 'CONNECTED',
        last_synced_at: new Date().toISOString(),
      });
    }

    // Redirect to client portal if returnTo specified, otherwise dashboard
    if (returnTo && returnTo.startsWith('/')) {
      return res.redirect(`${appUrl}${returnTo}?connected=${platform}`);
    }

    res.redirect(`${appUrl}/?connected=${platform}&client_id=${clientId}&section=accounts`);
  } catch (err: any) {
    console.error(`OAuth callback error for ${platform}:`, err.message);
    res.redirect(`${appUrl}/?error=${encodeURIComponent(`Authentication with ${platform} failed: ${err.message}`)}&section=accounts`);
  }
});

export default router;
