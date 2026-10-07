// Env must be loaded before any module reads process.env at module scope.
import './env.js';

import express from 'express';
import cors from 'cors';

import {
  enableSandboxPublishing,
  isSandboxMode,
  publishReadiness,
} from './publishers/index.js';

// Initialize platform adapters
import { initializeAdapters } from './platform-adapter/adapters/index.js';
initializeAdapters();

import clientsRouter from './routes/clients.js';
import oauthRouter from './routes/oauth.js';
import accountsRouter from './routes/accounts.js';
import socialAccountsRouter from './routes/social-accounts.js';
import postsRouter from './routes/posts.js';
import metricsRouter from './routes/metrics.js';
import schedulerRouter from './routes/scheduler.js';
import cronRouter from './routes/cron.js';
import authRouter from './routes/auth.js';
import mediaRouter from './routes/media.js';
import librariesRouter from './routes/libraries.js';
import bulkRouter from './routes/bulk.js';
import notificationsRouter from './routes/notifications.js';
import reportsRouter from './routes/reports.js';
import inboxRouter from './routes/inbox.js';
import webhooksRouter from './routes/webhooks.js';
import settingsRouter from './routes/settings.js';
import organizationsRouter from './routes/organizations.js';

const app = express();
const PORT = process.env.PORT || 5001;

// ---------------------------------------------------------------------------
// Publishing safety gate (Phase 0 rule: "published" must mean published)
//
// Simulated publishing is never registered implicitly. Only an explicit
// SANDBOX_MODE=true swaps every adapter for the SandboxPublisher. In every
// other case the adapters themselves refuse to publish when the platform app
// credentials or a real access token are missing, so a post can never be
// marked `published` while nothing reached the platform.
// ---------------------------------------------------------------------------
if (isSandboxMode()) {
  enableSandboxPublishing();
  console.warn(
    '⚠️ SANDBOX_MODE=true — every publisher returns SIMULATED results. Never run a real deployment with this set.'
  );
} else {
  const readiness = publishReadiness();
  console.log('📋 Publish readiness (a platform not listed as ready fails closed, never fake):');
  for (const entry of readiness) {
    console.log(`   ${entry.ready ? '✅' : '❌'} ${entry.platform.padEnd(16)} ${entry.ready ? 'ready' : `needs ${entry.description}`}`);
  }

  const notReady = readiness.filter((p) => !p.ready);
  if (notReady.length > 0) {
    console.warn(
      `⚠️ Cannot publish for real on: ${notReady.map((p) => p.platform).join(', ')}. ` +
        `Set ${notReady.map((p) => p.description).join(' | ')} in .env.local. ` +
        `Posts on those platforms fail with CREDENTIALS_NOT_CONFIGURED instead of reporting a fake success.`
    );
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : [])
  ],
  credentials: true
}));
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// ---------------------------------------------------------------------------
// API Routes (Multi-tenant Architecture per docs/03-api-and-publishers.md)
// ---------------------------------------------------------------------------
app.use('/api/organizations', organizationsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/social-accounts', socialAccountsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/cron', cronRouter);
app.use('/api/auth', authRouter);
app.use('/api/media', mediaRouter);
app.use('/api/libraries', librariesRouter);
app.use('/api/bulk', bulkRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/settings', settingsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'social-scheduler-backend',
    uptime: process.uptime(),
    persistence: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'supabase' : 'local-json',
    // 'sandbox' means every publish returns a simulated result — never ship it.
    publishing: isSandboxMode() ? 'sandbox' : 'live',
    platforms_ready: publishReadiness().filter((p) => p.ready).map((p) => p.platform),
  });
});

// ---------------------------------------------------------------------------
// Server-side Scheduler Loop (Step 4 — replaces client-side setInterval)
//
// Runs every 60 seconds on the server. This means posts will be published
// even if the browser tab is closed or the frontend is offline.
// ---------------------------------------------------------------------------
async function runSchedulerLoop() {
  try {
    const { runSchedulerCycle } = await import('./routes/scheduler.js');
    const res = await runSchedulerCycle();
    if (res && (res as any).processed > 0) {
      console.log(`⏰ Scheduler: Processed ${(res as any).processed} due post(s)`);
    }
  } catch (err: any) {
    console.error('Scheduler loop error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Server-side Metrics Sync Loop
//
// Fetches updated engagement metrics from each platform every 15 minutes.
// ---------------------------------------------------------------------------
async function runMetricsSyncLoop() {
  try {
    const { db } = await import('./db.js');
    const { getPublisher } = await import('./publishers/index.js');

    const publishedPosts = await db.getPosts({ status: 'published' });
    const eligible = publishedPosts.filter((p) => p.platform_post_id);

    let recorded = 0;
    for (const post of eligible) {
      const account = await db.getSocialAccountById(post.social_account_id);
      if (!account) continue;

      try {
        const publisher = getPublisher(post.platform);
        const metric = await publisher.fetchMetrics(post, account);
        await db.createPostMetric({
          post_id: post.id,
          likes: metric.likes,
          comments: metric.comments,
          shares: metric.shares,
          impressions: metric.impressions
        });
        recorded++;
      } catch (err: any) {
        // Adapters that cannot report engagement honestly fail instead of
        // inventing numbers; that is expected, so it is not worth an error log.
        if (err?.code !== 'METRICS_NOT_AVAILABLE' && err?.code !== 'PLATFORM_NOT_AVAILABLE') {
          console.warn(`Metrics sync failed for post ${post.id} (${post.platform}): ${err.message}`);
        }
      }
    }

    if (eligible.length > 0) {
      console.log(`📊 Metrics sync: recorded metrics for ${recorded} of ${eligible.length} published post(s)`);
    }
  } catch (err: any) {
    console.error('Metrics sync loop error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Social Scheduler Backend running on http://localhost:${PORT}`);
  console.log(`📡 Persistence: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Supabase Postgres' : 'Local JSON (configure .env.local for Supabase)'}`);

  // Kick off scheduler loop every 60 seconds
  setInterval(runSchedulerLoop, 60_000);
  // Kick off metrics sync every 15 minutes
  setInterval(runMetricsSyncLoop, 15 * 60_000);

  // Run once at startup to catch any posts that were due while server was down
  setTimeout(runSchedulerLoop, 5000);
  setTimeout(runMetricsSyncLoop, 10000);
});

export default app;
