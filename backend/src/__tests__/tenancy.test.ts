/**
 * Phase 2 — Real Tenancy & Auth Enforcement
 *
 * Regression tests that MUST stay green as the codebase grows:
 *   §2a  requireClientAccess rejects missing clientId (no DEFAULT_CLIENT_ID fallback)
 *   §2b  requireClientAccess rejects a clientId that belongs to a foreign org (IDOR guard)
 *   §2c  GET /api/clients is scoped to the caller's organization (no cross-tenant leak)
 *   §2d  POST /api/clients derives organization_id from the session, ignores request body
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { mockDb, resetSeed, seed, DEFAULT_CLIENT_ID, DEFAULT_ORG_ID } from './helpers.js';

const ORG_A = DEFAULT_ORG_ID;
const ORG_B = '00000000-0000-0000-0000-000000000002';
const CLIENT_A = DEFAULT_CLIENT_ID;
const CLIENT_B = '00000000-0000-0000-0000-000000000099';

beforeAll(async () => {
  mockDb.getClient = vi.fn((id: string) => {
    if (id === CLIENT_A) return Promise.resolve({ id: CLIENT_A, organization_id: ORG_A, name: 'Client A' });
    if (id === CLIENT_B) return Promise.resolve({ id: CLIENT_B, organization_id: ORG_B, name: 'Client B (foreign)' });
    return Promise.resolve(null);
  });

  mockDb.getClients = vi.fn((orgId?: string) => {
    const all = [
      { id: CLIENT_A, organization_id: ORG_A, name: 'Client A' },
      { id: CLIENT_B, organization_id: ORG_B, name: 'Client B (foreign)' },
    ];
    if (orgId) return Promise.resolve(all.filter((c: any) => c.organization_id === orgId));
    return Promise.resolve(all);
  });

  mockDb.createClient = vi.fn((data: any) =>
    Promise.resolve({ id: `client-new-${Date.now()}`, ...data, created_at: new Date().toISOString() })
  );
});

beforeEach(() => {
  resetSeed();
});

async function buildOrgApp(orgId: string): Promise<Express> {
  const a = express();
  a.use(express.json());
  // Pre-middleware: stamp the org context directly
  a.use((req, _res, next) => {
    (req as any).organizationId = orgId;
    (req as any).userRole = 'admin';
    (req as any).userId = 'test-user';
    next();
  });
  const [
    { default: clientsRouter },
    { default: postsRouter },
    { default: socialAccountsRouter },
    { default: mediaRouter },
  ] = await Promise.all([
    import('../routes/clients.js'),
    import('../routes/posts.js'),
    import('../routes/social-accounts.js'),
    import('../routes/media.js'),
  ]);
  a.use('/api/clients', clientsRouter);
  a.use('/api/posts', postsRouter);
  a.use('/api/social-accounts', socialAccountsRouter);
  a.use('/api/media', mediaRouter);
  return a;
}

describe('§2 Tenant isolation — requireClientAccess & Resource Scoping', () => {
  it('§2b: GET /api/clients/:clientId for a foreign-org client returns 403', async () => {
    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp).get(`/api/clients/${CLIENT_B}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it('§2b-own: GET /api/clients/:clientId for own-org client returns 200', async () => {
    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp).get(`/api/clients/${CLIENT_A}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(CLIENT_A);
  });

  it('§2c: GET /api/clients returns only the caller\'s org clients', async () => {
    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp).get('/api/clients');
    expect(res.status).toBe(200);
    const ids: string[] = res.body.map((c: any) => c.id);
    expect(ids).toContain(CLIENT_A);
    expect(ids).not.toContain(CLIENT_B);
  });

  it('§2d: POST /api/clients ignores req.body.organization_id and uses session org', async () => {
    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp)
      .post('/api/clients')
      .send({ name: 'New Client', organization_id: ORG_B });
    expect(res.status).toBe(201);
    expect(res.body.organization_id).toBe(ORG_A);
    expect(res.body.organization_id).not.toBe(ORG_B);
  });

  it('cross-tenant: GET /api/posts/:id returns 403 for post belonging to foreign org client', async () => {
    seed.posts.push({
      id: 'post-foreign-org',
      client_id: CLIENT_B,
      platform: 'linkedin',
      content: 'Foreign secret post',
      status: 'draft',
      created_at: new Date().toISOString(),
    });

    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp).get('/api/posts/post-foreign-org');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it('cross-tenant: PATCH /api/posts/:id returns 403 for post belonging to foreign org client', async () => {
    seed.posts.push({
      id: 'post-foreign-patch',
      client_id: CLIENT_B,
      platform: 'linkedin',
      content: 'Foreign secret post',
      status: 'draft',
      created_at: new Date().toISOString(),
    });

    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp)
      .patch('/api/posts/post-foreign-patch')
      .send({ content: 'Attempted tamper' });
    expect(res.status).toBe(403);
  });

  it('cross-tenant: DELETE /api/posts/:id returns 403 for foreign org post', async () => {
    seed.posts.push({
      id: 'post-foreign-del',
      client_id: CLIENT_B,
      platform: 'linkedin',
      content: 'Foreign post',
      status: 'draft',
      created_at: new Date().toISOString(),
    });

    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp).delete('/api/posts/post-foreign-del');
    expect(res.status).toBe(403);
  });

  it('cross-tenant: POST /api/posts returns 403 when creating post for foreign org client', async () => {
    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp)
      .post('/api/posts')
      .send({
        client_id: CLIENT_B,
        platform: 'linkedin',
        social_account_id: 'acc-li',
        content: 'Unauthorized post',
      });
    expect(res.status).toBe(403);
  });

  it('cross-tenant: GET /api/social-accounts/:id returns 403 for foreign org account', async () => {
    seed.social_accounts.push({
      id: 'acc-foreign-org',
      client_id: CLIENT_B,
      platform: 'linkedin',
      display_name: 'Foreign Org LinkedIn',
      status: 'connected',
    });

    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp).get('/api/social-accounts/acc-foreign-org');
    expect(res.status).toBe(403);
  });

  it('cross-tenant: DELETE /api/social-accounts/:id returns 403 for foreign org account', async () => {
    seed.social_accounts.push({
      id: 'acc-foreign-del',
      client_id: CLIENT_B,
      platform: 'linkedin',
      display_name: 'Foreign Org Account',
      status: 'connected',
    });

    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp).delete('/api/social-accounts/acc-foreign-del');
    expect(res.status).toBe(403);
  });

  it('cross-tenant: GET /api/media with foreign clientId returns 403', async () => {
    const orgAApp = await buildOrgApp(ORG_A);
    const res = await request(orgAApp).get(`/api/media?clientId=${CLIENT_B}`);
    expect(res.status).toBe(403);
  });
});
