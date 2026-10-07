import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  Organization,
  Workspace,
  WorkspaceMember,
  User,
  Client,
  SocialAccount,
  SocialAccountStatus,
  OAuthState,
  Post,
  PostVariant,
  Approval,
  MediaAsset,
  PublishJob,
  PublishAttempt,
  PublishJobStatus,
  ContentLibrary,
  LibraryPost,
  RecurringSchedule,
  AppNotification,
  InboxConversation,
  InboxMessage,
  PostMetric,
  PlatformType,
  PostStatus,
  UserRole,
  ErrorCategory,
  ClientMember,
  AuditLog,
} from './types/index.js';
import { encryptToken, decryptToken } from './crypto.js';

// ---------------------------------------------------------------------------
// Supabase Client
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (supabase) {
  console.log('✅ db: Using Supabase Postgres for persistence');
} else {
  console.warn('⚠️  db: Supabase not configured — using multi-tenant zero-config local store');
}

// ---------------------------------------------------------------------------
// Local JSON Store (fallback / zero-config mode)
// ---------------------------------------------------------------------------
const DATA_DIR = fs.existsSync(path.join(process.cwd(), 'backend', 'data'))
  ? path.join(process.cwd(), 'backend', 'data')
  : fs.existsSync(path.join(process.cwd(), 'data'))
  ? path.join(process.cwd(), 'data')
  : fs.existsSync(path.join(process.cwd(), '..', 'data'))
  ? path.join(process.cwd(), '..', 'data')
  : path.join(process.cwd(), 'data');

const DB_FILE = path.join(DATA_DIR, 'store.json');

export interface LocalDB {
  organizations: Organization[];
  workspace_members: WorkspaceMember[];
  users: User[];
  clients: Client[];
  social_accounts: SocialAccount[];
  oauth_states: OAuthState[];
  media_assets: MediaAsset[];
  posts: Post[];
  post_variants: PostVariant[];
  approvals: Approval[];
  publish_jobs: PublishJob[];
  publish_attempts: PublishAttempt[];
  content_libraries: ContentLibrary[];
  library_posts: LibraryPost[];
  recurring_schedules: RecurringSchedule[];
  notifications: AppNotification[];
  inbox_conversations: InboxConversation[];
  inbox_messages: InboxMessage[];
  post_metrics: PostMetric[];
  client_members: ClientMember[];
  audit_logs: AuditLog[];
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

  const workspace_members: WorkspaceMember[] = [
    {
      id: crypto.randomUUID(),
      workspace_id: DEFAULT_ORG_ID,
      user_id: adminId,
      role: 'owner',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 60).toISOString(),
    },
  ];

  const clients: Client[] = [
    {
      id: DEFAULT_CLIENT_ID,
      organization_id: DEFAULT_ORG_ID,
      name: 'Apex Fitness',
      timezone: 'America/New_York',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    },
    {
      id: SECOND_CLIENT_ID,
      organization_id: DEFAULT_ORG_ID,
      name: 'Lumina Cafe',
      timezone: 'Europe/London',
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
      platform_account_id: 'urn:li:organization:98214',
      display_name: 'Apex Fitness • Official LinkedIn',
      username: 'apexfitness',
      encrypted_access_token: encryptToken('mock_li_token_valid'),
      encrypted_refresh_token: encryptToken('mock_li_refresh_valid'),
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      status: 'CONNECTED',
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      last_verified_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      
      // Legacy fields for backward compatibility
      external_account_id: 'urn:li:organization:98214',
      external_account_name: 'Apex Fitness • Official LinkedIn',
      access_token_encrypted: encryptToken('mock_li_token_valid'),
      refresh_token_encrypted: encryptToken('mock_li_refresh_valid'),
      timezone: 'America/New_York',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    },
    {
      id: accFbId,
      client_id: DEFAULT_CLIENT_ID,
      platform: 'facebook',
      platform_account_id: 'fb_page_109283741',
      display_name: 'Apex Fitness Facebook Page',
      username: 'apexfitness',
      encrypted_access_token: encryptToken('mock_fb_token_valid'),
      encrypted_refresh_token: undefined,
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 50).toISOString(),
      status: 'CONNECTED',
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
      last_verified_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      
      // Legacy fields
      external_account_id: 'fb_page_109283741',
      external_account_name: 'Apex Fitness Facebook Page',
      access_token_encrypted: encryptToken('mock_fb_token_valid'),
      refresh_token_encrypted: undefined,
      timezone: 'America/New_York',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
    },
    {
      id: accIgId,
      client_id: DEFAULT_CLIENT_ID,
      platform: 'instagram',
      platform_account_id: 'ig_usr_591820491',
      display_name: '@apex.fitness (Instagram)',
      username: 'apex.fitness',
      encrypted_access_token: encryptToken('mock_ig_token_valid'),
      encrypted_refresh_token: undefined,
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 50).toISOString(),
      status: 'CONNECTED',
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
      last_verified_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      
      // Legacy fields
      external_account_id: 'ig_usr_591820491',
      external_account_name: '@apex.fitness (Instagram)',
      access_token_encrypted: encryptToken('mock_ig_token_valid'),
      refresh_token_encrypted: undefined,
      timezone: 'America/New_York',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
    },
    {
      id: accGbpId,
      client_id: DEFAULT_CLIENT_ID,
      platform: 'google_business',
      platform_account_id: 'accounts/109283749281/locations/48192049281',
      display_name: 'Apex Fitness Downtown — Google Profile',
      encrypted_access_token: encryptToken('mock_gbp_token_valid'),
      encrypted_refresh_token: encryptToken('mock_gbp_refresh_valid'),
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 28).toISOString(),
      status: 'CONNECTED',
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14).toISOString(),
      last_verified_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      
      // Legacy fields
      external_account_id: 'accounts/109283749281/locations/48192049281',
      external_account_name: 'Apex Fitness Downtown — Google Profile',
      access_token_encrypted: encryptToken('mock_gbp_token_valid'),
      refresh_token_encrypted: encryptToken('mock_gbp_refresh_valid'),
      timezone: 'America/New_York',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    },
    {
      id: accXId,
      client_id: DEFAULT_CLIENT_ID,
      platform: 'x',
      platform_account_id: 'x_usr_998124',
      display_name: '@ApexFitnessHQ (X)',
      username: 'ApexFitnessHQ',
      encrypted_access_token: encryptToken('mock_x_token_valid'),
      encrypted_refresh_token: encryptToken('mock_x_refresh_valid'),
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 80).toISOString(),
      status: 'CONNECTED',
      connected_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      updated_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      last_verified_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      
      // Legacy fields
      external_account_id: 'x_usr_998124',
      external_account_name: '@ApexFitnessHQ (X)',
      access_token_encrypted: encryptToken('mock_x_token_valid'),
      refresh_token_encrypted: encryptToken('mock_x_refresh_valid'),
      timezone: 'America/New_York',
      created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString(),
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
      platform_post_id: 'urn:li:share:718294819284102',
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
    workspace_members,
    users,
    clients,
    social_accounts,
    oauth_states: [],
    media_assets: [],
    posts,
    post_variants: [],
    approvals: [],
    publish_jobs: [],
    publish_attempts: [],
    content_libraries: [],
    library_posts: [],
    recurring_schedules: [],
    notifications: [],
    inbox_conversations: [],
    inbox_messages: [],
    post_metrics,
    client_members: [],
    audit_logs: [],
  };
}

