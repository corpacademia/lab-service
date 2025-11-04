// server.js
'use strict';
require('dotenv').config(); // MUST be first

const http = require('http');
const app = require('./src/app'); // your express app
const { initDb, getPool, closePool } = require('./db'); // ./db/index.js
const { startCronJobs, stopCronJobs } = require('./cron'); // ./cron.js
const redis = require('redis'); // ensure "redis" package installed (v4+)

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '0.0.0.0';
const REDIS_HOST = process.env.REDIS_HOST || process.env.REDIS_URL || null; // don't default to localhost in container
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_RETRIES = Number(process.env.REDIS_RETRIES || 5);
const REDIS_BASE_DELAY_MS = Number(process.env.REDIS_BASE_DELAY_MS || 1000);

let redisClient = null;

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`✅ Lab service running on http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server failed to start:', err && err.stack || err);
  process.exit(1);
});

async function connectRedisWithRetry(host, port, retries = REDIS_RETRIES, baseDelay = REDIS_BASE_DELAY_MS) {
  if (!host) {
    console.info('No REDIS_HOST provided — skipping Redis connect.');
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = redis.createClient({ url: `redis://${host}:${port}` });
      client.on('error', (err) => {
        // log redis client errors but don't crash the process
        console.error('Redis client error:', err && err.message || err);
      });
      await client.connect(); // v4 async connect
      console.info(`Redis connected (${host}:${port})`);
      return client;
    } catch (err) {
      console.warn(`Redis connect attempt ${attempt}/${retries} failed: ${err && err.message || err}`);
      if (attempt === retries) {
        console.error('All Redis connect attempts failed — continuing without Redis.');
        return null;
      }
      await new Promise(r => setTimeout(r, baseDelay * attempt));
    }
  }
  return null;
}

// Background init (non-blocking, server already listening)
(async function backgroundInit() {
  try {
    await initDb(); // should implement pg pool + test query with retries
    console.info('DB init finished (connected or retries exhausted).');
  } catch (err) {
    console.warn('DB init failed (continuing):', err && err.message || err);
  }

  // Redis connect (optional) — if REDIS_HOST not set, skip
  try {
    redisClient = await connectRedisWithRetry(REDIS_HOST, REDIS_PORT, REDIS_RETRIES, REDIS_BASE_DELAY_MS);
  } catch (err) {
    console.warn('Redis init threw (continuing):', err && err.message || err);
    redisClient = null;
  }

  // Start cron jobs (cron wrappers must tolerate missing DB/Redis)
  try {
    startCronJobs();
    console.info('Cron jobs started.');
  } catch (err) {
    console.warn('Failed to start cron jobs (continuing):', err && err.message || err);
  }
})();

// Graceful shutdown
const SHUTDOWN_TIMEOUT = Number(process.env.SHUTDOWN_TIMEOUT_MS || 30_000);
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal} — shutting down...`);

  server.close(async (err) => {
    if (err) console.error('Error while closing HTTP server:', err && err.stack || err);
    try {
      stopCronJobs();
    } catch (e) {
      console.warn('stopCronJobs error:', e && e.stack || e);
    }
    try {
      if (redisClient) {
        try { await redisClient.quit(); console.info('Redis client closed.'); } catch (e) { console.warn('Error closing redis client:', e && e.message || e); }
      }
    } catch (e) {
      console.warn('Error during Redis shutdown:', e && e.stack || e);
    }
    try {
      await closePool();
      console.info('DB pool closed.');
    } catch (e) {
      console.warn('Error closing DB pool:', e && e.stack || e);
    } finally {
      console.info('Shutdown complete. Exiting.');
      process.exit(0);
    }
  });

  setTimeout(() => {
    console.warn('Forcing shutdown after timeout.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
  setTimeout(() => shutdown('UNHANDLED_REJECTION'), 100);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack || err);
  setTimeout(() => shutdown('UNCAUGHT_EXCEPTION'), 100);
});

module.exports = server;
