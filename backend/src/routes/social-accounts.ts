/**
 * Social Accounts API Routes
 * 
 * Handles social account connection, verification, and management using the platform adapter pattern.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { PlatformType, SocialAccount } from '../types/index.js';
import { encryptToken, decryptToken } from '../crypto.js';
import { 
  getPlatformAdapter, 
  getPlatformCapabilities, 
  getPlatformInfo,
  getAllPlatforms,
  isPlatformSupported,
  OAuthError,
  TokenExpiredError,
  AccountNotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnsupportedCapabilityError,
  PlatformAPIError,
} from '../platform-adapter/index.js';
import { requireAuth } from './auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// Tenant isolation helper — social accounts
// ---------------------------------------------------------------------------
async function assertAccountOwnedByOrg(
  account: { client_id: string },
  req: Request
): Promise<{ status: number; body: object } | null> {
  const callerOrgId: string | undefined = (req as any).organizationId;
  if (!callerOrgId) return null; // zero-config dev mode — no isolation
  const client = await db.getClient(account.client_id);
  if (!client || client.organization_id !== callerOrgId) {
    return { status: 403, body: { error: 'Access to this account is not authorized' } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/social-accounts/config-status
// ---------------------------------------------------------------------------
router.get('/config-status', (req: Request, res: Response) => {
  const platforms = ['meta', 'facebook', 'instagram', 'linkedin', 'x', 'google_business'];
  const status: Record<string, boolean> = {};
  
  for (const platform of platforms) {
    const info = getPlatformInfo(platform as PlatformType);
    status[platform] = info?.status === 'REAL' || false;
  }
  
  res.json(status);
});

// ---------------------------------------------------------------------------
// GET /api/social-accounts/capabilities — Capability Matrix for all platforms
// ---------------------------------------------------------------------------
router.get('/capabilities', (_req: Request, res: Response) => {
  const platforms = getAllPlatforms();
  res.json({
    platforms: platforms.map((p) => ({
      platform: p.platform,
      status: p.status,
      capabilities: p.capabilities,
      notes: p.notes,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /api/social-accounts/capabilities/:platform — Specific platform capabilities
// ---------------------------------------------------------------------------
router.get('/capabilities/:platform', (req: Request, res: Response) => {
  const platform = req.params.platform as PlatformType;
  const info = getPlatformInfo(platform);
  if (!info) {
    return res.status(404).json({ error: `Platform ${platform} not found in registry` });
  }

  res.json({
    platform: info.platform,
    status: info.status,
    capabilities: info.capabilities,
    notes: info.notes,
  });
});

// ---------------------------------------------------------------------------
// GET /api/social-accounts
// ---------------------------------------------------------------------------
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const callerOrgId: string | undefined = (req as any).organizationId;
    const clientId = (req.query.client_id || req.query.clientId) as string | undefined;

    // Validate requested clientId belongs to caller's org
    if (clientId && callerOrgId) {
      const client = await db.getClient(clientId);
      if (!client || client.organization_id !== callerOrgId) {
        return res.status(403).json({ error: 'Access to this client is not authorized' });
      }
    }

    const accounts = await db.getSocialAccounts(clientId);

    // When no clientId filter, scope to org's clients
    let filteredAccounts = accounts;
    if (!clientId && callerOrgId) {
      const orgClients = await db.getClients(callerOrgId);
      const orgClientIds = new Set(orgClients.map((c) => c.id));
      filteredAccounts = accounts.filter((a) => orgClientIds.has(a.client_id));
    }
    
    // Return safe account data (no tokens)
    const sanitized = filteredAccounts.map((acc) => {
      const { 
        access_token, 
        access_token_encrypted, 
        encrypted_access_token,
        refresh_token, 
        refresh_token_encrypted, 
        encrypted_refresh_token,
        ...safe 
      } = acc as any;
      
      return {
        ...safe,
        platform_account_id: safe.platform_account_id || safe.external_account_id,
        connected_at: safe.connected_at || safe.created_at,
        capabilities: getPlatformCapabilities(safe.platform, acc),
      };
    });
    
    res.json(sanitized);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/social-accounts/:id
// ---------------------------------------------------------------------------
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const account = await db.getSocialAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const tenantErr = await assertAccountOwnedByOrg(account, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);
    
    const { 
      access_token, 
      access_token_encrypted, 
      encrypted_access_token,
      refresh_token, 
      refresh_token_encrypted, 
      encrypted_refresh_token,
      ...safe 
    } = account as any;
    
    res.json({
      ...safe,
      platform_account_id: safe.platform_account_id || safe.external_account_id,
      connected_at: safe.connected_at || safe.created_at,
      capabilities: getPlatformCapabilities(safe.platform, account),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/social-accounts/:id
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const account = await db.getSocialAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const tenantErr = await assertAccountOwnedByOrg(account, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);
    
    // Attempt to revoke token if adapter supports it
    const adapter = getPlatformAdapter(account.platform);
    if (adapter) {
      try {
        const rawToken = account.encrypted_access_token || (account as any).access_token_encrypted || (account as any).access_token;
        const token = rawToken ? decryptToken(rawToken) : null;
        if (token && !token.startsWith('mock_')) {
          await adapter.disconnect(token, account.platform_account_id || (account as any).external_account_id);
        }
      } catch (err) {
        console.warn(`Failed to revoke token for ${account.platform} account ${account.id}:`, err);
      }
    }
    
    await db.deleteSocialAccount(req.params.id);
    res.json({ success: true, message: 'Account disconnected successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/social-accounts/:id/verify
// ---------------------------------------------------------------------------
router.post('/:id/verify', requireAuth, async (req: Request, res: Response) => {
  try {
    const account = await db.getSocialAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const tenantErr = await assertAccountOwnedByOrg(account, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);
    
    const adapter = getPlatformAdapter(account.platform);
    if (!adapter) {
      return res.status(400).json({ error: 'Platform adapter not available' });
    }
    
    const rawToken = account.encrypted_access_token || (account as any).access_token_encrypted || (account as any).access_token;
    const token = rawToken ? decryptToken(rawToken) : null;
    if (!token) {
      return res.status(400).json({ error: 'No access token available for this account' });
    }
    
    const platformAccountId = account.platform_account_id || (account as any).external_account_id;
    
    // For mock tokens, return a simulated success
    if (token.startsWith('mock_') || token.startsWith('sandbox_')) {
      await db.updateSocialAccount(account.id, {
        status: 'CONNECTED',
        last_verified_at: new Date().toISOString(),
      });
      
      return res.json({
        success: true,
        status: 'CONNECTED',
        message: 'Account verified (sandbox mode)',
        display_name: account.display_name,
        last_verified_at: new Date().toISOString(),
      });
    }
    
    // Real verification using adapter
    const result = await adapter.validateConnection(token, platformAccountId);
    
    await db.updateSocialAccount(account.id, {
      status: result.status,
      last_verified_at: new Date().toISOString(),
      display_name: result.displayName || account.display_name,
      username: result.username || account.username,
      profile_image_url: result.profileImageUrl || account.profile_image_url,
    });
    
    if (result.status === 'CONNECTED') {
      res.json({
        success: true,
        status: 'CONNECTED',
        message: `Verified live connection with ${account.platform.toUpperCase()}!`,
        display_name: result.displayName || account.display_name,
        username: result.username,
        profile_image_url: result.profileImageUrl,
        last_verified_at: new Date().toISOString(),
      });
    } else {
      res.status(400).json({
        success: false,
        status: result.status,
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error('Account verification failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/social-accounts/:platform/connect
// ---------------------------------------------------------------------------
router.get('/:platform/connect', requireAuth, async (req: Request, res: Response) => {
  const platform = req.params.platform as PlatformType;
  const callerOrgId: string | undefined = (req as any).organizationId;
  
  if (!isPlatformSupported(platform)) {
    return res.status(400).json({ 
      error: `Platform ${platform} is not supported`,
      message: 'This platform is not yet implemented. Please check back later.'
    });
  }
  
  const adapter = getPlatformAdapter(platform);
  if (!adapter) {
    return res.status(400).json({ 
      error: `Platform adapter not available for ${platform}`,
      message: 'The platform adapter is not configured. Please check your environment variables.'
    });
  }
  
  const rawClientId = (req.query.clientId || req.query.client_id) as string | undefined;
  // Validate clientId belongs to caller's org
  if (rawClientId && callerOrgId) {
    const client = await db.getClient(rawClientId);
    if (!client || client.organization_id !== callerOrgId) {
      return res.status(403).json({ error: 'Access to this client is not authorized' });
    }
  }
  const clientId = rawClientId || '00000000-0000-0000-0000-000000000010';
  const returnTo = (req.query.returnTo as string) || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  // Generate OAuth state
  const state = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
  
  // Store OAuth state
  await db.saveOAuthState({
    state,
    client_id: clientId,
    platform,
    expires_at: expiresAt,
    return_to: returnTo || null,
  });
  
  try {
    const authResult = await adapter.getAuthorizationUrl(state, { clientId, returnTo });
    
    // Redirect to platform authorization URL
    res.redirect(authResult.authorizationUrl);
  } catch (error: any) {
    console.error(`OAuth authorization failed for ${platform}:`, error);
    
    const errorMsg = error instanceof OAuthError 
      ? error.message 
      : `Failed to initiate OAuth for ${platform}`;
    
    res.redirect(`${appUrl}/?error=${encodeURIComponent(errorMsg)}&section=accounts`);
  }
});

// ---------------------------------------------------------------------------
// GET /api/social-accounts/:platform/callback
// ---------------------------------------------------------------------------
router.get('/:platform/callback', async (req: Request, res: Response) => {
  const platform = req.params.platform as PlatformType;
  const { code, state, error, error_description } = req.query;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  if (error) {
    const desc = String(error_description || error);
    console.error(`OAuth error from ${platform}:`, desc);
    return res.redirect(`${appUrl}/?error=${encodeURIComponent(`Authentication failed: ${desc}`)}&section=accounts`);
  }
  
  if (!code) {
    return res.redirect(`${appUrl}/?error=Missing+authorization+code&section=accounts`);
  }
  
  try {
    // Validate OAuth state
    const oauthState = await db.getOAuthState(String(state));
    if (!oauthState) {
      return res.redirect(`${appUrl}/?error=${encodeURIComponent('Invalid or expired OAuth state')}&section=accounts`);
    }
    
    if (new Date(oauthState.expires_at).getTime() < Date.now()) {
      await db.deleteOAuthState(String(state));
      return res.redirect(`${appUrl}/?error=${encodeURIComponent('OAuth session expired')}&section=accounts`);
    }
    
    // Delete state (single-use)
    await db.deleteOAuthState(String(state));
    
    const clientId = oauthState.client_id;
    const isMock = String(code).startsWith('mock_code_');
    
    if (isMock && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Mock OAuth is disabled in production' });
    }
    
    const adapter = getPlatformAdapter(platform);
    if (!adapter) {
      return res.redirect(`${appUrl}/?error=${encodeURIComponent('Platform adapter not available')}&section=accounts`);
    }
    
    // Handle OAuth callback
    const callbackResult = await adapter.handleOAuthCallback(
      String(code),
      String(state),
      { code_verifier: oauthState.code_verifier }
    );
    
    // Store discovered accounts
    for (const discovered of callbackResult.accounts) {
      const accountPlatform = discovered.metadata?.platform || platform;
      
      await db.upsertSocialAccount({
        client_id: clientId,
        platform: accountPlatform as PlatformType,
        platform_account_id: discovered.platformAccountId,
        display_name: discovered.displayName,
        username: discovered.username,
        profile_image_url: discovered.profileImageUrl,
        encrypted_access_token: encryptToken(callbackResult.accessToken),
        encrypted_refresh_token: callbackResult.refreshToken ? encryptToken(callbackResult.refreshToken) : null,
        token_expires_at: callbackResult.expiresIn 
          ? new Date(Date.now() + callbackResult.expiresIn * 1000).toISOString()
          : null,
        status: 'CONNECTED',
        metadata: discovered.metadata,
      });
    }
    
    // Redirect back to accounts page
    res.redirect(`${appUrl}/?client_id=${clientId}&section=accounts&connected=${platform}`);
  } catch (error: any) {
    console.error('OAuth callback failed:', error);
    
    const errorMsg = error instanceof OAuthError || error instanceof PlatformAPIError
      ? error.message
      : 'OAuth connection failed';
    
    res.redirect(`${appUrl}/?error=${encodeURIComponent(errorMsg)}&section=accounts`);
  }
});

// ---------------------------------------------------------------------------
// POST /api/social-accounts (manual token connection)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const callerOrgId: string | undefined = (req as any).organizationId;
    const { platform, client_id, display_name, platform_account_id, access_token: inputAccessToken } = req.body;
    
    if (!platform) return res.status(400).json({ error: 'platform is required' });
    
    const clientId = client_id || '00000000-0000-0000-0000-000000000010';

    // Validate clientId belongs to caller's org
    if (callerOrgId) {
      const client = await db.getClient(clientId);
      if (!client || client.organization_id !== callerOrgId) {
        return res.status(403).json({ error: 'Access to this client is not authorized' });
      }
    }
    const tokenToUse = inputAccessToken?.trim() || `token_${platform}_${Date.now()}`;
    const finalDisplayName = display_name?.trim() || `${platform.toUpperCase()} Account`;
    const finalAccountId = platform_account_id?.trim() || `ext_${platform}_${Date.now()}`;
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    
    const created = await db.upsertSocialAccount({
      client_id: clientId,
      platform: platform as PlatformType,
      platform_account_id: finalAccountId,
      display_name: finalDisplayName,
      encrypted_access_token: encryptToken(tokenToUse),
      token_expires_at: tokenExpiresAt,
      status: 'CONNECTED',
      connected_at: new Date().toISOString(),
    });
    
    const { 
      access_token, 
      access_token_encrypted, 
      encrypted_access_token,
      refresh_token, 
      refresh_token_encrypted, 
      encrypted_refresh_token,
      ...safe 
    } = created as any;
    
    res.status(201).json(safe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
