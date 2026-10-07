import { Router, Request, Response } from 'express';
import { db } from '../db.js';

const router = Router();

// GET /api/notifications — List notifications
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const workspaceId = req.query.workspaceId as string | undefined;
    const unreadOnly = req.query.unreadOnly === 'true';

    const notifs = await db.getNotifications(userId, workspaceId, unreadOnly);
    res.json(notifs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read — Mark single notification read
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    await db.markNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/:id/read — Mark single notification read (alias)
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    await db.markNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/mark-all-read — Mark all notifications read
router.post('/mark-all-read', async (req: Request, res: Response) => {
  try {
    const notifs = await db.getNotifications();
    for (const n of notifs) {
      if (!n.read) await db.markNotificationRead(n.id);
    }
    res.json({ success: true, marked: notifs.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
