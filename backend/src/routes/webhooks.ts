import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';

const router = Router();

// GET /api/webhooks/:platform — Webhook verification challenge (Meta, etc.)
router.get('/:platform', (req: Request, res: Response) => {
  const { platform } = req.params;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN;

  // In production, reject if verify token is not explicitly configured
  if (process.env.NODE_ENV === 'production' && !expectedToken) {
    return res.status(500).json({ error: 'WEBHOOK_VERIFY_TOKEN is not configured on the server' });
  }

  // Fallback verify token for local dev only
  const verifyTokenToMatch = expectedToken || (process.env.NODE_ENV !== 'production' ? 'dev_webhook_verify_token' : '');

  if (mode === 'subscribe') {
    if (token && verifyTokenToMatch && token === verifyTokenToMatch) {
      console.log(`✅ Webhook challenge verified for platform ${platform}`);
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification token mismatch' });
  }

  res.status(400).json({ error: 'Invalid hub.mode' });
});

// POST /api/webhooks/:platform — Ingest provider webhook events (P0 #7)
router.post('/:platform', async (req: Request, res: Response) => {
  const { platform } = req.params;
  const signature = (req.headers['x-hub-signature-256'] as string) || (req.headers['x-hub-signature'] as string);
  const secret = process.env.META_APP_SECRET || process.env.WEBHOOK_SECRET;

  if (process.env.NODE_ENV === 'production' && !secret) {
    return res.status(500).json({ error: 'Webhook secret is not configured in production' });
  }

  // When secret is configured, signature is mandatory and strictly verified using timingSafeEqual over raw body
  if (secret) {
    if (!signature) {
      return res.status(401).json({ error: 'Missing webhook signature header' });
    }

    const rawBytes: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
    const hmac = crypto.createHmac('sha256', secret).update(rawBytes).digest('hex');
    const expectedSig = `sha256=${hmac}`;

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn(`⚠️ Webhook signature mismatch for platform: ${platform}`);
      return res.status(403).json({ error: 'Signature verification failed' });
    }
  }

  try {
    const event = req.body;
    console.log(`📡 Ingested webhook event from ${platform}:`, event.entry ? `${event.entry.length} entries` : 'payload received');

    // Handle token expiration / permission change events
    if (event.entry) {
      for (const entry of event.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'permissions') {
              console.log('Account permission change event detected');
            }
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
