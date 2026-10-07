import { Post, PostVariant, SocialAccount, PostMetric, ErrorCategory } from '../types/index.js';

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  platform_post_id?: string;
  error?: string;
  errorCategory?: ErrorCategory;
  retryable?: boolean;
}

export interface RefreshResult {
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: string | null;
}

export interface MetricResult {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
}

export interface AccountDiscoveryResult {
  id: string;
  name: string;
  username?: string;
  category?: string;
  details?: string;
  instagram_business_account?: {
    id: string;
    username: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  message: string;
  /** What the UI should offer the user (e.g. 'reconnect_account', 'configure_credentials'). */
  action?: string;
}

export interface SocialPublisher {
  publish(post: Post | PostVariant, account: SocialAccount): Promise<PublishResult>;
  refreshToken(account: SocialAccount): Promise<RefreshResult>;
  fetchMetrics(post: Post, account: SocialAccount): Promise<MetricResult>;
  validatePost?(post: Partial<Post | PostVariant>, account?: SocialAccount): ValidationResult;
  classifyError?(error: any): ClassifiedError;
}

/**
 * Universal error classifier for platform APIs
 */
export function classifyPlatformError(err: any): ClassifiedError {
  const msg = (err?.message || String(err)).toLowerCase();

  // Configuration failures are matched first and by error class, so a missing
  // credential can never be mislabelled as a token or permission problem.
  if (err?.code === 'CREDENTIALS_NOT_CONFIGURED' || msg.includes('is not configured: missing environment')) {
    return {
      category: 'CREDENTIALS_NOT_CONFIGURED',
      retryable: false,
      action: 'configure_credentials',
      message: err?.message || 'Platform credentials are not configured on this server',
    };
  }

  if (err?.code === 'ACCOUNT_NEEDS_RECONNECT' || msg.includes('sandbox/demo token')) {
    return {
      category: 'ACCOUNT_NEEDS_RECONNECT',
      retryable: false,
      action: 'reconnect_account',
      message: err?.message || 'Account is connected with a sandbox token and must be reconnected',
    };
  }

  if (err?.code === 'PLATFORM_NOT_AVAILABLE' || msg.includes('is not available yet')) {
    return {
      category: 'PLATFORM_NOT_AVAILABLE',
      retryable: false,
      action: 'publish_manually',
      message: err?.message || 'Automatic publishing to this platform is not available in this build',
    };
  }

  if (
    msg.includes('token expired') ||
    msg.includes('expired token') ||
    msg.includes('token_expired') ||
    msg.includes('jwt expired')
  ) {
    return { category: 'TOKEN_EXPIRED', retryable: true, action: 'reconnect_account', message: err?.message || 'OAuth token expired' };
  }

  if (
    msg.includes('token revoked') ||
    msg.includes('revoked') ||
    msg.includes('invalid_grant') ||
    msg.includes('session invalidated')
  ) {
    return { category: 'TOKEN_REVOKED', retryable: false, action: 'reconnect_account', message: err?.message || 'OAuth token was revoked by user or provider' };
  }

  if (
    msg.includes('rate limit') ||
    msg.includes('rate-limit') ||
    msg.includes('too many requests') ||
    msg.includes('429') ||
    msg.includes('quota exceeded')
  ) {
    return { category: 'RATE_LIMIT', retryable: true, message: err?.message || 'Platform rate limit hit; backoff scheduled' };
  }

  if (
    msg.includes('media') ||
    msg.includes('aspect ratio') ||
    msg.includes('video duration') ||
    msg.includes('image format') ||
    msg.includes('file size')
  ) {
    return { category: 'INVALID_MEDIA', retryable: false, message: err?.message || 'Media rejected by platform requirements' };
  }

  if (
    msg.includes('character limit') ||
    msg.includes('caption') ||
    msg.includes('content policy') ||
    msg.includes('duplicate') ||
    msg.includes('too long')
  ) {
    return { category: 'INVALID_CAPTION', retryable: false, message: err?.message || 'Caption content or length rejected by platform' };
  }

  if (
    msg.includes('permission') ||
    msg.includes('access denied') ||
    msg.includes('unauthorized') ||
    msg.includes('403 forbidden') ||
    msg.includes('scope')
  ) {
    return { category: 'PERMISSION_DENIED', retryable: false, message: err?.message || 'Permission denied or insufficient scope' };
  }

  if (
    msg.includes('disconnected') ||
    msg.includes('account deleted') ||
    msg.includes('page not found')
  ) {
    return { category: 'ACCOUNT_DISCONNECTED', retryable: false, message: err?.message || 'Social account is disconnected' };
  }

  if (
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504')
  ) {
    return { category: 'NETWORK_ERROR', retryable: true, message: err?.message || 'Temporary network or provider gateway error' };
  }

  if (msg.includes('500') || msg.includes('internal error')) {
    return { category: 'PROVIDER_ERROR', retryable: true, message: err?.message || 'Provider internal error' };
  }

  return { category: 'UNKNOWN', retryable: false, message: err?.message || 'Unknown publishing failure' };
}
