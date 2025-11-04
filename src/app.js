// app.js
'use strict';

require('dotenv').config(); // load env early

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');

const app = express();

// Import controllers / routers
const labRouter = require('./routes/labRoutes'); // adjusted relative path for typical structure
const { insertPaymentAndAssignLab } = require('./controllers/labCartController');

// Initialize DB tables if module has side-effects
// keep if labTables runs migrations/creates tables on require
try {
  require('./db/labTables');
} catch (e) {
  // log but don't crash app startup here — database init might be optional
  console.warn('labTables init skipped or failed at require():', e && e.message ? e.message : e);
}

// ---------------------------
// Middlewares
// ---------------------------

// Webhook that needs raw body (must be mounted before bodyParser.json)
app.use('/webhook', express.raw({ type: 'application/json' }), insertPaymentAndAssignLab);

// Body parsers
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// CORS — in production set FRONTEND_URL env to your Cloudfront / domain
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(cookieParser());

// Serve generated files (if any)
app.use('/generated', express.static(path.join(__dirname, 'controllers')));

// Serve uploaded files safely from public/uploads
app.use('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'public', 'uploads', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ---------------------------
// Health endpoint for ALB
// ---------------------------
// Keep extremely lightweight so ALB health check won't fail due to DB/Redis issues.
app.get('/health', (_req, res) => res.status(200).send('OK'));

// If you want a readiness probe that verifies DB/Redis, implement /ready or /readyz
// and perform async checks there (used by deployments that want dependency checks).

// ---------------------------
// Application routes
// ---------------------------
app.use('/', labRouter);

// ---------------------------
// Generic error handler
// ---------------------------
app.use((err, _req, res, _next) => {
  // Log error stack for debugging (ECS logs)
  console.error('Unhandled server error:', err && err.stack ? err.stack : err);
  const status = err && err.status ? err.status : 500;
  const msg = err && err.message ? err.message : 'Internal Server Error';
  // In production, avoid sending stack traces to client
  res.status(status).json({ error: msg });
});

module.exports = app;
