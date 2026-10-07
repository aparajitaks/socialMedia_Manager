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
import { isSandboxMode, sandboxDelay, PlatformNotAvailableError } from './credentials.js';

/**
 * The ONLY publisher allowed to invent a result. It is never registered unless
 * the operator explicitly starts the server with SANDBOX_MODE=true, so demo
 * flows (and the E2E suite) keep working while production can never report a
 * publish that did not happen.
 *
 * The legacy dev failure hooks ([TRIGGER_FAIL], invalid_token, bad_token) live
 * here rather than inside the real adapters, so real publishing never has to
 * wonder whether user content is a test directive.
 */
export class SandboxPublisher implements SocialPublisher {
  constructor(private platform: string = 'sandbox') {}

  private assertSandbox(): void {
    if (!isSandboxMode()) {
      throw new PlatformNotAvailableError(this.platform);
    }
  }

  validatePost(post: Partial<Post | PostVariant>): ValidationResult {
    const errors: string[] = [];
    const hasContent = !!(post.content && post.content.trim().length > 0);
    const hasMedia = !!(post.media_urls && post.media_urls.length > 0);
    if (!hasContent && !hasMedia) errors.push('A sandbox post needs either text or media');
    return { valid: errors.length === 0, errors };
  }

  async publish(post: Post | PostVariant, account: SocialAccount): Promise<PublishResult> {
    this.assertSandbox();

    const rawToken = decryptToken(account.access_token || account.access_token_encrypted || '');
    if (rawToken === 'invalid_token' || rawToken.startsWith('bad_token')) {
      throw new Error(`${this.platform} API 401: Invalid OAuth access token`);
    }
    if (post.content && post.content.includes('[TRIGGER_FAIL]')) {
      throw new Error(`${this.platform} API Error: simulated platform rejection`);
    }

    await sandboxDelay(150);
    const generatedId = `sandbox_${this.platform}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    console.warn(`⚠️ SANDBOX_MODE: fabricated ${this.platform} post id ${generatedId} — nothing was published`);
    return { success: true, externalPostId: generatedId, platform_post_id: generatedId };
  }

  async refreshToken(account: SocialAccount): Promise<RefreshResult> {
    this.assertSandbox();
    return {
      access_token: encryptToken(`mock_${this.platform}_${Date.now()}`),
      refresh_token: account.refresh_token || account.refresh_token_encrypted || null,
      token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async fetchMetrics(post: Post, account: SocialAccount): Promise<MetricResult> {
    this.assertSandbox();
    const impressions = Math.floor(200 + Math.random() * 300);
    const likes = Math.floor(impressions * 0.04);
    return { likes, comments: Math.floor(likes * 0.2), shares: Math.floor(likes * 0.1), impressions };
  }

  classifyError(err: any): ClassifiedError {
    return classifyPlatformError(err);
  }
}
