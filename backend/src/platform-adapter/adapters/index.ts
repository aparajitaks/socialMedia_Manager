/**
 * Platform Adapters Index
 * 
 * Exports all platform adapters and initializes the registry.
 */

import { MetaAdapter } from './meta.js';
import { LinkedInAdapter } from './linkedin.js';
import { XAdapter } from './x.js';
import { GoogleBusinessAdapter } from './google-business.js';
import { registerPlatform, initializePlatformRegistry, PlatformImplementationStatus } from '../registry.js';
import { PlatformCapabilities } from '../index.js';

// Base capabilities for platforms with REAL implementation
const META_CAPABILITIES: PlatformCapabilities = {
  publishText: true,
  publishImage: true,
  publishVideo: true,
  publishCarousel: true,
  publishStory: true,
  publishReel: true,
  publishShort: false,
  publishDocument: false,
  publishLink: true,
  firstComment: true,
  hashtags: true,
  mentions: true,
  analytics: true,
  comments: true,
  inbox: true,
  directMessages: false,
  webhooks: true,
};

const LINKEDIN_CAPABILITIES: PlatformCapabilities = {
  publishText: true,
  publishImage: true,
  publishVideo: true,
  publishCarousel: false,
  publishStory: false,
  publishReel: false,
  publishShort: false,
  publishDocument: true,
  publishLink: true,
  firstComment: false,
  hashtags: true,
  mentions: true,
  analytics: true,
  comments: true,
  inbox: false,
  directMessages: false,
  webhooks: true,
};

const X_CAPABILITIES: PlatformCapabilities = {
  publishText: true,
  publishImage: true,
  publishVideo: true,
  publishCarousel: false,
  publishStory: false,
  publishReel: false,
  publishShort: false,
  publishDocument: false,
  publishLink: true,
  firstComment: false,
  hashtags: true,
  mentions: true,
  analytics: false,
  comments: false,
  inbox: false,
  directMessages: false,
  webhooks: true,
};

const GOOGLE_BUSINESS_CAPABILITIES: PlatformCapabilities = {
  publishText: true,
  publishImage: true,
  publishVideo: false,
  publishCarousel: false,
  publishStory: false,
  publishReel: false,
  publishShort: false,
  publishDocument: false,
  publishLink: true,
  firstComment: false,
  hashtags: false,
  mentions: false,
  analytics: true,
  comments: true,
  inbox: false,
  directMessages: false,
  webhooks: true,
};

/**
 * Initialize and register all platform adapters
 */
export function initializeAdapters(): void {
  initializePlatformRegistry();

  // Register Meta adapter (REAL - requires valid META_APP_ID and META_APP_SECRET)
  const metaCredentials = !!(process.env.META_CLIENT_ID || process.env.META_APP_ID) && 
                         !!(process.env.META_CLIENT_SECRET || process.env.META_APP_SECRET);
  const metaStatus: PlatformImplementationStatus = metaCredentials ? 'REAL' : 'PARTIAL';
  
  registerPlatform({
    platform: 'meta',
    status: metaStatus,
    adapter: new MetaAdapter(),
    capabilities: META_CAPABILITIES,
    notes: metaStatus === 'PARTIAL' ? 'Requires META_CLIENT_ID and META_APP_SECRET' : undefined,
  });

  // Register Facebook separately (shares Meta adapter)
  registerPlatform({
    platform: 'facebook',
    status: metaStatus,
    adapter: new MetaAdapter(),
    capabilities: META_CAPABILITIES,
    notes: metaStatus === 'PARTIAL' ? 'Requires META_CLIENT_ID and META_APP_SECRET' : undefined,
  });

  // Register Instagram separately (shares Meta adapter)
  registerPlatform({
    platform: 'instagram',
    status: metaStatus,
    adapter: new MetaAdapter(),
    capabilities: META_CAPABILITIES,
    notes: metaStatus === 'PARTIAL' ? 'Requires META_CLIENT_ID and META_APP_SECRET' : undefined,
  });

  // Register LinkedIn adapter (REAL - requires LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET)
  const linkedinCredentials = !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  const linkedinStatus: PlatformImplementationStatus = linkedinCredentials ? 'REAL' : 'PARTIAL';
  
  registerPlatform({
    platform: 'linkedin',
    status: linkedinStatus,
    adapter: new LinkedInAdapter(),
    capabilities: LINKEDIN_CAPABILITIES,
    notes: linkedinStatus === 'PARTIAL' ? 'Requires LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET' : undefined,
  });

  // Register X adapter (REAL - requires X_CLIENT_ID and X_CLIENT_SECRET)
  const xCredentials = !!(process.env.X_CLIENT_ID || process.env.X_API_KEY) && 
                      !!(process.env.X_CLIENT_SECRET || process.env.X_API_SECRET);
  const xStatus: PlatformImplementationStatus = xCredentials ? 'REAL' : 'PARTIAL';
  
  registerPlatform({
    platform: 'x',
    status: xStatus,
    adapter: new XAdapter(),
    capabilities: X_CAPABILITIES,
    notes: xStatus === 'PARTIAL' ? 'Requires X_CLIENT_ID and X_CLIENT_SECRET' : undefined,
  });

  // Register Google Business adapter (REAL - requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
  const googleCredentials = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const googleStatus: PlatformImplementationStatus = googleCredentials ? 'REAL' : 'PARTIAL';
  
  registerPlatform({
    platform: 'google_business',
    status: googleStatus,
    adapter: new GoogleBusinessAdapter(),
    capabilities: GOOGLE_BUSINESS_CAPABILITIES,
    notes: googleStatus === 'PARTIAL' ? 'Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' : undefined,
  });
}

export { MetaAdapter, LinkedInAdapter, XAdapter, GoogleBusinessAdapter };
