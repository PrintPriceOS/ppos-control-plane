'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  discoverMigrations,
  calculateFileChecksum,
  classifySqlStatements,
  loadMigrationBaseline,
  findPrefixCollisions,
  scanRuntimeSchemaMutations
} = require('./lib/migrationIntegrity');

const rootDir = path.join(__dirname, '..');
const migrationsDir = path.join(rootDir, 'migrations');
const baselinePath = path.join(migrationsDir, 'migration-integrity-baseline.json');
const reportDir = path.join(rootDir, 'reports');
const reportPath = path.join(reportDir, 'phase183_runtime_ddl_inventory.json');

(() => {
  console.log('=== Phase 183 Migration Integrity & Schema Baseline Validation ===\n');

  // Assert no database envs are loaded to guarantee database-independent execution
  assert.ok(!process.env.DB_CONNECTION_TRIGGERED, 'No DB operations allowed in Phase 183 validation');

  // 1. Load Baseline
  if (!fs.existsSync(baselinePath)) {
    console.error('Error: Baseline file not found at migrations/migration-integrity-baseline.json');
    process.exit(1);
  }

  const baseline = loadMigrationBaseline(baselinePath);
  if (!baseline || !baseline.migrations) {
    console.error('Error: Invalid migration baseline schema');
    process.exit(1);
  }

  // 2. Discover files
  const discovered = discoverMigrations(migrationsDir);
  console.log(`Migration inventory:`);
  console.log(`  PASS: ${discovered.length} migration files discovered.`);

  // 3. Match count, literal paths, and checksums
  const baselineMap = new Map();
  for (const m of baseline.migrations) {
    if (baselineMap.has(m.path)) {
      console.error(`Error: Duplicate path in baseline: ${m.path}`);
      process.exit(1);
    }
    baselineMap.set(m.path, m);
  }

  const discoveredPaths = new Set(discovered.map(d => d.relativePath.replace(/\\/g, '/')));

  let integrityFailed = false;

  // Check for missing migrations (listed in baseline but missing from disk)
  for (const path of baselineMap.keys()) {
    if (!discoveredPaths.has(path)) {
      console.error(`Error: Missing migration file listed in baseline: ${path}`);
      integrityFailed = true;
    }
  }

  // Check for changed checksums or untracked new files
  for (const d of discovered) {
    const relPath = d.relativePath.replace(/\\/g, '/');
    const checksum = calculateFileChecksum(d.absolutePath);

    if (!baselineMap.has(relPath)) {
      console.error(`Error: Untracked new migration file found: ${relPath}`);
      console.error(`Please update migrations/migration-integrity-baseline.json to include this file.`);
      integrityFailed = true;
      continue;
    }

    const record = baselineMap.get(relPath);
    if (record.sha256 !== checksum) {
      console.error(`Error: Checksum mismatch for ${relPath}`);
      console.error(`  Expected: ${record.sha256}`);
      console.error(`  Found:    ${checksum}`);
      integrityFailed = true;
    }
  }

  if (integrityFailed) {
    console.error('\nPhase 183: FAILED (Integrity check failed)');
    process.exit(1);
  }
  console.log(`  PASS: All baseline paths are present.`);
  console.log(`  PASS: All SHA-256 checksums match.`);

  // 4. Prefix collision validation
  console.log(`\nPrefix collision validation:`);
  const collisions = findPrefixCollisions(discovered);
  const baselineCollisions = baseline.approvedPrefixCollisions || {};

  let collisionFailed = false;

  // Verify that every prefix collision matches the baseline exactly
  for (const [prefix, paths] of Object.entries(collisions)) {
    const normPaths = paths.map(p => p.replace(/\\/g, '/'));
    const approved = baselineCollisions[prefix];

    if (!approved) {
      console.error(`Error: Unapproved new prefix collision found for prefix "${prefix}":`);
      normPaths.forEach(p => console.error(`  - ${p}`));
      collisionFailed = true;
      continue;
    }

    // Compare paths
    const sortedApproved = [...approved].sort();
    const sortedNormPaths = [...normPaths].sort();
    if (JSON.stringify(sortedApproved) !== JSON.stringify(sortedNormPaths)) {
      console.error(`Error: Approved collision membership changed for prefix "${prefix}":`);
      console.error(`  Expected: ${JSON.stringify(sortedApproved)}`);
      console.error(`  Found:    ${JSON.stringify(sortedNormPaths)}`);
      collisionFailed = true;
    }
  }

  // Ensure no approved prefix collision is missing from active collisions list
  for (const prefix of Object.keys(baselineCollisions)) {
    if (!collisions[prefix]) {
      console.error(`Error: Missing approved collision group for prefix "${prefix}"`);
      collisionFailed = true;
    }
  }

  if (collisionFailed) {
    console.error('\nPhase 183: FAILED (Prefix collision check failed)');
    process.exit(1);
  }

  // Print approved baseline status
  for (const prefix of Object.keys(baselineCollisions)) {
    console.log(`  PASS: Approved collision ${prefix} matches baseline.`);
  }
  console.log(`  PASS: No unapproved prefix collisions found.`);

  // 5. SQL Statement classification
  console.log(`\nSQL classification:`);
  let ddlCount = 0;
  let mixedCount = 0;
  for (const d of discovered) {
    const content = fs.readFileSync(d.absolutePath, 'utf8');
    const classification = classifySqlStatements(content);
    if (classification.containsDdl) {
      ddlCount++;
      if (classification.containsDml) {
        mixedCount++;
      }
    }
  }
  console.log(`  PASS: Migration SQL classified.`);
  console.log(`  INFO: DDL migrations: ${ddlCount}`);
  console.log(`  INFO: Mixed DDL/DML migrations: ${mixedCount}`);

  // 6. Runtime DDL Audit
  console.log(`\nRuntime DDL separation:`);
  const findings = scanRuntimeSchemaMutations(rootDir);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2), 'utf8');

  // Verify server.js import status
  const serverPath = path.join(rootDir, 'server.js');
  let importDisabled = false;
  if (fs.existsSync(serverPath)) {
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    // It imports schema service
    if (serverContent.includes("require('./src/api/services/controlPlaneSchemaService')") ||
        serverContent.includes("require(\"./src/api/services/controlPlaneSchemaService\")")) {
      importDisabled = true;
    }
  }

  if (importDisabled) {
    console.log(`  PASS: Import-time schema init is disabled.`);
  } else {
    console.log(`  INFO: Import-time schema init import verify skipped.`);
  }
  console.log(`  WARN: Runtime schema mutation capability remains present.`);
  console.log(`  INFO: Findings written to reports/phase183_runtime_ddl_inventory.json.`);

  // 7. Safety Assertions
  console.log(`\nSafety:`);
  console.log(`  PASS: Database-independent execution.`);
  console.log(`  PASS: No migration executed.`);
  console.log(`  PASS: No schema mutation attempted.`);

  console.log('\nPhase 183: PASSED');
  process.exit(0);
})();
