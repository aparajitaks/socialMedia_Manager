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
  organizations: [] as any[],
  clients: [] as any[],
  social_accounts: [] as any[],
  post_groups: [] as any[],
  posts: [] as any[],
  post_metrics: [] as any[],
  publish_jobs: [] as any[],
  publish_attempts: [] as any[],
  post_variants: [] as any[],
};

/**
 * Reset seed to clean state between tests.
 */
export function resetSeed() {
  seed.social_accounts = [
    {
      id: 'acc-li',
      client_id: DEFAULT_CLIENT_ID,
      platform: 'linkedin',
      display_name: 'Test LinkedIn Page',
      access_token: 'enc:mock_token_li',
      refresh_token: null,
      external_account_id: 'li_ext_123',
      token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      status: 'connected',
    },
    {
      id: 'acc-x',
      client_id: DEFAULT_CLIENT_ID,
      platform: 'x',
      display_name: 'Test X Account',
      access_token: 'enc:mock_token_x',
      refresh_token: null,
      external_account_id: 'x_ext_456',
      token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      status: 'connected',
    },
  ];
  seed.post_groups = [
    { id: 'grp-1', label: 'Test Campaign', created_by: 'user-admin', created_at: new Date().toISOString() },
  ];
  seed.posts = [
    {
      id: 'post-draft',
      client_id: DEFAULT_CLIENT_ID,
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
      client_id: DEFAULT_CLIENT_ID,
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
      client_id: DEFAULT_CLIENT_ID,
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
      client_id: DEFAULT_CLIENT_ID,
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
  seed.publish_jobs = [];
  seed.publish_attempts = [];
  seed.post_variants = [];
  seed.organizations = [
    { id: DEFAULT_ORG_ID, name: 'Test Org', created_at: new Date().toISOString() },
  ];
  seed.clients = [
    { id: DEFAULT_CLIENT_ID, organization_id: DEFAULT_ORG_ID, name: 'Default Test Client', timezone: 'UTC', created_at: new Date().toISOString() },
    { id: '00000000-0000-0000-0000-000000000020', organization_id: DEFAULT_ORG_ID, name: 'Second Test Client', timezone: 'UTC', created_at: new Date().toISOString() },
  ];
}

process.env.LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || 'test-linkedin-client-id';
process.env.LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || 'test-linkedin-secret';
process.env.META_APP_ID = process.env.META_APP_ID || '123456789012345';
process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'test-meta-secret';

export const DEFAULT_CLIENT_ID = '00000000-0000-0000-0000-000000000010';
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

// ── DB mock implementation ───────────────────────────────────────────────────
export const mockDb = {
  // Client + organization helpers
  getClient: vi.fn((id: string) => {
    const c = (seed.clients || []).find((x: any) => x.id === id);
    if (c) return Promise.resolve(c);
    if (id === DEFAULT_CLIENT_ID) {
      return Promise.resolve({ id: DEFAULT_CLIENT_ID, organization_id: DEFAULT_ORG_ID, name: 'Default Test Client', timezone: 'UTC' });
    }
    return Promise.resolve(null as any);
  }),
  getClients: vi.fn((orgId?: string) => {
    let list = seed.clients || [];
    if (orgId) list = list.filter((c: any) => c.organization_id === orgId);
    return Promise.resolve([...list]);
  }),
  createClient: vi.fn((data: any) => {
    const c = { id: data.id || `client-${Date.now()}`, organization_id: data.organization_id || DEFAULT_ORG_ID, ...data };
    if (!seed.clients) seed.clients = [];
    seed.clients.push(c);
    return Promise.resolve(c);
  }),
  getUsers: vi.fn(() => Promise.resolve([...seed.users])),
  getUserById: vi.fn((id: string) => Promise.resolve(seed.users.find((u) => u.id === id) ?? null)),
  getSocialAccounts: vi.fn(() => Promise.resolve([...seed.social_accounts])),
  getSocialAccount: vi.fn((id: string) => Promise.resolve(seed.social_accounts.find((a) => a.id === id) ?? null)),
  getSocialAccountById: vi.fn((id: string) => Promise.resolve(seed.social_accounts.find((a) => a.id === id) ?? null)),
  upsertSocialAccount: vi.fn((data: any) => {
    const existingIdx = seed.social_accounts.findIndex((a) => a.id === data.id);
    if (existingIdx >= 0) {
      seed.social_accounts[existingIdx] = { ...seed.social_accounts[existingIdx], ...data };
      return Promise.resolve(seed.social_accounts[existingIdx]);
    }
    const acc = { ...data, id: data.id || `acc-new-${Date.now()}`, connected_at: new Date().toISOString() };
    seed.social_accounts.push(acc);
    return Promise.resolve(acc);
  }),
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
  getPost: vi.fn((id: string) => Promise.resolve(seed.posts.find((p) => p.id === id) ?? null)),
  createPost: vi.fn((data: any) => {
    const post = {
      ...data,
      id: data.id || `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
    };
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
  getPostVariants: vi.fn((postId: string) =>
    Promise.resolve((seed.post_variants || []).filter((v: any) => v.post_id === postId))
  ),
  getPostVariantById: vi.fn((id: string) => {
    const v = (seed.post_variants || []).find((x: any) => x.id === id);
    return Promise.resolve(v || null);
  }),
  createPostVariant: vi.fn((v: any) => {
    const created = {
      id: v.id || `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...v,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!seed.post_variants) seed.post_variants = [];
    seed.post_variants.push(created);
    return Promise.resolve(created);
  }),
  updatePostVariant: vi.fn((id: string, patch: any) => {
    const idx = (seed.post_variants || []).findIndex((v: any) => v.id === id);
    if (idx !== -1) {
      seed.post_variants[idx] = { ...seed.post_variants[idx], ...patch, updated_at: new Date().toISOString() };
      return Promise.resolve(seed.post_variants[idx]);
    }
    return Promise.resolve({ id, ...patch });
  }),
  deletePostVariant: vi.fn((id: string) => {
    seed.post_variants = (seed.post_variants || []).filter((v: any) => v.id !== id);
    return Promise.resolve();
  }),
  getApprovals: vi.fn(() => Promise.resolve([])),
  createApproval: vi.fn((a: any) => Promise.resolve({ id: `appr-${Date.now()}`, ...a })),
  updateApproval: vi.fn((id: string, a: any) => Promise.resolve({ id, ...a })),
  createNotification: vi.fn((n: any) => Promise.resolve({ id: `notif-${Date.now()}`, ...n })),
  saveOAuthState: vi.fn((s: any) => Promise.resolve(s)),
  getOAuthState: vi.fn((state: string) => Promise.resolve({ state, client_id: DEFAULT_CLIENT_ID, platform: 'linkedin', expires_at: new Date(Date.now() + 60000).toISOString(), return_to: null })),
  deleteOAuthState: vi.fn(() => Promise.resolve()),
  getMembershipByUserId: vi.fn(() => Promise.resolve(null)),
  getUserByEmail: vi.fn((email: string) => Promise.resolve(seed.users.find((u) => u.email === email) ?? null)),
  // Publish jobs
  createPublishJob: vi.fn((data: any) => {
    const job = {
      ...data,
      id: data.id || `job-${Date.now()}`,
      status: data.status || 'SCHEDULED',
      attempt_count: data.attempt_count || 0,
      max_attempts: data.max_attempts || 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    seed.publish_jobs.push(job);
    return Promise.resolve(job);
  }),
  getDuePublishJobs: vi.fn(() => {
    const now = Date.now();
    return Promise.resolve(
      seed.publish_jobs.filter(
        (j) =>
          (j.status === 'SCHEDULED' || j.status === 'RETRYING') &&
          !j.locked_at &&
          new Date(j.scheduled_at).getTime() <= now &&
          (!j.next_retry_at || new Date(j.next_retry_at).getTime() <= now)
      )
    );
  }),
  VALID_JOB_TRANSITIONS: {
    SCHEDULED: ['PROCESSING', 'CANCELLED', 'SCHEDULED'],
    QUEUED: ['PROCESSING', 'CANCELLED', 'SCHEDULED'],
    PROCESSING: ['PUBLISHED', 'COMPLETED', 'FAILED', 'RETRYING', 'SCHEDULED'],
    RETRYING: ['PROCESSING', 'CANCELLED', 'SCHEDULED'],
    FAILED: ['RETRYING', 'SCHEDULED', 'PROCESSING'],
    PUBLISHED: [],
    COMPLETED: [],
    CANCELLED: ['SCHEDULED'],
  },
  createPublishJobsTransaction: vi.fn((jobsData: any[]) => {
    const existingKeys = new Set((seed.publish_jobs || []).map((j) => j.idempotency_key));
    const created: any[] = [];
    for (const data of jobsData) {
      if (existingKeys.has(data.idempotency_key)) {
        return Promise.reject(new Error(`Duplicate publish job idempotency key: '${data.idempotency_key}'`));
      }
      existingKeys.add(data.idempotency_key);
      const job = {
        id: data.id || `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        post_id: data.post_id,
        variant_id: data.variant_id || null,
        client_id: data.client_id || DEFAULT_CLIENT_ID,
        social_account_id: data.social_account_id,
        platform: data.platform,
        scheduled_at: data.scheduled_at || new Date().toISOString(),
        status: data.status || 'SCHEDULED',
        idempotency_key: data.idempotency_key,
        attempt_count: data.attempt_count || 0,
        max_attempts: data.max_attempts || 3,
        locked_at: null,
        locked_by: null,
        started_at: null,
        completed_at: null,
        next_retry_at: null,
        last_error: null,
        error_category: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      created.push(job);
    }
    seed.publish_jobs.push(...created);
    return Promise.resolve(created);
  }),
  getPublishJobs: vi.fn((filter?: any) => {
    let jobs = [...seed.publish_jobs];
    if (filter?.clientId) jobs = jobs.filter((j) => j.client_id === filter.clientId);
    if (filter?.status) jobs = jobs.filter((j) => j.status === filter.status);
    if (filter?.postId) jobs = jobs.filter((j) => j.post_id === filter.postId);
    return Promise.resolve(jobs);
  }),
  cancelPublishJob: vi.fn((id: string, callerOrgId?: string) => {
    const job = seed.publish_jobs.find((j) => j.id === id);
    if (!job) return Promise.reject(new Error(`Publish job '${id}' not found`));
    if (callerOrgId) {
      const client = seed.clients.find((c) => c.id === job.client_id);
      if (!client || client.organization_id !== callerOrgId) {
        return Promise.reject(new Error('Unauthorized: Client does not belong to organization'));
      }
    }
    if (job.status === 'PROCESSING') {
      return Promise.reject(new Error('Cannot cancel a publish job that is currently PROCESSING by a worker'));
    }
    if (job.status === 'PUBLISHED' || job.status === 'COMPLETED') {
      return Promise.reject(new Error('Cannot cancel an already published job'));
    }
    job.status = 'CANCELLED';
    job.locked_at = null;
    job.locked_by = null;
    return Promise.resolve(job);
  }),
  recoverStaleJobs: vi.fn((staleThresholdMs: number = 300_000) => {
    const now = Date.now();
    const cutoff = now - staleThresholdMs;
    const recoveredIds: string[] = [];
    for (const job of seed.publish_jobs) {
      if (job.status === 'PROCESSING' && job.locked_at && new Date(job.locked_at).getTime() < cutoff) {
        job.status = 'RETRYING';
        job.locked_at = null;
        job.locked_by = null;
        job.last_error = `Worker lock timed out after ${Math.floor(staleThresholdMs / 1000)}s - recovered by watchdog`;
        recoveredIds.push(job.id);
      }
    }
    return Promise.resolve({ recoveredCount: recoveredIds.length, recoveredIds });
  }),
  getPublishJob: vi.fn((id: string) => Promise.resolve(seed.publish_jobs.find((j) => j.id === id) ?? null)),
  updatePublishJob: vi.fn((id: string, patch: any) => {
    const idx = seed.publish_jobs.findIndex((j) => j.id === id);
    if (idx === -1) return Promise.resolve(null);
    const existing = seed.publish_jobs[idx];
    if (patch.status && patch.status !== existing.status) {
      const allowed = (mockDb as any).VALID_JOB_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(patch.status)) {
        return Promise.reject(new Error(`Invalid job status transition: cannot change status from '${existing.status}' to '${patch.status}'`));
      }
    }
    seed.publish_jobs[idx] = { ...existing, ...patch, updated_at: new Date().toISOString() };
    return Promise.resolve(seed.publish_jobs[idx]);
  }),
  claimPublishJob: vi.fn((workerId: string, staleThresholdMs: number = 300_000) => {
    const now = Date.now();
    const staleCutoff = now - staleThresholdMs;
    const eligible = seed.publish_jobs
      .filter((j) => {
        const isDue = new Date(j.scheduled_at).getTime() <= now;
        const retryReady = !j.next_retry_at || new Date(j.next_retry_at).getTime() <= now;
        if (!isDue || !retryReady) return false;
        const isFresh = (j.status === 'SCHEDULED' || j.status === 'RETRYING') && !j.locked_at;
        const isStale = j.status === 'PROCESSING' && j.locked_at && new Date(j.locked_at).getTime() < staleCutoff;
        return isFresh || isStale;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    if (eligible.length === 0) return Promise.resolve(null);
    const job = eligible[0];
    job.status = 'PROCESSING';
    job.locked_at = new Date().toISOString();
    job.locked_by = workerId;
    job.started_at = new Date().toISOString();
    job.updated_at = new Date().toISOString();
    return Promise.resolve(job);
  }),
  getPublishJobByIdempotencyKey: vi.fn((idempotencyKey: string) => {
    const job = (seed.publish_jobs || []).find((j) => j.idempotency_key === idempotencyKey);
    return Promise.resolve(job || null);
  }),
  createPublishAttempt: vi.fn((data: any) => {
    const attempt = {
      ...data,
      id: `attempt-${Date.now()}`,
      executed_at: new Date().toISOString(),
    };
    seed.publish_attempts.push(attempt);
    return Promise.resolve(attempt);
  }),
};

// ── Mock the db module before routes are imported ────────────────────────────
vi.mock('../db.js', () => ({ db: mockDb, supabase: null, DEFAULT_CLIENT_ID, DEFAULT_ORG_ID }));

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

vi.mock('../publishers/index.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getPublisher: vi.fn(() => mockPublisher),
    exchangeLinkedInCode: vi.fn(async () => ({ access_token: 'mock_linkedin_access', refresh_token: 'mock_linkedin_refresh', expires_in: 3600 })),
    discoverLinkedInOrganizations: vi.fn(async () => ([{ id: 'urn:li:organization:98214', name: 'Apex Digital Systems' }])),
    exchangeGoogleCode: vi.fn(async () => ({ access_token: 'mock_google_access', refresh_token: 'mock_google_refresh', expires_in: 3600 })),
    discoverGoogleLocations: vi.fn(async () => ([{ id: 'accounts/109283749281/locations/48192049281', name: 'Downtown Flagship Store' }])),
    exchangeMetaCode: vi.fn(async () => ({ access_token: 'mock_meta_access', expires_in: 3600 })),
    discoverMetaPagesAndInstagram: vi.fn(async () => ([{ id: 'fb_page_109283741', name: 'Apex Growth Page' }])),
  };
});

// ── Mock crypto so token values are predictable ───────────────────────────────
vi.mock('../crypto.js', () => ({
  encryptToken: vi.fn((t: string) => `enc:${t}`),
  decryptToken: vi.fn((t: string) => t.replace(/^enc:/, '')),
}));

// ── App factory ───────────────────────────────────────────────────────────────
export async function buildApp(): Promise<Express> {
  const app = express();
  app.use(cors());
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

  const [
    { initializeAdapters },
    accountsRouter,
    socialAccountsRouter,
    postsRouter,
    metricsRouter,
    schedulerRouter,
    cronRouter,
    authRouter,
  ] = await Promise.all([
    import('../platform-adapter/adapters/index.js'),
    import('../routes/accounts.js').then((m) => m.default),
    import('../routes/social-accounts.js').then((m) => m.default),
    import('../routes/posts.js').then((m) => m.default),
    import('../routes/metrics.js').then((m) => m.default),
    import('../routes/scheduler.js').then((m) => m.default),
    import('../routes/cron.js').then((m) => m.default),
    import('../routes/auth.js').then((m) => m.default),
  ]);

  initializeAdapters();

  app.use('/api/accounts', accountsRouter);
  app.use('/api/social-accounts', socialAccountsRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/scheduler', schedulerRouter);
  app.use('/api/cron', cronRouter);
  app.use('/api/auth', authRouter);

  return app;
}
