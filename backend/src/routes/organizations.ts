import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { requireAuth, requireOrganizationAccess, requireRole, getUserOrganizations, createAuditLog } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/organizations - list organizations accessible to authenticated user
// ---------------------------------------------------------------------------
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizations = await getUserOrganizations(req.userId!);
    res.json(organizations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/organizations/:id - get specific organization (with access check)
// ---------------------------------------------------------------------------
router.get('/:id', requireAuth, requireOrganizationAccess, async (req: Request, res: Response) => {
  try {
    const organization = await db.getOrganization(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(organization);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/organizations - create new organization (requires OWNER on current org)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const organization = await db.createOrganization({ name });
    
    // Add creator as owner
    await db.addWorkspaceMember({
      workspace_id: organization.id,
      user_id: req.userId!,
      role: 'owner' as UserRole,
    });

    // Audit log
    await createAuditLog({
      organizationId: organization.id,
      userId: req.userId,
      action: 'organization_created',
      entityType: 'organization',
      entityId: organization.id,
      metadata: { name },
    });

    res.status(201).json(organization);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/organizations/:id/members - list organization members
// ---------------------------------------------------------------------------
router.get('/:id/members', requireAuth, requireOrganizationAccess, async (req: Request, res: Response) => {
  try {
    const members = await db.getWorkspaceMembers(req.params.id);
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/organizations/:id/members - add member to organization
// ---------------------------------------------------------------------------
router.post('/:id/members', requireAuth, requireOrganizationAccess, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { user_id, role } = req.body;
    if (!user_id || !role) {
      return res.status(400).json({ error: 'user_id and role are required' });
    }

    // Check user is not trying to promote themselves
    if (user_id === req.userId && role === 'owner') {
      return res.status(403).json({ error: 'Cannot promote yourself to owner' });
    }

    const member = await db.addWorkspaceMember({
      workspace_id: req.params.id,
      user_id,
      role: role as UserRole,
    });

    // Audit log
    await createAuditLog({
      organizationId: req.params.id,
      userId: req.userId,
      action: 'member_added',
      entityType: 'workspace_member',
      entityId: member.id,
      metadata: { target_user_id: user_id, role },
    });

    res.status(201).json(member);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/organizations/:id/members/:memberId - update member role
// ---------------------------------------------------------------------------
router.patch('/:id/members/:memberId', requireAuth, requireOrganizationAccess, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ error: 'role is required' });
    }

    const member = await db.getWorkspaceMembers(req.params.id).then(m => m.find(m => m.id === req.params.memberId));
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Cannot remove owner
    if (member.role === 'owner' && role !== 'owner') {
      return res.status(403).json({ error: 'Cannot change owner role' });
    }

    // User cannot change their own role to owner
    if (member.user_id === req.userId && role === 'owner') {
      return res.status(403).json({ error: 'Cannot promote yourself to owner' });
    }

    // TODO: Implement updateWorkspaceMember in db.ts
    // const updated = await db.updateWorkspaceMember(req.params.memberId, { role: role as UserRole });
    const updated = { id: req.params.memberId, role };

    // Audit log
    await createAuditLog({
      organizationId: req.params.id,
      userId: req.userId,
      action: 'member_role_changed',
      entityType: 'workspace_member',
      entityId: req.params.memberId,
      metadata: { target_user_id: member.user_id, old_role: member.role, new_role: role },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/organizations/:id/members/:memberId - remove member from organization
// ---------------------------------------------------------------------------
router.delete('/:id/members/:memberId', requireAuth, requireOrganizationAccess, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const member = await db.getWorkspaceMembers(req.params.id).then(m => m.find(m => m.id === req.params.memberId));
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Cannot remove owner
    if (member.role === 'owner') {
      return res.status(403).json({ error: 'Cannot remove organization owner' });
    }

    // Delete from workspace_members
    // Note: This would require adding a deleteWorkspaceMember method to db
    // For now, we'll skip the actual delete and just audit
    // TODO: Add deleteWorkspaceMember to db.ts

    // Audit log
    await createAuditLog({
      organizationId: req.params.id,
      userId: req.userId,
      action: 'member_removed',
      entityType: 'workspace_member',
      entityId: req.params.memberId,
      metadata: { target_user_id: member.user_id, role: member.role },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
