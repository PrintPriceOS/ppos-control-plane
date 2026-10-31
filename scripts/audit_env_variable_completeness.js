'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'logs', 'backups', 'tmp']);
const EXCLUDED_FILES = new Set(['package-lock.json', 'yarn.lock']);

const SAFETY_FLAGS = new Set([
  'FULL_PUBLIC',
  'OPEN_MARKETPLACE',
  'PUBLIC_SIGNUP',
  'PUBLIC_BETA',
  'PAYMENT_EXECUTION_ENABLED',
  'REFUND_EXECUTION_ENABLED',
  'PAYOUT_EXECUTION_ENABLED',
  'PROVIDER_EXTERNAL_SUBMISSION_ENABLED',
  'EXTERNAL_TAX_SUBMISSION_ENABLED',
  'EXTERNAL_ACCOUNTING_SUBMISSION_ENABLED',
  'SOURCE_MUTATION_ENABLED',
  'AUTO_EXPANSION_ENABLED',
  'SCOPE_AUTO_BROADEN_ENABLED',
  'PARTICIPANT_AUTO_ADD_ENABLED',
  'AUTO_ONBOARDING_ENABLED',
  'AUTO_SESSION_CREATION_ENABLED'
]);

const DATABASE_VARS = new Set([
  'MYSQL_HOST',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
  'DATABASE_URL',
  'MYSQL_PORT',
  'MYSQL_SSL'
]);

const RUNTIME_GOVERNANCE = new Set([
  'FORCE_REAL_DB_SMOKE',
  'ALLOW_SCHEMA_SMOKE_FALLBACK',
  'ALLOW_SMOKE_FALLBACK',
  'ALLOW_MOCK_DB',
  'ALLOW_IN_MEMORY_DB',
  'NODE_ENV',
  'LOG_LEVEL',
  'AUDIT_LOG_REDACTION_ENABLED',
  'EVIDENCE_PACK_REDACTION_ENABLED',
  'REDACT_SECRETS_IN_LOGS',
  'DB_UNREACHABLE'
]);

function isSensitive(name) {
  const n = name.toUpperCase();
  if (DATABASE_VARS.has(name)) return true;
  if (n.includes('SECRET') || n.includes('JWT') || n.includes('PASSWORD') || n.includes('KEY') || n.includes('TOKEN') || n.includes('CREDENTIAL') || n.includes('AUTH') || n.includes('API_KEY')) {
    return true;
  }
  return false;
}

function classifyVariable(name) {
  if (SAFETY_FLAGS.has(name)) return 'safety_flag';
  if (DATABASE_VARS.has(name)) return 'database';
  if (RUNTIME_GOVERNANCE.has(name)) return 'runtime_governance';
  if (isSensitive(name)) return 'sensitive';
  
  const n = name.toUpperCase();
  if (n.includes('PROVIDER') || n.includes('STRIPE') || n.includes('TAX') || n.includes('ACCOUNTING') || n.includes('INTEGRATION') || n.includes('EXTERNAL')) {
    return 'payment_provider_external';
  }
  if (n.includes('TEST') || n.includes('DEV') || n.includes('MOCK') || n.includes('FIXTURE') || n.includes('DEBUG') || n.includes('APPLY_ENV_PATCH')) {
    return 'optional_dev_test';
  }
  return 'unknown';
}

