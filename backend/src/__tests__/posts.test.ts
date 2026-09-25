/**
 * Checklist §3 — Posts API
 * Tests every bullet from Section 3 of the E2E checklist.
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

describe('§3 Posts API', () => {
  // ── Creation ──────────────────────────────────────────────────────────────

  it('POST /api/posts with two accounts creates one post_group and two posts', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('x-user-role', 'admin')
      .send({
        label: 'Checklist §3 creation test',
        accounts: [
          { social_account_id: 'acc-li', content: 'LinkedIn-specific caption' },
          { social_account_id: 'acc-x', content: 'X-specific short text' },
        ],
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.post_group).toBeDefined();
    expect(res.body.posts).toHaveLength(2);

    // Each post has its OWN tailored content
    const liPost = res.body.posts.find((p: any) => p.platform === 'linkedin');
    const xPost = res.body.posts.find((p: any) => p.platform === 'x');
    expect(liPost.content).toBe('LinkedIn-specific caption');
    expect(xPost.content).toBe('X-specific short text');
    expect(liPost.content).not.toBe(xPost.content);
  });

  it('POST /api/posts with no accounts returns 400', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('x-user-role', 'admin')
      .send({ label: 'Bad request', accounts: [] });
    expect(res.status).toBe(400);
  });

  it('POST /api/posts with unknown social_account_id returns 500', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('x-user-role', 'admin')
      .send({
        accounts: [{ social_account_id: 'does-not-exist', content: 'hi' }],
      });
    expect(res.status).toBe(500);
  });

  // ── Filtering ─────────────────────────────────────────────────────────────

  it('GET /api/posts?status=scheduled returns only scheduled posts', async () => {
    const res = await request(app).get('/api/posts?status=scheduled');
    expect(res.status).toBe(200);
    expect(res.body.every((p: any) => p.status === 'scheduled')).toBe(true);
  });

  it('GET /api/posts?status=draft returns only draft posts', async () => {
    const res = await request(app).get('/api/posts?status=draft');
    expect(res.status).toBe(200);
    expect(res.body.every((p: any) => p.status === 'draft')).toBe(true);
  });

  it('GET /api/posts?status=published returns only published posts', async () => {
    const res = await request(app).get('/api/posts?status=published');
    expect(res.status).toBe(200);
    expect(res.body.every((p: any) => p.status === 'published')).toBe(true);
  });

  it('GET /api/posts?status=failed returns only failed posts', async () => {
    const res = await request(app).get('/api/posts?status=failed');
    expect(res.status).toBe(200);
    expect(res.body.every((p: any) => p.status === 'failed')).toBe(true);
  });

  it('GET /api/posts?from=&to= with out-of-range window returns empty array', async () => {
    const from = new Date('2020-01-01').toISOString();
    const to = new Date('2020-01-02').toISOString();
    const res = await request(app).get(`/api/posts?from=${from}&to=${to}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  // ── PATCH ─────────────────────────────────────────────────────────────────

  it('PATCH /api/posts/:id succeeds on a draft post and returns updated content', async () => {
    const res = await request(app)
      .patch('/api/posts/post-draft')
      .send({ content: 'Updated draft content' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Updated draft content');
  });

  it('PATCH /api/posts/:id succeeds on a scheduled post', async () => {
    const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .patch('/api/posts/post-scheduled')
      .send({ scheduled_at: futureTime });
    expect(res.status).toBe(200);
    expect(res.body.scheduled_at).toBe(futureTime);
  });

  it('PATCH /api/posts/:id on a published post returns 400 (not silent)', async () => {
    const res = await request(app)
      .patch('/api/posts/post-published')
      .send({ content: 'Attempt to edit published post' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/published/i);
  });

  it('PATCH /api/posts/:id on unknown id returns 404', async () => {
    const res = await request(app).patch('/api/posts/ghost').send({ content: 'x' });
    expect(res.status).toBe(404);
  });

  // ── GET single ────────────────────────────────────────────────────────────

  it('GET /api/posts/:id returns the correct post', async () => {
    const res = await request(app).get('/api/posts/post-draft');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('post-draft');
    expect(res.body.content).toBe('Draft post content');
  });

  it('GET /api/posts/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/posts/no-such-post');
    expect(res.status).toBe(404);
  });

  // ── Retry ─────────────────────────────────────────────────────────────────

  it('POST /api/posts/:id/retry on a failed post sets status back to scheduled', async () => {
    const res = await request(app).post('/api/posts/post-failed/retry');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('scheduled');
  });

  it('POST /api/posts/:id/retry on a non-failed post returns 400 (not silent)', async () => {
    const res = await request(app).post('/api/posts/post-draft/retry');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/failed/i);
  });

  // ── Edge cases §8 ─────────────────────────────────────────────────────────

  it('§8 Edge: scheduling a post in the past still creates it (scheduler handles timing)', async () => {
    const pastTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const res = await request(app)
      .post('/api/posts')
      .set('x-user-role', 'admin')
      .send({
        accounts: [{ social_account_id: 'acc-li', content: 'Past-scheduled post' }],
        scheduled_at: pastTime,
      });
    // API accepts it — the scheduler will pick it up immediately on next run
    expect(res.status).toBe(201);
    expect(res.body.posts[0].status).toBe('scheduled');
  });

  it('§8 Edge: post with no media_urls creates successfully', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('x-user-role', 'admin')
      .send({
        accounts: [{ social_account_id: 'acc-li', content: 'No media post', media_urls: [] }],
      });
    expect(res.status).toBe(201);
    expect(res.body.posts[0].media_urls).toEqual([]);
  });
});
