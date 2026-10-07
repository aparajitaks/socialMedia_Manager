import { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';
import { UserRole } from '../types/index.js';

// ---------------------------------------------------------------------------
// Extended Request Type with Auth Context
// ---------------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      authUser?: any;
      userRole?: UserRole;
      organizationId?: string;
      membershipRole?: UserRole;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  authUser?: any;
  userRole?: UserRole;
  organizationId?: string;
  membershipRole?: UserRole;
}

// ---------------------------------------------------------------------------
// Permissions Definition
// ---------------------------------------------------------------------------
export const PERMISSIONS = {
  OWNER: [
    'organization:read',
    'organization:write',
    'organization:delete',
    'organization:billing',
    'users:read',
    'users:write',
    'users:delete',
    'clients:read',
    'clients:write',
    'clients:delete',
    'social_accounts:read',
    'social_accounts:write',
    'social_accounts:delete',
    'posts:read',
    'posts:write',
    'posts:delete',
    'posts:publish',
    'approvals:read',
    'approvals:write',
    'analytics:read',
    'reports:read',
  ],
  ADMIN: [
    'organization:read',
    'organization:write',
    'users:read',
    'users:write',
    'clients:read',
    'clients:write',
    'clients:delete',
    'social_accounts:read',
    'social_accounts:write',
    'social_accounts:delete',
    'posts:read',
    'posts:write',
    'posts:delete',
    'posts:publish',
    'approvals:read',
    'approvals:write',
    'analytics:read',
    'reports:read',
  ],
  EDITOR: [
    'organization:read',
    'clients:read',
    'social_accounts:read',
    'posts:read',
    'posts:write',
    'posts:publish',
    'media:upload',
    'analytics:read',
  ],
  APPROVER: [
    'organization:read',
    'clients:read',
    'posts:read',
    'approvals:read',
    'approvals:write',
    'analytics:read',
  ],
  VIEWER: [
    'organization:read',
    'clients:read',
    'posts:read',
    'analytics:read',
    'reports:read',
  ],
  CLIENT: [
    'clients:read',
    'posts:read',
    'approvals:read',
    'approvals:write',
    'analytics:read',
  ],
} as const;

// ---------------------------------------------------------------------------
// Helper: Check if role has permission
// ---------------------------------------------------------------------------
export function hasPermission(role: UserRole, permission: string): boolean {
  const normalizedRole = role.toLowerCase() as keyof typeof PERMISSIONS;
  // Handle case where permission might not be in the list (return false)
  if (!PERMISSIONS[normalizedRole]) return false;
  return PERMISSIONS[normalizedRole].includes(permission as any) || false;
}

