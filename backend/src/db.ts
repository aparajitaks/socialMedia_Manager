import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  User,
  SocialAccount,
  PostGroup,
  Post,
  PostMetric,
  PlatformMetricsSummary,
  PlatformType,
  PostStatus
} from './types/index.js';
import { encryptToken } from './crypto.js';

// ---------------------------------------------------------------------------
// Supabase Client
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (supabase) {
  console.log('✅ db: Using Supabase Postgres for persistence');
} else {
  console.warn('⚠️  db: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — falling back to local JSON store');
}

// ---------------------------------------------------------------------------
// Local JSON Store (fallback / zero-config mode)
// ---------------------------------------------------------------------------
const DATA_DIR = fs.existsSync(path.join(process.cwd(), 'data'))
  ? path.join(process.cwd(), 'data')
  : fs.existsSync(path.join(process.cwd(), 'backend', 'data'))
  ? path.join(process.cwd(), 'backend', 'data')
  : fs.existsSync(path.join(process.cwd(), '..', 'data'))
  ? path.join(process.cwd(), '..', 'data')
  : path.join(process.cwd(), 'data');

const DB_FILE = path.join(DATA_DIR, 'store.json');

interface LocalDB {
  users: User[];
  social_accounts: SocialAccount[];
  post_groups: PostGroup[];
  posts: Post[];
  post_metrics: PostMetric[];
}