function readLocalDB(): LocalDB {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const initial = getInitialData();
      return {
        ...initial,
        ...parsed,
        workspace_members: parsed.workspace_members || initial.workspace_members,
        post_variants: parsed.post_variants || [],
        approvals: parsed.approvals || [],
        media_assets: parsed.media_assets || [],
        publish_jobs: parsed.publish_jobs || [],
        publish_attempts: parsed.publish_attempts || [],
        content_libraries: parsed.content_libraries || [],
        library_posts: parsed.library_posts || [],
        recurring_schedules: parsed.recurring_schedules || [],
        notifications: parsed.notifications || [],
        inbox_conversations: parsed.inbox_conversations || [],
        inbox_messages: parsed.inbox_messages || [],
        client_members: parsed.client_members || [],
        audit_logs: parsed.audit_logs || [],
        social_accounts: (parsed.social_accounts && parsed.social_accounts.length > 0) ? parsed.social_accounts : initial.social_accounts,
      };
    }
  } catch (err) {
    console.error('Failed to read local DB, initializing defaults:', err);
  }

  const initial = getInitialData();
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  } catch (_) {}

  return initial;
}

async function writeLocalDB(data: LocalDB): Promise<void> {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (_) {}
}

function sbError(context: string, error: any) {
  throw new Error(`[Supabase ${context}] ${error.message || JSON.stringify(error)}`);
}

