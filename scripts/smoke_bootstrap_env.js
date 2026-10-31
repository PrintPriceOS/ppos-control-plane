'use strict';

/**
 * scripts/smoke_bootstrap_env.js
 * Shared env bootstrap for acceptance smokes.
 * Loads dotenv and validates required env vars without printing values.
 */
require('dotenv').config();

const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];

const missing = REQUIRED_ENV.filter(name => !process.env[name]);

if (missing.length > 0) {
  console.error(`FATAL-CONFIG-ERROR: Missing required environment variables: ${missing.join(', ')}`);
  console.error('Ensure .env file is present and contains all required variables.');
  process.exit(1);
}

for (const name of REQUIRED_ENV) {
  console.log(`  ENV ${name}: present (length=${process.env[name].length})`);
}

module.exports = { REQUIRED_ENV };
