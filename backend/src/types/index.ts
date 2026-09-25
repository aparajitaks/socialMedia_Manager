export type PlatformType = 'google_business' | 'linkedin' | 'facebook' | 'instagram' | 'x';
export type UserRole = 'owner' | 'admin' | 'member';
export type PostStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'draft';
export type SocialAccountStatus = 'connected' | 'expired' | 'revoked';

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface User {
  id: string;
  organization_id: string;
  email: string;
  role: UserRole;
  name?: string;
  created_at: string;
}

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
}

export interface SocialAccount {
  id: string;
  client_id: string;
  platform: PlatformType;
  external_account_id: string;
  external_account_name?: string | null;
  external_username?: string | null;
  display_name?: string; // UI friendly alias
  access_token_encrypted: string;
  refresh_token_encrypted?: string | null;
  token_expires_at?: string | null;
  scopes?: string[] | null;
  status: SocialAccountStatus;
  connected_by?: string | null;
  created_at: string;
  updated_at: string;

  // Runtime-decrypted convenience fields (never stored, never sent to browser)
  access_token?: string;
  refresh_token?: string | null;
}

export interface OAuthState {
  id: string;
  state: string;
  user_id: string;
  client_id: string;
  platform: PlatformType;
  expires_at: string;
  created_at: string;
}

export interface Post {
  id: string;
  client_id: string;
  social_account_id: string;
  platform: PlatformType;
  content: string;
  media_urls?: string[] | null;
  scheduled_at?: string | null;
  status: PostStatus;
  external_post_id?: string | null;
  platform_post_id?: string | null;
  post_group_id?: string | null;
  error_message?: string | null;
  error_reason?: string | null;
  approved_by?: string | null;
  published_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
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

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  error?: string;
}

export interface PostMetrics {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
}

export interface AccountDiscoveryItem {
  id: string;
  name: string;
  username?: string;
  platform: PlatformType;
  details?: string;
  hasInstagramBusiness?: boolean;
  instagramAccountId?: string;
}

export interface SocialPublisher {
  publish(post: Post, account: SocialAccount): Promise<PublishResult>;
  refreshToken(account: SocialAccount): Promise<SocialAccount>;
  fetchMetrics(post: Post, account: SocialAccount): Promise<PostMetrics>;
}
