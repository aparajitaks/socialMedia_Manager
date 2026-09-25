import { Post, SocialAccount } from '../types/index.js';

export interface PublishResult {
  platform_post_id: string;
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

export interface SocialPublisher {
  publish(post: Post, account: SocialAccount): Promise<PublishResult>;
  refreshToken(account: SocialAccount): Promise<RefreshResult>;
  fetchMetrics(post: Post, account: SocialAccount): Promise<MetricResult>;
}
