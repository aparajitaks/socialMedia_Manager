import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { PlatformType } from '../types/index.js';
import { encryptToken } from '../crypto.js';
import {
  exchangeGoogleCode,
  discoverGoogleLocations,
  exchangeLinkedInCode,
  discoverLinkedInOrganizations,
  exchangeMetaCode,
  discoverMetaPagesAndInstagram,
} from '../publishers/index.js';

const router = Router();

// GET /api/oauth/:platform/connect  — initiate OAuth redirect
router.get('/:platform/connect', (req: Request, res: Response) => {
  const { platform } = req.params;
  const clientId = (req.query.clientId || req.query.client_id) as string || '';
  const returnTo = (req.query.returnTo as string) || '';
  const simulate = req.query.simulate === 'true' ? '&simulate=true' : '';
  res.redirect(`/api/accounts/${platform}/connect?clientId=${clientId}&returnTo=${encodeURIComponent(returnTo)}${simulate}`);
});

/**
 * Shared OAuth Callback route per docs/02-oauth-flows.md:
 * GET /api/oauth/:platform/callback?code=...&state=...
 */
router.get('/:platform/callback', async (req: Request, res: Response) => {
  const { platform } = req.params;
  const { code, state, error, error_description } = req.query;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    console.error(`OAuth platform returned error for ${platform}:`, error, error_description);
    return res.redirect(`${appUrl}/?error=${encodeURIComponent(String(error_description || error))}`);
  }

  if (!code || !state) {
    return res.redirect(`${appUrl}/?error=${encodeURIComponent('Missing OAuth code or state parameter')}`);
  }

  try {
    // 1. Validate state in oauth_states table
    const oauthState = await db.getOAuthState(String(state));
    if (!oauthState) {
      return res.redirect(`${appUrl}/?error=${encodeURIComponent('Invalid or expired OAuth state (CSRF check failed)')}`);
    }

    if (new Date(oauthState.expires_at).getTime() < Date.now()) {
      await db.deleteOAuthState(String(state));
      return res.redirect(`${appUrl}/?error=${encodeURIComponent('OAuth session expired. Please try connecting again.')}`);
    }

    // 2. Delete state immediately (single-use per docs/02-oauth-flows.md)
    await db.deleteOAuthState(String(state));

    const clientId = oauthState.client_id;
    const isMock = String(code).startsWith('mock_code_') || req.query.simulated === 'true';

    if (isMock && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Mock OAuth simulation is disabled in production.' });
    }

    let accessToken = `token_${Date.now()}`;
    let refreshToken: string | null = null;
    let expiresAt: string | null = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    // 3. Platform token exchange
    if (!isMock) {
      if (platform === 'google_business') {
        const tokens = await exchangeGoogleCode(String(code));
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token || null;
        if (tokens.expires_in) {
          expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        }
      } else if (platform === 'linkedin') {
        const tokens = await exchangeLinkedInCode(String(code));
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token || null;
        if (tokens.expires_in) {
          expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        }
      } else if (platform === 'facebook' || platform === 'instagram') {
        const tokens = await exchangeMetaCode(String(code));
        accessToken = tokens.access_token;
        if (tokens.expires_in) {
          expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        }
      }
    }

    // 4. Account Discovery Step (docs/02-oauth-flows.md)
    if (platform === 'google_business') {
      const locations = await discoverGoogleLocations(accessToken);
      const chosen = locations[0] || { id: 'locations/primary', name: 'Google Business Profile' };

      await db.upsertSocialAccount({
        client_id: clientId,
        platform: 'google_business',
        external_account_id: chosen.id,
        external_account_name: chosen.name,
        display_name: chosen.name,
        access_token_encrypted: encryptToken(accessToken),
        refresh_token_encrypted: refreshToken ? encryptToken(refreshToken) : null,
        token_expires_at: expiresAt,
        status: 'CONNECTED',
      });
    } else if (platform === 'linkedin') {
      const orgs = await discoverLinkedInOrganizations(accessToken);
      const chosen = orgs[0] || { id: 'urn:li:organization:primary', name: 'LinkedIn Company Page' };

      await db.upsertSocialAccount({
        client_id: clientId,
        platform: 'linkedin',
        external_account_id: chosen.id,
        external_account_name: chosen.name,
        display_name: chosen.name,
        access_token_encrypted: encryptToken(accessToken),
        refresh_token_encrypted: refreshToken ? encryptToken(refreshToken) : null,
        token_expires_at: expiresAt,
        status: 'CONNECTED',
      });
    } else if (platform === 'facebook' || platform === 'instagram') {
      const pages = await discoverMetaPagesAndInstagram(accessToken);
      const chosen = pages[0] || { id: 'fb_page_default', name: 'Facebook Page' };

      // Upsert Facebook Page
      await db.upsertSocialAccount({
        client_id: clientId,
        platform: 'facebook',
        external_account_id: chosen.id,
        external_account_name: chosen.name,
        display_name: chosen.name,
        access_token_encrypted: encryptToken(accessToken),
        token_expires_at: expiresAt,
        status: 'CONNECTED',
      });

      // Upsert connected Instagram account if available (docs/02-oauth-flows.md Step 5)
      if (chosen.instagram_business_account?.id) {
        await db.upsertSocialAccount({
          client_id: clientId,
          platform: 'instagram',
          external_account_id: chosen.instagram_business_account.id,
          external_account_name: `@${chosen.instagram_business_account.username} (Instagram)`,
          external_username: chosen.instagram_business_account.username,
          display_name: `@${chosen.instagram_business_account.username} (Instagram)`,
          access_token_encrypted: encryptToken(accessToken),
          token_expires_at: expiresAt,
          status: 'CONNECTED',
        });
      }
    } else {
      // General fallback (e.g. X)
      await db.upsertSocialAccount({
        client_id: clientId,
        platform: platform as PlatformType,
        external_account_id: `${platform}_usr_${Date.now().toString().slice(-6)}`,
        external_account_name: `${platform.toUpperCase()} Account`,
        display_name: `${platform.toUpperCase()} Account`,
        access_token_encrypted: encryptToken(accessToken),
        status: 'CONNECTED',
      });
    }

    // 5. Redirect browser back to client's social accounts dashboard
    res.redirect(`${appUrl}/?client_id=${clientId}&section=accounts&connected=${platform}`);
  } catch (err: any) {
    console.error('OAuth callback failed:', err);
    res.redirect(`${appUrl}/?error=${encodeURIComponent(err.message || 'OAuth connection failed')}`);
  }
});

export default router;
