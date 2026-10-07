// Unified API client — thin wrappers that map Next.js API responses
// to the types the Figma components expect.

export type Platform = 'linkedin' | 'instagram' | 'facebook' | 'google_business' | 'x';
export type PostStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'processing'
  | 'published'
  | 'failed'
  | 'paused'
  | 'cancelled';

export interface SocialAccount {
  id: string;
  client_id?: string;
  platform: Platform;
  display_name: string;
  platform_account_id?: string;
  external_account_id?: string;
  external_account_name?: string;
  external_username?: string;
  username?: string;
  profile_image_url?: string;
  connected_at: string;
  token_expires_at?: string | null;
  status?: 'CONNECTED' | 'TOKEN_EXPIRING' | 'TOKEN_EXPIRED' | 'DISCONNECTED' | 'REAUTH_REQUIRED' | 'ERROR' | 'connected' | 'expired' | 'revoked' | 'needs_reconnect';
  last_verified_at?: string | null;
  last_synced_at?: string | null;
  last_error?: string | null;
  capabilities?: PlatformCapabilities;
}

export interface PlatformCapabilities {
  publishText: boolean;
  publishImage: boolean;
  publishVideo: boolean;
  publishCarousel: boolean;
  publishStory: boolean;
  publishReel: boolean;
  publishShort: boolean;
  publishDocument: boolean;
  publishLink: boolean;
  firstComment: boolean;
  hashtags: boolean;
  mentions: boolean;
  analytics: boolean;
  comments: boolean;
  inbox: boolean;
  directMessages: boolean;
  webhooks: boolean;
}

export interface Post {
  id: string;
  post_group_id?: string | null;
  social_account_id: string;
  platform: Platform;
  content: string;
  media_urls?: string[];
  status: PostStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  platform_post_id?: string | null;
  error_reason?: string | null;
  approved_by?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface PostVariant {
  id?: string;
  post_id?: string;
  social_account_id: string;
  platform: Platform;
  content: string;
  media_urls?: string[] | null;
  link?: string | null;
  title?: string | null;
  description?: string | null;
  first_comment?: string | null;
  hashtags?: string[] | string | null;
  platform_specific_fields?: Record<string, any> | null;
  status?: string;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  platform?: Platform;
  variantId?: string;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  platform?: Platform;
  variantId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface PostMetric {
  fetched_at: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
}

export interface PlatformSummary {
  platform: Platform;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_impressions: number;
}

// ---- helpers ----
export const PLATFORM_COLORS: Record<Platform, string> = {
  linkedin: '#0A66C2',
  instagram: '#C13584',
  facebook: '#1877F2',
  google_business: '#34A853',
  x: '#1C2321',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  facebook: 'Facebook',
  google_business: 'Google Business',
  x: 'X (Twitter)',
};

export const PLATFORM_LOGOS: Record<Platform, string> = {
  linkedin: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR5R9I9iV2-YEJQd_L4vObRF5nn98LYGEgYbjKA5lIcsw&s=10',
  instagram: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQpqR3mTVBIQI098yD0OlH0ojttu71mNrJiMHAz4eoLSw&s=10',
  facebook: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRbNM9YrPyE_2yGxHIE0mzfdsegYeLAMiSPbsWdqPvJmA&s=10',
  google_business: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS8mCfXC2zufaJeFuwCkrlqyMVKK_tL7ggC8diyDCtRQA&s=10',
  x: '',
};

// ---- API calls ----
export async function fetchAccounts(clientId?: string): Promise<SocialAccount[]> {
  const url = clientId ? `/api/social-accounts?client_id=${encodeURIComponent(clientId)}` : '/api/social-accounts';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch accounts');
  return res.json();
}

export async function fetchOAuthConfigStatus(): Promise<Record<string, boolean>> {
  const res = await fetch('/api/social-accounts/config-status');
  if (!res.ok) return {};
  return res.json();
}

export async function deleteAccount(id: string): Promise<void> {
  const res = await fetch(`/api/social-accounts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to disconnect account');
}

export async function verifyAccount(id: string): Promise<{
  success: boolean;
  status: string;
  message: string;
  display_name?: string;
  username?: string;
  profile_image_url?: string;
  last_verified_at?: string;
}> {
  const res = await fetch(`/api/social-accounts/${id}/verify`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Account verification failed');
  }
  return data;
}

export async function connectAccount(payload: {
  platform: Platform;
  client_id?: string;
  display_name?: string;
  platform_account_id?: string;
  external_account_id?: string;
  access_token?: string;
}): Promise<SocialAccount> {
  const res = await fetch('/api/social-accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to connect account');
  }
  return res.json();
}

export async function fetchPosts(status?: string): Promise<Post[]> {
  const url = status ? `/api/posts?status=${status}` : '/api/posts';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}

export async function createPosts(payload: {
  label?: string;
  campaign_label?: string;
  accounts: { social_account_id: string; content: string; media_urls?: string[] }[];
  scheduled_at?: string;
  status?: string;
}): Promise<{ post_group: { id: string }; posts: Post[] }> {
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create posts');
  }
  return res.json();
}

export async function retryPost(id: string): Promise<Post> {
  const res = await fetch(`/api/posts/${id}/retry`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to retry post');
  }
  return res.json();
}

export async function approvePost(id: string, role: 'admin' | 'editor'): Promise<Post> {
  const res = await fetch(`/api/posts/${id}/approve`, {
    method: 'POST',
    headers: { 'x-user-role': role },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to approve post');
  }
  return res.json();
}

export async function patchPost(id: string, patch: Partial<Pick<Post, 'content' | 'scheduled_at'>>): Promise<Post> {
  const res = await fetch(`/api/posts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update post');
  }
  return res.json();
}

export async function deletePost(id: string): Promise<void> {
  const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete post');
  }
}

export async function duplicatePost(id: string): Promise<{ post: Post; variants: PostVariant[] }> {
  const res = await fetch(`/api/posts/${id}/duplicate`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to duplicate post');
  }
  return res.json();
}

export async function validatePostPayload(payload: {
  platform?: Platform;
  content?: string;
  media_urls?: string[];
  link?: string;
  first_comment?: string;
  title?: string;
  variants?: Partial<PostVariant>[];
}): Promise<ValidationResult> {
  const res = await fetch('/api/posts/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Validation failed');
  }
  return res.json();
}

