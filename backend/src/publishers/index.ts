import { PlatformType } from '../types/index.js';
import { SocialPublisher } from './types.js';
import { LinkedInPublisher } from './linkedin.js';
import { GoogleBusinessPublisher } from './google-business.js';
import { MetaPublisher } from './meta.js';
import { XPublisher } from './x.js';

export * from './types.js';
export * from './linkedin.js';
export * from './google-business.js';
export * from './meta.js';
export * from './x.js';

const publishers: Record<PlatformType, SocialPublisher> = {
  linkedin: new LinkedInPublisher(),
  google_business: new GoogleBusinessPublisher(),
  facebook: new MetaPublisher(),
  instagram: new MetaPublisher(),
  x: new XPublisher()
};

export function getPublisher(platform: PlatformType): SocialPublisher {
  const publisher = publishers[platform];
  if (!publisher) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return publisher;
}
