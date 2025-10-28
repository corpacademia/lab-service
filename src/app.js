// app.js
'use strict';

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const labRouter = require('../src/routes/labRoutes');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');

const app = express();

// If you have a webhook that requires raw body (e.g. Stripe), mount it BEFORE bodyParser.json
// Replace path/controller reference with your actual controller
const { insertPaymentAndAssignLab } = require('./controllers/labCartController');

// initialize DB tables or run side-effects if required
// require will execute; keep if your file has side-effects you need
require('./db/labTables');

// --------------------------------------------------
// Middlewares
// --------------------------------------------------
// raw webhook route (keeps raw body for signature verification)
app.use('/webhook', express.raw({ type: 'application/json' }), insertPaymentAndAssignLab);

// JSON / URL-encoded body parsers
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// CORS - use FRONTEND_URL env in production
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(cookieParser());

// Serve generated files from controllers folder (if you generate files there)
app.use('/generated', express.static(path.join(__dirname, 'controllers')));

// Custom uploads route — serves files from ./public/uploads
app.use('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'public', 'uploads', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  // serve inline so browser can render images/pdf; change to attachment to force download
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// --------------------------------------------------
// Health endpoint for ALB / ECS target group
// --------------------------------------------------
app.get('/health', (req, res) => {
  // Keep this extremely lightweight (avoid DB/Redis checks that may slow or fail startup).
  // If you want to check dependencies, implement a /ready or /readyz endpoint that performs async checks.
  res.status(200).send('OK');
});

// --------------------------------------------------
// Application routes
// --------------------------------------------------
app.use('/', labRouter);

// --------------------------------------------------
// Generic error handler
// --------------------------------------------------
app.use((err, req, res, next) => {
  // Nice and explicit logging for ECS logs
  console.error('Unhandled server error:', err && err.stack ? err.stack : err);
  const status = err && err.status ? err.status : 500;
  const msg = err && err.message ? err.message : 'Internal Server Error';
  // Do not leak stack in production; consider showing less info based on NODE_ENV
  res.status(status).json({ error: msg });
});

module.exports = app;


app.use('/',labRouter);




module.exports = app;
