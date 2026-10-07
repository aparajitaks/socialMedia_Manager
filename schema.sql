-- ============================================================
-- Social Scheduler — Multi-Tenant Supabase Postgres Schema
-- Architecture: Workspace/Agency -> Workspace Members -> Clients -> Social Accounts -> Posts -> Post Variants -> Approvals -> Publish Jobs -> Post Metrics
-- ============================================================

-- Ensure pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. The agency / workspace itself
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Agency staff. `id` matches the corresponding row in Supabase's auth.users.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY, -- references auth.users(id) in live Supabase environment
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'approver', 'viewer', 'client', 'member', 'OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'VIEWER', 'CLIENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workspace members mapping (for multi-workspace support)
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'approver', 'viewer', 'client', 'OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'VIEWER', 'CLIENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- 3. One row per client brand the agency manages
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3b. Client members - for client-level access control
CREATE TABLE IF NOT EXISTS client_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'approver', 'viewer', 'client', 'OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'VIEWER', 'CLIENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, user_id)
);

-- 4. One row per connected social account, per client
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'facebook', 'instagram', 'linkedin', 'x', 'google_business', 'pinterest', 'tiktok', 'youtube', 'threads', 'bluesky')),
  platform_account_id TEXT NOT NULL, -- Page ID / IG Business Account ID / Org URN / Location
  display_name TEXT,
  username TEXT,
  profile_image_url TEXT,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'TOKEN_EXPIRING', 'TOKEN_EXPIRED', 'DISCONNECTED', 'REAUTH_REQUIRED', 'ERROR')),
  metadata JSONB,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  UNIQUE (client_id, platform, platform_account_id)
);

-- 5. Short-lived, single-use rows that survive the OAuth redirect round trip
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  code_verifier TEXT,  -- PKCE code verifier for X OAuth 2.0
  return_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Media Assets
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INT NOT NULL,
  width INT,
  height INT,
  duration INT,
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  checksum TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Scheduled / published content (Source Post)
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content TEXT NOT NULL,
  media_urls TEXT[],
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled',
  campaign_label TEXT,
  timezone TEXT DEFAULT 'UTC',
  external_post_id TEXT,
  platform_post_id TEXT,
  post_group_id TEXT,
  error_message TEXT,
  error_reason TEXT,
  error_category TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Platform-specific variants for posts
CREATE TABLE IF NOT EXISTS post_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content TEXT NOT NULL,
  media_urls TEXT[],
  hashtags TEXT[],
  mentions TEXT[],
  link TEXT,
  title TEXT,
  description TEXT,
  first_comment TEXT,
  platform_specific_fields JSONB,
  status TEXT NOT NULL DEFAULT 'scheduled',
  external_post_id TEXT,
  error_message TEXT,
  error_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Approvals table
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approver_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'pending', 'approved', 'rejected')),
  comment TEXT,
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Publishing Queue Jobs & Attempts
CREATE TABLE IF NOT EXISTS publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES post_variants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'PUBLISHED', 'FAILED', 'RETRYING', 'CANCELLED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  error_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publish_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES publish_jobs(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE')),
  error_message TEXT,
  error_category TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_payload JSONB
);

-- 11. Content Libraries & Recurring Schedules (RecurPost-style Evergreen Content)
CREATE TABLE IF NOT EXISTS content_libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#2B6E63',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS library_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID NOT NULL REFERENCES content_libraries(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_urls TEXT[],
  platform_variants JSONB,
  times_published INT NOT NULL DEFAULT 0,
  last_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID NOT NULL REFERENCES content_libraries(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  social_account_ids UUID[] NOT NULL,
  days_of_week INT[] NOT NULL, -- 0=Sun, 1=Mon, ..., 6=Sat
  time_of_day TEXT NOT NULL, -- HH:MM
  timezone TEXT NOT NULL DEFAULT 'UTC',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  max_repetitions INT,
  repetition_count INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. In-App Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_id UUID,
  entity_type TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Unified Inbox (Conversations & Messages)
CREATE TABLE IF NOT EXISTS inbox_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_conversation_id TEXT NOT NULL,
  participant_name TEXT NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(social_account_id, external_conversation_id)
);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  external_message_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_id TEXT,
  message_type TEXT NOT NULL CHECK (message_type IN ('comment', 'dm', 'mention', 'reply')),
  content TEXT NOT NULL,
  is_from_us BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Per-post performance data pulled back from each platform
CREATE TABLE IF NOT EXISTS post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  impressions INT DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. Audit log for security-sensitive actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_due ON posts (scheduled_at) WHERE status IN ('scheduled', 'SCHEDULED');
CREATE INDEX IF NOT EXISTS idx_posts_client ON posts (client_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_client ON social_accounts (client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states (state);
CREATE INDEX IF NOT EXISTS idx_post_metrics_post_id ON post_metrics (post_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_due ON publish_jobs (scheduled_at, status) WHERE status IN ('SCHEDULED', 'RETRYING');
CREATE INDEX IF NOT EXISTS idx_publish_jobs_idempotency ON publish_jobs (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_approvals_token ON approvals (share_token);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_client_members_client_user ON client_members (client_id, user_id);
CREATE INDEX IF NOT EXISTS idx_client_members_user ON client_members (user_id);

-- ============================================================
-- Atomic Job Claiming Function
-- ============================================================
-- This function atomically claims a due publish job using row-level locking.
-- It uses SELECT ... FOR UPDATE SKIP LOCKED to prevent race conditions.
CREATE OR REPLACE FUNCTION claim_publish_job(
  p_worker_id TEXT,
  p_now TIMESTAMPTZ,
  p_stale_threshold_seconds INT DEFAULT 300
)
RETURNS TABLE (
  id UUID,
  post_id UUID,
  variant_id UUID,
  client_id UUID,
  social_account_id UUID,
  platform TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT,
  idempotency_key TEXT,
  attempt_count INT,
  max_attempts INT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  error_category TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  UPDATE publish_jobs
  SET
    status = 'PROCESSING',
    locked_at = p_now,
    locked_by = p_worker_id,
    started_at = p_now,
    updated_at = p_now
  WHERE publish_jobs.id = (
    SELECT pj.id
    FROM publish_jobs pj
    WHERE
      (
        (pj.status IN ('SCHEDULED', 'RETRYING') AND pj.locked_at IS NULL)
        OR (pj.status = 'PROCESSING' AND pj.locked_at IS NOT NULL AND pj.locked_at < (p_now - (p_stale_threshold_seconds || ' seconds')::INTERVAL))
      )
      AND pj.scheduled_at <= p_now
      AND (pj.next_retry_at IS NULL OR pj.next_retry_at <= p_now)
    ORDER BY pj.scheduled_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- Seed Starter Agency & Clients (Idempotent)
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Acme Growth Agency')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, organization_id, email, name, role)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'admin@agency.com', 'Sarah Connor (Agency Owner)', 'owner')
ON CONFLICT (id) DO NOTHING;

INSERT INTO clients (id, organization_id, name, timezone)
VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Apex Fitness', 'America/New_York'),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Lumina Cafe', 'Europe/London')
ON CONFLICT (id) DO NOTHING;
