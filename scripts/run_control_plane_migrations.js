'use strict';

const path = require('path');
const fs = require('fs');

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`=== PPOS Control Plane Migration CLI Runner ===`);

  if (isDryRun) {
    // DRY-RUN: Inspect pending migrations — zero DDL executed.
    // PPOS_MIGRATION_EXECUTION is intentionally NOT set in dry-run mode.
    console.log(`[DRY-RUN MODE] Inspecting migration files. No DDL will be executed.\n`);
    const { discoverMigrations, verifyMigrationBaseline } = require('./lib/migrationIntegrity');
    const migrationsDir = path.join(__dirname, '../migrations');
    const baselinePath = path.join(migrationsDir, 'migration-integrity-baseline.json');

    const integrity = verifyMigrationBaseline(migrationsDir, baselinePath);
    if (!integrity.ok) {
      console.error(`[DRY-RUN] FAIL: Baseline integrity check failed — ${integrity.error}`);
      process.exit(1);
    }
    console.log(`[DRY-RUN] PASS: Baseline integrity verified.`);

    const { migrations } = discoverMigrations(migrationsDir);
    console.log(`[DRY-RUN] ${migrations.length} migration files found.`);
    console.log(`[DRY-RUN] Dry-run complete. No DDL executed.`);
    return;
  }

  // LIVE MIGRATION — requires explicit opt-in
  // Set migration context AFTER resolving the dry-run branch
  process.env.PPOS_MIGRATION_EXECUTION = 'true';
  process.env.PPOS_ENABLE_SCHEMA_MUTATION = 'true';

  const migrationService = require('../src/api/services/migrationService');
  const mysqlClient = require('../src/api/services/mysqlClient');

  try {
    console.log(`Initializing migration ledger table...`);
    const ledgerModule = require('../src/migrations/phase184g_migration_ledger_schema');
    await ledgerModule.up(mysqlClient);

    console.log(`Applying pending migrations...`);
    const service = new migrationService();
    await service.runMigrations();
    console.log(`Migration execution complete.`);
  } catch (err) {
    console.error(`Migration CLI failed:`, err.message);
    process.exit(1);
  } finally {
    try { await mysqlClient.closePool(); } catch (e) {}
  }
}

run();
