'use strict';

const path = require('path');
const fs = require('fs');

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`=== PPOS Control Plane Migration CLI Runner ===`);

  if (isDryRun) {
    console.log(`[DRY-RUN MODE] Inspecting database ledger and migrations. Zero DDL will be executed.\n`);
    const { discoverMigrations, verifyMigrationBaseline } = require('./lib/migrationIntegrity');
    const migrationsDir = path.join(__dirname, '../migrations');
    const baselinePath = path.join(migrationsDir, 'migration-integrity-baseline.json');

    // 1. Local files preflight check
    const integrity = verifyMigrationBaseline(migrationsDir, baselinePath);
    if (!integrity.ok) {
      console.error(`[DRY-RUN] FAIL: Local repository checksum divergence — ${integrity.error}`);
      process.exit(4); // Code 4: Checksum divergence
    }

    const mysqlClient = require('../src/api/services/mysqlClient');
    const ledgerRead = require('../src/api/services/migrationLedgerReadService');

    try {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const status = await ledgerRead.evaluateLedgerStatus(baseline);

      console.log(`[DRY-RUN] Ledger evaluation status: ${status.status}`);
      if (status.reason) {
        console.log(`[DRY-RUN] Reason: ${status.reason}`);
      }

      if (status.status === 'DATABASE_UNREACHABLE' || status.status === 'MIGRATION_LEDGER_INCOMPATIBLE') {
        process.exit(5); // Code 5: Ledger unavailable or incompatible
      }

      if (status.status === 'MIGRATION_FAILED' || status.status === 'MIGRATION_IN_PROGRESS') {
        process.exit(3); // Code 3: Failed/stale migration exists
      }

      if (status.status === 'MIGRATION_CHECKSUM_MISMATCH') {
        process.exit(4); // Code 4: Checksum divergence
      }

      if (status.status === 'PENDING_MIGRATIONS') {
        console.log(`[DRY-RUN] Pending migrations detected.`);
        process.exit(2); // Code 2: Pending migrations exist
      }

      console.log(`[DRY-RUN] All applied migrations match local baseline. DB is up to date.`);
      process.exit(0);

    } catch (err) {
      console.error(`[DRY-RUN] Diagnostic failed:`, err.message);
      process.exit(5);
    } finally {
      try { await mysqlClient.closePool(); } catch (e) {}
    }
  }

  // LIVE MIGRATION — requires explicit opt-in
  process.env.PPOS_MIGRATION_EXECUTION = 'true';
  process.env.PPOS_ENABLE_SCHEMA_MUTATION = 'true';

  const { migrationService } = require('../src/api/services/migrationService');
  const mysqlClient = require('../src/api/services/mysqlClient');

  try {
    console.log(`Initializing migration ledger table...`);
    const ledgerModule = require('../src/migrations/phase184g_migration_ledger_schema');
    await ledgerModule.up(mysqlClient);

    // Evolve ledger safely with Phase 185 schema upgrades if needed
    console.log(`Upgrading migration ledger schema with governance properties...`);
    const ledgerGovModule = require('../src/migrations/phase185_migration_ledger_governance_schema');
    await ledgerGovModule.up(mysqlClient);

    console.log(`Applying pending migrations...`);
    await migrationService.runMigrations();
    console.log(`Migration execution complete.`);
  } catch (err) {
    console.error(`Migration CLI failed:`, err.message);
    process.exit(1);
  } finally {
    try { await mysqlClient.closePool(); } catch (e) {}
  }
}

run();
