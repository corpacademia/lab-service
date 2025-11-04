// server.js
'use strict';

// Load env first
require('dotenv').config();

const http = require('http');
const app = require('./src/app'); // Express app

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer(app);

// Start listening
server.listen(PORT, HOST, () => {
  console.log(`✅ Lab service running on http://${HOST}:${PORT}`);
});

// Handle startup errors (e.g., port in use)
server.on('error', (err) => {
  console.error('❌ Failed to start Lab Service:', err && err.stack || err);
  process.exit(1);
});

// Graceful shutdown (for ECS/K8s)
const shutdown = (signal) => {
  console.log(`⚠️  Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    console.log('✅ HTTP server closed.');
    process.exit(0);
  });

  // Force exit after 30s
  setTimeout(() => {
    console.error('⏳ Shutdown timed out, forcing exit.');
    process.exit(1);
  }, 30_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled promise rejections & exceptions
process.on('unhandledRejection', (reason, p) => {
  console.error('🚨 Unhandled Rejection at:', p, 'reason:', reason);
  shutdown('UNHANDLED_REJECTION');
});

process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err && err.stack || err);
  shutdown('UNCAUGHT_EXCEPTION');
});

module.exports = server;
