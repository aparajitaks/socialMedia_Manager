import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { PostStatus, PlatformType, UserRole } from '../types/index.js';

const router = Router();

// GET /api/posts
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as PostStatus | undefined;
    const platform = req.query.platform as PlatformType | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    let posts = await db.getPosts({ status, from, to });
    if (platform) {
      posts = posts.filter((p) => p.platform === platform);
    }
    res.json(posts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts
router.post('/', async (req: Request, res: Response) => {
  try {
    const { label, accounts, scheduled_at } = req.body;

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ error: 'At least one account posting must be specified' });
    }

    const currentRole = (req.headers['x-user-role'] as UserRole) || 'admin';
    const users = await db.getUsers();
    const currentUser = users.find((u) => u.role === currentRole) || users[0];

    const postGroup = await db.createPostGroup(
      currentUser.id,
      label || `Post on ${new Date().toLocaleDateString()}`
    );

    const isDirectSchedule = !!scheduled_at;
    const targetStatus: PostStatus = isDirectSchedule ? 'scheduled' : 'draft';

    const createdPosts = [];
    for (const item of accounts) {
      const socialAccount = await db.getSocialAccountById(item.social_account_id);
      if (!socialAccount) {
        throw new Error(`Social account not found for id: ${item.social_account_id}`);
      }

      const post = await db.createPost({
        post_group_id: postGroup.id,
        social_account_id: socialAccount.id,
        platform: socialAccount.platform,
        content: item.content || '',
        media_urls: item.media_urls || [],
        status: targetStatus,
        scheduled_at: isDirectSchedule ? new Date(scheduled_at).toISOString() : null,
        created_by: currentUser.id
      });
      createdPosts.push(post);
    }

    res.status(201).json({
      post_group: postGroup,
      posts: createdPosts
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/posts/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/posts/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const currentPost = await db.getPostById(req.params.id);
    if (!currentPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (currentPost.status === 'published') {
      return res.status(400).json({ error: 'Cannot modify a post that is already published' });
    }

    const { content, media_urls, scheduled_at, status } = req.body;
    const updated = await db.updatePost(req.params.id, {
      content: content !== undefined ? content : currentPost.content,
      media_urls: media_urls !== undefined ? media_urls : currentPost.media_urls,
      scheduled_at: scheduled_at !== undefined ? scheduled_at : currentPost.scheduled_at,
      status: status !== undefined ? status : currentPost.status
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const currentPost = await db.getPostById(req.params.id);
    if (!currentPost) {
      return res.status(404).json({ error: 'Post not found' });
    }
    await db.deletePost(req.params.id);
    res.json({ success: true, message: 'Post removed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/:id/retry
router.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed posts can be retried' });
    }

    const updated = await db.updatePost(post.id, {
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 1000).toISOString(),
      error_reason: null
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/:id/approve
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const role = (req.headers['x-user-role'] as UserRole) || 'admin';
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin role required to approve posts' });
    }

    const post = await db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const users = await db.getUsers();
    const adminUser = users.find((u) => u.role === 'admin') || users[0];

    const updated = await db.updatePost(post.id, {
      approved_by: adminUser.id
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/posts/:id/metrics
router.get('/:id/metrics', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const metrics = await db.getPostMetrics(post.id);
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
