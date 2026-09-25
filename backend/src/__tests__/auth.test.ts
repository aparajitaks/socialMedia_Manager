/**
 * Checklist §0 — Environment checks
 * Checklist §1 — Auth & roles
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, resetSeed } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(() => {
  resetSeed();
});

// ── §0 ── Environment checks ──────────────────────────────────────────────────
describe('§0 Environment: health check', () => {
  it('GET /api/health returns 200 and status:ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ── §1 ── Auth & roles ────────────────────────────────────────────────────────
describe('§1 Auth & roles', () => {
  it('GET /api/auth/me with admin role returns admin user', async () => {
    const res = await request(app).get('/api/auth/me').set('x-user-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
  });

  it('GET /api/auth/me with editor role returns editor user', async () => {
    const res = await request(app).get('/api/auth/me').set('x-user-role', 'editor');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('editor');
  });

  it('GET /api/accounts is accessible to editor role (readable)', async () => {
    const res = await request(app).get('/api/accounts').set('x-user-role', 'editor');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/posts/:id/approve with editor role returns 403', async () => {
    const res = await request(app)
      .post('/api/posts/post-draft/approve')
      .set('x-user-role', 'editor');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  it('POST /api/posts/:id/approve with admin role returns 200', async () => {
    const res = await request(app)
      .post('/api/posts/post-draft/approve')
      .set('x-user-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.approved_by).toBeTruthy();
  });
});