export async function validateExistingPost(id: string): Promise<ValidationResult> {
  const res = await fetch(`/api/posts/${id}/validate`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Validation failed');
  }
  return res.json();
}

export async function createPostVariant(postId: string, variant: Partial<PostVariant>): Promise<PostVariant> {
  const res = await fetch(`/api/posts/${postId}/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(variant),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create variant');
  }
  return res.json();
}

export async function updatePostVariant(postId: string, variantId: string, variant: Partial<PostVariant>): Promise<PostVariant> {
  const res = await fetch(`/api/posts/${postId}/variants/${variantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(variant),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update variant');
  }
  return res.json();
}

export async function deletePostVariant(postId: string, variantId: string): Promise<void> {
  const res = await fetch(`/api/posts/${postId}/variants/${variantId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete variant');
  }
}

export async function fetchPlatformCapabilities(): Promise<{
  platforms: { platform: string; status: string; capabilities: PlatformCapabilities; notes?: string }[];
}> {
  const res = await fetch('/api/social-accounts/capabilities');
  if (!res.ok) throw new Error('Failed to fetch platform capabilities');
  return res.json();
}

export async function fetchPostMetrics(id: string): Promise<PostMetric[]> {
  const res = await fetch(`/api/posts/${id}/metrics`);
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

export async function fetchMetricsSummary(platform?: string): Promise<PlatformSummary[]> {
  const url = platform ? `/api/metrics/summary?platform=${platform}` : '/api/metrics/summary';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch summary');
  return res.json();
}

export async function runScheduler(): Promise<{ processed_count: number }> {
  const res = await fetch('/api/scheduler/run', { method: 'POST' });
  if (!res.ok) throw new Error('Scheduler run failed');
  return res.json();
}

export async function syncMetrics(): Promise<{ posts_analyzed: number; new_metrics_recorded: number }> {
  const res = await fetch('/api/cron/metrics', { method: 'POST', headers: authHeader() });
  if (!res.ok) throw new Error('Metrics sync failed');
  return res.json();
}

// ---- Session / Auth ----

const SESSION_KEY = 'postline_session';

export interface Session {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

export function saveSession(session: Session) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

export function loadSession(): Session | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}

function authHeader(): Record<string, string> {
  const session = loadSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function login(email: string, password: string): Promise<{ user: any; session: Session | null }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Login failed');
  }
  const data = await res.json();
  if (data.session?.access_token) saveSession(data.session);
  return data;
}

export async function logout() {
  const session = loadSession();
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' }
  }).catch(() => {});
  clearSession();
}

export async function getMe(): Promise<any> {
  const res = await fetch('/api/auth/me', { headers: authHeader() });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

// ---- Media Upload ----

export async function uploadMedia(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch('/api/media/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({
            data: reader.result as string, // base64 data URI
            filename: file.name,
            mimeType: file.type
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Upload failed');
        }
        const { url } = await res.json();
        resolve(url);
      } catch (err: any) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ===========================================================================
// Clients API (Agency Multi-Tenant)
// ===========================================================================

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
}

export async function fetchClients(): Promise<Client[]> {
  const res = await fetch('/api/clients', { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch clients');
  return res.json();
}

export async function createClient(name: string): Promise<Client> {
  const res = await fetch('/api/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create client');
  }
  return res.json();
}

// ===========================================================================
// Content Libraries (RecurPost Evergreen Recycling)
// ===========================================================================

export interface ContentLibrary {
  id: string;
  client_id: string;
  name: string;
  color: string;
  active: boolean;
  created_at: string;
  posts?: LibraryPost[];
  schedules?: RecurringSchedule[];
  total_posts?: number;
}

export interface LibraryPost {
  id: string;
  library_id: string;
  client_id: string;
  content: string;
  media_urls: string[];
  times_published: number;
  last_published_at?: string | null;
  created_at: string;
}

export interface RecurringSchedule {
  id: string;
  library_id: string;
  client_id: string;
  social_account_ids: string[];
  days_of_week: number[]; // 0=Sun, 1=Mon...
  time_of_day: string; // HH:MM
  timezone: string;
  start_date?: string | null;
  end_date?: string | null;
  max_repetitions?: number | null;
  active: boolean;
}

export async function fetchLibraries(clientId?: string): Promise<ContentLibrary[]> {
  const url = clientId ? `/api/libraries?clientId=${clientId}` : '/api/libraries';
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch content libraries');
  return res.json();
}

export async function fetchLibrary(id: string): Promise<ContentLibrary> {
  const res = await fetch(`/api/libraries/${id}`, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch library');
  return res.json();
}

export async function createLibrary(payload: { name: string; color?: string; client_id?: string }): Promise<ContentLibrary> {
  const res = await fetch('/api/libraries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create library');
  }
  return res.json();
}

export async function deleteLibrary(id: string): Promise<void> {
  const res = await fetch(`/api/libraries/${id}`, { method: 'DELETE', headers: authHeader() });
  if (!res.ok) throw new Error('Failed to delete library');
}

export async function addLibraryPost(libraryId: string, payload: { content: string; media_urls?: string[] }): Promise<LibraryPost> {
  const res = await fetch(`/api/libraries/${libraryId}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add post to library');
  }
  return res.json();
}

export async function deleteLibraryPost(libraryId: string, postId: string): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/posts/${postId}`, { method: 'DELETE', headers: authHeader() });
  if (!res.ok) throw new Error('Failed to delete library post');
}

export async function addRecurringSchedule(libraryId: string, payload: {
  days_of_week: number[];
  time_of_day: string;
  social_account_ids: string[];
  timezone?: string;
}): Promise<RecurringSchedule> {
  const res = await fetch(`/api/libraries/${libraryId}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add recurring schedule');
  }
  return res.json();
}

