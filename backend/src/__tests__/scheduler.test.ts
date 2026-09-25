/**
 * Checklist §4 — Scheduler engine
 * Tests the publish/fail/retry lifecycle and idempotency.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, resetSeed, seed, mockPublisher } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(() => {
  resetSeed();
  vi.clearAllMocks();
  // Default: publish succeeds
  mockPublisher.publish.mockResolvedValue({ platform_post_id: 'plat_post_abc' });
});

describe('§4 Scheduler engine', () => {
  // ── Happy path: scheduled → publishing → published ────────────────────────

  it('POST /api/scheduler/run moves due posts to published with platform_post_id and published_at', async () => {
    // Backdate the scheduled post so it's due NOW
    const scheduledPost = seed.posts.find((p) => p.id === 'post-scheduled')!;
    scheduledPost.scheduled_at = new Date(Date.now() - 1000).toISOString();

    const res = await request(app).post('/api/scheduler/run');
    expect(res.status).toBe(200);
    expect(res.body.processed).toBeGreaterThanOrEqual(1);

    const check = await request(app).get('/api/posts/post-scheduled');
    expect(check.body.status).toBe('published');
    expect(check.body.platform_post_id).toBeTruthy();
    expect(check.body.published_at).toBeTruthy();
  });

  it('POST /api/scheduler/run with no due posts returns 0 processed', async () => {
    // All scheduled posts are in the future — nothing due
    const res = await request(app).post('/api/scheduler/run');
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(0);
  });

  // ── Failure path: broken token → status = failed with human-readable reason

  it('POST /api/scheduler/run marks post as failed with error_reason when publisher throws', async () => {
    mockPublisher.publish.mockRejectedValueOnce(new Error('OAuth token revoked by user'));

    const scheduledPost = seed.posts.find((p) => p.id === 'post-scheduled')!;
    scheduledPost.scheduled_at = new Date(Date.now() - 1000).toISOString();

    const res = await request(app).post('/api/scheduler/run');
    expect(res.status).toBe(200);

    const check = await request(app).get('/api/posts/post-scheduled');
    expect(check.body.status).toBe('failed');
    expect(check.body.error_reason).toMatch(/OAuth token revoked/);
  });

  it('Failed post NEVER gets stuck at "publishing" (always resolves to failed)', async () => {
    mockPublisher.publish.mockRejectedValueOnce(new Error('Network timeout'));

    const scheduledPost = seed.posts.find((p) => p.id === 'post-scheduled')!;
    scheduledPost.scheduled_at = new Date(Date.now() - 1000).toISOString();

    await request(app).post('/api/scheduler/run');

    const check = await request(app).get('/api/posts/post-scheduled');
    expect(check.body.status).not.toBe('publishing');
    expect(check.body.status).toBe('failed');
  });

  // ── Idempotency check ─────────────────────────────────────────────────────

  it('§4 Idempotency: triggering scheduler twice never publishes the same post twice', async () => {
    const scheduledPost = seed.posts.find((p) => p.id === 'post-scheduled')!;
    scheduledPost.scheduled_at = new Date(Date.now() - 1000).toISOString();

    // First run
    await request(app).post('/api/scheduler/run');
    const callsAfterFirst = mockPublisher.publish.mock.calls.length;

    // Second run immediately after — post is now "published", should be skipped
    await request(app).post('/api/scheduler/run');
    const callsAfterSecond = mockPublisher.publish.mock.calls.length;

    expect(callsAfterSecond).toBe(callsAfterFirst); // no additional publish call
  });

  // ── Multi-platform isolation ──────────────────────────────────────────────

  it('§4 Multi-platform: one platform failure does not block or corrupt the other', async () => {
    // Schedule two posts (one per platform) both due now
    const li = seed.posts.find((p) => p.id === 'post-scheduled')!;
    li.scheduled_at = new Date(Date.now() - 1000).toISOString();

    const xPost = {
      id: 'post-sched-x',
      post_group_id: 'grp-1',
      social_account_id: 'acc-x',
      platform: 'x',
      content: 'X post due now',
      media_urls: [],
      status: 'scheduled',
      scheduled_at: new Date(Date.now() - 1000).toISOString(),
      published_at: null,
      platform_post_id: null,
      error_reason: null,
      approved_by: 'user-admin',
      created_by: 'user-admin',
      created_at: new Date().toISOString(),
    };
    seed.posts.push(xPost);

    // LinkedIn succeeds, X fails
    mockPublisher.publish
      .mockResolvedValueOnce({ platform_post_id: 'li_post_ok' })  // LinkedIn
      .mockRejectedValueOnce(new Error('X rate-limit exceeded'));   // X

    const res = await request(app).post('/api/scheduler/run');
    expect(res.status).toBe(200);
    expect(res.body.processed).toBeGreaterThanOrEqual(2);

    const liCheck = await request(app).get('/api/posts/post-scheduled');
    const xCheck = await request(app).get('/api/posts/post-sched-x');

    expect(liCheck.body.status).toBe('published');
    expect(xCheck.body.status).toBe('failed');
    expect(xCheck.body.error_reason).toMatch(/X rate-limit/);
  });

  // ── Token refresh ─────────────────────────────────────────────────────────

  it('POST /api/cron/refresh-tokens refreshes tokens for accounts near expiry', async () => {
    // Set acc-li to expire in 2 minutes (within refresh threshold)
    const acc = seed.social_accounts.find((a) => a.id === 'acc-li')!;
    acc.token_expires_at = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const res = await request(app).post('/api/cron/refresh-tokens');
    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBeGreaterThanOrEqual(1);
  });
});
