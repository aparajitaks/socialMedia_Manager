import { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';

export interface AuthenticatedClientRequest extends Request {
  clientId?: string;
  client?: any;
}

/**
 * Middleware: confirms the authenticated user has access to :clientId.
 *
 * Security invariants enforced here (docs/04-security.md):
 *  1. clientId must be explicitly supplied — no DEFAULT_CLIENT_ID fallback.
 *  2. The resolved client's organization_id must match req.organizationId that
 *     was stamped by requireAuth. This prevents cross-tenant IDOR.
 *
 * This middleware MUST run after requireAuth so that req.organizationId exists.
 */
export async function requireClientAccess(
  req: AuthenticatedClientRequest,
  res: Response,
  next: NextFunction
) {
  // requireAuth must have run before this middleware
  const callerOrgId: string | undefined = (req as any).organizationId;
  if (!callerOrgId) {
    return res.status(401).json({ error: 'Authentication required before client authorization check' });
  }

  const clientId = req.params.clientId || (req.query.client_id as string) || req.body?.client_id;

  if (!clientId) {
    return res.status(400).json({ error: 'Client ID is required' });
  }

  try {
    const client = await db.getClient(clientId);

    if (!client) {
      return res.status(404).json({ error: `Client '${clientId}' not found or unauthorized` });
    }

    // Tenant isolation: reject any client that does not belong to the caller's org
    if (client.organization_id !== callerOrgId) {
      return res.status(403).json({ error: 'Access to this client is not authorized' });
    }

    req.clientId = clientId;
    req.client = client;
    next();
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Authorization check failed' });
  }
}
