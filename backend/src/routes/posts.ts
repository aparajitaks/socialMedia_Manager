import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db, DEFAULT_CLIENT_ID } from '../db.js';
import { PostStatus, PlatformType, UserRole, Post } from '../types/index.js';
import { getPublisher } from '../publishers/index.js';
import { validateVariant, validateVariants } from '../platform-adapter/index.js';
import { requireAuth } from './auth.js';

// ---------------------------------------------------------------------------
// Helper: build a publish job payload for a given post + optional variant
// ---------------------------------------------------------------------------
function buildJobPayload(
  post: Post,
  variantId: string | null,
  socialAccountId: string,
  platform: string,
  scheduledAt: string
) {
  const ts = new Date(scheduledAt).getTime();
  const idempotencyKey = `idemp_${post.id}_${variantId || socialAccountId}_${ts}`;
  return {
    post_id: post.id,
    variant_id: variantId,
    client_id: post.client_id,
    social_account_id: socialAccountId,
    platform: platform as PlatformType,
    scheduled_at: scheduledAt,
    status: 'SCHEDULED' as const,
    idempotency_key: idempotencyKey,
    attempt_count: 0,
    max_attempts: 3,
  };
}

const router = Router();

// ---------------------------------------------------------------------------
// Tenant isolation helper — call this after loading any post from the DB.
// Returns null if access is allowed, or a {status, body} to send back.
// ---------------------------------------------------------------------------
async function assertPostOwnedByOrg(
  post: Post,
  req: Request
): Promise<{ status: number; body: object } | null> {
  const callerOrgId: string | undefined = (req as any).organizationId;
  if (!callerOrgId) return null; // zero-config dev mode — no isolation
  const clientId = post.client_id || DEFAULT_CLIENT_ID;
  const client = await db.getClient(clientId);
  if (!client || client.organization_id !== callerOrgId) {
    return { status: 403, body: { error: 'Access to this post is not authorized' } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tenant isolation helper for social accounts
// ---------------------------------------------------------------------------
async function assertAccountOwnedByOrg(
  account: { client_id: string },
  req: Request
): Promise<{ status: number; body: object } | null> {
  const callerOrgId: string | undefined = (req as any).organizationId;
  if (!callerOrgId) return null;
  const client = await db.getClient(account.client_id);
  if (!client || client.organization_id !== callerOrgId) {
    return { status: 403, body: { error: 'Access to this resource is not authorized' } };
  }
  return null;
}

function resolveUserRole(req: Request): string {
  if ((req as any).userRole) {
    return String((req as any).userRole).toLowerCase();
  }
  // In production, never trust unverified client headers
  if (process.env.NODE_ENV === 'production') {
    return 'editor';
  }
  return ((req.headers['x-user-role'] as string) || 'admin').toLowerCase();
}

// ===========================================================================
// Public Review Route (Shareable Approval Link - No Auth Required)
// ===========================================================================

// GET /api/posts/review/:token — view post details via secure share token
router.get('/review/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const approval = await db.getApprovalByToken(token);
    if (!approval) {
      return res.status(404).json({ error: 'Review link is invalid or has expired' });
    }

    const post = await db.getPostById(approval.post_id);
    if (!post) {
      return res.status(404).json({ error: 'Post no longer exists' });
    }

    const account = await db.getSocialAccountById(post.social_account_id);
    const variants = await db.getPostVariants(post.id);

    res.json({
      approval,
      post,
      account: account ? { id: account.id, platform: account.platform, display_name: account.display_name } : null,
      variants,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/review/:token/action — client approve or reject with comments
router.post('/review/:token/action', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { action, comment, approver_name } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
    }

    const approval = await db.getApprovalByToken(token);
    if (!approval) {
      return res.status(404).json({ error: 'Review link is invalid or has expired' });
    }

    const post = await db.getPostById(approval.post_id);
    if (!post) {
      return res.status(404).json({ error: 'Post no longer exists' });
    }

    const isApprove = action === 'approve';
    const newApprovalStatus = isApprove ? 'APPROVED' : 'REJECTED';
    const newPostStatus: PostStatus = isApprove
      ? post.scheduled_at
        ? 'scheduled'
        : 'approved'
      : 'draft';

    const updatedApproval = await db.updateApproval(approval.id, {
      status: newApprovalStatus,
      comment: comment || approval.comment,
      approver_name: approver_name || 'Client Reviewer',
    });

    const updatedPost = await db.updatePost(post.id, {
      status: newPostStatus,
      approved_by: isApprove ? approval.id : null,
    });

    // Create notification for agency staff
    await db.createNotification({
      client_id: post.client_id,
      type: isApprove ? 'POST_APPROVED' : 'POST_REJECTED',
      title: isApprove ? 'Post Approved by Client' : 'Post Rejected by Client',
      message: `${approver_name || 'Client'} has ${isApprove ? 'approved' : 'rejected'} post "${post.content.slice(0, 30)}..."${comment ? `: "${comment}"` : ''}`,
      entity_id: post.id,
      entity_type: 'post',
    });

    res.json({
      success: true,
      action,
      approval: updatedApproval,
      post: updatedPost,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================================================
// Core Posts CRUD & Workflows
// All routes below this point require authentication.
// ===========================================================================
router.use(requireAuth);

// GET /api/posts
router.get('/', async (req: Request, res: Response) => {
  try {
    const callerOrgId: string | undefined = (req as any).organizationId;
    const status = req.query.status as PostStatus | undefined;
    const platform = req.query.platform as PlatformType | undefined;
    const clientId = (req.query.clientId || req.query.client_id) as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // If a specific clientId is requested, verify tenant access first
    if (clientId && callerOrgId) {
      const client = await db.getClient(clientId);
      if (!client || client.organization_id !== callerOrgId) {
        return res.status(403).json({ error: 'Access to this client is not authorized' });
      }
    }

    let posts = await db.getPosts({ status, from, to, clientId, platform });

    // Scope to caller's org when no clientId filter (org-level cross-client view)
    if (!clientId && callerOrgId) {
      const orgClients = await db.getClients(callerOrgId);
      const orgClientIds = new Set(orgClients.map((c) => c.id));
      posts = posts.filter((p) => orgClientIds.has(p.client_id));
    }

    if (platform) {
      posts = posts.filter((p) => p.platform === platform);
    }

    res.json(posts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts — Create single post, batch post_group, or source post with platform variants
router.post('/', async (req: Request, res: Response) => {
  try {
    const callerOrgId: string | undefined = (req as any).organizationId;
    const { label, accounts, scheduled_at, content, client_id, social_account_id, platform, variants, status } = req.body;

    // Validate that the target client belongs to the caller's org
    const targetClientId = client_id || (accounts ? null : null); // resolved later per account
    if (targetClientId && callerOrgId) {
      const targetClient = await db.getClient(targetClientId);
      if (!targetClient || targetClient.organization_id !== callerOrgId) {
        return res.status(403).json({ error: 'Access to this client is not authorized' });
      }
    }

    const currentRole = (resolveUserRole(req) as UserRole) || 'admin';
    const users = await db.getUsers();
    const currentUser = users.find((u) => u.role === currentRole) || users[0];

    // Mode A: Multi-account post group creation (standard / legacy format)
    if (accounts && Array.isArray(accounts)) {
      if (accounts.length === 0) {
        return res.status(400).json({ error: 'At least one account posting must be specified' });
      }

      const postGroup = await db.createPostGroup(
        currentUser.id,
        label || `Post on ${new Date().toLocaleDateString()}`
      );

      const isDirectSchedule = !!scheduled_at;
      const targetStatus: PostStatus = status || (isDirectSchedule ? 'scheduled' : 'draft');

      const createdPosts = [];
      for (const item of accounts) {
        const socialAccount = await db.getSocialAccountById(item.social_account_id);
        if (!socialAccount) {
          throw new Error(`Social account not found for id: ${item.social_account_id}`);
        }

        // Platform-specific validation if scheduled
        if (targetStatus === 'scheduled' || targetStatus === 'SCHEDULED') {
          const publisher = getPublisher(socialAccount.platform);
          if (publisher.validatePost) {
            const val = publisher.validatePost(item, socialAccount);
            if (!val.valid) {
              return res.status(400).json({
                error: `Validation error for ${socialAccount.display_name}: ${val.errors.join('; ')}`
              });
            }
          }
        }

        const post = await db.createPost({
          client_id: socialAccount.client_id,
          post_group_id: postGroup.id,
          social_account_id: socialAccount.id,
          platform: socialAccount.platform,
          content: item.content || '',
          media_urls: item.media_urls || [],
          status: targetStatus,
          campaign_label: label || null,
          scheduled_at: isDirectSchedule ? new Date(scheduled_at).toISOString() : null,
          created_by: currentUser.id,
        });

        // If target status is pending approval, create approval record with shareable link
        if (targetStatus === 'pending_approval' || targetStatus === 'PENDING_APPROVAL') {
          await db.createApproval({
            post_id: post.id,
            client_id: post.client_id,
            status: 'PENDING',
          });
        }

        createdPosts.push(post);
      }

      // Mode A: transactionally create publish_jobs for all scheduled posts (§5, §6)
      if (targetStatus === 'scheduled' || targetStatus === 'SCHEDULED') {
        const jobsPayload = createdPosts.map((p) => {
          const scheduledAt = new Date(scheduled_at).toISOString();
          return buildJobPayload(p, null, p.social_account_id, p.platform, scheduledAt);
        });
        if (jobsPayload.length > 0) {
          try {
            await db.createPublishJobsTransaction(jobsPayload);
          } catch (jobErr: any) {
            // If job creation fails, do not fail the post creation — scheduler fallback will catch
            console.error('Mode A: failed to pre-create publish jobs:', jobErr.message);
          }
        }
      }

      return res.status(201).json({
        post_group: postGroup,
        posts: createdPosts,
      });
    }

    // Mode B: Single post or Source Post with Variants
    if (!social_account_id && (!variants || variants.length === 0)) {
      return res.status(400).json({ error: 'Either accounts array or social_account_id is required' });
    }

    const firstAccountId = social_account_id || variants[0]?.social_account_id;
    const account = await db.getSocialAccountById(firstAccountId);
    if (!account) {
      return res.status(404).json({ error: 'Social account not found' });
    }

    const targetStatus: PostStatus = status || (scheduled_at ? 'scheduled' : 'draft');

    const mainPost = await db.createPost({
      client_id: client_id || account.client_id,
      social_account_id: account.id,
      platform: platform || account.platform,
      content: content || '',
      media_urls: req.body.media_urls || [],
      scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : null,
      status: targetStatus,
      campaign_label: label || null,
      created_by: currentUser.id,
    });

    // Create variants if provided (transactional: if any fail, rollback created post)
    const createdVariants = [];
    if (variants && Array.isArray(variants) && variants.length > 0) {
      try {
        for (const v of variants) {
          const vAccount = await db.getSocialAccountById(v.social_account_id);
          if (!vAccount) {
            throw new Error(`Social account not found for variant: ${v.social_account_id}`);
          }
          if (vAccount.client_id !== (client_id || account.client_id)) {
            throw new Error(`Social account ${v.social_account_id} belongs to a different client`);
          }

          const targetPlatform = vAccount?.platform || v.platform || account.platform;
          const variant = await db.createPostVariant({
            post_id: mainPost.id,
            social_account_id: v.social_account_id,
            platform: targetPlatform,
            content: v.content !== undefined ? v.content : mainPost.content,
            media_urls: v.media_urls !== undefined ? v.media_urls : mainPost.media_urls,
            title: v.title || null,
            first_comment: v.first_comment || null,
            hashtags: v.hashtags || null,
            link: v.link || null,
            platform_specific_fields: v.platform_specific_fields || null,
            status: targetStatus,
          });
          createdVariants.push(variant);
        }
      } catch (variantErr: any) {
        // Rollback post on variant failure
        await db.deletePost(mainPost.id);
        throw variantErr;
      }
    }

    if (targetStatus === 'pending_approval' || targetStatus === 'PENDING_APPROVAL') {
      await db.createApproval({
        post_id: mainPost.id,
        client_id: mainPost.client_id,
        status: 'PENDING',
      });
    }

    // Mode B: transactionally create publish_jobs for scheduled posts (§5, §6)
    if (targetStatus === 'scheduled' || targetStatus === 'SCHEDULED') {
      try {
        const scheduledAt = scheduled_at ? new Date(scheduled_at).toISOString() : new Date().toISOString();
        let jobsPayload;
        if (createdVariants.length > 0) {
          // One job per variant
          jobsPayload = createdVariants.map((v) =>
            buildJobPayload(mainPost, v.id, v.social_account_id, v.platform, scheduledAt)
          );
        } else {
          // One job for the main post itself
          jobsPayload = [buildJobPayload(mainPost, null, mainPost.social_account_id, mainPost.platform, scheduledAt)];
        }
        await db.createPublishJobsTransaction(jobsPayload);
      } catch (jobErr: any) {
        // Non-fatal: scheduler fallback will still enqueue these
        console.error('Mode B: failed to pre-create publish jobs:', jobErr.message);
      }
    }

    res.status(201).json({
      post: mainPost,
      variants: createdVariants,
      posts: [mainPost],
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
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    const variants = db.getPostVariants ? await db.getPostVariants(post.id) : [];
    const approvals = db.getApprovals ? await db.getApprovals(post.id) : [];

    res.json({
      ...post,
      variants,
      approvals,
      latest_approval: approvals[0] || null,
    });
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
    const tenantErr = await assertPostOwnedByOrg(currentPost, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    if (currentPost.status === 'published') {
      return res.status(400).json({ error: 'Cannot modify a post that is already published' });
    }

    const { content, media_urls, scheduled_at, status, campaign_label, variants } = req.body;
    const updated = await db.updatePost(req.params.id, {
      content: content !== undefined ? content : currentPost.content,
      media_urls: media_urls !== undefined ? media_urls : currentPost.media_urls,
      scheduled_at: scheduled_at !== undefined ? scheduled_at : currentPost.scheduled_at,
      status: status !== undefined ? status : currentPost.status,
      campaign_label: campaign_label !== undefined ? campaign_label : currentPost.campaign_label,
    });

    // Update variants if provided
    if (variants && Array.isArray(variants)) {
      for (const v of variants) {
        if (v.id) {
          await db.updatePostVariant(v.id, v);
        }
      }
    }

    // When rescheduling: cancel any existing SCHEDULED jobs and re-create (§7, §8)
    const newScheduledAt = scheduled_at !== undefined ? scheduled_at : currentPost.scheduled_at;
    const newStatus = status !== undefined ? status : currentPost.status;
    if (newScheduledAt && (newStatus === 'scheduled' || newStatus === 'SCHEDULED')) {
      try {
        // Cancel existing open jobs for this post
        const existingJobs = await db.getPublishJobs({ postId: req.params.id });
        const openJobIds = existingJobs
          .filter((j) => j.status === 'SCHEDULED' || j.status === 'QUEUED' || j.status === 'RETRYING')
          .map((j) => j.id);
        for (const jobId of openJobIds) {
          await db.cancelPublishJob(jobId);
        }
        // Re-create fresh jobs at new time
        const postVariants = await db.getPostVariants(req.params.id);
        const scheduledAt = new Date(newScheduledAt).toISOString();
        let jobsPayload;
        if (postVariants.length > 0) {
          jobsPayload = postVariants.map((v) =>
            buildJobPayload(updated, v.id, v.social_account_id, v.platform, scheduledAt)
          );
        } else {
          jobsPayload = [buildJobPayload(updated, null, updated.social_account_id, updated.platform, scheduledAt)];
        }
        await db.createPublishJobsTransaction(jobsPayload);
      } catch (jobErr: any) {
        // Non-fatal: scheduler fallback handles it
        console.warn(`PATCH /posts/${req.params.id}: publish job resync error:`, jobErr.message);
      }
    }

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
    const tenantErr = await assertPostOwnedByOrg(currentPost, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);
    await db.deletePost(req.params.id);
    res.json({ success: true, message: 'Post removed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================================================
// Post Validation Engine
// ===========================================================================

// POST /api/posts/validate — Validate an in-flight post or variant payload (no DB save needed)
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { platform, content, media_urls, variants, link, first_comment, title } = req.body;

    if (variants && Array.isArray(variants) && variants.length > 0) {
      const result = validateVariants(variants);
      return res.json(result);
    }

    if (platform) {
      const result = validateVariant({
        platform,
        content: content || '',
        media_urls: media_urls || [],
        link,
        first_comment,
        title,
      });
      return res.json(result);
    }

    return res.status(400).json({ error: 'Provide platform or variants array to validate' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/:id/validate — Validate an existing post and its variants against platform capabilities
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    const variants = await db.getPostVariants(post.id);
    if (variants.length > 0) {
      const result = validateVariants(
        variants.map((v) => ({
          id: v.id,
          platform: v.platform,
          content: v.content,
          media_urls: v.media_urls,
          link: v.link,
          first_comment: v.first_comment,
          title: v.title,
          hashtags: v.hashtags,
        }))
      );
      return res.json(result);
    }

    const result = validateVariant({
      id: post.id,
      platform: post.platform,
      content: post.content,
      media_urls: post.media_urls,
    });
    return res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================================================
// Post Duplication
// ===========================================================================

// POST /api/posts/:id/duplicate — Clone a post and all its variants into a new draft
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const originalPost = await db.getPostById(req.params.id);
    if (!originalPost) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const tenantErr = await assertPostOwnedByOrg(originalPost, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    const currentRole = (resolveUserRole(req) as UserRole) || 'admin';
    const users = await db.getUsers();
    const currentUser = users.find((u) => u.role === currentRole) || users[0];

    const duplicateLabel = originalPost.campaign_label
      ? `${originalPost.campaign_label} (Copy)`
      : 'Untitled Draft (Copy)';

    const newPost = await db.createPost({
      client_id: originalPost.client_id,
      post_group_id: originalPost.post_group_id || null,
      social_account_id: originalPost.social_account_id,
      platform: originalPost.platform,
      content: originalPost.content,
      media_urls: originalPost.media_urls || [],
      scheduled_at: null,
      status: 'draft',
      campaign_label: duplicateLabel,
      created_by: currentUser.id,
    });

    const originalVariants = await db.getPostVariants(originalPost.id);
    const newVariants = [];

    for (const v of originalVariants) {
      const cloned = await db.createPostVariant({
        post_id: newPost.id,
        social_account_id: v.social_account_id,
        platform: v.platform,
        content: v.content,
        media_urls: v.media_urls,
        title: v.title,
        description: v.description,
        first_comment: v.first_comment,
        hashtags: v.hashtags,
        link: v.link,
        platform_specific_fields: v.platform_specific_fields,
        status: 'draft',
      });
      newVariants.push(cloned);
    }

    res.status(201).json({
      post: newPost,
      variants: newVariants,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================================================
// Variant Sub-Resource Endpoints
// ===========================================================================

// POST /api/posts/:id/variants — Add a platform variant to an existing post
router.post('/:id/variants', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    if (post.status === 'published') {
      return res.status(400).json({ error: 'Cannot add variants to a published post' });
    }

    const { social_account_id, platform, content, media_urls, title, description, first_comment, hashtags, link, platform_specific_fields, status } = req.body;

    if (!social_account_id) {
      return res.status(400).json({ error: 'social_account_id is required' });
    }

    const account = await db.getSocialAccountById(social_account_id);
    if (!account) {
      return res.status(404).json({ error: 'Social account not found' });
    }

    if (account.client_id !== post.client_id) {
      return res.status(400).json({ error: 'Social account belongs to a different client' });
    }

    const targetPlatform = account.platform || platform || post.platform;
    const variant = await db.createPostVariant({
      post_id: post.id,
      social_account_id: account.id,
      platform: targetPlatform,
      content: content !== undefined ? content : post.content,
      media_urls: media_urls !== undefined ? media_urls : post.media_urls,
      title: title || null,
      description: description || null,
      first_comment: first_comment || null,
      hashtags: hashtags || null,
      link: link || null,
      platform_specific_fields: platform_specific_fields || null,
      status: status || post.status || 'draft',
    });

    res.status(201).json(variant);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/posts/:id/variants/:variantId — Update a variant
router.patch('/:id/variants/:variantId', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    if (post.status === 'published') {
      return res.status(400).json({ error: 'Cannot modify variants of a published post' });
    }

    const variant = await db.getPostVariantById(req.params.variantId);
    if (!variant || variant.post_id !== post.id) {
      return res.status(404).json({ error: 'Variant not found for this post' });
    }

    const { content, media_urls, title, description, first_comment, hashtags, link, platform_specific_fields, status } = req.body;

    const updated = await db.updatePostVariant(variant.id, {
      content: content !== undefined ? content : variant.content,
      media_urls: media_urls !== undefined ? media_urls : variant.media_urls,
      title: title !== undefined ? title : variant.title,
      description: description !== undefined ? description : variant.description,
      first_comment: first_comment !== undefined ? first_comment : variant.first_comment,
      hashtags: hashtags !== undefined ? hashtags : variant.hashtags,
      link: link !== undefined ? link : variant.link,
      platform_specific_fields: platform_specific_fields !== undefined ? platform_specific_fields : variant.platform_specific_fields,
      status: status !== undefined ? status : variant.status,
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/posts/:id/variants/:variantId — Delete a variant
router.delete('/:id/variants/:variantId', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    if (post.status === 'published') {
      return res.status(400).json({ error: 'Cannot delete variants of a published post' });
    }

    const variant = await db.getPostVariantById(req.params.variantId);
    if (!variant || variant.post_id !== post.id) {
      return res.status(404).json({ error: 'Variant not found for this post' });
    }

    await db.deletePostVariant(variant.id);
    res.json({ success: true, message: 'Variant removed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/:id/submit-approval — Submit draft post for review
router.post('/:id/submit-approval', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    const shareToken = crypto.randomBytes(24).toString('hex');
    const approval = await db.createApproval({
      post_id: post.id,
      client_id: post.client_id,
      status: 'PENDING',
      share_token: shareToken,
    });

    const updated = await db.updatePost(post.id, { status: 'pending_approval' });

    // In-app notification
    await db.createNotification({
      client_id: post.client_id,
      type: 'APPROVAL_REQUESTED',
      title: 'Review Requested',
      message: `A new post requires review before publishing: "${post.content.slice(0, 35)}..."`,
      entity_id: post.id,
      entity_type: 'post',
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    res.json({
      post: updated,
      approval,
      shareable_review_url: `${appUrl}/review/${shareToken}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/:id/approve — Admin / Approver approval
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const role = resolveUserRole(req);
    const allowedRoles = ['owner', 'admin', 'approver'];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden: Admin or Approver role required to approve posts' });
    }

    const post = await db.getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    const users = await db.getUsers();
    const adminUser = users.find((u) => u.role.toLowerCase() === role) || users[0];

    const nextStatus: PostStatus = post.scheduled_at ? 'scheduled' : 'approved';
    const updated = await db.updatePost(post.id, {
      approved_by: adminUser.id,
      status: nextStatus,
    });

    // Update any pending approval records
    const approvals = await db.getApprovals(post.id);
    if (approvals.length > 0) {
      await db.updateApproval(approvals[0].id, {
        status: 'APPROVED',
        approver_id: adminUser.id,
        approver_name: adminUser.name || adminUser.email,
      });
    }

    await db.createNotification({
      client_id: post.client_id,
      type: 'POST_APPROVED',
      title: 'Post Approved',
      message: `Post approved by ${adminUser.name || 'Admin'} and ready for publishing.`,
      entity_id: post.id,
      entity_type: 'post',
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/:id/reject — Reject post back to draft with comments
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const role = resolveUserRole(req);
    const { comment } = req.body;

    const post = await db.getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const tenantErrR = await assertPostOwnedByOrg(post, req);
    if (tenantErrR) return res.status(tenantErrR.status).json(tenantErrR.body);

    const users = await db.getUsers();
    const reviewer = users.find((u) => u.role.toLowerCase() === role) || users[0];

    const updated = await db.updatePost(post.id, {
      status: 'draft',
      error_reason: comment ? `Rejected: ${comment}` : 'Rejected by reviewer',
    });

    const approvals = await db.getApprovals(post.id);
    if (approvals.length > 0) {
      await db.updateApproval(approvals[0].id, {
        status: 'REJECTED',
        approver_id: reviewer.id,
        approver_name: reviewer.name || reviewer.email,
        comment: comment || 'Changes requested',
      });
    }

    await db.createNotification({
      client_id: post.client_id,
      type: 'POST_REJECTED',
      title: 'Post Changes Requested',
      message: comment || 'Post was returned to draft by reviewer.',
      entity_id: post.id,
      entity_type: 'post',
    });

    res.json(updated);
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
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    if (post.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed posts can be retried' });
    }

    const updated = await db.updatePost(post.id, {
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 1000).toISOString(),
      error_reason: null,
      error_message: null,
      error_category: null,
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/:id/cancel — Cancel a scheduled post and its pending publish jobs (§22)
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    if (post.status === 'published') {
      return res.status(400).json({ error: 'Cannot cancel an already published post' });
    }
    if (post.status === 'cancelled') {
      return res.status(400).json({ error: 'Post is already cancelled' });
    }

    // Cancel all open publish jobs for this post
    const callerOrgId: string | undefined = (req as any).organizationId;
    const jobs = await db.getPublishJobs({ postId: post.id });
    const cancellationErrors: string[] = [];
    for (const job of jobs) {
      if (['SCHEDULED', 'QUEUED', 'RETRYING'].includes(job.status)) {
        try {
          await db.cancelPublishJob(job.id, callerOrgId);
        } catch (err: any) {
          cancellationErrors.push(`job ${job.id}: ${err.message}`);
        }
      }
    }

    const updated = await db.updatePost(post.id, { status: 'cancelled' });

    await db.createNotification({
      client_id: post.client_id,
      type: 'POST_CANCELLED',
      title: 'Post Cancelled',
      message: `Scheduled post was cancelled.`,
      entity_id: post.id,
      entity_type: 'post',
    });

    res.json({ success: true, post: updated, cancellation_errors: cancellationErrors });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/:id/reschedule — Drag-and-drop calendar rescheduling
router.post('/:id/reschedule', async (req: Request, res: Response) => {
  try {
    const { scheduled_at } = req.body;
    if (!scheduled_at) {
      return res.status(400).json({ error: 'scheduled_at is required' });
    }

    const post = await db.getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);

    if (post.status === 'published') {
      return res.status(400).json({ error: 'Cannot reschedule a published post' });
    }

    const newScheduledAt = new Date(scheduled_at).toISOString();
    const newStatus: PostStatus = post.status === 'failed' || post.status === 'cancelled' ? 'scheduled' : post.status;
    const updated = await db.updatePost(post.id, {
      scheduled_at: newScheduledAt,
      status: newStatus,
    });

    // Cancel old jobs and re-create at new time (§23)
    if (newStatus === 'scheduled') {
      try {
        const callerOrgId: string | undefined = (req as any).organizationId;
        const existingJobs = await db.getPublishJobs({ postId: post.id });
        for (const job of existingJobs) {
          if (['SCHEDULED', 'QUEUED', 'RETRYING'].includes(job.status)) {
            await db.cancelPublishJob(job.id, callerOrgId);
          }
        }
        const postVariants = await db.getPostVariants(post.id);
        let jobsPayload;
        if (postVariants.length > 0) {
          jobsPayload = postVariants.map((v) =>
            buildJobPayload(updated, v.id, v.social_account_id, v.platform, newScheduledAt)
          );
        } else {
          jobsPayload = [buildJobPayload(updated, null, updated.social_account_id, updated.platform, newScheduledAt)];
        }
        await db.createPublishJobsTransaction(jobsPayload);
      } catch (jobErr: any) {
        console.warn(`Reschedule /posts/${post.id}: job resync error:`, jobErr.message);
      }
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts/:id/pause & /api/posts/:id/resume — State Machine Controls
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);
    const updated = await db.updatePost(post.id, { status: 'paused' });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);
    const updated = await db.updatePost(post.id, { status: 'scheduled' });
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
    const tenantErr = await assertPostOwnedByOrg(post, req);
    if (tenantErr) return res.status(tenantErr.status).json(tenantErr.body);
    const metrics = await db.getPostMetrics(post.id);
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
