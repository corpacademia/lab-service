const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  user: process.env.USER || 'postgres',
  host: process.env.HOST || 'database-1.cmjc4ss04pqf.us-east-1.rds.amazonaws.com',
  database: process.env.DATABASE || 'golab',
  password: process.env.PASSWORD,
  port: process.env.DATABASE_PORT || 5432,

  // ✅ Fix: Enable SSL for AWS RDS
  ssl: {
    rejectUnauthorized: false, // allows secure connection without CA verification
    // For production (stronger security), use:
    // ca: fs.readFileSync('/etc/ssl/certs/rds-ca-bundle.pem').toString(),
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL successfully');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL client error', err);
  process.exit(-1);
});

module.exports = pool;
