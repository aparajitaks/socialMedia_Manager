import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  Organization,
  User,
  Client,
  SocialAccount,
  OAuthState,
  Post,
  PostMetric,
  PlatformType,
  PostStatus,
} from './types/index.js';
import { encryptToken, decryptToken } from './crypto.js';

// ---------------------------------------------------------------------------
// Supabase Client
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (supabase) {
  console.log('✅ db: Using Supabase Postgres for persistence');
} else {
  console.warn('⚠️  db: Supabase not configured — using multi-tenant zero-config local store');
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

export interface LocalDB {
  organizations: Organization[];
  users: User[];
  clients: Client[];
  social_accounts: SocialAccount[];
  oauth_states: OAuthState[];
  posts: Post[];
  post_metrics: PostMetric[];
}

export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_CLIENT_ID = '00000000-0000-0000-0000-000000000010';
export const SECOND_CLIENT_ID = '00000000-0000-0000-0000-000000000020';

function getInitialData(): LocalDB {
  const now = new Date();

  const organizations: Organization[] = [
    {
      id: DEFAULT_ORG_ID,
      name: 'Acme Growth Agency',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 60).toISOString(),
    },
  ];

  const adminId = '00000000-0000-0000-0000-000000000002';
  const users: User[] = [
    {
      id: adminId,
      organization_id: DEFAULT_ORG_ID,
      email: 'admin@agency.com',
      role: 'owner',
      name: 'Sarah Connor (Agency Owner)',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 60).toISOString(),
    },
  ];

  const clients: Client[] = [
    {
      id: DEFAULT_CLIENT_ID,
      organization_id: DEFAULT_ORG_ID,
      name: 'Apex Fitness',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    },
    {
      id: SECOND_CLIENT_ID,
      organization_id: DEFAULT_ORG_ID,
      name: 'Lumina Cafe',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    },
  ];

  const accLiId = '33333333-3333-4333-8333-333333333331';
  const accFbId = '33333333-3333-4333-8333-333333333332';
  const accIgId = '33333333-3333-4333-8333-333333333333';
  const accGbpId = '33333333-3333-4333-8333-333333333334';
  const accXId = '33333333-3333-4333-8333-333333333335';

  const social_accounts: SocialAccount[] = [
    {
      id: accLiId,
      client_id: DEFAULT_CLIENT_ID,
      platform: 'linkedin',
      external_account_id: 'urn:li:organization:98214',
      external_account_name: 'Apex Fitness • Official LinkedIn',
      display_name: 'Apex Fitness • Official LinkedIn',
      access_token_encrypted: encryptToken('mock_li_token_valid'),
      refresh_token_encrypted: encryptToken('mock_li_refresh_valid'),
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      status: 'connected',
      connected_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    },
    {
      id: accFbId,
      client_id: DEFAULT_CLIENT_ID,
      platform: 'facebook',
      external_account_id: 'fb_page_109283741',
      external_account_name: 'Apex Fitness Facebook Page',
      display_name: 'Apex Fitness Facebook Page',
      access_token_encrypted: encryptToken('mock_fb_token_valid'),
      refresh_token_encrypted: null,
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 50).toISOString(),
      status: 'connected',
      connected_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
    },
    {
      id: accIgId,
      client_id: DEFAULT_CLIENT_ID,
      platform: 'instagram',
      external_account_id: 'ig_usr_591820491',
      external_account_name: '@apex.fitness (Instagram)',
      display_name: '@apex.fitness (Instagram)',
      access_token_encrypted: encryptToken('mock_ig_token_valid'),
      refresh_token_encrypted: null,
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 50).toISOString(),
      status: 'connected',
      connected_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
    },
    {
      id: accGbpId,
      client_id: DEFAULT_CLIENT_ID,
      platform: 'google_business',
      external_account_id: 'accounts/109283749281/locations/48192049281',
      external_account_name: 'Apex Fitness Downtown — Google Profile',
      display_name: 'Apex Fitness Downtown — Google Profile',
      access_token_encrypted: encryptToken('mock_gbp_token_valid'),
      refresh_token_encrypted: encryptToken('mock_gbp_refresh_valid'),
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 28).toISOString(),
      status: 'connected',
      connected_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    },
    {
      id: accXId,
      client_id: DEFAULT_CLIENT_ID,
      platform: 'x',
      external_account_id: 'x_usr_998124',
      external_account_name: '@ApexFitnessHQ (X)',
      display_name: '@ApexFitnessHQ (X)',
      access_token_encrypted: encryptToken('mock_x_token_valid'),
      refresh_token_encrypted: encryptToken('mock_x_refresh_valid'),
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 80).toISOString(),
      status: 'connected',
      connected_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    },
  ];

  const posts: Post[] = [
    {
      id: '55555555-5555-5555-8555-555555555551',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: accLiId,
      platform: 'linkedin',
      content: 'Excited to announce our brand new High-Performance recovery lounge! Book your session today.',
      status: 'published',
      scheduled_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      published_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      external_post_id: 'urn:li:share:718294819284102',
      created_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    },
    {
      id: '55555555-5555-5555-8555-555555555552',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: accIgId,
      platform: 'instagram',
      content: 'Early morning momentum. What fitness goals are you crushing this week? #ApexFitness #GymLife',
      status: 'scheduled',
      scheduled_at: new Date(now.getTime() + 1000 * 60 * 60 * 4).toISOString(),
      created_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString(),
    },
    {
      id: '55555555-5555-5555-8555-555555555553',
      client_id: DEFAULT_CLIENT_ID,
      social_account_id: accGbpId,
      platform: 'google_business',
      content: 'Holiday hours update: We are open 6:00 AM - 10:00 PM all weekend. Drop in anytime!',
      status: 'scheduled',
      scheduled_at: new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString(),
      created_by: adminId,
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 8).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 8).toISOString(),
    },
  ];

  const post_metrics: PostMetric[] = [
    {
      id: '66666666-6666-6666-8666-666666666661',
      post_id: '55555555-5555-5555-8555-555555555551',
      fetched_at: new Date(now.getTime() - 1000 * 60 * 60 * 6).toISOString(),
      likes: 42,
      comments: 7,
      shares: 4,
      impressions: 512,
    },
  ];

  return {
    organizations,
    users,
    clients,
    social_accounts,
    oauth_states: [],
    posts,
    post_metrics,
  };
}

