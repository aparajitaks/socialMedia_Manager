/**
 * Phase 1 & 2 Tests:
 * - Social Account Capabilities & Connection Security
 * - Multi-Platform Content Composer & Platform Capability Validation
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

describe('Phase 1: Social Accounts & Capabilities API', () => {
  it('GET /api/social-accounts/capabilities returns capability matrix for all platforms', async () => {
    const res = await request(app).get('/api/social-accounts/capabilities');
    expect(res.status).toBe(200);
    expect(res.body.platforms).toBeDefined();
    expect(Array.isArray(res.body.platforms)).toBe(true);

    const xPlatform = res.body.platforms.find((p: any) => p.platform === 'x');
    expect(xPlatform).toBeDefined();
    expect(xPlatform.capabilities.publishText).toBe(true);
    expect(xPlatform.capabilities.publishVideo).toBe(true);

    const igPlatform = res.body.platforms.find((p: any) => p.platform === 'instagram');
    expect(igPlatform).toBeDefined();
    expect(igPlatform.capabilities.publishCarousel).toBe(true);

    const unsupported = res.body.platforms.find((p: any) => p.platform === 'tiktok');
    expect(unsupported).toBeDefined();
    expect(unsupported.status).toBe('UNSUPPORTED');
  });

  it('GET /api/social-accounts/capabilities/:platform returns single platform capabilities', async () => {
    const res = await request(app).get('/api/social-accounts/capabilities/linkedin');
    expect(res.status).toBe(200);
    expect(res.body.platform).toBe('linkedin');
    expect(res.body.capabilities.publishDocument).toBe(true);
  });

  it('GET /api/social-accounts/capabilities/:platform returns 404 for unknown platform', async () => {
    const res = await request(app).get('/api/social-accounts/capabilities/nonexistent_platform');
    expect(res.status).toBe(404);
  });

  it('GET /api/social-accounts returns safe accounts with capabilities and no tokens', async () => {
    const res = await request(app).get('/api/social-accounts');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    for (const acc of res.body) {
      expect(acc.access_token).toBeUndefined();
      expect(acc.access_token_encrypted).toBeUndefined();
      expect(acc.refresh_token).toBeUndefined();
      expect(acc.capabilities).toBeDefined();
      expect(typeof acc.capabilities.publishText).toBe('boolean');
    }
  });

  it('POST /api/social-accounts/:id/verify verifies connection in test mode', async () => {
    const res = await request(app).post('/api/social-accounts/acc-li/verify');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('CONNECTED');
  });

  it('DELETE /api/social-accounts/:id removes account safely', async () => {
    const delRes = await request(app).delete('/api/social-accounts/acc-li');
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });
});

describe('Phase 2: Platform Capability Validation Engine', () => {
  it('rejects X post exceeding 280 characters', async () => {
    const longContent = 'A'.repeat(281);
    const res = await request(app)
      .post('/api/posts/validate')
      .send({
        platform: 'x',
        content: longContent,
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.some((e: any) => e.code === 'CONTENT_TOO_LONG')).toBe(true);
  });

  it('warns when X post is near limit (260-280 characters)', async () => {
    const nearLimitContent = 'A'.repeat(265);
    const res = await request(app)
      .post('/api/posts/validate')
      .send({
        platform: 'x',
        content: nearLimitContent,
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.warnings.some((w: any) => w.code === 'CONTENT_NEAR_LIMIT')).toBe(true);
  });

  it('rejects text-only posts on Instagram (media required)', async () => {
    const res = await request(app)
      .post('/api/posts/validate')
      .send({
        platform: 'instagram',
        content: 'Check out our new post!',
        media_urls: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.some((e: any) => e.code === 'MEDIA_REQUIRED')).toBe(true);
  });

  it('accepts Instagram post with valid image', async () => {
    const res = await request(app)
      .post('/api/posts/validate')
      .send({
        platform: 'instagram',
        content: 'Check out our new post!',
        media_urls: ['https://example.com/photo.jpg'],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.errors.length).toBe(0);
  });

  it('rejects Instagram carousel with more than 10 media items', async () => {
    const media = Array.from({ length: 11 }, (_, i) => `https://example.com/img${i}.jpg`);
    const res = await request(app)
      .post('/api/posts/validate')
      .send({
        platform: 'instagram',
        content: 'Too many photos carousel',
        media_urls: media,
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.some((e: any) => e.code === 'TOO_MANY_MEDIA_ITEMS')).toBe(true);
  });

  it('rejects X post mixing image and video', async () => {
    const res = await request(app)
      .post('/api/posts/validate')
      .send({
        platform: 'x',
        content: 'Mixed media tweet',
        media_urls: ['https://example.com/photo.jpg', 'https://example.com/video.mp4'],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.some((e: any) => e.code === 'MEDIA_MIXED_NOT_SUPPORTED')).toBe(true);
  });

  it('rejects Google Business post with video', async () => {
    const res = await request(app)
      .post('/api/posts/validate')
      .send({
        platform: 'google_business',
        content: 'Local business update with video',
        media_urls: ['https://example.com/promo.mp4'],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.some((e: any) => e.code === 'VIDEO_NOT_SUPPORTED')).toBe(true);
  });
});

describe('Phase 2: Composer Posts & Variant Lifecycle API', () => {
  it('creates a source post with variants transactionally', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({
        client_id: DEFAULT_CLIENT_ID,
        content: 'Cross-platform announcement!',
        campaign_label: 'Product Launch Q4',
        variants: [
          {
            social_account_id: 'acc-li',
            platform: 'linkedin',
            content: 'LinkedIn tailored text',
          },
          {
            social_account_id: 'acc-x',
            platform: 'x',
            content: 'X tweet version',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.post).toBeDefined();
    expect(res.body.variants.length).toBe(2);
    expect(res.body.variants[0].content).toBe('LinkedIn tailored text');
    expect(res.body.variants[1].content).toBe('X tweet version');
  });

  it('rolls back post creation if a variant account belongs to another client', async () => {
    // Different client
    seed.social_accounts.push({
      id: 'acc-foreign',
      client_id: '99999999-9999-9999-9999-999999999999',
      platform: 'linkedin',
      display_name: 'Foreign Client Account',
      access_token: 'enc:foreign',
      status: 'connected',
    });

    const initialPostsCount = seed.posts.length;

    const res = await request(app)
      .post('/api/posts')
      .send({
        client_id: DEFAULT_CLIENT_ID,
        content: 'Malicious post injection',
        variants: [
          {
            social_account_id: 'acc-foreign',
            platform: 'linkedin',
            content: 'Attack variant',
          },
        ],
      });

    expect(res.status).toBe(500);
    // Verified rollback: no new post persisted in database
    expect(seed.posts.length).toBe(initialPostsCount);
  });

  it('POST /api/posts/:id/duplicate clones post and variants to a new draft', async () => {
    // Create base post with variant
    const createRes = await request(app)
      .post('/api/posts')
      .send({
        client_id: DEFAULT_CLIENT_ID,
        content: 'Original to duplicate',
        campaign_label: 'Original Campaign',
        variants: [
          {
            social_account_id: 'acc-x',
            platform: 'x',
            content: 'Original variant content',
          },
        ],
      });

    const basePostId = createRes.body.post.id;

    const dupRes = await request(app).post(`/api/posts/${basePostId}/duplicate`);
    expect(dupRes.status).toBe(201);
    expect(dupRes.body.post.id).not.toBe(basePostId);
    expect(dupRes.body.post.content).toBe('Original to duplicate');
    expect(dupRes.body.post.campaign_label).toContain('(Copy)');
    expect(dupRes.body.post.status).toBe('draft');
    expect(dupRes.body.variants.length).toBe(1);
    expect(dupRes.body.variants[0].content).toBe('Original variant content');
  });

  it('POST /api/posts/:id/variants adds a new variant to existing post', async () => {
    const postRes = await request(app)
      .post('/api/posts')
      .send({
        client_id: DEFAULT_CLIENT_ID,
        social_account_id: 'acc-li',
        content: 'Single account base post',
      });

    const postId = postRes.body.post.id;

    const varRes = await request(app)
      .post(`/api/posts/${postId}/variants`)
      .send({
        social_account_id: 'acc-x',
        platform: 'x',
        content: 'Added variant for X',
      });

    expect(varRes.status).toBe(201);
    expect(varRes.body.post_id).toBe(postId);
    expect(varRes.body.content).toBe('Added variant for X');
  });

  it('PATCH /api/posts/:id/variants/:variantId updates variant content', async () => {
    const postRes = await request(app)
      .post('/api/posts')
      .send({
        client_id: DEFAULT_CLIENT_ID,
        social_account_id: 'acc-li',
        content: 'Base post',
        variants: [
          {
            social_account_id: 'acc-li',
            platform: 'linkedin',
            content: 'Variant before patch',
          },
        ],
      });

    const postId = postRes.body.post.id;
    const variantId = postRes.body.variants[0].id;

    const patchRes = await request(app)
      .patch(`/api/posts/${postId}/variants/${variantId}`)
      .send({
        content: 'Variant after patch',
        first_comment: 'Link in comments!',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.content).toBe('Variant after patch');
    expect(patchRes.body.first_comment).toBe('Link in comments!');
  });

  it('DELETE /api/posts/:id/variants/:variantId removes variant', async () => {
    const postRes = await request(app)
      .post('/api/posts')
      .send({
        client_id: DEFAULT_CLIENT_ID,
        social_account_id: 'acc-li',
        content: 'Base post',
        variants: [
          {
            social_account_id: 'acc-li',
            platform: 'linkedin',
            content: 'Variant to delete',
          },
        ],
      });

    const postId = postRes.body.post.id;
    const variantId = postRes.body.variants[0].id;

    const delRes = await request(app).delete(`/api/posts/${postId}/variants/${variantId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const checkRes = await request(app).get(`/api/posts/${postId}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.variants.find((v: any) => v.id === variantId)).toBeUndefined();
  });
});
