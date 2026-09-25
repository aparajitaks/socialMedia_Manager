-- ============================================================
-- Postline — Supabase Setup SQL
-- Run this ONCE in your Supabase project's SQL Editor
-- ============================================================

-- 1. Users table
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  role text not null default 'editor', -- 'admin' | 'editor'
  created_at timestamptz not null default now()
);

-- 2. Social Accounts table
create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  display_name text not null,
  external_account_id text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  connected_by uuid references users(id) on delete set null,
  connected_at timestamptz not null default now()
);

-- 3. Post Groups
create table if not exists post_groups (
  id uuid primary key default gen_random_uuid(),
  label text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 4. Posts table
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  post_group_id uuid references post_groups(id) on delete cascade,
  social_account_id uuid references social_accounts(id) on delete cascade not null,
  platform text not null,
  content text not null,
  media_urls text[],
  status text not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  platform_post_id text,
  error_reason text,
  approved_by uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 5. Post Metrics table
create table if not exists post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade not null,
  fetched_at timestamptz not null default now(),
  likes int default 0,
  comments int default 0,
  shares int default 0,
  impressions int default 0
);

-- Indexes
create index if not exists idx_posts_status_scheduled on posts(status, scheduled_at);
create index if not exists idx_posts_social_account on posts(social_account_id);
create index if not exists idx_post_metrics_post_id on post_metrics(post_id);
create index if not exists idx_social_accounts_platform on social_accounts(platform, external_account_id);

-- ============================================================
-- Row Level Security
-- Backend uses service role key, which bypasses RLS.
-- Enable RLS but allow service role full access.
-- ============================================================
alter table users enable row level security;
alter table social_accounts enable row level security;
alter table post_groups enable row level security;
alter table posts enable row level security;
alter table post_metrics enable row level security;

-- Allow the service role to do everything (backend uses this)
create policy "Service role full access - users" on users
  for all using (true) with check (true);

create policy "Service role full access - social_accounts" on social_accounts
  for all using (true) with check (true);

create policy "Service role full access - post_groups" on post_groups
  for all using (true) with check (true);

create policy "Service role full access - posts" on posts
  for all using (true) with check (true);

create policy "Service role full access - post_metrics" on post_metrics
  for all using (true) with check (true);

-- ============================================================
-- Storage bucket for media uploads
-- ============================================================
insert into storage.buckets (id, name, public)
values ('postline-media', 'postline-media', true)
on conflict (id) do nothing;

-- Allow service role to upload
create policy "Service role can upload media" on storage.objects
  for all using (bucket_id = 'postline-media') with check (bucket_id = 'postline-media');
