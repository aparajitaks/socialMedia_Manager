import { Post, PostVariant, SocialAccount } from '../types/index.js';
import { decryptToken, encryptToken } from '../crypto.js';
import {
  SocialPublisher,
  PublishResult,
  RefreshResult,
  MetricResult,
  ValidationResult,
  ClassifiedError,
  classifyPlatformError,
} from './types.js';
import {
  hasLiveCredentials,
  requireRealAccessToken,
  requireRealMetrics,
  requireSandboxMode,
  sandboxDelay,
  sandboxPublishId,
} from './credentials.js';

const PINTEREST_CREDENTIALS = ['PINTEREST_APP_ID', 'PINTEREST_SECRET'];

/**
 * Extended platforms: Pinterest, TikTok, YouTube, Threads, Bluesky.
 *
 * Before this change every one of these adapters answered with a fabricated
 * post id, a `mock_…` refresh token and hardcoded engagement numbers, so a demo
 * looked exactly like a working integration. Only Pinterest has a real API call
 * here; the other four never had one.
 *
 * The honest baseline: refuse to publish, refresh or report metrics unless the
 * operator explicitly opted into sandbox mode (SANDBOX_MODE=true), where
 * inventing a result is the documented behaviour. Each platform keeps its real
 * validatePost() limits, and validation still runs before the sandbox gate, so
 * a 400-character Bluesky post is rejected with the same message in every mode.
 */
abstract class SandboxOnlyPublisher implements SocialPublisher {
  abstract readonly platform: string;
  abstract validatePost(post: Partial<Post | PostVariant>): ValidationResult;

  /** Legacy dev failure hooks — meaningful only in sandbox mode. */
  protected failureHooks(
    rawToken: string,
    post: Post | PostVariant,
    authMessage: string,
    failMessage: string
  ): void {
    if (rawToken === 'invalid_token' || rawToken.startsWith('bad_token')) {
      throw new Error(authMessage);
    }
    if (post.content && post.content.includes('[TRIGGER_FAIL]')) {
      throw new Error(failMessage);
    }
  }

  protected rawTokenFor(account: SocialAccount): string {
    return decryptToken(account.access_token || account.access_token_encrypted || '');
  }

  async publish(post: Post | PostVariant, account: SocialAccount): Promise<PublishResult> {
    const val = this.validatePost(post);
    if (!val.valid) {
      throw new Error(`${this.platform} validation failed: ${val.errors.join(', ')}`);
    }

    requireSandboxMode(this.platform);

    this.failureHooks(
      this.rawTokenFor(account),
      post,
      `${this.platform} API 401: Invalid OAuth access token`,
      `${this.platform} API Error: simulated platform rejection`
    );

    await sandboxDelay(150);
    const id = sandboxPublishId(this.platform);
    console.warn(`⚠️ SANDBOX_MODE: fabricated ${this.platform} post id ${id} — nothing was published`);
    return { success: true, externalPostId: id, platform_post_id: id };
  }

  async refreshToken(account: SocialAccount): Promise<RefreshResult> {
    requireSandboxMode(this.platform);
    return {
      access_token: encryptToken(`mock_${this.platform.toLowerCase()}_${Date.now()}`),
      refresh_token: account.refresh_token || account.refresh_token_encrypted || null,
      token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async fetchMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
    requireRealMetrics(this.platform);
    const impressions = Math.floor(200 + Math.random() * 400);
    const likes = Math.floor(impressions * 0.04);
    const metrics = { likes, comments: Math.floor(likes * 0.2), shares: Math.floor(likes * 0.1), impressions };
    console.warn(`⚠️ SANDBOX_MODE: invented ${this.platform} engagement for post ${post?.id} — these are not real metrics`);
    return metrics;
  }

  classifyError(err: any): ClassifiedError {
    return classifyPlatformError(err);
  }
}

// ---------------------------------------------------------------------------
// Pinterest Adapter — the only extended platform with a real API call
// ---------------------------------------------------------------------------
export class PinterestPublisher extends SandboxOnlyPublisher {
  readonly platform = 'Pinterest';

