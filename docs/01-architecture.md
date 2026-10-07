Architecture & Data Model
Why multi-tenant
This is an agency platform, not a single-brand tool: one agency manages many clients, and
each client has its own set of connected social accounts. Every table holding client data is
scoped by client_id , and every client belongs to one organization_id — the agency.

text
organizations
(the agency)
└── users
(agency staff)
└── clients
(one row per client brand/workspace)
└── social_accounts (one row per connected platform account)
└── posts
(scheduled / published content)
└── post_metrics

A client having more than one account on the same platform isn't the common case, but the
schema doesn't prevent it — see the unique constraint on social_accounts below.

Database schema
Requires the pgcrypto extension for gen_random_uuid() (enabled by default on
Supabase).

sql

-- The agency itself
CREATE TABLE organizations (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
name TEXT NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Agency staff. `id` matches the corresponding row in Supabase's auth.users.
CREATE TABLE users (
id UUID PRIMARY KEY REFERENCES auth.users(id),
organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
email TEXT NOT NULL UNIQUE,
role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One row per client brand the agency manages
CREATE TABLE clients (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
name TEXT NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One row per connected social account, per client
CREATE TABLE social_accounts (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
platform TEXT NOT NULL CHECK (platform IN ('google_business', 'linkedin', 'fa
external_account_id TEXT NOT NULL,
-- Page ID / IG Business Account ID /
external_account_name TEXT,
external_username TEXT,
access_token_encrypted TEXT NOT NULL,
refresh_token_encrypted TEXT,
token_expires_at TIMESTAMPTZ,
scopes TEXT[],
status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expi
connected_by UUID REFERENCES users(id),
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
UNIQUE (client_id, platform, external_account_id)
);
-- Short-lived, single-use rows that survive the OAuth redirect round trip.

-- See 02-oauth-flows.md for why this table exists.
CREATE TABLE oauth_states (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
state TEXT NOT NULL UNIQUE,
user_id UUID NOT NULL REFERENCES users(id),
client_id UUID NOT NULL REFERENCES clients(id),
platform TEXT NOT NULL,
expires_at TIMESTAMPTZ NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Scheduled / published content
CREATE TABLE posts (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCA
content TEXT NOT NULL,
media_urls TEXT[],
scheduled_at TIMESTAMPTZ NOT NULL,
status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'publ
external_post_id TEXT,
error_message TEXT,
created_by UUID REFERENCES users(id),
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Per-post performance data pulled back from each platform (Stage 10)
CREATE TABLE post_metrics (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
likes INT DEFAULT 0,
comments INT DEFAULT 0,
shares INT DEFAULT 0,
impressions INT DEFAULT 0,
fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Indexes the scheduler and OAuth callback lean on
CREATE INDEX idx_posts_due ON posts (scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_social_accounts_client ON social_accounts (client_id);
CREATE INDEX idx_oauth_states_state ON oauth_states (state);

Key relationships
clients.organization_id — every client belongs to exactly one agency.
social_accounts.client_id — every connected account belongs to exactly one

client, never shared across clients.
posts.social_account_id — a post targets one specific connected account, not a
platform in the abstract.
oauth_states — written when a connect flow starts, read once by the callback, then
deleted. This is what lets the callback recover which client the flow was for — see 02oauth-flows.md .
external_account_id isn't the OAuth identity

The ID this column stores is whatever the platform's publishing API actually needs — which
usually isn't the identity you get back from the initial token:
Google Business Profile — a location, typically

accounts/{accountId}/locations/{locationId} .

LinkedIn — the organization URN the agency user selected, not the member's
personal ID.
Facebook — the Page ID, not the person's user ID.
Instagram — the Instagram Business Account ID attached to a connected Facebook
Page, not an Instagram login.

Resolving this is the "account discovery" step in 02-oauth-flows.md — skipping it and
storing the raw OAuth identity instead is the most common mistake in this kind of
integration.

