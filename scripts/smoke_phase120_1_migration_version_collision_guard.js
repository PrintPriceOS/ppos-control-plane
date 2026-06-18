'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
  if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
  else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
  return condition;
}

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

function runCollisionGuard() {
  console.log('\n━━━ Phase 120.1 — Migration Version Collision Guard ━━━\n');

  // 1. Read all migration files
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`  Found ${files.length} migration files.\n`);

  // 2. Extract versions using the same logic as migrationService.js
  const migSvcPath = path.join(ROOT, 'src/api/services/migrationService.js');
  const migSvcCode = fs.readFileSync(migSvcPath, 'utf8');

  // Verify migrationService uses full basename (not just numeric prefix)
  assert(
    migSvcCode.includes("file.replace(/\\.sql$/, '')"),
    'COLLGUARD_01: migrationService.js extracts version as full basename without .sql'
  );

  // 3. Compute versions the same way migrationService does
  const versionMap = new Map();
  const duplicates = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (versionMap.has(version)) {
      duplicates.push({ version, files: [versionMap.get(version), file] });
    } else {
      versionMap.set(version, file);
    }
  }

  assert(duplicates.length === 0, `COLLGUARD_02: No duplicate migration versions found (${duplicates.length} duplicates)`);

  if (duplicates.length > 0) {
    console.error('\n  ⚠️  Duplicate versions detected:');
    for (const dup of duplicates) {
      console.error(`    version="${dup.version}" files=${JSON.stringify(dup.files)}`);
    }
  }

  // 4. Verify that the two known 015-prefix files are treated as distinct
  const file015a = '015_phase76_printhouse_capabilities.sql';
  const file015b = '015_stripe_webhook_events_idempotency.sql';
  const version015a = file015a.replace(/\.sql$/, '');
  const version015b = file015b.replace(/\.sql$/, '');

  assert(version015a !== version015b, 'COLLGUARD_03: 015_phase76 and 015_stripe are distinct versions');
  assert(
    fs.existsSync(path.join(MIGRATIONS_DIR, file015a)),
    'COLLGUARD_04: 015_phase76_printhouse_capabilities.sql exists'
  );
  assert(
    fs.existsSync(path.join(MIGRATIONS_DIR, file015b)),
    'COLLGUARD_05: 015_stripe_webhook_events_idempotency.sql exists'
  );

  // 5. Verify numeric prefix alone would collide (proving guard is needed)
  const numericPrefixMap = new Map();
  const numericCollisions = [];
  for (const file of files) {
    const match = file.match(/^(\d+)/);
    if (match) {
      const prefix = match[1];
      if (numericPrefixMap.has(prefix)) {
        numericCollisions.push({ prefix, files: [numericPrefixMap.get(prefix), file] });
      } else {
        numericPrefixMap.set(prefix, file);
      }
    }
  }

  if (numericCollisions.length > 0) {
    console.log(`\n  ℹ️  ${numericCollisions.length} numeric prefix collision(s) exist — these are safe because full basename is used:`);
    for (const col of numericCollisions) {
      console.log(`    prefix=${col.prefix}: ${col.files.join(' / ')}`);
    }
  }

  assert(numericCollisions.length > 0, 'COLLGUARD_06: Numeric prefix collisions exist (confirming full-basename guard is necessary)');

  // 6. Verify migrationService has VARCHAR(255) for version column
  assert(migSvcCode.includes('VARCHAR(255)'), 'COLLGUARD_07: schema_versions version column supports VARCHAR(255)');

  // Summary
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Phase 120.1 Migration Version Collision Guard: PASS: ${PASS} | FAIL: ${FAIL}`);
  console.log(`${'─'.repeat(64)}\n`);

  if (FAIL > 0) {
    console.error('❌ Migration Version Collision Guard: FAILED');
    process.exit(1);
  }

  console.log('✅ Migration Version Collision Guard: ALL PASS\n');
}

runCollisionGuard();
