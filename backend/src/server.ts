import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from multiple possible locations
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

import accountsRouter from './routes/accounts.js';
import postsRouter from './routes/posts.js';
import metricsRouter from './routes/metrics.js';
import schedulerRouter from './routes/scheduler.js';
import cronRouter from './routes/cron.js';
import authRouter from './routes/auth.js';
import mediaRouter from './routes/media.js';

const app = express();
const PORT = process.env.PORT || 5001;

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
app.use(express.json({ limit: '10mb' }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api/accounts', accountsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/cron', cronRouter);
app.use('/api/auth', authRouter);
app.use('/api/media', mediaRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'social-scheduler-backend',
    uptime: process.uptime(),
    persistence: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'supabase' : 'local-json'
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
    const { db } = await import('./db.js');
    const { getPublisher } = await import('./publishers/index.js');

    const duePosts = await db.getDueScheduledPosts();
    if (duePosts.length === 0) return;

    console.log(`⏰ Scheduler: ${duePosts.length} post(s) due for publishing`);

    for (const post of duePosts) {
      await db.updatePost(post.id, { status: 'publishing' });

      try {
        const account = await db.getSocialAccountById(post.social_account_id);
        if (!account) throw new Error(`Account ${post.social_account_id} not found`);

        const publisher = getPublisher(post.platform);
        const result = await publisher.publish(post, account);

        await db.updatePost(post.id, {
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: result.platform_post_id,
          error_reason: null
        });

        console.log(`✅ Scheduler: Published post ${post.id} → ${result.platform_post_id}`);
      } catch (err: any) {
        await db.updatePost(post.id, {
          status: 'failed',
          error_reason: err.message || 'Unknown publishing error'
        });
        console.error(`❌ Scheduler: Failed to publish post ${post.id}: ${err.message}`);
      }
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
      } catch (_) {
        // Silently skip individual metric failures
      }
    }

    if (eligible.length > 0) {
      console.log(`📊 Metrics sync: Updated ${eligible.length} published post(s)`);
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
