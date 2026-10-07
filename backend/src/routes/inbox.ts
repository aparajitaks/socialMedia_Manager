import { Router, Request, Response } from 'express';
import { db, DEFAULT_CLIENT_ID } from '../db.js';

const router = Router();

// GET /api/inbox/conversations — List conversations
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.clientId || req.query.client_id) as string || DEFAULT_CLIENT_ID;
    const platform = req.query.platform as string | undefined;

    const convs = await db.getInboxConversations(clientId, platform);
    res.json(convs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inbox/conversations/:id/messages — Get message thread
router.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const messages = await db.getInboxMessages(req.params.id);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inbox/conversations/:id/reply — Send reply in conversation
router.post('/conversations/:id/reply', async (req: Request, res: Response) => {
  try {
    const { content, sender_name } = req.body;
    if (!content) return res.status(400).json({ error: 'Reply content is required' });

    const msg = await db.createInboxMessage({
      conversation_id: req.params.id,
      content,
      sender_name: sender_name || 'Agency Community Manager',
      is_from_us: true,
      message_type: 'reply',
    });

    res.status(201).json(msg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