// ---------------------------------------------------------------------------
// DB Service Interface & Implementation
// ---------------------------------------------------------------------------
export const db = {
  // Organizations / Workspaces
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

  async createOrganization(data: Partial<Organization>): Promise<Organization> {
    const newOrg: Organization = {
      id: data.id || crypto.randomUUID(),
      name: data.name || 'New Agency Workspace',
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('organizations').insert(newOrg).select().single();
      if (error) sbError('createOrganization', error);
      return created;
    }
    const current = readLocalDB();
    current.organizations.push(newOrg);
    await writeLocalDB(current);
    return newOrg;
  },

  // Workspace Members & RBAC
  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    if (supabase) {
      const { data, error } = await supabase.from('workspace_members').select('*').eq('workspace_id', workspaceId);
      if (error) sbError('getWorkspaceMembers', error);
      return data || [];
    }
    return (readLocalDB().workspace_members || []).filter((m) => m.workspace_id === workspaceId);
  },

  async addWorkspaceMember(data: { workspace_id: string; user_id: string; role: UserRole }): Promise<WorkspaceMember> {
    const member: WorkspaceMember = {
      id: crypto.randomUUID(),
      workspace_id: data.workspace_id,
      user_id: data.user_id,
      role: data.role,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('workspace_members').upsert(member).select().single();
      if (error) sbError('addWorkspaceMember', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.workspace_members) current.workspace_members = [];
    current.workspace_members.push(member);
    await writeLocalDB(current);
    return member;
  },

  /**
   * Returns the first workspace membership for a given user.
   * workspace_id is aliased as organization_id in this codebase (Workspace = Organization).
   */
  async getMembershipByUserId(userId: string): Promise<WorkspaceMember | null> {
    if (supabase) {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      if (error) sbError('getMembershipByUserId', error);
      return data ?? null;
    }
    const members = readLocalDB().workspace_members || [];
    return members.find((m) => m.user_id === userId) ?? null;
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
      timezone: data.timezone || 'UTC',
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

  async updateClient(id: string, patch: Partial<Client>): Promise<Client> {
    if (supabase) {
      const { data, error } = await supabase.from('clients').update(patch).eq('id', id).select().single();
      if (error) sbError('updateClient', error);
      return data;
    }
    const current = readLocalDB();
    const idx = current.clients.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Client ${id} not found`);
    current.clients[idx] = { ...current.clients[idx], ...patch };
    await writeLocalDB(current);
    return current.clients[idx];
  },

  async deleteClient(id: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) sbError('deleteClient', error);
      return;
    }
    const current = readLocalDB();
    current.clients = current.clients.filter((c) => c.id !== id);
    current.social_accounts = current.social_accounts.filter((a) => a.client_id !== id);
    current.posts = current.posts.filter((p) => p.client_id !== id);
    await writeLocalDB(current);
  },

  // Users
  async getUsers(): Promise<User[]> {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*');
      if (error) sbError('getUsers', error);
      return data || [];
    }
    return readLocalDB().users;
  },

  async getUser(id: string): Promise<User | null> {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getUser', error);
      return data;
    }
    return readLocalDB().users.find((u) => u.id === id) || null;
  },

  async getUserById(id: string): Promise<User | null> {
    return this.getUser(id);
  },

  async getUserByEmail(email: string): Promise<User | null> {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      if (error) sbError('getUserByEmail', error);
      return data;
    }
    return readLocalDB().users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
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

  async updateUser(id: string, patch: Partial<User>): Promise<User> {
    if (supabase) {
      const { data, error } = await supabase.from('users').update(patch).eq('id', id).select().single();
      if (error) sbError('updateUser', error);
      return data;
    }
    const current = readLocalDB();
    const idx = current.users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error(`User ${id} not found`);
    current.users[idx] = { ...current.users[idx], ...patch };
    await writeLocalDB(current);
    return current.users[idx];
  },

  // Social Accounts
  async getSocialAccounts(clientId?: string): Promise<SocialAccount[]> {
    if (supabase) {
      let q = supabase.from('social_accounts').select('*').order('connected_at', { ascending: true });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) sbError('getSocialAccounts', error);
      return (data || []).map((acc) => this.normalizeSocialAccount(acc));
    }

    const accounts = readLocalDB().social_accounts;
    const filtered = clientId ? accounts.filter((a) => a.client_id === clientId) : accounts;
    return filtered.map((a) => this.normalizeSocialAccount(a));
  },

  async getSocialAccount(id: string): Promise<SocialAccount | null> {
    if (supabase) {
      const { data, error } = await supabase.from('social_accounts').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getSocialAccount', error);
      if (!data) return null;
      return this.normalizeSocialAccount(data);
    }
    const acc = readLocalDB().social_accounts.find((a) => a.id === id);
    if (!acc) return null;
    return this.normalizeSocialAccount(acc);
  },

  async getSocialAccountById(id: string): Promise<SocialAccount | null> {
    return this.getSocialAccount(id);
  },

  /**
   * Normalize social account data to handle both old and new schema
   * Maps legacy field names to new field names for backward compatibility
   */
  normalizeSocialAccount(acc: any): SocialAccount {
    const normalized: SocialAccount = {
      id: acc.id,
      client_id: acc.client_id,
      platform: acc.platform,
      platform_account_id: acc.platform_account_id || acc.external_account_id,
      display_name: acc.display_name || acc.external_account_name || acc.external_account_id,
      username: acc.username || acc.external_username,
      profile_image_url: acc.profile_image_url,
      encrypted_access_token: acc.encrypted_access_token || acc.access_token_encrypted,
      encrypted_refresh_token: acc.encrypted_refresh_token || acc.refresh_token_encrypted,
      token_expires_at: acc.token_expires_at,
      status: this.normalizeStatus(acc.status),
      metadata: acc.metadata,
      connected_at: acc.connected_at || acc.created_at,
      updated_at: acc.updated_at,
      last_verified_at: acc.last_verified_at || acc.last_synced_at,
      
      // Legacy field aliases for backward compatibility
      external_account_id: acc.platform_account_id || acc.external_account_id,
      external_account_name: acc.display_name || acc.external_account_name,
      external_username: acc.username || acc.external_username,
      access_token_encrypted: acc.encrypted_access_token || acc.access_token_encrypted,
      refresh_token_encrypted: acc.encrypted_refresh_token || acc.refresh_token_encrypted,
      timezone: acc.timezone,
      last_synced_at: acc.last_synced_at || acc.last_verified_at,
      last_error: acc.last_error,
      error_category: acc.error_category,
      connected_by: acc.connected_by,
      scopes: acc.scopes,
      created_at: acc.created_at || acc.connected_at,
    };

    // Never include decrypted tokens in normalized account
    return normalized;
  },

  /**
   * Normalize status values to uppercase
   */
  normalizeStatus(status: string): SocialAccountStatus {
    if (!status) return 'CONNECTED';
    const upper = status.toUpperCase();
    const validStatuses: SocialAccountStatus[] = ['CONNECTED', 'TOKEN_EXPIRING', 'TOKEN_EXPIRED', 'DISCONNECTED', 'REAUTH_REQUIRED', 'ERROR'];
    if (validStatuses.includes(upper as SocialAccountStatus)) {
      return upper as SocialAccountStatus;
    }
    // Legacy status mapping
    const legacyMap: Record<string, SocialAccountStatus> = {
      'connected': 'CONNECTED',
      'expired': 'TOKEN_EXPIRED',
      'revoked': 'DISCONNECTED',
      'needs_reconnect': 'REAUTH_REQUIRED',
    };
    return legacyMap[status.toLowerCase()] || 'CONNECTED';
  },

  async upsertSocialAccount(data: Partial<SocialAccount>): Promise<SocialAccount> {
    const now = new Date().toISOString();
    const localState = supabase ? null : readLocalDB();
    
    // Check for existing account using new schema or legacy schema
    const platformAccountId = data.platform_account_id || data.external_account_id;
    const existing = localState
      ? localState.social_accounts.find(
          (a) =>
            (data.id && a.id === data.id) ||
            (data.client_id &&
              data.platform &&
              platformAccountId &&
              a.client_id === data.client_id &&
              a.platform === data.platform &&
              (a.platform_account_id === platformAccountId || a.external_account_id === platformAccountId))
        )
      : null;

    // Handle token encryption
    const tokenRaw = data.access_token || data.encrypted_access_token || data.access_token_encrypted;
    const encryptedToken = tokenRaw
      ? (tokenRaw.includes(':') ? tokenRaw : encryptToken(tokenRaw))
      : (existing?.encrypted_access_token || existing?.access_token_encrypted || '');

    const refreshTokenRaw = data.refresh_token || data.encrypted_refresh_token || data.refresh_token_encrypted;
    let encryptedRefreshToken: string | null = null;
    if (refreshTokenRaw !== undefined) {
      encryptedRefreshToken = refreshTokenRaw
        ? (refreshTokenRaw.includes(':') ? refreshTokenRaw : encryptToken(refreshTokenRaw))
        : null;
    } else if (existing) {
      encryptedRefreshToken = existing.encrypted_refresh_token || existing.refresh_token_encrypted || null;
    }

    const clientId = data.client_id || existing?.client_id || DEFAULT_CLIENT_ID;
    const displayName = data.display_name || data.external_account_name || platformAccountId || existing?.display_name || 'Social Account';

    // Build account row with new schema
    const accountRow: any = {
      id: data.id || existing?.id || crypto.randomUUID(),
      client_id: clientId,
      platform: (data.platform || existing?.platform) as PlatformType,
      platform_account_id: platformAccountId || existing?.platform_account_id || existing?.external_account_id || `acc_${Date.now()}`,
      display_name: displayName,
      username: data.username !== undefined ? data.username : (existing?.username || existing?.external_username || null),
      profile_image_url: data.profile_image_url || existing?.profile_image_url,
      encrypted_access_token: encryptedToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: data.token_expires_at !== undefined ? data.token_expires_at : (existing?.token_expires_at || null),
      status: this.normalizeStatus(data.status as any || existing?.status || 'CONNECTED'),
      metadata: data.metadata || existing?.metadata || null,
      connected_at: existing?.connected_at || existing?.created_at || data.created_at || now,
      updated_at: now,
      last_verified_at: data.last_verified_at || existing?.last_verified_at || existing?.last_synced_at || null,
      
      // Legacy fields for backward compatibility (will be stored but not used in new schema)
      external_account_id: platformAccountId || existing?.external_account_id,
      external_account_name: displayName,
      external_username: data.username || existing?.external_username,
      access_token_encrypted: encryptedToken,
      refresh_token_encrypted: encryptedRefreshToken,
      timezone: data.timezone || existing?.timezone || 'UTC',
      last_synced_at: data.last_synced_at || existing?.last_synced_at,
      last_error: data.last_error !== undefined ? data.last_error : (existing?.last_error || null),
      error_category: data.error_category !== undefined ? data.error_category : (existing?.error_category || null),
      connected_by: data.connected_by || existing?.connected_by || null,
      scopes: data.scopes || existing?.scopes || null,
      created_at: existing?.created_at || data.created_at || now,
    };

    if (supabase) {
      // For Supabase, use new schema field names
      const supabaseRow = {
        id: accountRow.id,
        client_id: accountRow.client_id,
        platform: accountRow.platform,
        platform_account_id: accountRow.platform_account_id,
        display_name: accountRow.display_name,
        username: accountRow.username,
        profile_image_url: accountRow.profile_image_url,
        encrypted_access_token: accountRow.encrypted_access_token,
        encrypted_refresh_token: accountRow.encrypted_refresh_token,
        token_expires_at: accountRow.token_expires_at,
        status: accountRow.status,
        metadata: accountRow.metadata,
        connected_at: accountRow.connected_at,
        updated_at: accountRow.updated_at,
        last_verified_at: accountRow.last_verified_at,
      };

      const { data: upserted, error } = await supabase
        .from('social_accounts')
        .upsert(supabaseRow, { onConflict: 'client_id,platform,platform_account_id' })
        .select()
        .single();

      if (error) sbError('upsertSocialAccount', error);
      return this.normalizeSocialAccount(upserted);
    }

    const current = readLocalDB();
    const idx = current.social_accounts.findIndex(
      (a) =>
        a.id === accountRow.id ||
        (a.client_id === accountRow.client_id &&
          a.platform === accountRow.platform &&
          (a.platform_account_id === accountRow.platform_account_id || a.external_account_id === accountRow.platform_account_id))
    );

    if (idx >= 0) {
      current.social_accounts[idx] = { ...current.social_accounts[idx], ...accountRow, updated_at: now };
    } else {
      current.social_accounts.push(accountRow);
    }

    await writeLocalDB(current);
    return this.normalizeSocialAccount(accountRow);
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

  // OAuth States
  async saveOAuthState(data: {
    state: string;
    user_id?: string;
    client_id: string;
    platform: PlatformType;
    expires_at: string;
    code_verifier?: string;
    return_to?: string | null;
  }): Promise<OAuthState> {
    const row: OAuthState = {
      id: crypto.randomUUID(),
      state: data.state,
      user_id: data.user_id || '00000000-0000-0000-0000-000000000002',
      client_id: data.client_id,
      platform: data.platform,
      expires_at: data.expires_at,
      created_at: new Date().toISOString(),
      code_verifier: data.code_verifier || null,
      return_to: data.return_to || null,
    };

    if (supabase) {
      const { data: created, error } = await supabase.from('oauth_states').insert(row).select().single();
      if (error) sbError('saveOAuthState', error);
      return created;
    }

    const current = readLocalDB();
    if (!current.oauth_states) current.oauth_states = [];
    // Replace existing state if present (idempotent upsert for X PKCE re-save)
    const existingIdx = current.oauth_states.findIndex((s) => s.state === data.state);
    if (existingIdx >= 0) {
      current.oauth_states[existingIdx] = row;
    } else {
      current.oauth_states.push(row);
    }
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

  // Media Assets
  async getMediaAssets(clientId?: string): Promise<MediaAsset[]> {
    if (supabase) {
      let q = supabase.from('media_assets').select('*').order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) sbError('getMediaAssets', error);
      return data || [];
    }
    const current = readLocalDB();
    return clientId ? (current.media_assets || []).filter((m) => m.client_id === clientId) : current.media_assets || [];
  },

  async getMediaAsset(id: string): Promise<MediaAsset | null> {
    if (supabase) {
      const { data, error } = await supabase.from('media_assets').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getMediaAsset', error);
      return data;
    }
    return (readLocalDB().media_assets || []).find((m) => m.id === id) || null;
  },

  async createMediaAsset(data: Partial<MediaAsset>): Promise<MediaAsset> {
    const asset: MediaAsset = {
      id: data.id || crypto.randomUUID(),
      client_id: data.client_id || DEFAULT_CLIENT_ID,
      workspace_id: data.workspace_id || DEFAULT_ORG_ID,
      file_name: data.file_name || 'upload.jpg',
      mime_type: data.mime_type || 'image/jpeg',
      size: data.size || 0,
      width: data.width || null,
      height: data.height || null,
      duration: data.duration || null,
      storage_key: data.storage_key || `media/${Date.now()}`,
      url: data.url!,
      checksum: data.checksum || null,
      created_by: data.created_by || null,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('media_assets').insert(asset).select().single();
      if (error) sbError('createMediaAsset', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.media_assets) current.media_assets = [];
    current.media_assets.unshift(asset);
    await writeLocalDB(current);
    return asset;
  },

  async deleteMediaAsset(id: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('media_assets').delete().eq('id', id);
      if (error) sbError('deleteMediaAsset', error);
      return;
    }
    const current = readLocalDB();
    current.media_assets = (current.media_assets || []).filter((m) => m.id !== id);
    await writeLocalDB(current);
  },

  // Posts
  async createPostGroup(userId?: string, label?: string): Promise<{ id: string; label?: string }> {
    return { id: crypto.randomUUID(), label: label || 'Post Group' };
  },

  async getPosts(
    filter?: string | { status?: string; from?: string; to?: string; clientId?: string; workspaceId?: string; platform?: string }
  ): Promise<Post[]> {
    const clientId = typeof filter === 'string' ? filter : filter?.clientId;
    const status = typeof filter === 'object' ? filter?.status : undefined;
    const from = typeof filter === 'object' ? filter?.from : undefined;
    const to = typeof filter === 'object' ? filter?.to : undefined;
    const platform = typeof filter === 'object' ? filter?.platform : undefined;

    if (supabase) {
      let q = supabase.from('posts').select('*').order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      if (status && status !== 'all') q = q.eq('status', status);
      if (platform) q = q.eq('platform', platform);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);
      const { data, error } = await q;
      if (error) sbError('getPosts', error);
      return data || [];
    }

    let posts = readLocalDB().posts;
    if (clientId) posts = posts.filter((p) => p.client_id === clientId);
    if (status && status !== 'all') {
      const lower = status.toLowerCase();
      posts = posts.filter((p) => p.status.toLowerCase() === lower);
    }
    if (platform) posts = posts.filter((p) => p.platform === platform);
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
        .in('status', ['scheduled', 'SCHEDULED'])
        .lte('scheduled_at', nowIso);
      if (error) sbError('getDueScheduledPosts', error);
      return data || [];
    }

    const posts = readLocalDB().posts;
    return posts.filter(
      (p) =>
        (p.status.toLowerCase() === 'scheduled') &&
        p.scheduled_at &&
        new Date(p.scheduled_at).getTime() <= Date.now()
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
      scheduled_at: data.scheduled_at || null,
      status: (data.status as any) || 'scheduled',
      campaign_label: data.campaign_label || null,
      timezone: data.timezone || 'UTC',
      external_post_id: data.external_post_id || null,
      platform_post_id: data.platform_post_id || null,
      post_group_id: data.post_group_id || null,
      error_message: data.error_message || null,
      error_reason: data.error_reason || null,
      error_category: data.error_category || null,
      approved_by: data.approved_by || null,
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
    current.post_variants = (current.post_variants || []).filter((v) => v.post_id !== id);
    current.approvals = (current.approvals || []).filter((a) => a.post_id !== id);
    current.publish_jobs = (current.publish_jobs || []).filter((j) => j.post_id !== id);
    await writeLocalDB(current);
  },

  // Post Variants
  async getPostVariants(postId: string): Promise<PostVariant[]> {
    if (supabase) {
      const { data, error } = await supabase.from('post_variants').select('*').eq('post_id', postId);
      if (error) sbError('getPostVariants', error);
      return data || [];
    }
    return (readLocalDB().post_variants || []).filter((v) => v.post_id === postId);
  },

  async createPostVariant(data: Partial<PostVariant>): Promise<PostVariant> {
    const now = new Date().toISOString();
    const variant: PostVariant = {
      id: data.id || crypto.randomUUID(),
      post_id: data.post_id!,
      social_account_id: data.social_account_id!,
      platform: data.platform!,
      content: data.content || '',
      media_urls: data.media_urls || null,
      hashtags: data.hashtags || null,
      mentions: data.mentions || null,
      link: data.link || null,
      title: data.title || null,
      description: data.description || null,
      first_comment: data.first_comment || null,
      platform_specific_fields: data.platform_specific_fields || null,
      status: (data.status as any) || 'scheduled',
      external_post_id: data.external_post_id || null,
      error_message: data.error_message || null,
      error_category: data.error_category || null,
      created_at: now,
      updated_at: now,
    };

    if (supabase) {
      const { data: created, error } = await supabase.from('post_variants').insert(variant).select().single();
      if (error) sbError('createPostVariant', error);
      return created;
    }

    const current = readLocalDB();
    if (!current.post_variants) current.post_variants = [];
    current.post_variants.push(variant);
    await writeLocalDB(current);
    return variant;
  },

  async updatePostVariant(id: string, patch: Partial<PostVariant>): Promise<PostVariant> {
    const now = new Date().toISOString();
    if (supabase) {
      const { data, error } = await supabase.from('post_variants').update({ ...patch, updated_at: now }).eq('id', id).select().single();
      if (error) sbError('updatePostVariant', error);
      return data;
    }
    const current = readLocalDB();
    const idx = (current.post_variants || []).findIndex((v) => v.id === id);
    if (idx === -1) throw new Error(`PostVariant ${id} not found`);
    current.post_variants[idx] = { ...current.post_variants[idx], ...patch, updated_at: now };
    await writeLocalDB(current);
    return current.post_variants[idx];
  },

  async getPostVariantById(id: string): Promise<PostVariant | null> {
    if (supabase) {
      const { data, error } = await supabase.from('post_variants').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getPostVariantById', error);
      return data;
    }
    return (readLocalDB().post_variants || []).find((v) => v.id === id) || null;
  },

  async deletePostVariant(id: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('post_variants').delete().eq('id', id);
      if (error) sbError('deletePostVariant', error);
      return;
    }
    const current = readLocalDB();
    current.post_variants = (current.post_variants || []).filter((v) => v.id !== id);
    await writeLocalDB(current);
  },

  // Approvals
  async getApprovals(postId?: string): Promise<Approval[]> {
    if (supabase) {
      let q = supabase.from('approvals').select('*').order('created_at', { ascending: false });
      if (postId) q = q.eq('post_id', postId);
      const { data, error } = await q;
      if (error) sbError('getApprovals', error);
      return data || [];
    }
    const apps = readLocalDB().approvals || [];
    return postId ? apps.filter((a) => a.post_id === postId) : apps;
  },

  async getApproval(id: string): Promise<Approval | null> {
    if (supabase) {
      const { data, error } = await supabase.from('approvals').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getApproval', error);
      return data;
    }
    return (readLocalDB().approvals || []).find((a) => a.id === id) || null;
  },

  async getApprovalByToken(shareToken: string): Promise<Approval | null> {
    if (supabase) {
      const { data, error } = await supabase.from('approvals').select('*').eq('share_token', shareToken).maybeSingle();
      if (error) sbError('getApprovalByToken', error);
      return data;
    }
    return (readLocalDB().approvals || []).find((a) => a.share_token === shareToken) || null;
  },

  async createApproval(data: Partial<Approval>): Promise<Approval> {
    const now = new Date().toISOString();
    const approval: Approval = {
      id: data.id || crypto.randomUUID(),
      post_id: data.post_id!,
      client_id: data.client_id || DEFAULT_CLIENT_ID,
      approver_id: data.approver_id || null,
      approver_name: data.approver_name || null,
      status: data.status || 'PENDING',
      comment: data.comment || null,
      share_token: data.share_token || crypto.randomBytes(20).toString('hex'),
      created_at: now,
      updated_at: now,
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('approvals').insert(approval).select().single();
      if (error) sbError('createApproval', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.approvals) current.approvals = [];
    current.approvals.unshift(approval);
    await writeLocalDB(current);
    return approval;
  },

  async updateApproval(id: string, patch: Partial<Approval>): Promise<Approval> {
    const now = new Date().toISOString();
    if (supabase) {
      const { data, error } = await supabase.from('approvals').update({ ...patch, updated_at: now }).eq('id', id).select().single();
      if (error) sbError('updateApproval', error);
      return data;
    }
    const current = readLocalDB();
    const idx = (current.approvals || []).findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Approval ${id} not found`);
    current.approvals[idx] = { ...current.approvals[idx], ...patch, updated_at: now };
    await writeLocalDB(current);
    return current.approvals[idx];
  },

  // Valid state transitions for PublishJob state machine (§4, §21)
  VALID_JOB_TRANSITIONS: {
    SCHEDULED: ['PROCESSING', 'CANCELLED', 'SCHEDULED'],
    QUEUED: ['PROCESSING', 'CANCELLED', 'SCHEDULED'],
    PROCESSING: ['PUBLISHED', 'COMPLETED', 'FAILED', 'RETRYING', 'SCHEDULED'],
    RETRYING: ['PROCESSING', 'CANCELLED', 'SCHEDULED'],
    FAILED: ['RETRYING', 'SCHEDULED', 'PROCESSING'], // manual retry
    PUBLISHED: [],
    COMPLETED: [],
    CANCELLED: ['SCHEDULED'],
  } as Record<string, string[]>,

  // Publishing Queue (PublishJob & PublishAttempt)
  async createPublishJob(data: Partial<PublishJob>): Promise<PublishJob> {
    const now = new Date().toISOString();
    const job: PublishJob = {
      id: data.id || crypto.randomUUID(),
      post_id: data.post_id!,
      variant_id: data.variant_id || null,
      client_id: data.client_id || DEFAULT_CLIENT_ID,
      social_account_id: data.social_account_id!,
      platform: data.platform!,
      scheduled_at: data.scheduled_at || now,
      status: (data.status as PublishJobStatus) || 'SCHEDULED',
      idempotency_key: data.idempotency_key || `job_${data.post_id}_${data.variant_id || data.social_account_id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      attempt_count: data.attempt_count || 0,
      max_attempts: data.max_attempts || 3,
      locked_at: data.locked_at || null,
      locked_by: data.locked_by || null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: now,
      updated_at: now,
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('publish_jobs').insert(job).select().single();
      if (error) sbError('createPublishJob', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.publish_jobs) current.publish_jobs = [];
    current.publish_jobs.push(job);
    await writeLocalDB(current);
    return job;
  },

  /**
   * Transactional batch creation of publish jobs (§6)
   * Rolls back if any job cannot be created or has a duplicate idempotency key.
   */
  async createPublishJobsTransaction(jobsData: Partial<PublishJob>[]): Promise<PublishJob[]> {
    if (!jobsData || jobsData.length === 0) return [];
    const now = new Date().toISOString();

    const jobsToInsert: PublishJob[] = jobsData.map((data) => ({
      id: data.id || crypto.randomUUID(),
      post_id: data.post_id!,
      variant_id: data.variant_id || null,
      client_id: data.client_id || DEFAULT_CLIENT_ID,
      social_account_id: data.social_account_id!,
      platform: data.platform!,
      scheduled_at: data.scheduled_at || now,
      status: (data.status as PublishJobStatus) || 'SCHEDULED',
      idempotency_key: data.idempotency_key || `job_${data.post_id}_${data.variant_id || data.social_account_id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      attempt_count: data.attempt_count || 0,
      max_attempts: data.max_attempts || 3,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
      next_retry_at: null,
      last_error: null,
      error_category: null,
      created_at: now,
      updated_at: now,
    }));

    if (supabase) {
      const { data: created, error } = await supabase.from('publish_jobs').insert(jobsToInsert).select();
      if (error) sbError('createPublishJobsTransaction', error);
      return created || [];
    }

    const current = readLocalDB();
    if (!current.publish_jobs) current.publish_jobs = [];

    // Verify uniqueness of idempotency keys before inserting
    const existingKeys = new Set(current.publish_jobs.map((j) => j.idempotency_key));
    for (const job of jobsToInsert) {
      if (existingKeys.has(job.idempotency_key)) {
        throw new Error(`Duplicate publish job idempotency key: '${job.idempotency_key}'`);
      }
      existingKeys.add(job.idempotency_key);
    }

    current.publish_jobs.push(...jobsToInsert);
    await writeLocalDB(current);
    return jobsToInsert;
  },

  async getDuePublishJobs(): Promise<PublishJob[]> {
    const nowIso = new Date().toISOString();
    if (supabase) {
      const { data, error } = await supabase
        .from('publish_jobs')
        .select('*')
        .in('status', ['SCHEDULED', 'RETRYING'])
        .lte('scheduled_at', nowIso)
        .is('locked_at', null)
        .order('scheduled_at', { ascending: true });
      if (error) sbError('getDuePublishJobs', error);
      return data || [];
    }
    const now = Date.now();
    return (readLocalDB().publish_jobs || [])
      .filter(
        (j) =>
          (j.status === 'SCHEDULED' || j.status === 'RETRYING') &&
          !j.locked_at &&
          new Date(j.scheduled_at).getTime() <= now &&
          (!j.next_retry_at || new Date(j.next_retry_at).getTime() <= now)
      )
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  },

  /**
   * Stale Job Recovery (§12)
   * Detects and resets jobs stuck in PROCESSING where locked_at is older than staleThresholdMs.
   */
  async recoverStaleJobs(staleThresholdMs: number = 300_000): Promise<{ recoveredCount: number; recoveredIds: string[] }> {
    const now = Date.now();
    const staleCutoffIso = new Date(now - staleThresholdMs).toISOString();

    if (supabase) {
      const { data: staleJobs, error: findError } = await supabase
        .from('publish_jobs')
        .select('*')
        .eq('status', 'PROCESSING')
        .not('locked_at', 'is', null)
        .lt('locked_at', staleCutoffIso);

      if (findError || !staleJobs || staleJobs.length === 0) {
        return { recoveredCount: 0, recoveredIds: [] };
      }

      const recoveredIds: string[] = [];
      for (const job of staleJobs) {
        const { error: updateError } = await supabase
          .from('publish_jobs')
          .update({
            status: 'RETRYING',
            locked_at: null,
            locked_by: null,
            last_error: `Worker lock timed out after ${Math.floor(staleThresholdMs / 1000)}s - recovered by watchdog`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        if (!updateError) recoveredIds.push(job.id);
      }

      return { recoveredCount: recoveredIds.length, recoveredIds };
    }

    const current = readLocalDB();
    const cutoffTime = now - staleThresholdMs;
    const recoveredIds: string[] = [];

    for (let i = 0; i < (current.publish_jobs || []).length; i++) {
      const job = current.publish_jobs[i];
      if (
        job.status === 'PROCESSING' &&
        job.locked_at &&
        new Date(job.locked_at).getTime() < cutoffTime
      ) {
        current.publish_jobs[i] = {
          ...job,
          status: 'RETRYING',
          locked_at: null,
          locked_by: null,
          last_error: `Worker lock timed out after ${Math.floor(staleThresholdMs / 1000)}s - recovered by watchdog`,
          updated_at: new Date().toISOString(),
        };
        recoveredIds.push(job.id);
      }
    }

    if (recoveredIds.length > 0) {
      await writeLocalDB(current);
    }

    return { recoveredCount: recoveredIds.length, recoveredIds };
  },

  /**
   * Atomically claim a due publish job using PostgreSQL row-level locking.
   * Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent race conditions between workers.
   * Incorporates stale lock recovery for crashed workers (§10, §12).
   */
  async claimPublishJob(workerId: string, staleThresholdMs: number = 300_000): Promise<PublishJob | null> {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const staleCutoffMs = nowMs - staleThresholdMs;

    if (supabase) {
      const { data: claimedJob, error: selectError } = await supabase.rpc('claim_publish_job', {
        p_worker_id: workerId,
        p_now: nowIso,
        p_stale_threshold_seconds: Math.floor(staleThresholdMs / 1000),
      });

      if (!selectError && claimedJob) {
        return Array.isArray(claimedJob) ? claimedJob[0] || null : claimedJob;
      }

      // Fallback if RPC function is not deployed:
      const staleCutoffIso = new Date(staleCutoffMs).toISOString();
      const { data: candidate, error: candError } = await supabase
        .from('publish_jobs')
        .select('*')
        .or(`and(status.in.(SCHEDULED,RETRYING),locked_at.is.null),and(status.eq.PROCESSING,locked_at.lt.${staleCutoffIso})`)
        .lte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (candError || !candidate) return null;

      const { data: updated, error: updateError } = await supabase
        .from('publish_jobs')
        .update({
          status: 'PROCESSING',
          locked_at: nowIso,
          locked_by: workerId,
          started_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', candidate.id)
        .select()
        .maybeSingle();

      if (updateError || !updated) return null;
      return updated;
    }

    // Local DB fallback: simulate atomic claim with check-and-set and stale recovery
    const current = readLocalDB();
    const eligibleJobs = (current.publish_jobs || [])
      .filter((j) => {
        const isDue = new Date(j.scheduled_at).getTime() <= nowMs;
        const retryReady = !j.next_retry_at || new Date(j.next_retry_at).getTime() <= nowMs;
        if (!isDue || !retryReady) return false;

        const isFresh = (j.status === 'SCHEDULED' || j.status === 'RETRYING') && !j.locked_at;
        const isStale = j.status === 'PROCESSING' && j.locked_at && new Date(j.locked_at).getTime() < staleCutoffMs;
        return isFresh || isStale;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    if (eligibleJobs.length === 0) return null;

    const chosen = eligibleJobs[0];
    const idx = current.publish_jobs.findIndex((j) => j.id === chosen.id);
    if (idx === -1) return null;

    current.publish_jobs[idx] = {
      ...current.publish_jobs[idx],
      status: 'PROCESSING',
      locked_at: nowIso,
      locked_by: workerId,
      started_at: nowIso,
      updated_at: nowIso,
    };

    await writeLocalDB(current);
    return current.publish_jobs[idx];
  },

  async getPublishJobByIdempotencyKey(idempotencyKey: string): Promise<PublishJob | null> {
    if (supabase) {
      const { data, error } = await supabase
        .from('publish_jobs')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (error) sbError('getPublishJobByIdempotencyKey', error);
      return data;
    }
    return (readLocalDB().publish_jobs || []).find((j) => j.idempotency_key === idempotencyKey) || null;
  },

  async getPublishJob(id: string): Promise<PublishJob | null> {
    if (supabase) {
      const { data, error } = await supabase.from('publish_jobs').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getPublishJob', error);
      return data;
    }
    return (readLocalDB().publish_jobs || []).find((j) => j.id === id) || null;
  },

  async getPublishJobs(filter?: { clientId?: string; status?: string; postId?: string; limit?: number }): Promise<PublishJob[]> {
    if (supabase) {
      let query = supabase.from('publish_jobs').select('*');
      if (filter?.clientId) query = query.eq('client_id', filter.clientId);
      if (filter?.status) query = query.eq('status', filter.status);
      if (filter?.postId) query = query.eq('post_id', filter.postId);
      if (filter?.limit) query = query.limit(filter.limit);
      const { data, error } = await query.order('scheduled_at', { ascending: false });
      if (error) sbError('getPublishJobs', error);
      return data || [];
    }
    let jobs = readLocalDB().publish_jobs || [];
    if (filter?.clientId) jobs = jobs.filter((j) => j.client_id === filter.clientId);
    if (filter?.status) jobs = jobs.filter((j) => j.status === filter.status);
    if (filter?.postId) jobs = jobs.filter((j) => j.post_id === filter.postId);
    jobs = [...jobs].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
    if (filter?.limit) jobs = jobs.slice(0, filter.limit);
    return jobs;
  },

  async cancelPublishJob(id: string, callerOrgId?: string): Promise<PublishJob> {
    const job = await this.getPublishJob(id);
    if (!job) throw new Error(`Publish job '${id}' not found`);

    if (callerOrgId) {
      const client = await this.getClient(job.client_id);
      if (!client || client.organization_id !== callerOrgId) {
        throw new Error(`Unauthorized: Client does not belong to organization`);
      }
    }

    if (job.status === 'PROCESSING') {
      throw new Error(`Cannot cancel a publish job that is currently PROCESSING by a worker`);
    }

    if (job.status === 'PUBLISHED' || job.status === 'COMPLETED') {
      throw new Error(`Cannot cancel an already published job`);
    }

    return await this.updatePublishJob(id, {
      status: 'CANCELLED',
      locked_at: null,
      locked_by: null,
    });
  },

  async updatePublishJob(id: string, patch: Partial<PublishJob>): Promise<PublishJob> {
    const now = new Date().toISOString();

    // Enforce state machine transitions (§21)
    if (patch.status) {
      const existing = await this.getPublishJob(id);
      if (existing && existing.status !== patch.status) {
        const allowed = this.VALID_JOB_TRANSITIONS[existing.status] || [];
        if (!allowed.includes(patch.status)) {
          throw new Error(`Invalid job status transition: cannot change status from '${existing.status}' to '${patch.status}'`);
        }
      }
    }

    if (supabase) {
      const { data, error } = await supabase.from('publish_jobs').update({ ...patch, updated_at: now }).eq('id', id).select().single();
      if (error) sbError('updatePublishJob', error);
      return data;
    }
    const current = readLocalDB();
    const idx = (current.publish_jobs || []).findIndex((j) => j.id === id);
    if (idx === -1) throw new Error(`PublishJob ${id} not found`);
    current.publish_jobs[idx] = { ...current.publish_jobs[idx], ...patch, updated_at: now };
    await writeLocalDB(current);
    return current.publish_jobs[idx];
  },

  async createPublishAttempt(data: Partial<PublishAttempt>): Promise<PublishAttempt> {
    // Sanitize response payload to prevent any secrets from entering DB/logs (§20, §29)
    const sanitizeAttemptPayload = (payload: any): any => {
      if (!payload || typeof payload !== 'object') return payload;
      const sanitized = Array.isArray(payload) ? [...payload] : { ...payload };
      const sensitiveKeys = ['token', 'access_token', 'accessToken', 'refreshToken', 'refresh_token', 'secret', 'password', 'key'];
      for (const k of Object.keys(sanitized)) {
        if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
          sanitized[k] = '[REDACTED]';
        } else if (typeof sanitized[k] === 'object') {
          sanitized[k] = sanitizeAttemptPayload(sanitized[k]);
        }
      }
      return sanitized;
    };

    const attempt: PublishAttempt = {
      id: crypto.randomUUID(),
      job_id: data.job_id!,
      attempt_number: data.attempt_number || 1,
      status: data.status || 'SUCCESS',
      error_message: data.error_message || null,
      error_category: data.error_category || null,
      executed_at: new Date().toISOString(),
      response_payload: sanitizeAttemptPayload(data.response_payload) || null,
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('publish_attempts').insert(attempt).select().single();
      if (error) sbError('createPublishAttempt', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.publish_attempts) current.publish_attempts = [];
    current.publish_attempts.push(attempt);
    await writeLocalDB(current);
    return attempt;
  },

  async getPublishAttempts(jobId?: string): Promise<PublishAttempt[]> {
    if (supabase) {
      let q = supabase.from('publish_attempts').select('*').order('executed_at', { ascending: false });
      if (jobId) q = q.eq('job_id', jobId);
      const { data, error } = await q;
      if (error) sbError('getPublishAttempts', error);
      return data || [];
    }
    const attempts = readLocalDB().publish_attempts || [];
    return jobId ? attempts.filter((a) => a.job_id === jobId) : attempts;
  },

  // Content Libraries (RecurPost-style Evergreen Content)
  async getContentLibraries(clientId?: string): Promise<ContentLibrary[]> {
    if (supabase) {
      let q = supabase.from('content_libraries').select('*').order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) sbError('getContentLibraries', error);
      return data || [];
    }
    const libs = readLocalDB().content_libraries || [];
    return clientId ? libs.filter((l) => l.client_id === clientId) : libs;
  },

  async getContentLibrary(id: string): Promise<ContentLibrary | null> {
    if (supabase) {
      const { data, error } = await supabase.from('content_libraries').select('*').eq('id', id).maybeSingle();
      if (error) sbError('getContentLibrary', error);
      return data;
    }
    return (readLocalDB().content_libraries || []).find((l) => l.id === id) || null;
  },

  async createContentLibrary(data: Partial<ContentLibrary>): Promise<ContentLibrary> {
    const lib: ContentLibrary = {
      id: data.id || crypto.randomUUID(),
      client_id: data.client_id || DEFAULT_CLIENT_ID,
      name: data.name || 'Marketing Library',
      color: data.color || '#2B6E63',
      active: data.active !== undefined ? data.active : true,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('content_libraries').insert(lib).select().single();
      if (error) sbError('createContentLibrary', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.content_libraries) current.content_libraries = [];
    current.content_libraries.push(lib);
    await writeLocalDB(current);
    return lib;
  },

  async updateContentLibrary(id: string, patch: Partial<ContentLibrary>): Promise<ContentLibrary> {
    if (supabase) {
      const { data, error } = await supabase.from('content_libraries').update(patch).eq('id', id).select().single();
      if (error) sbError('updateContentLibrary', error);
      return data;
    }
    const current = readLocalDB();
    const idx = (current.content_libraries || []).findIndex((l) => l.id === id);
    if (idx === -1) throw new Error(`Library ${id} not found`);
    current.content_libraries[idx] = { ...current.content_libraries[idx], ...patch };
    await writeLocalDB(current);
    return current.content_libraries[idx];
  },

  async deleteContentLibrary(id: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('content_libraries').delete().eq('id', id);
      if (error) sbError('deleteContentLibrary', error);
      return;
    }
    const current = readLocalDB();
    current.content_libraries = (current.content_libraries || []).filter((l) => l.id !== id);
    current.library_posts = (current.library_posts || []).filter((p) => p.library_id !== id);
    current.recurring_schedules = (current.recurring_schedules || []).filter((s) => s.library_id !== id);
    await writeLocalDB(current);
  },

  // Library Posts
  async getLibraryPosts(libraryId: string): Promise<LibraryPost[]> {
    if (supabase) {
      const { data, error } = await supabase.from('library_posts').select('*').eq('library_id', libraryId).order('times_published', { ascending: true });
      if (error) sbError('getLibraryPosts', error);
      return data || [];
    }
    return (readLocalDB().library_posts || [])
      .filter((p) => p.library_id === libraryId)
      .sort((a, b) => a.times_published - b.times_published);
  },

  async createLibraryPost(data: Partial<LibraryPost>): Promise<LibraryPost> {
    const post: LibraryPost = {
      id: data.id || crypto.randomUUID(),
      library_id: data.library_id!,
      client_id: data.client_id || DEFAULT_CLIENT_ID,
      content: data.content || '',
      media_urls: data.media_urls || null,
      platform_variants: data.platform_variants || null,
      times_published: 0,
      last_published_at: null,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('library_posts').insert(post).select().single();
      if (error) sbError('createLibraryPost', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.library_posts) current.library_posts = [];
    current.library_posts.push(post);
    await writeLocalDB(current);
    return post;
  },

  async updateLibraryPost(id: string, patch: Partial<LibraryPost>): Promise<LibraryPost> {
    if (supabase) {
      const { data, error } = await supabase.from('library_posts').update(patch).eq('id', id).select().single();
      if (error) sbError('updateLibraryPost', error);
      return data;
    }
    const current = readLocalDB();
    const idx = (current.library_posts || []).findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`LibraryPost ${id} not found`);
    current.library_posts[idx] = { ...current.library_posts[idx], ...patch };
    await writeLocalDB(current);
    return current.library_posts[idx];
  },

  async deleteLibraryPost(id: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('library_posts').delete().eq('id', id);
      if (error) sbError('deleteLibraryPost', error);
      return;
    }
    const current = readLocalDB();
    current.library_posts = (current.library_posts || []).filter((p) => p.id !== id);
    await writeLocalDB(current);
  },

  // Recurring Schedules
  async getRecurringSchedules(clientId?: string): Promise<RecurringSchedule[]> {
    if (supabase) {
      let q = supabase.from('recurring_schedules').select('*');
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) sbError('getRecurringSchedules', error);
      return data || [];
    }
    const scheds = readLocalDB().recurring_schedules || [];
    return clientId ? scheds.filter((s) => s.client_id === clientId) : scheds;
  },

  async createRecurringSchedule(data: Partial<RecurringSchedule>): Promise<RecurringSchedule> {
    const sched: RecurringSchedule = {
      id: data.id || crypto.randomUUID(),
      library_id: data.library_id!,
      client_id: data.client_id || DEFAULT_CLIENT_ID,
      social_account_ids: data.social_account_ids || [],
      days_of_week: data.days_of_week || [1, 3, 5],
      time_of_day: data.time_of_day || '09:00',
      timezone: data.timezone || 'UTC',
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      max_repetitions: data.max_repetitions || null,
      repetition_count: 0,
      active: data.active !== undefined ? data.active : true,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('recurring_schedules').insert(sched).select().single();
      if (error) sbError('createRecurringSchedule', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.recurring_schedules) current.recurring_schedules = [];
    current.recurring_schedules.push(sched);
    await writeLocalDB(current);
    return sched;
  },

  async updateRecurringSchedule(id: string, patch: Partial<RecurringSchedule>): Promise<RecurringSchedule> {
    if (supabase) {
      const { data, error } = await supabase.from('recurring_schedules').update(patch).eq('id', id).select().single();
      if (error) sbError('updateRecurringSchedule', error);
      return data;
    }
    const current = readLocalDB();
    const idx = (current.recurring_schedules || []).findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Schedule ${id} not found`);
    current.recurring_schedules[idx] = { ...current.recurring_schedules[idx], ...patch };
    await writeLocalDB(current);
    return current.recurring_schedules[idx];
  },

  async deleteRecurringSchedule(id: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('recurring_schedules').delete().eq('id', id);
      if (error) sbError('deleteRecurringSchedule', error);
      return;
    }
    const current = readLocalDB();
    current.recurring_schedules = (current.recurring_schedules || []).filter((s) => s.id !== id);
    await writeLocalDB(current);
  },

  // Notifications
  async getNotifications(userId?: string, workspaceId?: string, unreadOnly?: boolean): Promise<AppNotification[]> {
    if (supabase) {
      let q = supabase.from('notifications').select('*').order('created_at', { ascending: false });
      if (userId) q = q.eq('user_id', userId);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      if (unreadOnly) q = q.eq('read', false);
      const { data, error } = await q;
      if (error) sbError('getNotifications', error);
      return data || [];
    }
    let notifs = readLocalDB().notifications || [];
    if (userId) notifs = notifs.filter((n) => !n.user_id || n.user_id === userId);
    if (workspaceId) notifs = notifs.filter((n) => !n.workspace_id || n.workspace_id === workspaceId);
    if (unreadOnly) notifs = notifs.filter((n) => !n.read);
    return notifs;
  },

  async createNotification(data: Partial<AppNotification>): Promise<AppNotification> {
    const notif: AppNotification = {
      id: crypto.randomUUID(),
      workspace_id: data.workspace_id || DEFAULT_ORG_ID,
      client_id: data.client_id || DEFAULT_CLIENT_ID,
      user_id: data.user_id || null,
      type: data.type || 'PUBLISH_SUCCESS',
      title: data.title || 'Notification',
      message: data.message || '',
      entity_id: data.entity_id || null,
      entity_type: data.entity_type || null,
      read: false,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('notifications').insert(notif).select().single();
      if (error) sbError('createNotification', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.notifications) current.notifications = [];
    current.notifications.unshift(notif);
    await writeLocalDB(current);
    return notif;
  },

  async markNotificationRead(id: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
      if (error) sbError('markNotificationRead', error);
      return;
    }
    const current = readLocalDB();
    const notif = (current.notifications || []).find((n) => n.id === id);
    if (notif) {
      notif.read = true;
      await writeLocalDB(current);
    }
  },

  // Client Members
  async getClientMembers(clientId: string): Promise<ClientMember[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('client_members')
        .select('*')
        .eq('client_id', clientId);
      if (error) sbError('getClientMembers', error);
      return data || [];
    }
    // For local DB, we don't have client_members yet - return empty
    return [];
  },

  async getClientMember(clientId: string, userId: string): Promise<ClientMember | null> {
    if (supabase) {
      const { data, error } = await supabase
        .from('client_members')
        .select('*')
        .eq('client_id', clientId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) sbError('getClientMember', error);
      return data;
    }
    return null;
  },

  async addClientMember(data: {
    client_id: string;
    user_id: string;
    role: UserRole;
  }): Promise<ClientMember> {
    const member: ClientMember = {
      id: crypto.randomUUID(),
      client_id: data.client_id,
      user_id: data.user_id,
      role: data.role,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase
        .from('client_members')
        .insert(member)
        .select()
        .single();
      if (error) sbError('addClientMember', error);
      return created;
    }
    // Local DB fallback not implemented for client_members
    return member;
  },

  async removeClientMember(clientId: string, userId: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase
        .from('client_members')
        .delete()
        .eq('client_id', clientId)
        .eq('user_id', userId);
      if (error) sbError('removeClientMember', error);
      return;
    }
  },

  async updateClientMember(clientId: string, userId: string, patch: Partial<ClientMember>): Promise<ClientMember> {
    if (supabase) {
      const { data, error } = await supabase
        .from('client_members')
        .update(patch)
        .eq('client_id', clientId)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) sbError('updateClientMember', error);
      return data;
    }
    // Local DB fallback not implemented
    throw new Error('Local DB not supported for client_members');
  },

  // Audit Logs
  async createAuditLog(data: Partial<AuditLog>): Promise<AuditLog> {
    const log: AuditLog = {
      id: crypto.randomUUID(),
      organization_id: data.organization_id || undefined,
      client_id: data.client_id || undefined,
      user_id: data.user_id || undefined,
      action: data.action || '',
      entity_type: data.entity_type || undefined,
      entity_id: data.entity_id || undefined,
      metadata: data.metadata || undefined,
      ip_address: data.ip_address || undefined,
      user_agent: data.user_agent || undefined,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase
        .from('audit_logs')
        .insert(log)
        .select()
        .single();
      if (error) sbError('createAuditLog', error);
      return created;
    }
    // Local DB fallback not implemented for audit_logs
    console.log('[AUDIT]', log);
    return log;
  },

  async getAuditLogs(filters?: {
    organizationId?: string;
    clientId?: string;
    userId?: string;
    action?: string;
    entityType?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    if (supabase) {
      let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
      if (filters?.organizationId) q = q.eq('organization_id', filters.organizationId);
      if (filters?.clientId) q = q.eq('client_id', filters.clientId);
      if (filters?.userId) q = q.eq('user_id', filters.userId);
      if (filters?.action) q = q.eq('action', filters.action);
      if (filters?.entityType) q = q.eq('entity_type', filters.entityType);
      if (filters?.limit) q = q.limit(filters.limit);
      const { data, error } = await q;
      if (error) sbError('getAuditLogs', error);
      return data || [];
    }
    return [];
  },

  // Inbox
  async getInboxConversations(clientId?: string, platform?: string): Promise<InboxConversation[]> {
    if (supabase) {
      let q = supabase.from('inbox_conversations').select('*').order('last_message_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      if (platform) q = q.eq('platform', platform);
      const { data, error } = await q;
      if (error) sbError('getInboxConversations', error);
      return data || [];
    }
    let convs = readLocalDB().inbox_conversations || [];
    if (clientId) convs = convs.filter((c) => c.client_id === clientId);
    if (platform) convs = convs.filter((c) => c.platform === platform);
    return convs;
  },

  async getInboxMessages(conversationId: string): Promise<InboxMessage[]> {
    if (supabase) {
      const { data, error } = await supabase.from('inbox_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
      if (error) sbError('getInboxMessages', error);
      return data || [];
    }
    return (readLocalDB().inbox_messages || []).filter((m) => m.conversation_id === conversationId);
  },

  async createInboxMessage(data: Partial<InboxMessage>): Promise<InboxMessage> {
    const msg: InboxMessage = {
      id: crypto.randomUUID(),
      conversation_id: data.conversation_id!,
      external_message_id: data.external_message_id || `msg_${Date.now()}`,
      sender_name: data.sender_name || 'Anonymous',
      sender_id: data.sender_id || null,
      message_type: data.message_type || 'comment',
      content: data.content || '',
      is_from_us: !!data.is_from_us,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      const { data: created, error } = await supabase.from('inbox_messages').insert(msg).select().single();
      if (error) sbError('createInboxMessage', error);
      return created;
    }
    const current = readLocalDB();
    if (!current.inbox_messages) current.inbox_messages = [];
    current.inbox_messages.push(msg);
    await writeLocalDB(current);
    return msg;
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

    return (readLocalDB().post_metrics || []).filter((m) => m.post_id === postId);
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
    if (!current.post_metrics) current.post_metrics = [];
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
      metrics = readLocalDB().post_metrics || [];
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
      pinterest: { platform: 'pinterest', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      tiktok: { platform: 'tiktok', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      youtube: { platform: 'youtube', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      threads: { platform: 'threads', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
      bluesky: { platform: 'bluesky', total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 },
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
