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
      const { migrations } = discoverMigrations(migrationsDir);
      
      let migrationCount = 0;
      let baselineMarkerCount = 0;
      let phaseMarkerCount = 0;
      let unresolvedCount = 0;
      let failedCount = 0;
      let startedCount = 0;

      const baselineMap = new Map();
      for (const m of baseline.migrations) {
        const p = m.path || m.relativePath;
        const filename = p.split('/').pop();
        baselineMap.set(filename, m);
      }

      // Read-only inspection query
      try {
        const [rows] = await mysqlClient.getPool().query('SELECT version, description, checksum, state FROM schema_versions');
        for (const row of rows) {
          if (row.state === 'FAILED') {
            failedCount++;
          } else if (row.state === 'STARTED') {
            startedCount++;
          }

          const fileKey = row.description && row.description.endsWith('.sql') 
            ? row.description 
            : `${row.version}.sql`;
          
          if (baselineMap.has(fileKey)) {
            migrationCount++;
          } else if (row.version === '1.0.0' && row.description === 'Initial Production Baseline') {
            baselineMarkerCount++;
          } else if (/^\d{3}$/.test(row.version) && /^Phase \d+:/.test(row.description || '') && !row.checksum) {
            phaseMarkerCount++;
          } else {
            unresolvedCount++;
          }
        }
      } catch (err) {
        // Fallback for legacy tables before migration 135 runs
        try {
          const [rows] = await mysqlClient.getPool().query('SELECT version, description, checksum FROM schema_versions');
          for (const row of rows) {
            const fileKey = row.description && row.description.endsWith('.sql') 
              ? row.description 
              : `${row.version}.sql`;
            
            if (baselineMap.has(fileKey)) {
              migrationCount++;
            } else if (row.version === '1.0.0' && row.description === 'Initial Production Baseline') {
              baselineMarkerCount++;
            } else if (/^\d{3}$/.test(row.version) && /^Phase \d+:/.test(row.description || '') && !row.checksum) {
              phaseMarkerCount++;
            } else {
              unresolvedCount++;
            }
          }
        } catch (e) {
          unresolvedCount = 0;
        }
      }

      const status = await ledgerRead.evaluateLedgerStatus(baseline);

      console.log(`=== Dry-Run Ledger Diagnostic ===`);
      console.log(`Repository migrations   : ${migrations.length}`);
      console.log(`Legacy rows total       : ${migrationCount + baselineMarkerCount + phaseMarkerCount + unresolvedCount}`);
      console.log(`Migration rows resolved : ${migrationCount}`);
      console.log(`Baseline markers        : ${baselineMarkerCount}`);
      console.log(`Phase markers           : ${phaseMarkerCount}`);
      console.log(`Unresolved rows         : ${unresolvedCount}`);
      console.log(`Pending migrations      : ${migrations.length - migrationCount}`);
      console.log(`Failed migrations       : ${failedCount}`);
      console.log(`Started migrations      : ${startedCount}`);
      console.log(`Ledger status           : ${status.status}`);
      if (status.reason) {
        console.log(`Diagnostic detail       : ${status.reason}`);
      }
      console.log(`=================================`);


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
  const { discoverMigrations } = require('./lib/migrationIntegrity');

  try {
    console.log(`Initializing migration ledger table...`);
    const ledgerModule = require('../src/migrations/phase184g_migration_ledger_schema');
    await ledgerModule.up(mysqlClient);

    // Evolve ledger safely with Phase 185 schema upgrades if needed
    console.log(`Upgrading migration ledger schema with governance properties...`);
    const ledgerGovModule = require('../src/migrations/phase185_migration_ledger_governance_schema');
    await ledgerGovModule.up(mysqlClient);

    // Dynamic Safe Backfill and Ledger Alignment
    console.log(`Verifying and normalising database migration ledger records...`);
    const dbPool = mysqlClient.getPool();
    const dbConn = await dbPool.getConnection();

    try {
      // 1. Fetch current database entries
      const [rows] = await dbConn.query('SELECT version, description, checksum, state FROM schema_versions');
      
      const { migrations } = discoverMigrations(path.join(__dirname, '../migrations'));
      const baselinePath = path.join(__dirname, '../migrations/migration-integrity-baseline.json');
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

      const baselineMap = new Map();
      for (const m of baseline.migrations) {
        const p = m.path || m.relativePath;
        const filename = p.split('/').pop();
        baselineMap.set(filename, m);
      }

      let unresolvedRows = 0;
      let backfilledCount = 0;
      let migrationCount = 0;
      let baselineMarkerCount = 0;
      let phaseMarkerCount = 0;
      let failedPreservedCount = 0;
      let startedPreservedCount = 0;
      let appliedPreservedCount = 0;

      for (const row of rows) {
        if (row.state === 'FAILED') {
          failedPreservedCount++;
        } else if (row.state === 'STARTED') {
          startedPreservedCount++;
        } else {
          appliedPreservedCount++;
        }

        const fileKey = row.description && row.description.endsWith('.sql') 
          ? row.description 
          : `${row.version}.sql`;
        
        // Rule 1: Real Migrations
        if (baselineMap.has(fileKey)) {
          migrationCount++;
          const match = baselineMap.get(fileKey);
          const canonicalPath = match.path || match.relativePath;
          const canonicalChecksum = match.canonicalSha256 || match.sha256;

          await dbConn.query(`
            UPDATE schema_versions
            SET
              record_type = 'MIGRATION',
              migration_path = ?,
              checksum = ?,
              state = COALESCE(NULLIF(state, ''), 'APPLIED'),
              execution_id = COALESCE(execution_id, '00000000-0000-0000-0000-000000000000'),
              started_at = COALESCE(started_at, applied_at, NOW(3)),
              applied_at = CASE WHEN state = 'APPLIED' OR state IS NULL OR state = '' THEN COALESCE(applied_at, NOW(3)) ELSE applied_at END
            WHERE version = ? OR description = ?
          `, [canonicalPath, canonicalChecksum, row.version, row.description]);
          backfilledCount++;
          continue;
        }

        // Rule 2: Baseline Marker
        if (row.version === '1.0.0' && row.description === 'Initial Production Baseline') {
          baselineMarkerCount++;
          await dbConn.query(`
            UPDATE schema_versions
            SET
              record_type = 'BASELINE_MARKER',
              migration_path = NULL,
              checksum = '',
              state = COALESCE(NULLIF(state, ''), 'APPLIED'),
              execution_id = COALESCE(execution_id, '00000000-0000-0000-0000-000000000000'),
              started_at = COALESCE(started_at, applied_at, NOW(3)),
              applied_at = CASE WHEN state = 'APPLIED' OR state IS NULL OR state = '' THEN COALESCE(applied_at, NOW(3)) ELSE applied_at END
            WHERE version = ? AND description = ?
          `, [row.version, row.description]);
          backfilledCount++;
          continue;
        }

        // Rule 3: Phase Markers
        if (/^\d{3}$/.test(row.version) && /^Phase \d+:/.test(row.description || '') && !row.checksum) {
          phaseMarkerCount++;
          await dbConn.query(`
            UPDATE schema_versions
            SET
              record_type = 'PHASE_MARKER',
              migration_path = NULL,
              checksum = '',
              state = COALESCE(NULLIF(state, ''), 'APPLIED'),
              execution_id = COALESCE(execution_id, '00000000-0000-0000-0000-000000000000'),
              started_at = COALESCE(started_at, applied_at, NOW(3)),
              applied_at = CASE WHEN state = 'APPLIED' OR state IS NULL OR state = '' THEN COALESCE(applied_at, NOW(3)) ELSE applied_at END
            WHERE version = ? AND description = ?
          `, [row.version, row.description]);
          backfilledCount++;
          continue;
        }

        // Unresolved row
        console.error(`[ERROR] Unresolved/ambiguous migration entry in database: version=${row.version}, desc=${row.description}`);
        unresolvedRows++;
      }

      console.log(`=== Backfill Normalisation Breakdown ===`);
      console.log(`Legacy rows total       : ${rows.length}`);
      console.log(`Migration rows aligned  : ${migrationCount}`);
      console.log(`FAILED rows preserved   : ${failedPreservedCount}`);
      console.log(`STARTED rows preserved  : ${startedPreservedCount}`);
      console.log(`APPLIED rows preserved  : ${appliedPreservedCount}`);
      console.log(`Baseline markers        : ${baselineMarkerCount}`);
      console.log(`Phase markers           : ${phaseMarkerCount}`);
      console.log(`Unresolved rows         : ${unresolvedRows}`);
      console.log(`========================================`);

      if (unresolvedRows > 0) {
        throw new Error(`Migration ledger normalisation failed: ${unresolvedRows} unresolved/ambiguous database rows found.`);
      }

    } finally {
      dbConn.release();
    }


    if (process.env.PPOS_ALLOW_FALSE_APPLIED_140_REPAIR === 'true') {
      console.log(`Executing governed repair for false-APPLIED migration 140...`);
      const { repairFalseAppliedMigration140 } = require('../src/api/services/migrationRepairService');
      const repairConn = await dbPool.getConnection();
      try {
        await repairFalseAppliedMigration140(repairConn);
      } finally {
        repairConn.release();
      }
    }

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
