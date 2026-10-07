import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { requireAuth } from './auth.js';
import { requireClientAccess, AuthenticatedClientRequest } from './clientAuth.js';
import { PlatformType, SocialAccount, Post } from '../types/index.js';
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
import { encryptToken } from '../crypto.js';

const router = Router();

// All client endpoints require an authenticated caller with an organization context
router.use(requireAuth);

// ===========================================================================
// Agency Clients Management
// ===========================================================================

// GET /api/clients - List client workspaces scoped to the caller's organization
router.get('/', requireAuth, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    const orgId: string | undefined = (req as any).organizationId;
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context is required' });
    }
    const clients = await db.getClients(orgId);
    res.json(clients);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients - Create a new client brand within the caller's organization
router.post('/', requireAuth, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    const orgId: string | undefined = (req as any).organizationId;
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context is required' });
    }
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Client name is required' });
    }
    const created = await db.createClient({
      name: name.trim(),
      // Always use the authenticated user's org — never trust the request body
      organization_id: orgId,
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:clientId - Get single client
router.get('/:clientId', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  res.json(req.client);
});

// ===========================================================================
// Client Social Accounts (docs/03-api-and-publishers.md)
// ===========================================================================

// GET /api/clients/:clientId/social - List connected accounts
router.get('/:clientId/social', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    const accounts = await db.getSocialAccounts(req.clientId!);
    // Never expose access tokens to the frontend (docs/04-security.md)
    const sanitized = accounts.map(({ access_token, access_token_encrypted, refresh_token, refresh_token_encrypted, ...safe }) => safe);
    res.json(sanitized);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:clientId/social/:platform/connect - Start OAuth flow
router.get('/:clientId/social/:platform/connect', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  const { platform } = req.params;
  const clientId = req.clientId!;
  if (req.query.simulate === 'true' && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'OAuth simulation mode is disabled in production.' });
  }
  const simulate = req.query.simulate === 'true' ? '&simulate=true' : '';
  const returnTo = req.query.returnTo ? `&returnTo=${encodeURIComponent(String(req.query.returnTo))}` : '';
  res.redirect(`/api/accounts/${platform}/connect?clientId=${clientId}${simulate}${returnTo}`);
});

// GET /api/clients/:clientId/social/:platform/discover - Account discovery picker helper
router.get('/:clientId/social/:platform/discover', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  const { platform } = req.params;
  try {
    if (platform === 'google_business') {
      const items = await discoverGoogleLocations('mock_token');
      return res.json(items);
    }
    if (platform === 'linkedin') {
      const items = await discoverLinkedInOrganizations('mock_token');
      return res.json(items);
    }
    if (platform === 'facebook' || platform === 'instagram') {
      const items = await discoverMetaPagesAndInstagram('mock_token');
      return res.json(items);
    }
    res.json([]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:clientId/social/connect - Direct / manual connect with credentials or discovery item (dev/staging only)
router.post('/:clientId/social/connect', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Manual credential connection is disabled in production. Please connect via OAuth.' });
    }
    const { platform, external_account_id, display_name, password } = req.body;
    if (!platform || !display_name) {
      return res.status(400).json({ error: 'Platform and display name are required' });
    }

    const cleanDisplay = String(display_name).trim();
    const extId = external_account_id || `${platform}_usr_${Date.now().toString().slice(-6)}`;
    const syntheticToken = `user_conn_${cleanDisplay}_${password ? crypto.createHash('md5').update(password).digest('hex').slice(0, 12) : Date.now()}`;

    const connected = await db.upsertSocialAccount({
      client_id: req.clientId!,
      platform: platform as PlatformType,
      display_name: cleanDisplay,
      external_account_name: cleanDisplay,
      external_account_id: extId,
      access_token: syntheticToken,
      access_token_encrypted: encryptToken(syntheticToken),
      token_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'CONNECTED',
    });

    const { access_token, access_token_encrypted, refresh_token, refresh_token_encrypted, ...safe } = connected;
    res.status(201).json(safe);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:clientId/social/:accountId - Disconnect account & revoke
router.delete('/:clientId/social/:accountId', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    const { accountId } = req.params;
    const account = await db.getSocialAccount(accountId);
    if (!account || account.client_id !== req.clientId) {
      return res.status(404).json({ error: 'Account not found for this client' });
    }

    await db.deleteSocialAccount(accountId);
    res.json({ success: true, message: 'Account disconnected and revoked' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================================
// Client Posts (docs/03-api-and-publishers.md)
// ===========================================================================

// GET /api/clients/:clientId/posts - List posts
router.get('/:clientId/posts', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    const posts = await db.getPosts(req.clientId!);
    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:clientId/posts - Create / schedule a post
router.post('/:clientId/posts', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    const { social_account_id, platform, content, media_urls, scheduled_at, status } = req.body;
    if (!social_account_id || !content) {
      return res.status(400).json({ error: 'social_account_id and content are required' });
    }

    const account = await db.getSocialAccount(social_account_id);
    if (!account || account.client_id !== req.clientId) {
      return res.status(400).json({ error: 'Invalid social account for this client' });
    }

    const post = await db.createPost({
      client_id: req.clientId!,
      social_account_id,
      platform: (platform || account.platform) as PlatformType,
      content,
      media_urls: media_urls || [],
      scheduled_at: scheduled_at || new Date().toISOString(),
      status: status || 'scheduled',
    });

    res.status(201).json(post);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/clients/:clientId/posts/:postId - Edit a scheduled post
router.patch('/:clientId/posts/:postId', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    const { postId } = req.params;
    const post = await db.getPost(postId);
    if (!post || post.client_id !== req.clientId) {
      return res.status(404).json({ error: 'Post not found for this client' });
    }

    const updated = await db.updatePost(postId, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:clientId/posts/:postId - Cancel a scheduled post
router.delete('/:clientId/posts/:postId', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    const { postId } = req.params;
    const post = await db.getPost(postId);
    if (!post || post.client_id !== req.clientId) {
      return res.status(404).json({ error: 'Post not found for this client' });
    }

    await db.deletePost(postId);
    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:clientId/metrics/summary - Metrics for client
router.get('/:clientId/metrics/summary', requireClientAccess, async (req: AuthenticatedClientRequest, res: Response) => {
  try {
    const platform = req.query.platform as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const summary = await db.getMetricsSummary(req.clientId!, platform, from, to);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
