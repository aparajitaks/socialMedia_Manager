#!/usr/bin/env node
/**
 * Dedicated Publishing Worker
 *
 * This is a standalone worker process that:
 * 1. Periodically polls the database for due publish jobs
 * 2. Claims jobs atomically using PostgreSQL row-level locking
 * 3. Processes jobs by calling the platform publishers
 * 4. Handles retries with exponential backoff
 * 5. Updates job status in the database
 *
 * Multiple worker instances can run safely - they use database locking
 * to prevent duplicate processing of the same job.
 *
 * Usage:
 *   node backend/src/worker.ts
 *
 * Environment variables:
 *   WORKER_POLL_INTERVAL_MS - Polling interval in milliseconds (default: 5000)
 *   WORKER_SHUTDOWN_TIMEOUT_MS - Graceful shutdown timeout (default: 30000)
 */

import { publishingQueueWorker } from './queue/publisher-worker.js';

const WORKER_POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10);
const WORKER_SHUTDOWN_TIMEOUT_MS = parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || '30000', 10);

let isRunning = true;
let cycleCount = 0;

async function workerLoop() {
  while (isRunning) {
    cycleCount++;
    const startTime = Date.now();

    try {
      console.log(`[Worker Cycle ${cycleCount}] Starting...`);

      const stats = await publishingQueueWorker.processDueJobs();

      const duration = Date.now() - startTime;
      console.log(
        `[Worker Cycle ${cycleCount}] Completed in ${duration}ms - ` +
          `Processed: ${stats.processed}, ` +
          `Completed: ${stats.completed}, ` +
          `Failed: ${stats.failed}, ` +
          `Retried: ${stats.retried}`
      );

      if (stats.skipped) {
        console.log(`[Worker Cycle ${cycleCount}] Skipped: ${stats.reason}`);
      }
    } catch (err: any) {
      console.error(`[Worker Cycle ${cycleCount}] Error:`, err.message);
    }

    // Wait for the poll interval (or check if we should shutdown sooner)
    if (isRunning) {
      await new Promise((resolve) => setTimeout(resolve, WORKER_POLL_INTERVAL_MS));
    }
  }

  console.log('[Worker] Loop terminated');
}

// Handle graceful shutdown
async function handleShutdown(signal: string) {
  console.log(`[Worker] Received ${signal}, initiating graceful shutdown...`);
  isRunning = false;

  // Give the worker time to finish current cycle
  const shutdownStart = Date.now();
  await publishingQueueWorker.shutdown();

  const shutdownDuration = Date.now() - shutdownStart;
  console.log(`[Worker] Shutdown complete in ${shutdownDuration}ms`);

  process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[Worker] Uncaught exception:', err);
  isRunning = false;
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the worker
console.log('[Worker] Starting publishing worker...');
console.log(`[Worker] Poll interval: ${WORKER_POLL_INTERVAL_MS}ms`);
console.log(`[Worker] Shutdown timeout: ${WORKER_SHUTDOWN_TIMEOUT_MS}ms`);

workerLoop().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
