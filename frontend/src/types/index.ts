export type UserRole = 'admin' | 'editor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export type PlatformType = 'linkedin' | 'google_business' | 'facebook' | 'instagram' | 'x';

export interface SocialAccount {
  id: string;
  platform: PlatformType;
  display_name: string;
  external_account_id: string;
  access_token: string; // Stored encrypted
  refresh_token?: string | null;
  token_expires_at?: string | null;
  connected_by?: string | null;
  connected_at: string;
}

export interface PostGroup {
  id: string;
  label?: string | null;
  created_by?: string | null;
  created_at: string;
}

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface Post {
  id: string;
  post_group_id?: string | null;
  social_account_id: string;
  platform: PlatformType;
  content: string;
  media_urls?: string[] | null;
  status: PostStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  platform_post_id?: string | null;
  error_reason?: string | null;
  approved_by?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface PostMetric {
  id: string;
  post_id: string;
  fetched_at: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
}

export interface PlatformMetricsSummary {
  platform: PlatformType;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_impressions: number;
}

export interface CreatePostPayload {
  label?: string;
  accounts: {
    social_account_id: string;
    content: string;
    media_urls?: string[];
  }[];
  scheduled_at?: string;
}
