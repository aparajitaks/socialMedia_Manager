import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import crypto from 'crypto';
import webhooksRouter from '../routes/webhooks.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use('/api/webhooks', webhooksRouter);
});

describe('§ Webhooks verification and HMAC security (P0 #7)', () => {
  it('GET /api/webhooks/:platform returns challenge when verify_token matches', async () => {
    const prev = process.env.WEBHOOK_VERIFY_TOKEN;
    try {
      process.env.WEBHOOK_VERIFY_TOKEN = 'my_secure_meta_token_777';

      const res = await request(app)
        .get('/api/webhooks/meta')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'my_secure_meta_token_777',
          'hub.challenge': 'challenge_code_12345',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('challenge_code_12345');
    } finally {
      process.env.WEBHOOK_VERIFY_TOKEN = prev;
    }
  });

  it('GET /api/webhooks/:platform returns 403 when verify_token does not match', async () => {
    const prev = process.env.WEBHOOK_VERIFY_TOKEN;
    try {
      process.env.WEBHOOK_VERIFY_TOKEN = 'my_secure_meta_token_777';

      const res = await request(app)
        .get('/api/webhooks/meta')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'challenge_code_12345',
        });

      expect(res.status).toBe(403);
    } finally {
      process.env.WEBHOOK_VERIFY_TOKEN = prev;
    }
  });

  it('POST /api/webhooks/:platform rejects unsigned payload when secret is configured', async () => {
    const prev = process.env.WEBHOOK_SECRET;
    try {
      process.env.WEBHOOK_SECRET = 'webhook_secret_key_888';

      const res = await request(app)
        .post('/api/webhooks/meta')
        .send({ object: 'page', entry: [] });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Missing webhook signature');
    } finally {
      process.env.WEBHOOK_SECRET = prev;
    }
  });

  it('POST /api/webhooks/:platform rejects invalid signature', async () => {
    const prev = process.env.WEBHOOK_SECRET;
    try {
      process.env.WEBHOOK_SECRET = 'webhook_secret_key_888';

      const res = await request(app)
        .post('/api/webhooks/meta')
        .set('x-hub-signature-256', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
        .send({ object: 'page', entry: [] });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Signature verification failed');
    } finally {
      process.env.WEBHOOK_SECRET = prev;
    }
  });

  it('POST /api/webhooks/:platform accepts valid HMAC-SHA256 signature computed over raw body', async () => {
    const secret = 'webhook_secret_key_888';
    const prev = process.env.WEBHOOK_SECRET;
    try {
      process.env.WEBHOOK_SECRET = secret;

      const payload = JSON.stringify({ object: 'page', entry: [{ id: '123' }] });
      const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const signature = `sha256=${hmac}`;

      const res = await request(app)
        .post('/api/webhooks/meta')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    } finally {
      process.env.WEBHOOK_SECRET = prev;
    }
  });
});