  validatePost(post: Partial<Post | PostVariant>): ValidationResult {
    const errors: string[] = [];
    if (!post.content && !post.title) errors.push('Pinterest requires a pin title or description');
    if (post.title && post.title.length > 100) errors.push('Pinterest title cannot exceed 100 characters');
    if (post.content && post.content.length > 500) errors.push('Pinterest description cannot exceed 500 characters');
    if (!post.media_urls || post.media_urls.length === 0) errors.push('Pinterest requires at least one image');
    return { valid: errors.length === 0, errors };
  }

  async publish(post: Post | PostVariant, account: SocialAccount): Promise<PublishResult> {
    const val = this.validatePost(post);
    if (!val.valid) {
      throw new Error(`Pinterest validation failed: ${val.errors.join(', ')}`);
    }

    if (!hasLiveCredentials(PINTEREST_CREDENTIALS)) {
      // No Pinterest app configured in this deployment: only sandbox mode may
      // invent a pin id, everything else is refused.
      return super.publish(post, account);
    }

    const rawToken = requireRealAccessToken('Pinterest', this.rawTokenFor(account));

    try {
      const res = await fetch('https://api.pinterest.com/v5/pins', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rawToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: post.title || post.content?.slice(0, 100),
          description: post.content,
          board_id: account.external_account_id,
          media_source: {
            source_type: 'image_url',
            url: post.media_urls![0],
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Pinterest API (${res.status}): ${await res.text()}`);
      }

      const data = await res.json();
      if (!data.id) {
        throw new Error(`Pinterest API returned no pin id: ${JSON.stringify(data)}`);
      }
      return { success: true, externalPostId: data.id, platform_post_id: data.id };
    } catch (err: any) {
      throw new Error(err.message || 'Pinterest publish failed');
    }
  }
}

// ---------------------------------------------------------------------------
// TikTok Adapter — no live upload integration in this build
// ---------------------------------------------------------------------------
export class TikTokPublisher extends SandboxOnlyPublisher {
  readonly platform = 'TikTok';

  validatePost(post: Partial<Post | PostVariant>): ValidationResult {
    const errors: string[] = [];
    if (!post.media_urls || post.media_urls.length === 0) {
      errors.push('TikTok requires a video file');
    }
    if (post.content && post.content.length > 2200) {
      errors.push('TikTok caption cannot exceed 2200 characters');
    }
    return { valid: errors.length === 0, errors };
  }
}


// ---------------------------------------------------------------------------
// YouTube Adapter — no live upload integration in this build
// ---------------------------------------------------------------------------
export class YouTubePublisher extends SandboxOnlyPublisher {
  readonly platform = 'YouTube';

  validatePost(post: Partial<Post | PostVariant>): ValidationResult {
    const errors: string[] = [];
    if (!post.title && !post.content) errors.push('YouTube requires a video title');
    if (post.title && post.title.length > 100) errors.push('YouTube title cannot exceed 100 characters');
    if (post.content && post.content.length > 5000) errors.push('YouTube description cannot exceed 5000 characters');
    if (!post.media_urls || post.media_urls.length === 0) errors.push('YouTube requires a video upload');
    return { valid: errors.length === 0, errors };
  }
}

// ---------------------------------------------------------------------------
// Threads Adapter — no live API integration in this build
// ---------------------------------------------------------------------------
export class ThreadsPublisher extends SandboxOnlyPublisher {
  readonly platform = 'Threads';

  validatePost(post: Partial<Post | PostVariant>): ValidationResult {
    const errors: string[] = [];
    if (!post.content || post.content.trim().length === 0) errors.push('Threads requires post text');
    if (post.content && post.content.length > 500) errors.push('Threads character limit is 500');
    return { valid: errors.length === 0, errors };
  }
}

// ---------------------------------------------------------------------------
// Bluesky Adapter — no live atproto integration in this build
// ---------------------------------------------------------------------------
export class BlueskyPublisher extends SandboxOnlyPublisher {
  readonly platform = 'Bluesky';

  validatePost(post: Partial<Post | PostVariant>): ValidationResult {
    const errors: string[] = [];
    if (!post.content || post.content.trim().length === 0) errors.push('Bluesky requires post text');
    if (post.content && post.content.length > 300) errors.push('Bluesky post limit is 300 characters');
    return { valid: errors.length === 0, errors };
  }
}

