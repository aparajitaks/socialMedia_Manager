OAuth Flows
The flow that repeats for every platform

text
1. Agency user clicks "Connect {Platform}" for a specific client
2. Frontend → GET /api/clients/:clientId/social/:platform/connect
3. Backend → checks the agency user can manage :clientId
→ generates a random `state`, saves it to oauth_states
(state, user_id, client_id, platform, expires_at ≈ now + 10 min)
→ redirects the browser to the platform's authorize URL
4. Platform → user logs in and approves the requested scopes
5. Platform → redirects back to YOUR callback:
/api/oauth/:platform/callback?code=...&state=...
6. Backend → looks up `state` in oauth_states, confirms it hasn't expired,
deletes the row (single use)
→ exchanges `code` for an access_token (+ refresh_token)
→ calls the platform's API to discover the actual publishing
destination (Page / IG Business Account / Org / Location —
see the per-platform sections below)
→ encrypts the tokens, upserts a row into social_accounts
scoped to the client_id recovered from oauth_states
→ redirects the browser to /clients/:clientId/social

Two things make this safe for a multi-client agency app rather than a single-user app:
Every connect request is scoped to one client, and the backend checks the agency
user is actually allowed to manage that client before starting the flow.
state is what carries the client/user context across the redirect. The platform
doesn't know or care which of your clients this is — the oauth_states row is the only
place that link exists. Never trust a client identifier that arrives on the callback URL
itself; only trust what's stored server-side against state .

Your application never sees the client's platform password — only the platform's own login
page does.

Why account discovery is a separate step
The token from step 6 identifies a person (or, for Google, a Google account) — not the Page,
Org, or Location you actually want to publish to. A second API call, made with that fresh
access token, is what tells you the real destination ID to store. Skipping this and storing the
raw OAuth identity is the most common mistake in this kind of integration.

Google Business Profile
Good first platform to build — the OAuth implementation is thoroughly documented and
the destination (a Business Profile location) maps fairly directly from the token.
Authorize URL

text
https://accounts.google.com/o/oauth2/v2/auth
?client_id={GOOGLE_CLIENT_ID}
&redirect_uri={GOOGLE_REDIRECT_URI}
&response_type=code
&scope=https://www.googleapis.com/auth/business.manage
&access_type=offline
&prompt=consent
&state={state}
access_type=offline plus prompt=consent is what guarantees a refresh_token comes

back. Without prompt=consent , Google only issues one on a user's first authorization —
easy to lose track of mid-development when you're re-testing the same account.
Token exchange — the standard Google OAuth 2.0 token endpoint; exchange code for
access_token , refresh_token , expires_in , scope .

Account discovery — call the Business Profile API's accounts and locations endpoints with
the new access token. Resource IDs look like accounts/{accountId} and
locations/{locationId} ; store the location as external_account_id .

LinkedIn
LinkedIn OAuth authenticates a member, not an organization. Posting to a Company Page
needs a second step: asking which organizations that member administers, and letting
them pick one.

text
1. Standard 3-legged member OAuth → access token for the member
2. Call LinkedIn's organization-access API with that token
→ returns the organizations this member can post/manage on
3. Show the agency user a picker:
○ ABC Technologies
○ XYZ Solutions
→ they select the org that corresponds to this client
4. Store the selected organization's URN as external_account_id

Organization posting needs an org-social write scope — LinkedIn has renamed and
versioned these over time, so confirm the current scope name and API version in LinkedIn's
docs immediately before building this integration, not from memory.

Meta (Facebook + Instagram)
One OAuth flow can produce two rows in social_accounts , because Instagram publishing
goes through a connected Facebook Page.

text
1. Facebook/Meta OAuth → access token for the person
2. Call /me/accounts with that token
→ returns the Facebook Pages this person manages
3. For each Page, check its instagram_business_account field
→ Pages with one have a connectable Instagram Business account
4. Let the agency user pick which Page(s) to connect for this client
5. Store two rows if both apply:
- platform=facebook, external_account_id = Page ID
- platform=instagram, external_account_id = IG Business Account ID

Both rows can share the same underlying Page access token — Instagram publishing
through the Graph API is authenticated via the Page, not a separate Instagram login.

Token storage & refresh
Encrypt access_token and refresh_token at the application layer before writing to
Postgres — see 04-security.md .
Store token_expires_at from the token response.
Refresh proactively: before the scheduler calls a publisher, check whether the token is
near expiry and refresh first, rather than waiting for a publish call to fail.
Google and LinkedIn both issue refresh tokens for long-lived offline access; confirm
Meta's current long-lived Page token behavior in their docs, since Meta handles token
lifetimes differently from the other two.

Further reading
Starting points, current as of when this was written — recheck against each platform's live
docs before implementing:
OAuth 2.0 framework — RFC 6749 (rfc-editor.org)
LinkedIn — "Authenticating with OAuth 2.0," Microsoft Learn
Google — "Implement OAuth with Business Profile APIs," Google for Developers
Google — "Using OAuth 2.0 to Access Google APIs," Google for Developers