export async function deleteRecurringSchedule(libraryId: string, schedId: string): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/schedules/${schedId}`, { method: 'DELETE', headers: authHeader() });
  if (!res.ok) throw new Error('Failed to delete recurring schedule');
}

export async function rotateLibrary(libraryId: string, socialAccountIds?: string[]): Promise<any> {
  const res = await fetch(`/api/libraries/${libraryId}/rotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ social_account_ids: socialAccountIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to rotate library');
  }
  return res.json();
}

// ===========================================================================
// Bulk CSV Import API
// ===========================================================================

export interface BulkValidationResult {
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  valid_rows: any[];
  invalid_rows: { row_number: number; row: any; errors: string[] }[];
  warnings: string[];
  can_import: boolean;
}

export async function validateBulkCSV(csvContent: string): Promise<BulkValidationResult> {
  const res = await fetch('/api/bulk/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ csv_content: csvContent }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to validate CSV');
  }
  return res.json();
}

export async function importBulkWrapped(validRows: any[]): Promise<{ imported_count: number }> {
  const res = await fetch('/api/bulk/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ valid_rows: validRows }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to import bulk rows');
  }
  return res.json();
}

// ===========================================================================
// Reports API
// ===========================================================================

export interface ReportSummary {
  client_id: string;
  generated_at: string;
  period: { from: string; to: string };
  totals: {
    total_impressions: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
    total_engagement: number;
    average_engagement_rate_pct: number;
    published_posts_count: number;
    connected_accounts_count: number;
  };
  platform_breakdown: PlatformSummary[];
  top_posts: {
    id: string;
    platform: Platform;
    content: string;
    published_at: string;
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
    total_engagement: number;
    engagement_rate_pct: number;
  }[];
}

export async function fetchReportSummary(from?: string, to?: string): Promise<ReportSummary> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const url = `/api/reports/summary${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch performance report');
  return res.json();
}

// ===========================================================================
// Social Inbox API
// ===========================================================================

export interface InboxConversation {
  id: string;
  client_id: string;
  platform: Platform;
  sender_name: string;
  sender_avatar?: string;
  last_message_text: string;
  last_message_at: string;
  unread: boolean;
}

export interface InboxMessage {
  id: string;
  conversation_id: string;
  content: string;
  sender_name: string;
  is_from_us: boolean;
  message_type: 'direct_message' | 'comment' | 'reply';
  created_at: string;
}

export async function fetchInboxConversations(platform?: string): Promise<InboxConversation[]> {
  const url = platform ? `/api/inbox/conversations?platform=${platform}` : '/api/inbox/conversations';
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch inbox');
  return res.json();
}

export async function fetchInboxMessages(conversationId: string): Promise<InboxMessage[]> {
  const res = await fetch(`/api/inbox/conversations/${conversationId}/messages`, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function sendInboxReply(conversationId: string, content: string, senderName?: string): Promise<InboxMessage> {
  const res = await fetch(`/api/inbox/conversations/${conversationId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ content, sender_name: senderName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send reply');
  }
  return res.json();
}