// ---------------------------------------------------------------------------
// Helper: Check if role can manage other users
// ---------------------------------------------------------------------------
export function canManageUsers(role: UserRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

// ---------------------------------------------------------------------------
// Helper: Check if role can manage clients
// ---------------------------------------------------------------------------
export function canManageClients(role: UserRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

// ---------------------------------------------------------------------------
// Helper: Check if role can manage organization settings
// ---------------------------------------------------------------------------
export function canManageOrganizationSettings(role: UserRole): boolean {
  return role === 'OWNER';
}

// ---------------------------------------------------------------------------
// Middleware: requireAuth (already exists in auth.ts, re-exported for convenience)
// ---------------------------------------------------------------------------
export { requireAuth } from '../routes/auth.js';

// ---------------------------------------------------------------------------
// Middleware: requireOrganizationAccess
// ---------------------------------------------------------------------------
export async function requireOrganizationAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const organizationId = req.params.organizationId || req.body.organizationId || req.query.organizationId || req.organizationId;

  if (!organizationId) {
    return res.status(400).json({ error: 'Organization ID is required' });
  }

  // Verify the authenticated user belongs to this organization
  const membership = await db.getMembershipByUserId(req.userId!);
  
  let user: any = null;
  if (!membership || membership.workspace_id !== organizationId) {
    // Also check users table directly
    user = await db.getUser(req.userId!);
    if (!user || user.organization_id !== organizationId) {
      return res.status(403).json({ error: 'You do not have access to this organization' });
    }
  }

  // Attach the verified organization ID to the request
  req.organizationId = organizationId;
  req.membershipRole = membership?.role as UserRole || user?.role as UserRole;

  next();
}

// ---------------------------------------------------------------------------
// Middleware: requireClientAccess
// ---------------------------------------------------------------------------
export async function requireClientAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const clientId = req.params.clientId || req.body.client_id || req.query.clientId;

  if (!clientId) {
    return res.status(400).json({ error: 'Client ID is required' });
  }

  // First, verify organization access
  await requireOrganizationAccess(req, res, (err) => {
    if (err) return next(err);
  });

  // Get the client
  const client = await db.getClient(clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  // Verify the client belongs to the user's organization
  if (client.organization_id !== req.organizationId) {
    return res.status(403).json({ error: 'You do not have access to this client' });
  }

  // Check client-level membership (if it exists)
  const clientMember = await db.getClientMember(clientId, req.userId!);
  
  // If user is CLIENT role, they must have explicit client membership
  if (req.userRole === 'CLIENT' && !clientMember) {
    return res.status(403).json({ error: 'You do not have access to this client' });
  }

  next();
}

// ---------------------------------------------------------------------------
// Middleware: requireRole
// ---------------------------------------------------------------------------
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userRole = req.userRole || req.membershipRole;

    if (!userRole) {
      return res.status(403).json({ error: 'User role not found' });
    }

    const normalizedUserRole = userRole.toLowerCase() as UserRole;
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase() as UserRole);

    if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        provided: userRole
      });
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Helper: getUserOrganizations
// ---------------------------------------------------------------------------
export async function getUserOrganizations(userId: string) {
  const user = await db.getUser(userId);
  if (!user) return [];

  // Get direct organization from users table
  const organizations: any[] = [];
  if (user.organization_id) {
    const org = await db.getOrganization(user.organization_id);
    if (org) organizations.push({ ...org, role: user.role });
  }

  // Get additional organizations from workspace_members
  const memberships = await db.getWorkspaceMembers(user.organization_id || user.id);
  for (const membership of memberships) {
    const org = await db.getOrganization(membership.workspace_id);
    if (org && !organizations.find(o => o.id === org.id)) {
      organizations.push({ ...org, role: membership.role });
    }
  }

  return organizations;
}

// ---------------------------------------------------------------------------
// Helper: getCurrentOrganization
// ---------------------------------------------------------------------------
export async function getCurrentOrganization(req: AuthenticatedRequest) {
  const organizationId = req.organizationId;
  if (!organizationId) return null;

  const org = await db.getOrganization(organizationId);
  return org;
}

// ---------------------------------------------------------------------------
// Helper: getClientsForUser
// ---------------------------------------------------------------------------
export async function getClientsForUser(userId: string, organizationId: string) {
  const user = await db.getUser(userId);
  if (!user) return [];

  const role = user.role.toLowerCase() as UserRole;

  // OWNER and ADMIN can see all clients in the organization
  if (role === 'owner' || role === 'admin') {
    return await db.getClients(organizationId);
  }

  // CLIENT role can only see clients they're members of
  if (role === 'client') {
    // Would need client_members table query
    // For now, return empty - will implement with client_members
    return [];
  }

  // EDITOR, APPROVER, VIEWER can see all clients (for now)
  return await db.getClients(organizationId);
}

// ---------------------------------------------------------------------------
// Audit Log Helper
// ---------------------------------------------------------------------------
export async function createAuditLog(params: {
  organizationId?: string;
  clientId?: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    // This would require adding audit_logs to the db interface
    // For now, we'll implement as a TODO
    console.log('[AUDIT]', params);
  } catch (err) {
    console.error('Failed to create audit log:', err);
  }
}
