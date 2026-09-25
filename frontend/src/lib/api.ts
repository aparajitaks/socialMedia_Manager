// Unified API client — thin wrappers that map Next.js API responses
// to the types the Figma components expect.

export type Platform = 'linkedin' | 'instagram' | 'facebook' | 'google_business' | 'x';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface SocialAccount {
  id: string;
  platform: Platform;
  display_name: string;
  external_account_id: string;
  connected_at: string;
  token_expires_at?: string | null;
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

// ---- API calls ----
export async function fetchAccounts(): Promise<SocialAccount[]> {
  const res = await fetch('/api/accounts');
  if (!res.ok) throw new Error('Failed to fetch accounts');
  return res.json();
}

export async function deleteAccount(id: string): Promise<void> {
  const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to disconnect account');
}

export async function connectAccount(payload: {
  platform: Platform;
  display_name?: string;
  external_account_id?: string;
  access_token?: string;
  password?: string;
}): Promise<SocialAccount> {
  const res = await fetch('/api/accounts', {
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
  accounts: { social_account_id: string; content: string; media_urls?: string[] }[];
  scheduled_at?: string;
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
