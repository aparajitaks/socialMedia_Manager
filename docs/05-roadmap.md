Build Roadmap
Build this in small, verified stages — not as one giant prompt. Each stage is scoped to be
buildable and checkable in a single Antigravity session. Don't start a stage until the
previous one is verified working.
Stage 0 — Project scaffold

Scaffold a Next.js 14 App Router + TypeScript project connected to Supabase (Auth,
Postgres, Storage). Set up .env.local.example with the variables listed in docs/04security.md , and add Supabase client helpers for server and browser contexts.
Stage 1 — Multi-tenant data model

Using docs/01-architecture.md , create Supabase migrations for the schema exactly
as specified, including the indexes at the bottom of that doc. Don't add tables or
columns that aren't in the spec.
Stage 2 — One OAuth integration, end to end

Build connect → callback → disconnect for exactly one platform before touching any other.
Google Business Profile has the most stable, best-documented OAuth of the three covered
here — use it unless you have a reason to start with LinkedIn instead.
Using docs/02-oauth-flows.md , implement the connect and callback routes for
Google Business Profile, following the general flow and the Google Business Profile
section. Include the oauth_states state-check logic exactly as described — don't skip
the authorization check on the connect route.
Stage 3 — Account discovery

Add the account-discovery step from docs/02-oauth-flows.md : after token exchange,
call the Business Profile API to list accounts and locations, and if there's more than one,
return them so the frontend can show a picker before saving.
Stage 4 — Encrypted token storage

Implement application-layer encryption for access_token and refresh_token before
they're written to social_accounts , per docs/04-security.md . Use
TOKEN_ENCRYPTION_KEY from the environment.
Stage 5 — Manual verification (no code)

Connect a real test account through the UI, confirm a row lands in social_accounts
with encrypted tokens and the correct client_id , and make one manual API call to
the platform (Postman or a script) using the decrypted token to confirm it's valid.

Stage 6 — Publish one real post

Add a publish() function for Google Business Profile that takes a hardcoded piece of
content and the connected account, and posts it live. Call it from a temporary test route
or script — don't wire up /api/clients/:clientId/posts yet.
Stage 7 — Abstract into the publisher interface

Refactor Stage 6's publish function into the SocialPublisher interface and
publishers/google/ folder structure from docs/03-api-and-publishers.md .
Stage 8 — Add Meta (Facebook + Instagram)

Using the Meta section of docs/02-oauth-flows.md , implement
connect/callback/discovery for Facebook Pages and their linked Instagram Business
accounts, storing both as separate social_accounts rows where applicable.
Implement publishers/meta/ against the same SocialPublisher interface.
Stage 9 — Scheduler

Implement the cron-based scheduler from docs/03-api-and-publishers.md : find due
posts, mark them publishing , call the matching publisher, and record published or
failed . Wire up POST /api/clients/:clientId/posts to create scheduled rows.
Stage 10 — Metrics

Implement fetchMetrics() for each connected publisher and a job that populates
post_metrics for published posts.
Stage 11 — Calendar / dashboard UI

Build the client-facing dashboard: connected accounts with status, a calendar or list
view of scheduled/published posts, and the account-picker UI from Stage 3.

After Stage 11
Job queue migration — move the scheduler from cron-polling to BullMQ + Redis
once the once-a-minute scan starts to lag under real client volume (see 03-api-andpublishers.md ).
More platforms — each new platform (X, TikTok, YouTube, Threads) is a new folder
under publishers/ implementing the same interface, plus a new section in 02oauth-flows.md . Don't start a second platform before Stages 2–7 are solid for the first
one.

