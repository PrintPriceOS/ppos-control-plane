'use strict';

const fs = require('fs');
const path = require('path');

const UNSAFE_TRUE_FLAGS = [
  'FULL_PUBLIC=true',
  'OPEN_MARKETPLACE=true',
  'PUBLIC_SIGNUP=true',
  'PUBLIC_BETA=true',
  'PAYMENT_EXECUTION_ENABLED=true',
  'PROVIDER_EXTERNAL_SUBMISSION_ENABLED=true',
  'EXTERNAL_TAX_SUBMISSION_ENABLED=true',
  'EXTERNAL_ACCOUNTING_SUBMISSION_ENABLED=true',
  'SOURCE_MUTATION_ENABLED=true'
];

function applyPatch() {
  const rootDir = path.join(__dirname, '..');
  const envPath = path.join(rootDir, '.env');

  if (!fs.existsSync(envPath)) {
    throw new Error('FATAL: .env file is missing from root directory. Cannot apply patch.');
  }

  const patchFile = path.join(path.resolve('/tmp'), 'ppos_missing_env_additions.env');
  if (!fs.existsSync(patchFile)) {
    throw new Error('FATAL: Patch file ppos_missing_env_additions.env is missing.');
  }

  const patchContent = fs.readFileSync(patchFile, 'utf8');

  // Verify unsafe flags in patch
  for (const flag of UNSAFE_TRUE_FLAGS) {
    if (patchContent.includes(flag)) {
      throw new Error(`FATAL: Unsafe patch content detected: ${flag}`);
    }
  }

  // Verify non-placeholder DATABASE_URL
  if (patchContent.includes('DATABASE_URL=') && !patchContent.includes('DATABASE_URL=REQUIRED_MANUAL_DATABASE_VALUE')) {
    // If DATABASE_URL is uncommented and has some value, block it unless ALLOW_UNSAFE_DB_URL is set
    if (process.env.ALLOW_UNSAFE_DB_URL !== 'true') {
      throw new Error('FATAL: Patch contains unredacted or raw DATABASE_URL value.');
    }
  }

  // Verify secret-looking values in generated output
  const lines = patchContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Check if an active line contains secret / password / key
    const parts = trimmed.split('=');
    if (parts.length > 1) {
      const name = parts[0].toUpperCase();
      const val = parts.slice(1).join('=');
      if (val && (name.includes('SECRET') || name.includes('JWT') || name.includes('PASSWORD') || name.includes('KEY') || name.includes('TOKEN'))) {
        throw new Error(`FATAL: Secret-looking active variable found in patch: ${name}`);
      }
    }
  }

  // Load existing env file to check keys
  const existingContent = fs.readFileSync(envPath, 'utf8');
  const existingLines = existingContent.split('\n');
  const existingKeys = new Set();
  for (const line of existingLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      existingKeys.add(parts[0].trim());
    }
  }

  // Filter patch lines to only include missing ones
  const patchLines = patchContent.split('\n');
  const addedLines = [];
  const addedNames = [];

  for (const line of patchLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      addedLines.push(line);
      continue;
    }
    if (trimmed.startsWith('#')) {
      addedLines.push(line);
      continue;
    }
    const parts = trimmed.split('=');
    const key = parts[0].trim();
    if (!existingKeys.has(key)) {
      addedLines.push(line);
      addedNames.push(key);
    } else {
      // Already exists, skip it
      addedLines.push(`# SKIPPED (already present): ${line}`);
    }
  }

  if (addedNames.length === 0) {
    console.log('No new missing environment variables to apply.');
    return { backupPath: null, addedCount: 0 };
  }

  // Create backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${envPath}.backup.phase135_1_${timestamp}`;
  fs.writeFileSync(backupPath, existingContent, 'utf8');
  console.log(`Backup created at: ${backupPath}`);

  // Append new variables
  let newContent = existingContent;
  if (!newContent.endsWith('\n')) {
    newContent += '\n';
  }
  newContent += `\n# --- ADDED BY PHASE 135.1 ENV PATCH RUN ON ${new Date().toISOString()} ---\n`;
  newContent += addedLines.join('\n') + '\n';

  // Perform write
  if (process.env.APPLY_ENV_PATCH === 'true') {
    fs.writeFileSync(envPath, newContent, 'utf8');
    console.log(`Successfully appended ${addedNames.length} missing variables to .env.`);
    for (const name of addedNames) {
      console.log(`  Added: ${name} [REDACTED]`);
    }
  } else {
    console.log(`DRY RUN: Would append ${addedNames.length} missing variables to .env.`);
    for (const name of addedNames) {
      console.log(`  Would Add: ${name} [REDACTED]`);
    }
    console.log('Invoke with APPLY_ENV_PATCH=true to commit changes.');
  }

  return {
    backupPath,
    addedCount: addedNames.length,
    addedNames
  };
}

if (require.main === module) {
  try {
    applyPatch();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { applyPatch };
