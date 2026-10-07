/**
 * Platform Capability Validator
 *
 * Authoritative backend validation engine for social post content, media,
 * character limits, and platform-specific capabilities.
 */

import { PlatformType } from '../types/index.js';
import { getPlatformCapabilities, getPlatformInfo } from './registry.js';

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  platform?: PlatformType;
  variantId?: string;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  platform?: PlatformType;
  variantId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface VariantValidationInput {
  id?: string;
  platform: PlatformType;
  content: string;
  media_urls?: string[] | null;
  link?: string | null;
  first_comment?: string | null;
  title?: string | null;
  hashtags?: string[] | string | null;
  mentions?: string[] | string | null;
}

export const PLATFORM_CHAR_LIMITS: Record<PlatformType, number> = {
  x: 280,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
  google_business: 1500,
  meta: 63206,
  tiktok: 2200,
  youtube: 5000,
  pinterest: 500,
  threads: 500,
  bluesky: 300,
};

export const PLATFORM_WARN_THRESHOLDS: Record<PlatformType, number> = {
  x: 260,
  linkedin: 2800,
  facebook: 60000,
  instagram: 2000,
  google_business: 1350,
  meta: 60000,
  tiktok: 2000,
  youtube: 4800,
  pinterest: 450,
  threads: 450,
  bluesky: 270,
};

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|avi|m4v)(\?.*)?$/i.test(url);
}

function isDocumentUrl(url: string): boolean {
  return /\.(pdf|doc|docx|ppt|pptx)(\?.*)?$/i.test(url);
}

/**
 * Validates a single post variant against platform rules and capabilities.
 */
