API Routes, Publisher Interface & Scheduler
API routes

text
# Accounts
GET
/api/clients/:clientId/social
GET
/api/clients/:clientId/social/:platform/connect
GET
/api/oauth/:platform/callback
DELETE /api/clients/:clientId/social/:accountId

list connected accoun
start OAuth (redirec
shared callback per
disconnect an accoun

# Posts
GET
/api/clients/:clientId/posts
POST /api/clients/:clientId/posts
PATCH /api/clients/:clientId/posts/:postId
DELETE /api/clients/:clientId/posts/:postId

list posts
create/schedule a po
edit a scheduled po
cancel a scheduled

Every route under /api/clients/:clientId/* runs the same check first: confirm the
logged-in agency user's organization has access to :clientId , before touching anything
else. Write this once as middleware — it's the same check the OAuth connect route needs.

Shared types

typescript

interface SocialAccount {
id: string;
clientId: string;
platform: 'google_business' | 'linkedin' | 'facebook' | 'instagram';
externalAccountId: string;
accessToken: string;
// decrypted, in-memory only — never serialized to
refreshToken?: string;
tokenExpiresAt?: string;
}
interface Post {
id: string;
clientId: string;
socialAccountId: string;
content: string;
mediaUrls?: string[];
scheduledAt: string;
}
interface PostMetrics {
likes: number;
comments: number;
shares: number;
impressions: number;
}

Publisher interface
Don't branch on platform throughout the codebase ( if (platform === 'instagram')
{...} scattered everywhere). Give every platform a module implementing the same
interface, so adding platform #5 doesn't touch platforms #1–4.

typescript

interface PublishResult {
success: boolean;
externalPostId?: string;
error?: string;
}
interface SocialPublisher {
publish(post: Post, account: SocialAccount): Promise<PublishResult>;
refreshToken(account: SocialAccount): Promise<SocialAccount>;
fetchMetrics(post: Post, account: SocialAccount): Promise<PostMetrics>;
}

text
publishers/
google/
oauth.ts
linkedin/ oauth.ts
meta/
oauth.ts

publisher.ts
publisher.ts
publisher.ts

metrics.ts
metrics.ts
metrics.ts

(shared by facebook + ins

The scheduler and API routes only ever call through SocialPublisher — they never
import a platform SDK directly.

Scheduler (v1)
A cron job is enough to start with. Don't reach for a job queue before you need one.

text
Every 1 minute:
SELECT * FROM posts
WHERE status = 'scheduled' AND scheduled_at <= now()
for each post:
UPDATE posts SET status = 'publishing' WHERE id = post.id
account = load social_accounts row for post.social_account_id
if account.token_expires_at is near: account = publishers[platform].refresh
result = publishers[platform].publish(post, account)
if result.success:
UPDATE posts SET status = 'published', external_post_id = result.external
else:
UPDATE posts SET status = 'failed', error_message = result.error

Later, not now: once client volume makes a once-a-minute table scan and single-threaded
publish loop a real bottleneck, move to a job queue (e.g. BullMQ + Redis) — a post is

enqueued at creation time with a delay, and a worker picks it up and calls the same
SocialPublisher interface. The interface doesn't change; only what calls it does. Get the
cron version running with real usage before this migration is worth doing.

