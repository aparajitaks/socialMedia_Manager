/**
 * Platform Registry
 * 
 * Centralized registry for platform adapters.
 * This is the single source of truth for which platforms are supported
 * and their implementation status.
 */

import { PlatformType, PlatformCapabilities, PlatformAdapter } from './index.js';

// Platform implementation status
export type PlatformImplementationStatus = 'REAL' | 'PARTIAL' | 'MOCK' | 'UNSUPPORTED';

export interface PlatformInfo {
  platform: PlatformType;
  status: PlatformImplementationStatus;
  adapter?: PlatformAdapter;
  capabilities: PlatformCapabilities;
  notes?: string;
}

/**
 * Base capabilities for unsupported platforms
 */
const UNSUPPORTED_CAPABILITIES: PlatformCapabilities = {
  publishText: false,
  publishImage: false,
  publishVideo: false,
  publishCarousel: false,
  publishStory: false,
  publishReel: false,
  publishShort: false,
  publishDocument: false,
  publishLink: false,
  firstComment: false,
  hashtags: false,
  mentions: false,
  analytics: false,
  comments: false,
  inbox: false,
  directMessages: false,
  webhooks: false,
};

/**
 * Platform registry
 * This will be populated as adapters are implemented
 */
const platformRegistry: Map<PlatformType, PlatformInfo> = new Map();

/**
 * Register a platform adapter
 */
export function registerPlatform(info: PlatformInfo): void {
  platformRegistry.set(info.platform, info);
}

/**
 * Get platform adapter by platform type
 */
export function getPlatformAdapter(platform: PlatformType): PlatformAdapter | null {
  const info = platformRegistry.get(platform);
  return info?.adapter || null;
}

/**
 * Get platform information
 */
export function getPlatformInfo(platform: PlatformType): PlatformInfo | null {
  return platformRegistry.get(platform) || null;
}

/**
 * Get platform capabilities
 */
export function getPlatformCapabilities(platform: PlatformType, account?: any): PlatformCapabilities {
  const info = platformRegistry.get(platform);
  if (!info) {
    return UNSUPPORTED_CAPABILITIES;
  }
  
  // If adapter is available and has dynamic capabilities based on account
  if (info.adapter && account) {
    return info.adapter.getCapabilities(account);
  }
  
  return info.capabilities;
}

/**
 * Get all registered platforms
 */
export function getAllPlatforms(): PlatformInfo[] {
  return Array.from(platformRegistry.values());
}

/**
 * Get platforms by implementation status
 */
export function getPlatformsByStatus(status: PlatformImplementationStatus): PlatformInfo[] {
  return Array.from(platformRegistry.values()).filter(p => p.status === status);
}

/**
 * Check if a platform is supported
 */
export function isPlatformSupported(platform: PlatformType): boolean {
  const info = platformRegistry.get(platform);
  return info !== undefined && info.status !== 'UNSUPPORTED';
}

/**
 * Check if a platform has real OAuth implementation
 */
export function isPlatformReal(platform: PlatformType): boolean {
  const info = platformRegistry.get(platform);
  return info?.status === 'REAL';
}

/**
 * Initialize the platform registry with known platforms
 * Adapters will be registered as they are implemented
 */
export function initializePlatformRegistry(): void {
  // Meta (Facebook + Instagram) - will be registered separately
  // LinkedIn - will be registered separately
  // X - will be registered separately
  // Google Business - will be registered separately
  
  // Future platforms (UNSUPPORTED for now)
  const futurePlatforms: PlatformType[] = ['pinterest', 'tiktok', 'youtube', 'threads', 'bluesky'];
  
  for (const platform of futurePlatforms) {
    registerPlatform({
      platform,
      status: 'UNSUPPORTED',
      capabilities: UNSUPPORTED_CAPABILITIES,
      notes: 'Not yet implemented',
    });
  }
}
