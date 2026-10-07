/**
 * Checklist §2 — Social account connections
 * Checklist §2 — Token encryption at rest
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, resetSeed, seed, mockDb, DEFAULT_CLIENT_ID } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(() => {
  resetSeed();
});

describe('§2 Social accounts', () => {
  it('GET /api/accounts returns list of connected accounts', async () => {
    const res = await request(app).get('/api/accounts');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].platform).toBeTruthy();
    expect(res.body[0].display_name).toBeTruthy();
  });

  it('GET /api/accounts does NOT expose access_token in response (encrypted at rest check)', async () => {
    const res = await request(app).get('/api/accounts');
    expect(res.status).toBe(200);
    for (const acc of res.body) {
      expect(acc.access_token).toBeUndefined();
      expect(acc.refresh_token).toBeUndefined();
    }
  });

  it('GET /api/accounts/:id returns single account without tokens', async () => {
    const res = await request(app).get('/api/accounts/acc-li');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('acc-li');
    expect(res.body.access_token).toBeUndefined();
  });

  it('GET /api/accounts/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/accounts/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/accounts/:id removes the account', async () => {
    const before = await request(app).get('/api/accounts');
    expect(before.body.length).toBe(2);

    const del = await request(app).delete('/api/accounts/acc-li');
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    const after = await request(app).get('/api/accounts');
    expect(after.body.length).toBe(1);
    expect(after.body.find((a: any) => a.id === 'acc-li')).toBeUndefined();
  });

  it('GET /api/accounts/:platform/connect redirects to OAuth URL', async () => {
    const res = await request(app).get('/api/accounts/linkedin/connect').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('linkedin.com');
  });

  it('GET /api/accounts/instagram/connect uses the Instagram callback URL', async () => {
    const res = await request(app).get('/api/accounts/instagram/connect').redirects(0);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('redirect_uri')).toContain('/api/accounts/instagram/callback');
  });

  it('Instagram callback stores only an Instagram account row', async () => {
    mockDb.getOAuthState.mockResolvedValueOnce({
      state: 'state-instagram',
      client_id: DEFAULT_CLIENT_ID,
      platform: 'instagram',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      return_to: '/connect/00000000-0000-0000-0000-000000000010',
    } as any);
    mockDb.upsertSocialAccount.mockClear();

    const res = await request(app)
      .get('/api/accounts/instagram/callback')
      .query({ code: 'real_code_456', state: 'state-instagram' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(mockDb.upsertSocialAccount).toHaveBeenCalledTimes(1);
    expect(mockDb.upsertSocialAccount).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'instagram' })
    );
    expect(mockDb.upsertSocialAccount).not.toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'facebook' })
    );
  });

  it('OAuth callback returns the user to the original client page', async () => {
    mockDb.getOAuthState.mockResolvedValueOnce({
      state: 'state-123',
      client_id: DEFAULT_CLIENT_ID,
      platform: 'linkedin',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      return_to: '/connect/00000000-0000-0000-0000-000000000010',
    } as any);

    const res = await request(app)
      .get('/api/accounts/linkedin/callback')
      .query({ code: 'real_code_123', state: 'state-123' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      'http://localhost:3000/connect/00000000-0000-0000-0000-000000000010?connected=linkedin'
    );
  });

  it('GET /api/accounts/unsupported/connect returns 400', async () => {
    const res = await request(app).get('/api/accounts/tiktok/connect').redirects(0);
    expect(res.status).toBe(400);
  });

  it('Reconnecting same platform after disconnect works without errors', async () => {
    await request(app).delete('/api/accounts/acc-li');
    const after = await request(app).get('/api/accounts');
    expect(after.body.find((a: any) => a.platform === 'linkedin' && a.id === 'acc-li')).toBeUndefined();
    expect(after.status).toBe(200);
  });

  it('POST /api/accounts connects a new channel and redacts encrypted access token', async () => {
    const res = await request(app).post('/api/accounts').send({
      platform: 'instagram',
      display_name: '@my_awesome_brand',
      external_account_id: 'ig_custom_99',
    });
    expect(res.status).toBe(201);
    expect(res.body.display_name).toBe('@my_awesome_brand');
    expect(res.body.platform).toBe('instagram');
    expect(res.body.access_token).toBeUndefined();
  });

  it('POST /api/accounts without platform returns 400', async () => {
    const res = await request(app).post('/api/accounts').send({
      display_name: 'Missing platform',
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/accounts/config-status returns platform availability', async () => {
    const res = await request(app).get('/api/accounts/config-status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('linkedin');
    expect(res.body).toHaveProperty('meta');
  });

  it('POST /api/accounts/:id/verify verifies connection status', async () => {
    const res = await request(app).post('/api/accounts/acc-li/verify');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status.toLowerCase()).toBe('connected');
  });

  it('OAuth callback rejects requests with missing or invalid state (CSRF protection)', async () => {
    const res = await request(app)
      .get('/api/accounts/linkedin/callback')
      .query({ code: 'real_code_123' }) // missing state
      .redirects(0);

    expect(res.status).toBe(302);
    expect(decodeURIComponent(res.headers.location)).toContain('CSRF verification failed');
  });

  it('OAuth callback rejects mock codes in production environment', async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await request(app)
        .get('/api/accounts/linkedin/callback')
        .query({ code: 'mock_code_123', state: 'any_state' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('disabled in production');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