export function validateVariant(variant: VariantValidationInput): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const platform = variant.platform;
  const content = (variant.content || '').trim();
  const mediaUrls = variant.media_urls || [];
  const variantId = variant.id;

  const capabilities = getPlatformCapabilities(platform);
  const platformInfo = getPlatformInfo(platform);

  // 1. Unsupported platform check
  if (platformInfo && platformInfo.status === 'UNSUPPORTED') {
    errors.push({
      variantId,
      platform,
      field: 'platform',
      code: 'PLATFORM_NOT_SUPPORTED',
      message: `Publishing to ${platform.toUpperCase()} is not yet supported.`,
    });
    return { valid: false, errors, warnings };
  }

  // 2. Content & Media empty check
  if (!content && mediaUrls.length === 0) {
    errors.push({
      variantId,
      platform,
      field: 'content',
      code: 'CONTENT_EMPTY',
      message: 'Post must contain either text or media.',
    });
  }

  // 3. Platform character limits
  const maxChars = PLATFORM_CHAR_LIMITS[platform] ?? 3000;
  const warnChars = PLATFORM_WARN_THRESHOLDS[platform] ?? (maxChars - 100);

  if (content.length > maxChars) {
    errors.push({
      variantId,
      platform,
      field: 'content',
      code: 'CONTENT_TOO_LONG',
      message: `Content length (${content.length}) exceeds ${platform.toUpperCase()} limit of ${maxChars} characters.`,
    });
  } else if (content.length >= warnChars && content.length > 0) {
    warnings.push({
      variantId,
      platform,
      field: 'content',
      code: 'CONTENT_NEAR_LIMIT',
      message: `Content is near the ${maxChars} character limit (${content.length}/${maxChars}).`,
    });
  }

  // 4. Media inspection & platform rules
  const videoCount = mediaUrls.filter(isVideoUrl).length;
  const docCount = mediaUrls.filter(isDocumentUrl).length;
  const imageCount = mediaUrls.length - videoCount - docCount;

  // Instagram rules
  if (platform === 'instagram') {
    if (mediaUrls.length === 0) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'MEDIA_REQUIRED',
        message: 'Instagram requires at least one image or video. Text-only posts are not supported.',
      });
    }

    if (mediaUrls.length > 10) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'TOO_MANY_MEDIA_ITEMS',
        message: 'Instagram allows a maximum of 10 media items in a carousel post.',
      });
    }

    if (docCount > 0) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'DOCUMENT_NOT_SUPPORTED',
        message: 'Instagram does not support document uploads.',
      });
    }

    // Check for clickable URLs in caption
    if (/(https?:\/\/[^\s]+)/gi.test(content)) {
      warnings.push({
        variantId,
        platform,
        field: 'content',
        code: 'LINK_NOT_CLICKABLE',
        message: 'Links in Instagram captions are not clickable for followers.',
      });
    }
  }

  // X (Twitter) rules
  if (platform === 'x') {
    if (videoCount > 0 && imageCount > 0) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'MEDIA_MIXED_NOT_SUPPORTED',
        message: 'X does not allow mixing images and videos in the same post.',
      });
    }

    if (videoCount > 1) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'TOO_MANY_VIDEOS',
        message: 'X allows at most 1 video per tweet.',
      });
    }

    if (imageCount > 4) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'TOO_MANY_IMAGES',
        message: 'X allows at most 4 images per tweet.',
      });
    }

    if (docCount > 0) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'DOCUMENT_NOT_SUPPORTED',
        message: 'X does not support document attachments in tweets.',
      });
    }

    if (variant.first_comment) {
      warnings.push({
        variantId,
        platform,
        field: 'first_comment',
        code: 'FIRST_COMMENT_NOT_SUPPORTED',
        message: 'First comment is not supported natively on X.',
      });
    }
  }

  // Google Business rules
  if (platform === 'google_business') {
    if (videoCount > 0) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'VIDEO_NOT_SUPPORTED',
        message: 'Google Business Profile updates do not support video.',
      });
    }

    if (docCount > 0) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'DOCUMENT_NOT_SUPPORTED',
        message: 'Google Business Profile does not support document attachments.',
      });
    }

    if (mediaUrls.length > 10) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'TOO_MANY_IMAGES',
        message: 'Google Business Profile allows a maximum of 10 photos per post.',
      });
    }

    if (/#\w+/g.test(content)) {
      warnings.push({
        variantId,
        platform,
        field: 'content',
        code: 'HASHTAGS_NOT_INDEXED',
        message: 'Hashtags are not indexed on Google Business Profile.',
      });
    }

    if (variant.first_comment) {
      warnings.push({
        variantId,
        platform,
        field: 'first_comment',
        code: 'FIRST_COMMENT_NOT_SUPPORTED',
        message: 'First comment is not supported on Google Business Profile.',
      });
    }
  }

  // LinkedIn rules
  if (platform === 'linkedin') {
    if (videoCount > 1) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'TOO_MANY_VIDEOS',
        message: 'LinkedIn allows at most 1 video per post.',
      });
    }

    if (videoCount > 0 && (imageCount > 0 || docCount > 0)) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'MEDIA_MIXED_NOT_SUPPORTED',
        message: 'LinkedIn does not allow combining video with images or documents.',
      });
    }

    if (imageCount > 9) {
      errors.push({
        variantId,
        platform,
        field: 'media',
        code: 'TOO_MANY_IMAGES',
        message: 'LinkedIn allows a maximum of 9 images per post.',
      });
    }

    if (variant.first_comment) {
      warnings.push({
        variantId,
        platform,
        field: 'first_comment',
        code: 'FIRST_COMMENT_LIMITED',
        message: 'First comment requires additional permissions on LinkedIn.',
      });
    }
  }

  // Capability checks against platform adapter registry
  if (videoCount > 0 && !capabilities.publishVideo) {
    errors.push({
      variantId,
      platform,
      field: 'media',
      code: 'VIDEO_NOT_SUPPORTED',
      message: `${platform.toUpperCase()} does not support video publishing.`,
    });
  }

  if (imageCount > 1 && !capabilities.publishCarousel && platform !== 'facebook' && platform !== 'x' && platform !== 'linkedin' && platform !== 'google_business') {
    warnings.push({
      variantId,
      platform,
      field: 'media',
      code: 'CAROUSEL_NOT_SUPPORTED',
      message: `${platform.toUpperCase()} may not display multiple images as a carousel.`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a list of variants together.
 */
export function validateVariants(variants: VariantValidationInput[]): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationWarning[] = [];

  for (const v of variants) {
    const res = validateVariant(v);
    allErrors.push(...res.errors);
    allWarnings.push(...res.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
