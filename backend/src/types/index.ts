export type PlatformType =
  | 'meta'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'x'
  | 'google_business'
  | 'pinterest'
  | 'tiktok'
  | 'youtube'
  | 'threads'
  | 'bluesky';

export type UserRole =
  | 'OWNER'
  | 'ADMIN'
  | 'EDITOR'
  | 'APPROVER'
  | 'VIEWER'
  | 'CLIENT'
  | 'owner'
  | 'admin'
  | 'editor'
  | 'approver'
  | 'viewer'
  | 'client'
  | 'member';

export type PostLifecycleState =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'RETRYING'
  | 'CANCELLED'
  | 'PAUSED';

export type PostStatus =
  | PostLifecycleState
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'queued'
  | 'processing'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'paused';

export type SocialAccountStatus = 'CONNECTED' | 'TOKEN_EXPIRING' | 'TOKEN_EXPIRED' | 'DISCONNECTED' | 'REAUTH_REQUIRED' | 'ERROR';

export type ErrorCategory =
  | 'CREDENTIALS_NOT_CONFIGURED'
  | 'ACCOUNT_NEEDS_RECONNECT'
  | 'PLATFORM_NOT_AVAILABLE'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'RATE_LIMIT'
  | 'INVALID_MEDIA'
  | 'INVALID_CAPTION'
  | 'PERMISSION_DENIED'
  | 'ACCOUNT_DISCONNECTED'
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export type Workspace = Organization;

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: UserRole;
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
  timezone?: string;
  created_at: string;
}

export interface SocialAccount {
  id: string;
  client_id: string;
  platform: PlatformType;
  platform_account_id: string;
  display_name?: string;
  username?: string;
  profile_image_url?: string;
  encrypted_access_token: string;
  encrypted_refresh_token?: string | null;
  token_expires_at?: string | null;
  status: SocialAccountStatus;
  metadata?: Record<string, any> | null;
  connected_at: string;
  updated_at: string;
  last_verified_at?: string | null;

  // Legacy field aliases for backward compatibility
  external_account_id?: string;
  external_account_name?: string;
  external_username?: string;
  access_token_encrypted?: string;
  refresh_token_encrypted?: string | null;
  timezone?: string;
  last_synced_at?: string | null;
  last_error?: string | null;
  error_category?: ErrorCategory | null;
  connected_by?: string | null;
  scopes?: string[] | null;
  created_at?: string;

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
  code_verifier?: string | null; // PKCE code verifier for X OAuth 2.0
  return_to?: string | null;
}

export interface PostVariant {
  id: string;
  post_id: string;
  social_account_id: string;
  platform: PlatformType;
  content: string; // Caption / body
  media_urls?: string[] | null;
  hashtags?: string[] | null;
  mentions?: string[] | null;
  link?: string | null;
  title?: string | null; // e.g. for YouTube/Pinterest
  description?: string | null;
  first_comment?: string | null; // e.g. for Instagram first comment
  platform_specific_fields?: Record<string, any> | null;
  status: PostStatus;
  external_post_id?: string | null;
  error_message?: string | null;
  error_category?: ErrorCategory | null;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  client_id: string;
  organization_id?: string;
  social_account_id: string;
  platform: PlatformType;
  title?: string | null;
  content: string;
  media_urls?: string[] | null;
  scheduled_at?: string | null;
  status: PostStatus;
  external_post_id?: string | null;
  platform_post_id?: string | null;
  post_group_id?: string | null;
  error_message?: string | null;
  error_reason?: string | null;
  error_category?: ErrorCategory | null;
  approved_by?: string | null;
  published_at?: string | null;
  created_by?: string | null;
  campaign_label?: string | null;
  timezone?: string;
  variants?: PostVariant[];
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: string;
  post_id: string;
  client_id: string;
  approver_id?: string | null;
  approver_name?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'pending' | 'approved' | 'rejected';
  comment?: string | null;
  share_token?: string;
  created_at: string;
  updated_at: string;
}

export interface MediaAsset {
  id: string;
  client_id: string;
  workspace_id?: string;
  file_name: string;
  mime_type: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  storage_key: string;
  url: string;
  checksum?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface PublishJob {
  id: string;
  post_id: string;
  variant_id?: string | null;
  client_id: string;
  social_account_id: string;
  platform: PlatformType;
  scheduled_at: string;
  status: 'SCHEDULED' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYING' | 'CANCELLED';
  idempotency_key: string;
  attempt_count: number;
  max_attempts: number;
  locked_at?: string | null;
  locked_by?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  next_retry_at?: string | null;
  last_error?: string | null;
  error_category?: ErrorCategory | null;
  created_at: string;
  updated_at: string;
}

export interface PublishAttempt {
  id: string;
  job_id: string;
  attempt_number: number;
  status: 'SUCCESS' | 'FAILURE';
  error_message?: string | null;
  error_category?: ErrorCategory | null;
  executed_at: string;
  response_payload?: any;
}

export interface ContentLibrary {
  id: string;
  client_id: string;
  name: string;
  color?: string;
  active: boolean;
  created_at: string;
}

export interface LibraryPost {
  id: string;
  library_id: string;
  client_id: string;
  content: string;
  media_urls?: string[] | null;
  platform_variants?: Record<string, any> | null;
  times_published: number;
  last_published_at?: string | null;
  created_at: string;
}

export interface RecurringSchedule {
  id: string;
  library_id: string;
  client_id: string;
  social_account_ids: string[];
  days_of_week: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  time_of_day: string; // HH:MM in 24hr format
  timezone: string;
  start_date?: string | null;
  end_date?: string | null;
  max_repetitions?: number | null;
  repetition_count: number;
  active: boolean;
  created_at: string;
}

export interface AppNotification {
  id: string;
  workspace_id?: string;
  client_id?: string;
  user_id?: string | null;
  type:
    | 'APPROVAL_REQUESTED'
    | 'POST_APPROVED'
    | 'POST_REJECTED'
    | 'POST_FAILED'
    | 'TOKEN_EXPIRED'
    | 'ACCOUNT_DISCONNECTED'
    | 'PUBLISH_SUCCESS'
    | 'REPORT_READY';
  title: string;
  message: string;
  entity_id?: string | null;
  entity_type?: string | null;
  read: boolean;
  created_at: string;
}

export interface ClientMember {
  id: string;
  client_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
}

export interface AuditLog {
  id: string;
  organization_id?: string;
  client_id?: string;
  user_id?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
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

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  platform_post_id?: string;
  error?: string;
  errorCategory?: ErrorCategory;
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
  refreshToken(account: SocialAccount): Promise<SocialAccount | any>;
  fetchMetrics(post: Post, account: SocialAccount): Promise<PostMetrics>;
  validatePost?(post: Post | PostVariant, account?: SocialAccount): { valid: boolean; errors: string[] };
}

export interface InboxConversation {
  id: string;
  client_id: string;
  platform: PlatformType;
  sender_name: string;
  sender_avatar?: string | null;
  last_message_text: string;
  last_message_at: string;
  unread: boolean;
}

export interface InboxMessage {
  id: string;
  conversation_id: string;
  external_message_id?: string;
  sender_name: string;
  sender_id?: string | null;
  message_type: 'direct_message' | 'comment' | 'reply';
  content: string;
  is_from_us: boolean;
  created_at: string;
}
