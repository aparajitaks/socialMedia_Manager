import { PlatformType } from '../types/index.js';
import { SocialPublisher } from './types.js';
import { LinkedInPublisher } from './linkedin/publisher.js';
import { GooglePublisher } from './google/publisher.js';
import { MetaPublisher } from './meta/publisher.js';
import { XPublisher } from './x.js';
import { SandboxPublisher } from './sandbox.js';
import {
  PinterestPublisher,
  TikTokPublisher,
  YouTubePublisher,
  ThreadsPublisher,
  BlueskyPublisher,
} from './extended-adapters.js';

export * from './types.js';
export * from './google/oauth.js';
export * from './google/publisher.js';
export * from './google/metrics.js';
export * from './linkedin/oauth.js';
export * from './linkedin/publisher.js';
export * from './linkedin/metrics.js';
export * from './meta/oauth.js';
export * from './meta/publisher.js';
export * from './meta/metrics.js';
export * from './x.js';
export * from './extended-adapters.js';
export * from './credentials.js';
export * from './sandbox.js';

// Legacy alias for compatibility
export { GooglePublisher as GoogleBusinessPublisher };

// Core production publishers
const publishers: Record<string, SocialPublisher> = {
  linkedin: new LinkedInPublisher(),
  google_business: new GooglePublisher(),
  facebook: new MetaPublisher(),
  instagram: new MetaPublisher(),
  x: new XPublisher(),
};

// Snapshot of the real adapters so sandbox mode can be turned back off (used by
// tests and by any process that flips SANDBOX_MODE at runtime).
const realPublishers: Record<string, SocialPublisher> = { ...publishers };

// Extended publishers available on demand
export const extendedPublishers: Record<string, SocialPublisher> = {
  pinterest: new PinterestPublisher(),
  tiktok: new TikTokPublisher(),
  youtube: new YouTubePublisher(),
  threads: new ThreadsPublisher(),
  bluesky: new BlueskyPublisher(),
};

const realExtendedPublishers: Record<string, SocialPublisher> = { ...extendedPublishers };

/**
 * Replace a publisher. When SANDBOX_MODE=true this is how a whole deployment is
 * switched over to the SandboxPublisher (see server.ts), so no real adapter can
 * ever be reached in demo mode.
 */
export function registerPublisher(platform: string, publisher: SocialPublisher) {
  publishers[platform] = publisher;
}

export function enableSandboxPublishing(): void {
  for (const platform of Object.keys(publishers)) {
    publishers[platform] = new SandboxPublisher(platform);
  }
  for (const platform of Object.keys(extendedPublishers)) {
    extendedPublishers[platform] = new SandboxPublisher(platform);
  }
}

/** Put the real adapters back (undo enableSandboxPublishing). */
export function restoreRealPublishers(): void {
  for (const platform of Object.keys(realPublishers)) {
    publishers[platform] = realPublishers[platform];
  }
  for (const platform of Object.keys(realExtendedPublishers)) {
    extendedPublishers[platform] = realExtendedPublishers[platform];
  }
}

export function getPublisher(platform: PlatformType | string): SocialPublisher {
  const publisher = publishers[platform];
  if (!publisher) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return publisher;
}

export function getAllSupportedPlatforms(): string[] {
  return Object.keys(publishers);
}
