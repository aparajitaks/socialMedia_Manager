import { Router, Request, Response } from 'express';
import { db, DEFAULT_CLIENT_ID } from '../db.js';
import { Post } from '../types/index.js';

const router = Router();

// ===========================================================================
// RecurPost-Style Evergreen Content Libraries & Recurring Schedules
// ===========================================================================

// GET /api/libraries — List libraries for client
router.get('/', async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.clientId || req.query.client_id) as string || DEFAULT_CLIENT_ID;
    const libraries = await db.getContentLibraries(clientId);
    res.json(libraries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/libraries — Create library
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color, client_id, active } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Library name is required' });
    }

    const created = await db.createContentLibrary({
      client_id: client_id || DEFAULT_CLIENT_ID,
      name: name.trim(),
      color: color || '#2B6E63',
      active: active !== undefined ? active : true,
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/libraries/:id — Get single library with posts and recurring schedules
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const lib = await db.getContentLibrary(req.params.id);
    if (!lib) return res.status(404).json({ error: 'Library not found' });

    const posts = await db.getLibraryPosts(lib.id);
    const schedules = (await db.getRecurringSchedules(lib.client_id)).filter((s) => s.library_id === lib.id);

    res.json({
      ...lib,
      posts,
      schedules,
      total_posts: posts.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/libraries/:id — Update library
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updated = await db.updateContentLibrary(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/libraries/:id — Delete library
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteContentLibrary(req.params.id);
    res.json({ success: true, message: 'Library deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================================
// Library Posts Management
// ===========================================================================

// GET /api/libraries/:id/posts — List library posts
router.get('/:id/posts', async (req: Request, res: Response) => {
  try {
    const posts = await db.getLibraryPosts(req.params.id);
    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/libraries/:id/posts — Add post to library
router.post('/:id/posts', async (req: Request, res: Response) => {
  try {
    const { content, media_urls, platform_variants } = req.body;
    if (!content && (!media_urls || media_urls.length === 0)) {
      return res.status(400).json({ error: 'Post content or media is required' });
    }

    const lib = await db.getContentLibrary(req.params.id);
    if (!lib) return res.status(404).json({ error: 'Library not found' });

    const created = await db.createLibraryPost({
      library_id: lib.id,
      client_id: lib.client_id,
      content: content || '',
      media_urls: media_urls || [],
      platform_variants: platform_variants || null,
    });

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/libraries/:id/posts/:postId — Edit library post
router.patch('/:id/posts/:postId', async (req: Request, res: Response) => {
  try {
    const updated = await db.updateLibraryPost(req.params.postId, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/libraries/:id/posts/:postId — Delete library post
router.delete('/:id/posts/:postId', async (req: Request, res: Response) => {
  try {
    await db.deleteLibraryPost(req.params.postId);
    res.json({ success: true, message: 'Library post deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================================
// Recurring Schedules Management (RecurPost-Style Slots & Rotation)
// ===========================================================================

// GET /api/libraries/:id/schedules
router.get('/:id/schedules', async (req: Request, res: Response) => {
  try {
    const lib = await db.getContentLibrary(req.params.id);
    if (!lib) return res.status(404).json({ error: 'Library not found' });

    const schedules = (await db.getRecurringSchedules(lib.client_id)).filter((s) => s.library_id === lib.id);
    res.json(schedules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/libraries/:id/schedules — Add recurring schedule slot
router.post('/:id/schedules', async (req: Request, res: Response) => {
  try {
    const { days_of_week, time_of_day, timezone, social_account_ids, start_date, end_date, max_repetitions } = req.body;

    const lib = await db.getContentLibrary(req.params.id);
    if (!lib) return res.status(404).json({ error: 'Library not found' });

    if (!days_of_week || !Array.isArray(days_of_week) || days_of_week.length === 0) {
      return res.status(400).json({ error: 'days_of_week array is required (e.g. [1, 3, 5] for Mon/Wed/Fri)' });
    }
    if (!time_of_day) {
      return res.status(400).json({ error: 'time_of_day is required (e.g. "10:00")' });
    }
    if (!social_account_ids || !Array.isArray(social_account_ids) || social_account_ids.length === 0) {
      return res.status(400).json({ error: 'social_account_ids array is required' });
    }

    const created = await db.createRecurringSchedule({
      library_id: lib.id,
      client_id: lib.client_id,
      social_account_ids,
      days_of_week,
      time_of_day,
      timezone: timezone || 'UTC',
      start_date: start_date || null,
      end_date: end_date || null,
      max_repetitions: max_repetitions || null,
      active: true,
    });

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/libraries/:id/schedules/:schedId
router.delete('/:id/schedules/:schedId', async (req: Request, res: Response) => {
  try {
    await db.deleteRecurringSchedule(req.params.schedId);
    res.json({ success: true, message: 'Recurring schedule deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/libraries/:id/rotate — Queue next eligible post from library into scheduled posts
router.post('/:id/rotate', async (req: Request, res: Response) => {
  try {
    const lib = await db.getContentLibrary(req.params.id);
    if (!lib) return res.status(404).json({ error: 'Library not found' });

    const posts = await db.getLibraryPosts(lib.id);
    if (posts.length === 0) {
      return res.status(400).json({ error: 'No posts in library to rotate' });
    }

    // Select the post with fewest publications (least recently published)
    const nextPost = posts[0];
    const schedules = (await db.getRecurringSchedules(lib.client_id)).filter((s) => s.library_id === lib.id && s.active);

    const targetAccounts = req.body.social_account_ids || (schedules[0] ? schedules[0].social_account_ids : []);
    if (targetAccounts.length === 0) {
      return res.status(400).json({ error: 'No target social accounts specified for publication' });
    }

    const scheduledAt = req.body.scheduled_at || new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const createdPosts: Post[] = [];

    for (const accId of targetAccounts) {
      const account = await db.getSocialAccountById(accId);
      if (!account) continue;

      const p = await db.createPost({
        client_id: lib.client_id,
        social_account_id: accId,
        platform: account.platform,
        content: nextPost.content,
        media_urls: nextPost.media_urls || [],
        scheduled_at: scheduledAt,
        status: 'scheduled',
        campaign_label: `Library: ${lib.name}`,
      });
      createdPosts.push(p);
    }

    // Increment publication count on the library post
    await db.updateLibraryPost(nextPost.id, {
      times_published: (nextPost.times_published || 0) + 1,
      last_published_at: new Date().toISOString(),
    });

    res.json({
      success: true,
      library: lib.name,
      rotated_post: nextPost,
      scheduled_posts: createdPosts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
