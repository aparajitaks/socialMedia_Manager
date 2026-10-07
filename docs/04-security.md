Security Requirements
This app holds OAuth tokens that let it post on behalf of every client account the agency
connects. Treat token handling as the highest-risk part of the build.

Rules
Tokens never reach the frontend. No access token or refresh token is ever sent to the
browser, stored in localStorage / sessionStorage , or put in a client-readable cookie.
Every social API call happens server-side.
Encrypt tokens at rest. Encrypt access_token and refresh_token at the
application layer (e.g. AES-256-GCM, key from an environment variable — not from
the database) before writing to social_accounts . Database-level encryption alone
isn't enough: a leaked DB export shouldn't hand over live tokens.
state is single-use and short-lived. Generate it with a cryptographically secure
random source, store it server-side tied to user_id + client_id + platform , give it
a short expiry (≈10 minutes), and delete the row once a callback has consumed it.
Never trust a client/org identifier arriving on the callback URL itself — only trust
what's stored against state .
Authorize every client-scoped route, not just OAuth. Before touching any
/api/clients/:clientId/* route — connecting an account, creating a post, viewing
analytics — confirm the logged-in agency user's organization actually has access to
that clientId .
If any table is ever queried directly from the client (rather than exclusively through
your API routes), add Supabase Row Level Security policies scoping every table by the
caller's organization_id . Don't rely on API-route checks alone once direct clientside Supabase queries are possible.
Disconnect should revoke, not just delete. Where the platform offers a revoke
endpoint, call it when a client account is disconnected, in addition to removing the
local row — don't leave a live, forgotten token sitting on the platform's side.

Environment variables

env

# Google Business Profile
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=
# Meta (Facebook + Instagram)
META_CLIENT_ID=
META_CLIENT_SECRET=
META_REDIRECT_URI=
# Application-layer token encryption
TOKEN_ENCRYPTION_KEY=
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

None of these belong in version control. Commit .env.local.example with the keys
present and no values.

