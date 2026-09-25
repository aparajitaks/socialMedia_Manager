/**
 * Test helper — creates a lightweight Express app wired to the same route
 * handlers used in production, but with the DB swapped for an in-memory
 * store so tests never hit a real Supabase instance or the filesystem.
 */
import express, { Express } from 'express';
import cors from 'cors';

// ── In-memory DB mock ────────────────────────────────────────────────────────
// We intercept the module before any route file imports it.
import { vi } from 'vitest';

// Minimal seed data shared across suites
export const seed = {
  users: [
    { id: 'user-admin', email: 'admin@test.com', role: 'admin', created_at: new Date().toISOString() },
    { id: 'user-editor', email: 'editor@test.com', role: 'editor', created_at: new Date().toISOString() },
  ],
  social_accounts: [] as any[],
  post_groups: [] as any[],
  posts: [] as any[],
  post_metrics: [] as any[],
};

/**
 * Reset seed to clean state between tests.
 */
export function resetSeed() {
  seed.social_accounts = [
    {
      id: 'acc-li',
      platform: 'linkedin',
      display_name: 'Test LinkedIn Page',
      access_token: 'enc:mock_token_li',
      refresh_token: null,
      external_account_id: 'li_ext_123',
      token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    },
    {
      id: 'acc-x',
      platform: 'x',
      display_name: 'Test X Account',
      access_token: 'enc:mock_token_x',
      refresh_token: null,
      external_account_id: 'x_ext_456',
      token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    },
  ];
  seed.post_groups = [
    { id: 'grp-1', label: 'Test Campaign', created_by: 'user-admin', created_at: new Date().toISOString() },
  ];
  seed.posts = [
    {
      id: 'post-draft',
      post_group_id: 'grp-1',
      social_account_id: 'acc-li',
      platform: 'linkedin',
      content: 'Draft post content',
      media_urls: [],
      status: 'draft',
      scheduled_at: null,
      published_at: null,
      platform_post_id: null,
      error_reason: null,
      approved_by: null,
      created_by: 'user-admin',
      created_at: new Date().toISOString(),
    },
    {
      id: 'post-scheduled',
      post_group_id: 'grp-1',
      social_account_id: 'acc-li',
      platform: 'linkedin',
      content: 'Scheduled post content',
      media_urls: [],
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      published_at: null,
      platform_post_id: null,
      error_reason: null,
      approved_by: 'user-admin',
      created_by: 'user-admin',
      created_at: new Date().toISOString(),
    },
    {
      id: 'post-published',
      post_group_id: 'grp-1',
      social_account_id: 'acc-li',
      platform: 'linkedin',
      content: 'Published post content',
      media_urls: [],
      status: 'published',
      scheduled_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      platform_post_id: 'li_post_99',
      error_reason: null,
      approved_by: 'user-admin',
      created_by: 'user-admin',
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'post-failed',
      post_group_id: 'grp-1',
      social_account_id: 'acc-x',
      platform: 'x',
      content: 'Failed post content',
      media_urls: [],
      status: 'failed',
      scheduled_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      published_at: null,
      platform_post_id: null,
      error_reason: 'X API 401: Token rejected',
      approved_by: null,
      created_by: 'user-editor',
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  ];
  seed.post_metrics = [
    {
      id: 'metric-1',
      post_id: 'post-published',
      likes: 42,
      comments: 7,
      shares: 3,
      impressions: 820,
      fetched_at: new Date().toISOString(),
    },
  ];
}

// ── DB mock implementation ───────────────────────────────────────────────────
export const mockDb = {
  getUsers: vi.fn(() => Promise.resolve([...seed.users])),
  getUserById: vi.fn((id: string) => Promise.resolve(seed.users.find((u) => u.id === id) ?? null)),
  getSocialAccounts: vi.fn(() => Promise.resolve([...seed.social_accounts])),
  getSocialAccountById: vi.fn((id: string) => Promise.resolve(seed.social_accounts.find((a) => a.id === id) ?? null)),
  createSocialAccount: vi.fn((data: any) => {
    const acc = { ...data, id: `acc-new-${Date.now()}`, connected_at: new Date().toISOString() };
    seed.social_accounts.push(acc);
    return Promise.resolve(acc);
  }),
  updateSocialAccount: vi.fn((id: string, patch: any) => {
    const idx = seed.social_accounts.findIndex((a) => a.id === id);
    if (idx === -1) return Promise.resolve(null);
    seed.social_accounts[idx] = { ...seed.social_accounts[idx], ...patch };
    return Promise.resolve(seed.social_accounts[idx]);
  }),
  deleteSocialAccount: vi.fn((id: string) => {
    seed.social_accounts = seed.social_accounts.filter((a) => a.id !== id);
    return Promise.resolve(true);
  }),
  createPostGroup: vi.fn((createdBy: string, label: string) => {
    const grp = { id: `grp-${Date.now()}`, label, created_by: createdBy, created_at: new Date().toISOString() };
    seed.post_groups.push(grp);
    return Promise.resolve(grp);
  }),
  getPosts: vi.fn((filter?: any) => {
    let posts = [...seed.posts];
    if (filter?.status) posts = posts.filter((p) => p.status === filter.status);
    if (filter?.from) posts = posts.filter((p) => p.scheduled_at && new Date(p.scheduled_at) >= new Date(filter.from));
    if (filter?.to) posts = posts.filter((p) => p.scheduled_at && new Date(p.scheduled_at) <= new Date(filter.to));
    return Promise.resolve(posts);
  }),
  getPostById: vi.fn((id: string) => Promise.resolve(seed.posts.find((p) => p.id === id) ?? null)),
  createPost: vi.fn((data: any) => {
    const post = { ...data, id: `post-${Date.now()}`, created_at: new Date().toISOString() };
    seed.posts.push(post);
    return Promise.resolve(post);
  }),
  updatePost: vi.fn((id: string, patch: any) => {
    const idx = seed.posts.findIndex((p) => p.id === id);
    if (idx === -1) return Promise.resolve(null);
    seed.posts[idx] = { ...seed.posts[idx], ...patch };
    return Promise.resolve(seed.posts[idx]);
  }),
  deletePost: vi.fn((id: string) => {
    seed.posts = seed.posts.filter((p) => p.id !== id);
    return Promise.resolve(true);
  }),
  getDueScheduledPosts: vi.fn(() => {
    const now = Date.now();
    return Promise.resolve(
      seed.posts.filter((p) => p.status === 'scheduled' && p.scheduled_at && new Date(p.scheduled_at).getTime() <= now)
    );
  }),
  getPostMetrics: vi.fn((postId: string) =>
    Promise.resolve(seed.post_metrics.filter((m) => m.post_id === postId))
  ),
  createPostMetric: vi.fn((data: any) => {
    const m = { ...data, id: `metric-${Date.now()}`, fetched_at: new Date().toISOString() };
    seed.post_metrics.push(m);
    return Promise.resolve(m);
  }),
  getMetricsSummary: vi.fn(() =>
    Promise.resolve([
      { platform: 'linkedin', total_likes: 42, total_comments: 7, total_shares: 3, total_impressions: 820 },
    ])
  ),
};

// ── Mock the db module before routes are imported ────────────────────────────
vi.mock('../db.js', () => ({ db: mockDb, supabase: null }));

// ── Mock the publishers so tests never hit real APIs ─────────────────────────
export const mockPublisher = {
  publish: vi.fn().mockResolvedValue({ platform_post_id: 'mock_platform_post_123' }),
  refreshToken: vi.fn().mockResolvedValue({
    access_token: 'enc:new_mock_token',
    refresh_token: null,
    token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
  }),
  fetchMetrics: vi.fn().mockResolvedValue({ likes: 10, comments: 2, shares: 1, impressions: 200 }),
};

vi.mock('../publishers/index.js', () => ({
  getPublisher: vi.fn(() => mockPublisher),
}));

// ── Mock crypto so token values are predictable ───────────────────────────────
vi.mock('../crypto.js', () => ({
  encryptToken: vi.fn((t: string) => `enc:${t}`),
  decryptToken: vi.fn((t: string) => t.replace(/^enc:/, '')),
}));

// ── App factory ───────────────────────────────────────────────────────────────
export async function buildApp(): Promise<Express> {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

  const [accountsRouter, postsRouter, metricsRouter, schedulerRouter, cronRouter, authRouter] = await Promise.all([
    import('../routes/accounts.js').then((m) => m.default),
    import('../routes/posts.js').then((m) => m.default),
    import('../routes/metrics.js').then((m) => m.default),
    import('../routes/scheduler.js').then((m) => m.default),
    import('../routes/cron.js').then((m) => m.default),
    import('../routes/auth.js').then((m) => m.default),
  ]);

  app.use('/api/accounts', accountsRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/scheduler', schedulerRouter);
  app.use('/api/cron', cronRouter);
  app.use('/api/auth', authRouter);

  return app;
}