let inMemoryDB: LocalDB | null = null;

function readLocalDB(): LocalDB {
  if (inMemoryDB) return inMemoryDB;

  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // Migrate older schema if missing clients/organizations
      if (!parsed.organizations || !parsed.clients) {
        const initial = getInitialData();
        inMemoryDB = { ...initial, ...parsed };
        return inMemoryDB!;
      }
      inMemoryDB = parsed;
      return inMemoryDB!;
    }
  } catch (err) {
    console.error('Failed to read local DB, resetting to defaults:', err);
  }

  inMemoryDB = getInitialData();
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(inMemoryDB, null, 2), 'utf-8');
  } catch (_) {}

  return inMemoryDB;
}

async function writeLocalDB(data: LocalDB): Promise<void> {
  inMemoryDB = data;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    // Non-fatal fallback for read-only environments
  }
}

function sbError(context: string, error: any) {
  throw new Error(`[Supabase ${context}] ${error.message || JSON.stringify(error)}`);
}

// ---------------------------------------------------------------------------
// DB Service Interface & Implementation
// ---------------------------------------------------------------------------
export const db = {
  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    if (supabase) {
      const { data, error } = await supabase.from('organizations').select('*');
      if (error) sbError('getOrganizations', error);
      return data || [];
    }
    return readLocalDB().organizations;
  },

  async getOrganization(id: string): Promise<Organization | null> {
    if (supabase) {
      const { data, error } = await supabase.from('organizations').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getOrganization', error);
      return data;
    }
    return readLocalDB().organizations.find((o) => o.id === id) || null;
  },

  // Clients
  async getClients(organizationId?: string): Promise<Client[]> {
    if (supabase) {
      let q = supabase.from('clients').select('*').order('created_at', { ascending: true });
      if (organizationId) q = q.eq('organization_id', organizationId);
      const { data, error } = await q;
      if (error) sbError('getClients', error);
      return data || [];
    }
    const clients = readLocalDB().clients;
    if (organizationId) return clients.filter((c) => c.organization_id === organizationId);
    return clients;
  },

  async getClient(id: string): Promise<Client | null> {
    if (supabase) {
      const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getClient', error);
      return data;
    }
    return readLocalDB().clients.find((c) => c.id === id) || null;
  },

  async createClient(data: Partial<Client>): Promise<Client> {
    const newClient: Client = {
      id: data.id || crypto.randomUUID(),
      organization_id: data.organization_id || DEFAULT_ORG_ID,
      name: data.name || 'Untitled Client',
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      const { data: created, error } = await supabase.from('clients').insert(newClient).select().single();
      if (error) sbError('createClient', error);
      return created;
    }

    const current = readLocalDB();
    current.clients.push(newClient);
    await writeLocalDB(current);
    return newClient;
  },

  async getUsers(): Promise<User[]> {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*');
      if (error) sbError('getUsers', error);
      return data || [];
    }
    return readLocalDB().users;
  },

  async getUserByEmail(email: string): Promise<User | null> {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      if (error) sbError('getUserByEmail', error);
      return data;
    }
    return readLocalDB().users.find((u) => u.email === email) || null;
  },

  async createUser(data: Partial<User>): Promise<User> {
    const newUser: User = {
      id: data.id || crypto.randomUUID(),
      organization_id: data.organization_id || DEFAULT_ORG_ID,
      email: data.email || 'user@agency.com',
      role: data.role || 'member',
      name: data.name || data.email?.split('@')[0] || 'Agency Staff',
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      const { data: created, error } = await supabase.from('users').insert(newUser).select().single();
      if (error) sbError('createUser', error);
      return created;
    }

    const current = readLocalDB();
    current.users.push(newUser);
    await writeLocalDB(current);
    return newUser;
  },

  async getSocialAccountById(id: string): Promise<SocialAccount | null> {
    return this.getSocialAccount(id);
  },

  async createPostGroup(userId?: string, label?: string): Promise<{ id: string; label?: string }> {
    return { id: crypto.randomUUID(), label: label || 'Post Group' };
  },

  // Social Accounts
  async getSocialAccounts(clientId?: string): Promise<SocialAccount[]> {
    if (supabase) {
      let q = supabase.from('social_accounts').select('*').order('created_at', { ascending: true });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) sbError('getSocialAccounts', error);
      return (data || []).map((acc) => ({
        ...acc,
        display_name: acc.external_account_name || acc.external_username || acc.external_account_id,
        access_token: acc.access_token_encrypted, // encrypted format
      }));
    }

    const accounts = readLocalDB().social_accounts;
    const filtered = clientId ? accounts.filter((a) => a.client_id === clientId) : accounts;
    return filtered.map((a) => ({
      ...a,
      display_name: a.display_name || a.external_account_name || a.external_username || a.external_account_id,
    }));
  },

  async getSocialAccount(id: string): Promise<SocialAccount | null> {
    if (supabase) {
      const { data, error } = await supabase.from('social_accounts').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getSocialAccount', error);
      if (!data) return null;
      return {
        ...data,
        display_name: data.external_account_name || data.external_username || data.external_account_id,
        access_token: data.access_token_encrypted,
      };
    }
    const acc = readLocalDB().social_accounts.find((a) => a.id === id);
    if (!acc) return null;
    return {
      ...acc,
      display_name: acc.display_name || acc.external_account_name || acc.external_username || acc.external_account_id,
    };
  },

  async upsertSocialAccount(data: Partial<SocialAccount>): Promise<SocialAccount> {
    const now = new Date().toISOString();
    const tokenRaw = data.access_token || data.access_token_encrypted || '';
    const encryptedToken = tokenRaw.includes(':') ? tokenRaw : encryptToken(tokenRaw);
    const refreshTokenRaw = data.refresh_token || data.refresh_token_encrypted;
    const encryptedRefreshToken = refreshTokenRaw
      ? refreshTokenRaw.includes(':')
        ? refreshTokenRaw
        : encryptToken(refreshTokenRaw)
      : null;

    const clientId = data.client_id || DEFAULT_CLIENT_ID;
    const displayName = data.display_name || data.external_account_name || data.external_account_id || 'Social Account';

    const accountRow: SocialAccount = {
      id: data.id || crypto.randomUUID(),
      client_id: clientId,
      platform: data.platform as PlatformType,
      external_account_id: data.external_account_id || `acc_${Date.now()}`,
      external_account_name: displayName,
      external_username: data.external_username || null,
      display_name: displayName,
      access_token_encrypted: encryptedToken,
      refresh_token_encrypted: encryptedRefreshToken,
      token_expires_at: data.token_expires_at || null,
      scopes: data.scopes || null,
      status: (data.status as any) || 'connected',
      connected_by: data.connected_by || null,
      created_at: data.created_at || now,
      updated_at: now,
    };

    if (supabase) {
      const { data: upserted, error } = await supabase
        .from('social_accounts')
        .upsert(
          {
            ...accountRow,
            display_name: undefined, // Computed column in schema
          },
          { onConflict: 'client_id,platform,external_account_id' }
        )
        .select()
        .single();

      if (error) sbError('upsertSocialAccount', error);
      return {
        ...upserted,
        display_name: upserted.external_account_name || upserted.external_account_id,
        access_token: upserted.access_token_encrypted,
      };
    }

    const current = readLocalDB();
    const idx = current.social_accounts.findIndex(
      (a) =>
        (a.id === accountRow.id) ||
        (a.client_id === accountRow.client_id &&
          a.platform === accountRow.platform &&
          a.external_account_id === accountRow.external_account_id)
    );

    if (idx >= 0) {
      current.social_accounts[idx] = { ...current.social_accounts[idx], ...accountRow, updated_at: now };
    } else {
      current.social_accounts.push(accountRow);
    }

    await writeLocalDB(current);
    return accountRow;
  },

  async createSocialAccount(data: Partial<SocialAccount>): Promise<SocialAccount> {
    return this.upsertSocialAccount(data);
  },

  async updateSocialAccount(id: string, data: Partial<SocialAccount>): Promise<SocialAccount> {
    return this.upsertSocialAccount({ id, ...data });
  },

  async deleteSocialAccount(id: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('social_accounts').delete().eq('id', id);
      if (error) sbError('deleteSocialAccount', error);
      return;
    }

    const current = readLocalDB();
    current.social_accounts = current.social_accounts.filter((a) => a.id !== id);
    current.posts = current.posts.filter((p) => p.social_account_id !== id);
    await writeLocalDB(current);
  },

  // OAuth States (docs/02-oauth-flows.md)
  async saveOAuthState(data: {
    state: string;
    user_id?: string;
    client_id: string;
    platform: PlatformType;
    expires_at: string;
  }): Promise<OAuthState> {
    const row: OAuthState = {
      id: crypto.randomUUID(),
      state: data.state,
      user_id: data.user_id || '00000000-0000-0000-0000-000000000002',
      client_id: data.client_id,
      platform: data.platform,
      expires_at: data.expires_at,
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      const { data: created, error } = await supabase.from('oauth_states').insert(row).select().single();
      if (error) sbError('saveOAuthState', error);
      return created;
    }

    const current = readLocalDB();
    if (!current.oauth_states) current.oauth_states = [];
    current.oauth_states.push(row);
    await writeLocalDB(current);
    return row;
  },

  async getOAuthState(state: string): Promise<OAuthState | null> {
    if (supabase) {
      const { data, error } = await supabase.from('oauth_states').select('*').eq('state', state).maybeSingle();
      if (error) sbError('getOAuthState', error);
      return data;
    }

    const current = readLocalDB();
    return (current.oauth_states || []).find((s) => s.state === state) || null;
  },

  async deleteOAuthState(state: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('oauth_states').delete().eq('state', state);
      if (error) sbError('deleteOAuthState', error);
      return;
    }

    const current = readLocalDB();
    if (current.oauth_states) {
      current.oauth_states = current.oauth_states.filter((s) => s.state !== state);
      await writeLocalDB(current);
    }
  },

  // Posts
  async getPosts(
    filter?: string | { status?: string; from?: string; to?: string; clientId?: string }
  ): Promise<Post[]> {
    const clientId = typeof filter === 'string' ? filter : filter?.clientId;
    const status = typeof filter === 'object' ? filter?.status : undefined;
    const from = typeof filter === 'object' ? filter?.from : undefined;
    const to = typeof filter === 'object' ? filter?.to : undefined;

    if (supabase) {
      let q = supabase.from('posts').select('*').order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      if (status && status !== 'all') q = q.eq('status', status);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);
      const { data, error } = await q;
      if (error) sbError('getPosts', error);
      return data || [];
    }

    let posts = readLocalDB().posts;
    if (clientId) posts = posts.filter((p) => p.client_id === clientId);
    if (status && status !== 'all') posts = posts.filter((p) => p.status === status);
    if (from) posts = posts.filter((p) => new Date(p.created_at).getTime() >= new Date(from).getTime());
    if (to) posts = posts.filter((p) => new Date(p.created_at).getTime() <= new Date(to).getTime());
    return posts;
  },

  async getPost(id: string): Promise<Post | null> {
    if (supabase) {
      const { data, error } = await supabase.from('posts').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getPost', error);
      return data;
    }

    return readLocalDB().posts.find((p) => p.id === id) || null;
  },

  async getPostById(id: string): Promise<Post | null> {
    return this.getPost(id);
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
      return data || [];
    }

    const posts = readLocalDB().posts;
    return posts.filter(
      (p) => p.status === 'scheduled' && p.scheduled_at && new Date(p.scheduled_at).getTime() <= Date.now()
    );
  },

  async createPost(data: Partial<Post>): Promise<Post> {
    const now = new Date().toISOString();
    const newPost: Post = {
      id: data.id || crypto.randomUUID(),
      client_id: data.client_id || DEFAULT_CLIENT_ID,
      social_account_id: data.social_account_id!,
      platform: data.platform!,
      content: data.content || '',
      media_urls: data.media_urls || null,
      scheduled_at: data.scheduled_at || now,
      status: data.status || 'scheduled',
      external_post_id: data.external_post_id || null,
      error_message: data.error_message || null,
      error_reason: data.error_reason || null,
      published_at: data.published_at || null,
      created_by: data.created_by || null,
      created_at: data.created_at || now,
      updated_at: now,
    };

    if (supabase) {
      const { data: created, error } = await supabase.from('posts').insert(newPost).select().single();
      if (error) sbError('createPost', error);
      return created;
    }

    const current = readLocalDB();
    current.posts.unshift(newPost);
    await writeLocalDB(current);
    return newPost;
  },

  async updatePost(id: string, data: Partial<Post>): Promise<Post> {
    const now = new Date().toISOString();
    const updates = { ...data, updated_at: now };

    if (supabase) {
      const { data: updated, error } = await supabase.from('posts').update(updates).eq('id', id).select().single();
      if (error) sbError('updatePost', error);
      return updated;
    }

    const current = readLocalDB();
    const idx = current.posts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Post ${id} not found`);

    current.posts[idx] = { ...current.posts[idx], ...updates };
    await writeLocalDB(current);
    return current.posts[idx];
  },

  async deletePost(id: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('posts').delete().eq('id', id);
      if (error) sbError('deletePost', error);
      return;
    }

    const current = readLocalDB();
    current.posts = current.posts.filter((p) => p.id !== id);
    current.post_metrics = current.post_metrics.filter((m) => m.post_id !== id);
    await writeLocalDB(current);
  },

  // Post Metrics
  async getPostMetrics(postId: string): Promise<PostMetric[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('post_metrics')
        .select('*')
        .eq('post_id', postId)
        .order('fetched_at', { ascending: false });
      if (error) sbError('getPostMetrics', error);
      return data || [];
    }

    return readLocalDB().post_metrics.filter((m) => m.post_id === postId);
  },

  async createPostMetric(data: Partial<PostMetric>): Promise<PostMetric> {
    const newMetric: PostMetric = {
      id: data.id || crypto.randomUUID(),
      post_id: data.post_id!,
      fetched_at: data.fetched_at || new Date().toISOString(),
      likes: data.likes || 0,
      comments: data.comments || 0,
      shares: data.shares || 0,
      impressions: data.impressions || 0,
    };

    if (supabase) {
      const { data: created, error } = await supabase.from('post_metrics').insert(newMetric).select().single();
      if (error) sbError('createPostMetric', error);
      return created;
    }

    const current = readLocalDB();
    current.post_metrics.unshift(newMetric);
    await writeLocalDB(current);
    return newMetric;
  },

  async getMetricsSummary(
    clientId?: string,
    platform?: string,
    from?: string,
    to?: string
  ): Promise<
    Array<{
      platform: PlatformType;
      total_likes: number;
      total_comments: number;
      total_shares: number;
      total_impressions: number;
    }>
  > {
    const posts = await this.getPosts(clientId);
    const postMap = new Map(posts.map((p) => [p.id, p]));

    let metrics: PostMetric[] = [];
    if (supabase) {
      let q = supabase.from('post_metrics').select('*');
      if (from) q = q.gte('fetched_at', from);
      if (to) q = q.lte('fetched_at', to);
      const { data, error } = await q;
      if (error) sbError('getMetricsSummary', error);
      metrics = data || [];
    } else {
      metrics = readLocalDB().post_metrics;
    }

    const platformTotals: Record<
      string,
      {
        platform: PlatformType;
        total_likes: number;
        total_comments: number;
        total_shares: number;
        total_impressions: number;
      }
    > = {
      linkedin: { platform: 'linkedin', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      facebook: { platform: 'facebook', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      instagram: { platform: 'instagram', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      google_business: {
        platform: 'google_business',
        total_likes: 0,
        total_comments: 0,
        total_shares: 0,
        total_impressions: 0,
      },
      x: { platform: 'x', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
    };

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
          platform: post.platform,
          total_likes: 0,
          total_comments: 0,
          total_shares: 0,
          total_impressions: 0,
        };
      }

      platformTotals[post.platform].total_likes += metric.likes || 0;
      platformTotals[post.platform].total_comments += metric.comments || 0;
      platformTotals[post.platform].total_shares += metric.shares || 0;
      platformTotals[post.platform].total_impressions += metric.impressions || 0;
    }

    if (platform) {
      return [
        platformTotals[platform] || {
          platform: platform as PlatformType,
          total_likes: 0,
          total_comments: 0,
          total_shares: 0,
          total_impressions: 0,
        },
      ];
    }

    return Object.values(platformTotals);
  },
};
