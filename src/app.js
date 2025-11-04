// app.js
'use strict';

require('dotenv').config(); // load env early

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser'); // you can replace with express.json() if you like
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const helmet = require('helmet'); // optional but recommended
const compression = require('compression'); // optional
const rateLimit = require('express-rate-limit'); // optional

const app = express();

// Import controllers / routers
const labRouter = require('./routes/labRoutes');
const { insertPaymentAndAssignLab } = require('./controllers/labCartController');

// NOTE: if ./db/labTables performs DB work at require time (migrations), prefer to run it
// during an explicit DB init step (e.g. in server.js after initDb()) to avoid blocking startup.
// Keep here only if it's safe to run on require.
try {
  require('./db/labTables');
} catch (e) {
  console.warn('labTables init skipped or failed at require():', e && e.message ? e.message : e);
}

// ---------------------------
// Security & performance middleware (optional but recommended)
// ---------------------------
if (process.env.ENABLE_HELMET !== 'false') {
  try { app.use(helmet()); } catch (e) { console.warn('helmet missing', e); }
}
if (process.env.ENABLE_COMPRESSION !== 'false') {
  try { app.use(compression()); } catch (e) { /* ok */ }
}

// Basic rate limiter for public routes (tune in prod)
if (process.env.ENABLE_RATE_LIMIT !== 'false') {
  try {
    const limiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: Number(process.env.RATE_LIMIT_MAX || 300), // requests per window
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use(limiter);
  } catch (e) { /* no rate-limit installed */ }
}

// ---------------------------
// Middlewares
// ---------------------------

// Webhook that needs raw body (must be mounted before bodyParser.json)
// Important: insertPaymentAndAssignLab must accept a raw Buffer in req.body
app.use('/webhook', express.raw({ type: 'application/json' }), insertPaymentAndAssignLab);

// Body parsers (express.json could be used; keeping bodyParser to match your original)
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// CORS — single origin from env is safest
const frontendOrigin = process.env.FRONTEND_URL || 'https://app.golabing.ai';
app.use(cors({
  origin: frontendOrigin,
  credentials: true
}));

app.use(cookieParser());

// Serve generated files (if any)
app.use('/generated', express.static(path.join(__dirname, 'controllers')));

// ---------------------------
// Safe uploads route
// ---------------------------
// Use express.static for public files when possible. If you need auth/per-file checks,
// keep a route — but sanitize filename and stream with error handling.
app.get('/uploads/:filename', (req, res) => {
  try {
    const raw = req.params.filename || '';
    // Basic sanitize: allow only filename chars (alphanumeric, dash, underscore, dot)
    // and reject path separators to prevent traversal.
    if (!/^[a-zA-Z0-9._-]+$/.test(raw)) {
      return res.status(400).send('Invalid filename');
    }

    // Resolve path and ensure it's inside the uploads folder
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    const filePath = path.join(uploadsDir, raw);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(uploadsDir) + path.sep) && resolved !== path.resolve(uploadsDir)) {
      // additional protection: file must reside within uploadsDir
      return res.status(400).send('Invalid filename');
    }

    // Use async stat to avoid race conditions with existsSync
    fs.stat(resolved, (err, stats) => {
      if (err || !stats.isFile()) {
        return res.status(404).send('File not found');
      }

      const mimeType = mime.lookup(resolved) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      // Use inline for preview; set attachment for forced download if needed
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolved)}"`);

      const stream = fs.createReadStream(resolved);
      // handle stream errors
      stream.on('error', (streamErr) => {
        console.error('File stream error:', streamErr && streamErr.stack || streamErr);
        if (!res.headersSent) res.status(500).end('Error reading file');
        else res.end();
      });
      stream.pipe(res);
    });
  } catch (ex) {
    console.error('Unexpected error in /uploads/:filename', ex && ex.stack || ex);
    res.status(500).send('Internal Server Error');
  }
});

// ---------------------------
// Health endpoint for ALB
// ---------------------------
// lightweight — must not call DB here
app.get('/health', (_req, res) => res.status(200).send('OK'));

// Readiness endpoint (optional) — non-blocking cached DB status is better if you want DB-aware readiness
app.get('/ready', async (_req, res) => {
  // Example: if you maintain a cached `dbConnected` flag elsewhere, check that here.
  res.status(200).json({ ready: true, pid: process.pid, ts: Date.now() });
});

// ---------------------------
// Application routes
// ---------------------------
app.use('/', labRouter);

// ---------------------------
// Generic error handler (4 args ensures Express treats it as an error handler)
// ---------------------------
app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err && err.stack ? err.stack : err);

  const status = err && err.status ? err.status : 500;
  const msg = (process.env.NODE_ENV === 'production')
    ? (err && err.message ? err.message : 'Internal Server Error')
    : (err && err.stack ? err.stack : err);

  // Avoid exposing internals in production; above logic respects NODE_ENV
  res.status(status).json({ error: msg });
});

module.exports = app;
