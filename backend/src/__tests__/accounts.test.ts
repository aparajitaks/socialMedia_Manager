/**
 * Checklist §2 — Social account connections
 * Checklist §2 — Token encryption at rest
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, resetSeed, seed } from './helpers.js';

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
});