function scanDir(dir, foundVars) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      scanDir(fullPath, foundVars);
    } else if (entry.isFile()) {
      if (EXCLUDED_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name);
      if (['.js', '.ts', '.tsx', '.json', '.sh'].includes(ext)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Match patterns: process.env.VAR or process.env['VAR'] or process.env["VAR"]
          const matches1 = content.matchAll(/process\.env\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
          for (const match of matches1) {
            foundVars.add(match[1]);
          }
          const matches2 = content.matchAll(/process\.env\[['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\]/g);
          for (const match of matches2) {
            foundVars.add(match[1]);
          }
        } catch (e) {
          // ignore read errors
        }
      }
    }
  }
}

function runAudit() {
  const foundVars = new Set();
  const rootDir = path.join(__dirname, '..');
  scanDir(rootDir, foundVars);

  const sortedVars = Array.from(foundVars).sort();
  const present = [];
  const missing = [];
  const classified = {
    present: [],
    missing: [],
    sensitive: [],
    safety_flag: [],
    database: [],
    runtime_governance: [],
    payment_provider_external: [],
    optional_dev_test: [],
    unknown: []
  };

  const dotenvPath = path.join(rootDir, '.env');
  const envFileExists = fs.existsSync(dotenvPath);

  // We read variables directly from process.env (loaded via dotenv)
  for (const name of sortedVars) {
    const isPresent = process.env[name] !== undefined;
    const cat = classifyVariable(name);

    if (isPresent) {
      present.push(name);
      classified.present.push(name);
    } else {
      missing.push(name);
      classified.missing.push(name);
    }

    if (cat === 'safety_flag') classified.safety_flag.push(name);
    else if (cat === 'database') classified.database.push(name);
    else if (cat === 'runtime_governance') classified.runtime_governance.push(name);
    else if (cat === 'sensitive') classified.sensitive.push(name);
    else if (cat === 'payment_provider_external') classified.payment_provider_external.push(name);
    else if (cat === 'optional_dev_test') classified.optional_dev_test.push(name);
    else classified.unknown.push(name);
  }

  // Count sensitive missing
  const sensitiveMissing = missing.filter(name => isSensitive(name) || DATABASE_VARS.has(name));

  // Safety flags status (redacted/safe check)
  const safetyFlagsStatus = {};
  for (const flag of SAFETY_FLAGS) {
    const val = process.env[flag];
    safetyFlagsStatus[flag] = val === 'true' ? 'ENABLED (UNSAFE)' : 'disabled';
  }

  // Fallback flags status
  const fallbackFlags = ['FORCE_REAL_DB_SMOKE', 'ALLOW_SCHEMA_SMOKE_FALLBACK', 'ALLOW_SMOKE_FALLBACK', 'ALLOW_MOCK_DB', 'ALLOW_IN_MEMORY_DB'];
  const fallbackStatus = {};
  for (const flag of fallbackFlags) {
    const val = process.env[flag];
    fallbackStatus[flag] = val === 'true' ? 'enabled' : 'disabled';
  }

  // Recommended additions: missing variables that are NOT database/sensitive/optional_dev_test
  const recommendedAdditions = missing.filter(name => {
    const cat = classifyVariable(name);
    return cat !== 'database' && cat !== 'sensitive' && cat !== 'optional_dev_test';
  });

  return {
    totalExpected: sortedVars.length,
    presentCount: present.length,
    missingCount: missing.length,
    sensitiveMissingCount: sensitiveMissing.length,
    safetyFlagsStatus,
    fallbackStatus,
    recommendedAdditions,
    classified,
    sortedVars,
    present,
    missing,
    envFileExists
  };
}

if (require.main === module) {
  const result = runAudit();
  console.log('=== ENVIRONMENT VARIABLE AUDIT REPORT ===');
  console.log(`Total expected variables found in code: ${result.totalExpected}`);
  console.log(`Present in current environment: ${result.presentCount}`);
  console.log(`Missing in current environment: ${result.missingCount}`);
  console.log(`Sensitive / Database missing count: ${result.sensitiveMissingCount}`);
  console.log('\n--- Classification of Missing Variables ---');
  for (const cat of ['safety_flag', 'database', 'runtime_governance', 'sensitive', 'payment_provider_external', 'optional_dev_test', 'unknown']) {
    const list = result.classified.missing.filter(name => classifyVariable(name) === cat);
    if (list.length > 0) {
      console.log(`* ${cat}: ${list.join(', ')}`);
    }
  }

  console.log('\n--- Safety Invariants Status ---');
  for (const [flag, status] of Object.entries(result.safetyFlagsStatus)) {
    console.log(`  ${flag}: ${status}`);
  }

  console.log('\n--- Fallback / Mock Flags Status ---');
  for (const [flag, status] of Object.entries(result.fallbackStatus)) {
    console.log(`  ${flag}: ${status}`);
  }

  console.log('\n--- Recommended Additions (excluding secrets/DB) ---');
  console.log(result.recommendedAdditions.length > 0 ? result.recommendedAdditions.join(', ') : 'None');
}

module.exports = { runAudit, classifyVariable, isSensitive, SAFETY_FLAGS, DATABASE_VARS, RUNTIME_GOVERNANCE };
