import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { PlatformType } from '../types/index.js';

const router = Router();

// GET /api/metrics/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as PlatformType | undefined;
    const summaries = await db.getMetricsSummary(platform);
    res.json(summaries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