function getInitialData(): LocalDB {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const editorId = '22222222-2222-4222-8222-222222222222';
  const now = new Date();

  const users: User[] = [
    {
      id: adminId,
      name: 'Sarah Connor (Admin)',
      email: 'admin@company.internal',
      role: 'admin',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString()
    },
    {
      id: editorId,
      name: 'Alex Rivera (Editor)',
      email: 'editor@company.internal',
      role: 'editor',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 25).toISOString()
    }
  ];

  const accLiId = '33333333-3333-4333-8333-333333333331';
  const accFbId = '33333333-3333-4333-8333-333333333332';
  const accIgId = '33333333-3333-4333-8333-333333333333';
  const accGbpId = '33333333-3333-4333-8333-333333333334';
  const accXId = '33333333-3333-4333-8333-333333333335';

  const social_accounts: SocialAccount[] = [
    {
      id: accLiId,
      platform: 'linkedin',
      display_name: 'Acme Corp • Official LinkedIn',
      external_account_id: 'org_acme_corp_98214',
      access_token: encryptToken('mock_li_token_valid'),
      refresh_token: encryptToken('mock_li_refresh_valid'),
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      connected_by: adminId,
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20).toISOString()
    },
    {
      id: accFbId,
      platform: 'facebook',
      display_name: 'Acme Technologies Facebook Page',
      external_account_id: 'fb_page_109283741',
      access_token: encryptToken('mock_fb_token_valid'),
      refresh_token: null,
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 50).toISOString(),
      connected_by: adminId,
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString()
    },
    {
      id: accIgId,
      platform: 'instagram',
      display_name: '@acme_global (Instagram Business)',
      external_account_id: 'ig_biz_882371940',
      access_token: encryptToken('mock_ig_token_valid'),
      refresh_token: null,
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 50).toISOString(),
      connected_by: adminId,
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString()
    },
    {
      id: accGbpId,
      platform: 'google_business',
      display_name: 'Acme HQ — Google Business Profile',
      external_account_id: 'locations/gbp_loc_4412',
      access_token: encryptToken('mock_gbp_token_valid'),
      refresh_token: encryptToken('mock_gbp_refresh_valid'),
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 28).toISOString(),
      connected_by: adminId,
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14).toISOString()
    },
    {
      id: accXId,
      platform: 'x',
      display_name: '@AcmeTechHQ (X)',
      external_account_id: 'x_usr_998124',
      access_token: encryptToken('mock_x_token_valid'),
      refresh_token: encryptToken('mock_x_refresh_valid'),
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 80).toISOString(),
      connected_by: adminId,
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString()
    }
  ];

  const grp1Id = '44444444-4444-4444-8444-444444444441';
  const grp2Id = '44444444-4444-4444-8444-444444444442';
  const grp3Id = '44444444-4444-4444-8444-444444444443';
  const grp4Id = '44444444-4444-4444-8444-444444444444';

  const post_groups: PostGroup[] = [
    {
      id: grp1Id,
      label: 'Q3 Enterprise Product Launch Announcement',
      created_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 48).toISOString()
    },
    {
      id: grp2Id,
      label: 'Customer Success Spotlight — FinTech Case Study',
      created_by: editorId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString()
    },
    {
      id: grp3Id,
      label: 'Upcoming Engineering Webinar Announcement',
      created_by: editorId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 6).toISOString()
    },
    {
      id: grp4Id,
      label: 'Weekly Team Culture & Hiring Highlights',
      created_by: editorId,
      created_at: new Date(now.getTime() - 1000 * 60 * 30).toISOString()
    }
  ];

  const post1Id = '55555555-5555-4555-8555-555555555551';
  const post2Id = '55555555-5555-4555-8555-555555555552';
  const post3Id = '55555555-5555-4555-8555-555555555553';
  const post4Id = '55555555-5555-4555-8555-555555555554';
  const post5Id = '55555555-5555-4555-8555-555555555555';
  const post6Id = '55555555-5555-4555-8555-555555555556';

  const posts: Post[] = [
    {
      id: post1Id,
      post_group_id: grp1Id,
      social_account_id: accLiId,
      platform: 'linkedin',
      content: '🚀 We are thrilled to announce the launch of Acme Suite 4.0! Built to supercharge workflows with enterprise security and autonomous collaboration. Check out the release notes: https://acme.internal/release-4',
      media_urls: ['https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800'],
      status: 'published',
      scheduled_at: new Date(now.getTime() - 1000 * 60 * 60 * 40).toISOString(),
      published_at: new Date(now.getTime() - 1000 * 60 * 60 * 40).toISOString(),
      platform_post_id: 'urn:li:share:719827361928371',
      error_reason: null,
      approved_by: adminId,
      created_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 48).toISOString()
    },
    {
      id: post2Id,
      post_group_id: grp1Id,
      social_account_id: accXId,
      platform: 'x',
      content: 'Acme Suite 4.0 is live! ⚡ Discover how top teams streamline their workflow with our newest autonomous engine. Read more 👇 #ProductLaunch #TechInnovation',
      media_urls: [],
      status: 'published',
      scheduled_at: new Date(now.getTime() - 1000 * 60 * 60 * 39).toISOString(),
      published_at: new Date(now.getTime() - 1000 * 60 * 60 * 39).toISOString(),
      platform_post_id: '179283719283712',
      error_reason: null,
      approved_by: adminId,
      created_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 48).toISOString()
    },
    {
      id: post3Id,
      post_group_id: grp2Id,
      social_account_id: accLiId,
      platform: 'linkedin',
      content: 'How did FinBank cut operational turnaround time by 64%? In our latest case study, we dive into their migration to distributed workflows. Read the full analysis on our blog.',
      media_urls: ['https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800'],
      status: 'published',
      scheduled_at: new Date(now.getTime() - 1000 * 60 * 60 * 18).toISOString(),
      published_at: new Date(now.getTime() - 1000 * 60 * 60 * 18).toISOString(),
      platform_post_id: 'urn:li:share:719827999128388',
      error_reason: null,
      approved_by: adminId,
      created_by: editorId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString()
    },
    {
      id: post4Id,
      post_group_id: grp3Id,
      social_account_id: accLiId,
      platform: 'linkedin',
      content: 'Join our upcoming webinar: "Scaling High-Concurrency Data Pipelines in 2026". Live Q&A with our Principal Architect. Save your seat today!',
      media_urls: [],
      status: 'scheduled',
      scheduled_at: new Date(now.getTime() + 1000 * 60 * 60 * 2).toISOString(),
      published_at: null,
      platform_post_id: null,
      error_reason: null,
      approved_by: adminId,
      created_by: editorId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 6).toISOString()
    },
    {
      id: post5Id,
      post_group_id: grp3Id,
      social_account_id: accFbId,
      platform: 'facebook',
      content: 'Webinar Alert 🚨 Learn how leading infrastructure teams manage high-concurrency systems. Register free for this Thursday session!',
      media_urls: ['https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800'],
      status: 'scheduled',
      scheduled_at: new Date(now.getTime() + 1000 * 60 * 60 * 4).toISOString(),
      published_at: null,
      platform_post_id: null,
      error_reason: null,
      approved_by: null,
      created_by: editorId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 6).toISOString()
    },
    {
      id: post6Id,
      post_group_id: grp4Id,
      social_account_id: accGbpId,
      platform: 'google_business',
      content: 'We are expanding our headquarters in downtown! Check out current open roles on our careers page or stop by our open showcase.',
      media_urls: [],
      status: 'failed',
      scheduled_at: new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
      published_at: null,
      platform_post_id: null,
      error_reason: 'Google Business Profile Error: Location ID requires re-verification by business owner',
      approved_by: null,
      created_by: editorId,
      created_at: new Date(now.getTime() - 1000 * 60 * 30).toISOString()
    }
  ];

  const post_metrics: PostMetric[] = [
    {
      id: '66666666-6666-4666-8666-666666666661',
      post_id: post1Id,
      fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 20).toISOString(),
      likes: 142,
      comments: 28,
      shares: 19,
      impressions: 4820
    },
    {
      id: '66666666-6666-4666-8666-666666666662',
      post_id: post1Id,
      fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(),
      likes: 215,
      comments: 44,
      shares: 31,
      impressions: 7340
    },
    {
      id: '66666666-6666-4666-8666-666666666663',
      post_id: post2Id,
      fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(),
      likes: 89,
      comments: 12,
      shares: 34,
      impressions: 3190
    },
    {
      id: '66666666-6666-4666-8666-666666666664',
      post_id: post3Id,
      fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 1).toISOString(),
      likes: 98,
      comments: 16,
      shares: 11,
      impressions: 2480
    }
  ];

  return { users, social_accounts, post_groups, posts, post_metrics };
}

