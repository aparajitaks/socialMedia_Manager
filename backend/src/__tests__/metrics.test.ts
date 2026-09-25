/**
 * Checklist §5 — Metrics
 * Tests post metrics retrieval, manual trigger/update, and summary aggregation.
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

describe('§5 Metrics', () => {
  it('GET /api/posts/:id/metrics returns metrics history for a published post', async () => {
    const res = await request(app).get('/api/posts/post-published/metrics');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].likes).toBe(42);
    expect(res.body[0].impressions).toBe(820);
  });

  it('GET /api/metrics/summary returns aggregated metrics', async () => {
    const res = await request(app).get('/api/metrics/summary');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].platform).toBe('linkedin');
    expect(res.body[0].total_likes).toBe(42);
  });

  it('POST /api/cron/fetch-metrics triggers metrics fetch job successfully', async () => {
    const res = await request(app).post('/api/cron/fetch-metrics');
    expect(res.status).toBe(200);
    expect(res.body.posts_analyzed).toBeDefined();
    expect(res.body.new_metrics_recorded).toBeDefined();
  });
});
