/**
 * Checklist §2, §4 — Publishers factory and platform mappings
 */
import { describe, it, expect } from 'vitest';
import { getPublisher } from '../publishers/index.js';
import { PlatformType } from '../types/index.js';

describe('Publishers factory', () => {
  const supportedPlatforms: PlatformType[] = ['linkedin', 'google_business', 'facebook', 'instagram', 'x'];

  supportedPlatforms.forEach((platform) => {
    it(`returns a publisher instance for ${platform}`, () => {
      const pub = getPublisher(platform);
      expect(pub).toBeDefined();
      expect(typeof pub.publish).toBe('function');
      expect(typeof pub.refreshToken).toBe('function');
      expect(typeof pub.fetchMetrics).toBe('function');
    });
  });

  it('throws an error for unsupported platforms', () => {
    expect(() => getPublisher('tiktok' as any)).toThrowError(/Unsupported platform/);
  });
});