// ---------------------------------------------------------------------------
// Simple write-mutex to prevent JSON file corruption from concurrent writes
// ---------------------------------------------------------------------------
let writeLock: Promise<void> = Promise.resolve();

function readLocalDB(): LocalDB {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const initial = getInitialData();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading local DB, resetting to defaults:', err);
    return getInitialData();
  }
}

function writeLocalDB(data: LocalDB): Promise<void> {
  // Chain behind the current lock so concurrent writes are serialized
  writeLock = writeLock.then(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving local DB:', err);
    }
  });
  return writeLock;
}

// ---------------------------------------------------------------------------
// Supabase error helper — throws with context for easier debugging
// ---------------------------------------------------------------------------
function sbError(op: string, error: any): never {
  throw new Error(`Supabase ${op} error: ${error?.message || JSON.stringify(error)}`);
}

// ---------------------------------------------------------------------------
// Database Service Interface
// ---------------------------------------------------------------------------
export const db = {
  // ---- Users ----
  async getUsers(): Promise<User[]> {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: true });
      if (error) sbError('getUsers', error);
      return data!;
    }
    return readLocalDB().users;
  },

  async getUserById(id: string): Promise<User | null> {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getUserById', error);
      return data;
    }
    return readLocalDB().users.find((u) => u.id === id) || null;
  },

  async getUserByEmail(email: string): Promise<User | null> {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').ilike('email', email).maybeSingle();
      if (error) sbError('getUserByEmail', error);
      return data;
    }
    return readLocalDB().users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async createUser(user: Omit<User, 'id' | 'created_at'>): Promise<User> {
    const newUser: User = {
      ...user,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };
    if (supabase) {
      const { data, error } = await supabase.from('users').insert(newUser).select().single();
      if (error) sbError('createUser', error);
      return data!;
    }
    const current = readLocalDB();
    current.users.push(newUser);
    await writeLocalDB(current);
    return newUser;
  },

  // ---- Social Accounts ----
  async getSocialAccounts(): Promise<SocialAccount[]> {
    if (supabase) {
      const { data, error } = await supabase.from('social_accounts').select('*').order('connected_at', { ascending: false });
      if (error) sbError('getSocialAccounts', error);
      return data!;
    }
    return readLocalDB().social_accounts;
  },

  async getSocialAccountById(id: string): Promise<SocialAccount | null> {
    if (supabase) {
      const { data, error } = await supabase.from('social_accounts').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getSocialAccountById', error);
      return data;
    }
    return readLocalDB().social_accounts.find((a) => a.id === id) || null;
  },

  async createSocialAccount(account: Omit<SocialAccount, 'id' | 'connected_at'>): Promise<SocialAccount> {
    const newAccount: SocialAccount = {
      ...account,
      id: crypto.randomUUID(),
      connected_at: new Date().toISOString()
    };

    if (supabase) {
      // Upsert by platform + external_account_id to avoid duplicates
      const { data: existing } = await supabase
        .from('social_accounts')
        .select('id')
        .eq('platform', newAccount.platform)
        .eq('external_account_id', newAccount.external_account_id)
        .maybeSingle();

      if (existing?.id) {
        // Update existing record
        const { data, error } = await supabase
          .from('social_accounts')
          .update({ ...newAccount, connected_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) sbError('createSocialAccount(update)', error);
        return data!;
      }

      const { data, error } = await supabase.from('social_accounts').insert(newAccount).select().single();
      if (error) sbError('createSocialAccount(insert)', error);
      return data!;
    }

    const current = readLocalDB();
    current.social_accounts = current.social_accounts.filter(
      (a) => !(a.platform === newAccount.platform && a.external_account_id === newAccount.external_account_id)
    );
    current.social_accounts.unshift(newAccount);
    await writeLocalDB(current);
    return newAccount;
  },

  async updateSocialAccount(id: string, patch: Partial<SocialAccount>): Promise<SocialAccount | null> {
    if (supabase) {
      const { data, error } = await supabase.from('social_accounts').update(patch).eq('id', id).select().single();
      if (error) sbError('updateSocialAccount', error);
      return data!;
    }
    const current = readLocalDB();
    const idx = current.social_accounts.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    current.social_accounts[idx] = { ...current.social_accounts[idx], ...patch };
    await writeLocalDB(current);
    return current.social_accounts[idx];
  },

  async deleteSocialAccount(id: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('social_accounts').delete().eq('id', id);
      if (error) sbError('deleteSocialAccount', error);
      return true;
    }
    const current = readLocalDB();
    current.social_accounts = current.social_accounts.filter((a) => a.id !== id);
    await writeLocalDB(current);
    return true;
  },

  // ---- Post Groups ----
  async createPostGroup(label?: string, created_by?: string): Promise<PostGroup> {
    const newGroup: PostGroup = {
      id: crypto.randomUUID(),
      label: label || null,
      created_by: created_by || null,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase.from('post_groups').insert(newGroup).select().single();
      if (error) sbError('createPostGroup', error);
      return data!;
    }

    const current = readLocalDB();
    current.post_groups.unshift(newGroup);
    await writeLocalDB(current);
    return newGroup;
  },

  // ---- Posts ----
  async getPosts(filter?: { status?: string; from?: string; to?: string }): Promise<Post[]> {
    if (supabase) {
      let query = supabase.from('posts').select('*').order('created_at', { ascending: false });
      if (filter?.status) query = query.eq('status', filter.status);
      if (filter?.from) query = query.gte('scheduled_at', filter.from);
      if (filter?.to) query = query.lte('scheduled_at', filter.to);
      const { data, error } = await query;
      if (error) sbError('getPosts', error);
      return data!;
    }

    let posts = readLocalDB().posts;
    if (filter?.status) posts = posts.filter((p) => p.status === filter.status);
    if (filter?.from) {
      const fromTime = new Date(filter.from).getTime();
      posts = posts.filter((p) => (p.scheduled_at ? new Date(p.scheduled_at).getTime() >= fromTime : false));
    }
    if (filter?.to) {
      const toTime = new Date(filter.to).getTime();
      posts = posts.filter((p) => (p.scheduled_at ? new Date(p.scheduled_at).getTime() <= toTime : false));
    }
    return posts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getPostById(id: string): Promise<Post | null> {
    if (supabase) {
      const { data, error } = await supabase.from('posts').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getPostById', error);
      return data;
    }
    return readLocalDB().posts.find((p) => p.id === id) || null;
  },

  async createPost(post: Omit<Post, 'id' | 'created_at'>): Promise<Post> {
    const newPost: Post = {
      ...post,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase.from('posts').insert(newPost).select().single();
      if (error) sbError('createPost', error);
      return data!;
    }

    const current = readLocalDB();
    current.posts.unshift(newPost);
    await writeLocalDB(current);
    return newPost;
  },

  async updatePost(id: string, patch: Partial<Post>): Promise<Post | null> {
    if (supabase) {
      const { data, error } = await supabase.from('posts').update(patch).eq('id', id).select().single();
      if (error) sbError('updatePost', error);
      return data!;
    }

    const current = readLocalDB();
    const idx = current.posts.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    current.posts[idx] = { ...current.posts[idx], ...patch };
    await writeLocalDB(current);
    return current.posts[idx];
  },

  async deletePost(id: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('posts').delete().eq('id', id);
      if (error) sbError('deletePost', error);
      return true;
    }
    const current = readLocalDB();
    const initLen = current.posts.length;
    current.posts = current.posts.filter((p) => p.id !== id);
    await writeLocalDB(current);
    return current.posts.length < initLen;
  },

  async getDueScheduledPosts(): Promise<Post[]> {
    const nowIso = new Date().toISOString();
    if (supabase) {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_at', nowIso);
      if (error) sbError('getDueScheduledPosts', error);
      return data!;
    }

    const nowTime = Date.now();
    return readLocalDB().posts.filter(
      (p) => p.status === 'scheduled' && p.scheduled_at && new Date(p.scheduled_at).getTime() <= nowTime
    );
  },

  // ---- Post Metrics ----
  async getPostMetrics(postId: string): Promise<PostMetric[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('post_metrics')
        .select('*')
        .eq('post_id', postId)
        .order('fetched_at', { ascending: false });
      if (error) sbError('getPostMetrics', error);
      return data!;
    }

    return readLocalDB()
      .post_metrics.filter((m) => m.post_id === postId)
      .sort((a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime());
  },

  async createPostMetric(metric: Omit<PostMetric, 'id' | 'fetched_at'>): Promise<PostMetric> {
    const newMetric: PostMetric = {
      ...metric,
      id: crypto.randomUUID(),
      fetched_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase.from('post_metrics').insert(newMetric).select().single();
      if (error) sbError('createPostMetric', error);
      return data!;
    }

    const current = readLocalDB();
    current.post_metrics.unshift(newMetric);
    await writeLocalDB(current);
    return newMetric;
  },

  async getMetricsSummary(platform?: string, from?: string, to?: string): Promise<PlatformMetricsSummary[]> {
    const posts = await this.getPosts();

    let metrics: PostMetric[];
    if (supabase) {
      let q = supabase.from('post_metrics').select('*');
      if (from) q = q.gte('fetched_at', from);
      if (to) q = q.lte('fetched_at', to);
      const { data, error } = await q;
      if (error) sbError('getMetricsSummary', error);
      metrics = data!;
    } else {
      metrics = readLocalDB().post_metrics;
    }

    const postMap = new Map(posts.map((p) => [p.id, p]));
    const platformTotals: Record<string, PlatformMetricsSummary> = {
      linkedin: { platform: 'linkedin', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      facebook: { platform: 'facebook', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      instagram: { platform: 'instagram', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      google_business: { platform: 'google_business', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      x: { platform: 'x', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 }
    };

    // Keep only the latest metric per post to avoid double-counting
    const latestMetricPerPost = new Map<string, PostMetric>();
    for (const m of metrics) {
      if (from && new Date(m.fetched_at).getTime() < new Date(from).getTime()) continue;
      if (to && new Date(m.fetched_at).getTime() > new Date(to).getTime()) continue;
      const existing = latestMetricPerPost.get(m.post_id);
      if (!existing || new Date(m.fetched_at).getTime() > new Date(existing.fetched_at).getTime()) {
        latestMetricPerPost.set(m.post_id, m);
      }
    }

    for (const [postId, metric] of latestMetricPerPost.entries()) {
      const post = postMap.get(postId);
      if (!post) continue;
      if (platform && post.platform !== platform) continue;

      if (!platformTotals[post.platform]) {
        platformTotals[post.platform] = {
          platform: post.platform as PlatformType,
          total_likes: 0,
          total_comments: 0,
          total_shares: 0,
          total_impressions: 0
        };
      }

      platformTotals[post.platform].total_likes += metric.likes || 0;
      platformTotals[post.platform].total_comments += metric.comments || 0;
      platformTotals[post.platform].total_shares += metric.shares || 0;
      platformTotals[post.platform].total_impressions += metric.impressions || 0;
    }

    if (platform) {
      return [platformTotals[platform] || { platform: platform as PlatformType, total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 }];
    }

    return Object.values(platformTotals);
  }
};
