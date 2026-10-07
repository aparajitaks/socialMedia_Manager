/**
 * Platform Adapter Interface
 * 
 * This module defines the contract for social platform adapters.
 * Each platform must implement this interface to handle OAuth, account discovery,
 * token lifecycle, and capability reporting.
 */

import type { SocialAccount, PlatformType } from '../types/index.js';

// Re-export from registry for convenience
export { 
  getPlatformAdapter, 
  getPlatformCapabilities, 
  getPlatformInfo, 
  isPlatformSupported,
  isPlatformReal,
  getAllPlatforms,
  getPlatformsByStatus,
  type PlatformImplementationStatus,
} from './registry.js';

// Re-export PlatformType for convenience
export type { PlatformType } from '../types/index.js';

// Re-export validator
export {
  validateVariant,
  validateVariants,
  PLATFORM_CHAR_LIMITS,
  PLATFORM_WARN_THRESHOLDS,
  type ValidationError,
  type ValidationWarning,
  type ValidationResult,
  type VariantValidationInput,
} from './validator.js';

export interface PlatformCapabilities {
  // Publishing capabilities
  publishText: boolean;
  publishImage: boolean;
  publishVideo: boolean;
  publishCarousel: boolean;
  publishStory: boolean;
  publishReel: boolean;
  publishShort: boolean;
  publishDocument: boolean;
  publishLink: boolean;
  
  // Engagement capabilities
  firstComment: boolean;
  hashtags: boolean;
  mentions: boolean;
  
  // Data and interaction capabilities
  analytics: boolean;
  comments: boolean;
  inbox: boolean;
  directMessages: boolean;
  webhooks: boolean;
}

export interface OAuthAuthorizationResult {
  authorizationUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number;
  accounts: DiscoveredAccount[];
}

export interface DiscoveredAccount {
  platformAccountId: string;
  displayName: string;
  username?: string;
  profileImageUrl?: string;
  accountType?: 'PERSONAL' | 'ORGANIZATION_PAGE' | 'BUSINESS' | 'CREATOR';
  metadata?: Record<string, any>;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number;
}

export interface ConnectionVerificationResult {
  status: 'CONNECTED' | 'TOKEN_EXPIRED' | 'DISCONNECTED' | 'REAUTH_REQUIRED' | 'ERROR';
  displayName?: string;
  username?: string;
  profileImageUrl?: string;
  error?: string;
}

export interface PlatformAdapter {
  /**
   * Get the platform identifier
   */
  getPlatform(): PlatformType;

  /**
   * Get the platform's capabilities
   */
  getCapabilities(account?: SocialAccount): PlatformCapabilities;

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string, options?: Record<string, any>): Promise<OAuthAuthorizationResult>;

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  handleOAuthCallback(code: string, state: string, options?: Record<string, any>): Promise<OAuthCallbackResult>;

  /**
   * Refresh an expired access token
   */
  refreshToken(refreshToken: string): Promise<TokenRefreshResult>;

  /**
   * Verify that a connection is still valid
   */
  validateConnection(accessToken: string, platformAccountId: string): Promise<ConnectionVerificationResult>;

  /**
   * Disconnect/revoke token (if supported by platform)
   */
  disconnect(accessToken: string, platformAccountId: string): Promise<void>;

  /**
   * Get account profile information
   */
  getAccountProfile(accessToken: string, platformAccountId: string): Promise<DiscoveredAccount>;
}

/**
 * Platform-specific error types
 */
export class OAuthError extends Error {
  constructor(message: string, public platform: PlatformType) {
    super(message);
    this.name = 'OAuthError';
  }
}

export class TokenExpiredError extends Error {
  constructor(message: string, public platform: PlatformType) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class AccountNotFoundError extends Error {
  constructor(message: string, public platform: PlatformType) {
    super(message);
    this.name = 'AccountNotFoundError';
  }
}

export class PermissionDeniedError extends Error {
  constructor(message: string, public platform: PlatformType) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string, public platform: PlatformType, public retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class UnsupportedCapabilityError extends Error {
  constructor(message: string, public platform: PlatformType, public capability: string) {
    super(message);
    this.name = 'UnsupportedCapabilityError';
  }
}

export class PlatformAPIError extends Error {
  constructor(
    message: string,
    public platform: PlatformType,
    public statusCode?: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'PlatformAPIError';
  }
}
