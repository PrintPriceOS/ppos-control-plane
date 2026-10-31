'use strict';

/**
 * src/api/services/migrationRepairService.js
 *
 * Governed Repair Service for Historical False-APPLIED Migration 140 (Phase 192 RC9).
 *
 * Strictly scoped to `migrations/140_phase191e_materials_capacity_leadtimes.sql`.
 * Requires explicit opt-in: `PPOS_ALLOW_FALSE_APPLIED_140_REPAIR=true`.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('migration-repair-service');
const migrationIntegrity = require('../../../scripts/lib/migrationIntegrity');

const TARGET_MIGRATION_PATH = 'migrations/140_phase191e_materials_capacity_leadtimes.sql';

/**
 * Inspects whether migration 140 is in the historical false-APPLIED state.
 */
async function detectFalseAppliedMigration140(connOrDb) {
  const [rows] = await connOrDb.query(`
    SELECT version, description, checksum, state, failure_code, failed_statement_index, previous_failures
    FROM schema_versions
    WHERE migration_path = ? OR description = '140_phase191e_materials_capacity_leadtimes.sql'
       OR version = '140_phase191e_materials_capacity_leadtimes'
  `, [TARGET_MIGRATION_PATH]);

  if (!rows || rows.length === 0) {
    return { detected: false, reason: 'MIGRATION_140_NOT_FOUND' };
  }

  const row = rows[0];
  if (row.state !== 'APPLIED') {
    return { detected: false, state: row.state, reason: 'STATE_NOT_APPLIED' };
  }

  if (row.failure_code === 'ER_FK_INCOMPATIBLE_COLUMNS' && Number(row.failed_statement_index) === 3) {
    return { detected: true, row };
  }

  return { detected: false, reason: 'FAILURE_EVIDENCE_NOT_MATCHED' };
}

/**
 * Executes strictly-governed repair of migration 140 if all 7 preconditions are met.
 */
async function repairFalseAppliedMigration140(connOrDb) {
  const enabled = process.env.PPOS_ALLOW_FALSE_APPLIED_140_REPAIR === 'true';

  // 1. Fetch 140 ledger row
  const [rows] = await connOrDb.query(`
    SELECT version, description, checksum, record_type, migration_path, state,
           execution_id, runner_id, started_at, failed_at, applied_at,
           failure_code, failure_message, failed_statement_index, previous_failures
    FROM schema_versions
    WHERE migration_path = ? OR description = '140_phase191e_materials_capacity_leadtimes.sql'
       OR version = '140_phase191e_materials_capacity_leadtimes'
  `, [TARGET_MIGRATION_PATH]);

  if (!rows || rows.length === 0) {
    return { repaired: false, reason: 'MIGRATION_140_NOT_IN_LEDGER' };
  }

  const row = rows[0];

  // Idempotency check: if already FAILED and has audit marker, return cleanly
  let prevFailures = [];
  try {
    prevFailures = typeof row.previous_failures === 'string'
      ? JSON.parse(row.previous_failures)
      : (row.previous_failures || []);
  } catch (e) {
    prevFailures = [];
  }

  const alreadyRepaired = prevFailures.some(f => f && f.action === 'FALSE_APPLIED_REPAIR_RC9');
  if (row.state === 'FAILED' && alreadyRepaired) {
    logger.info({ event: 'migration_140_repair_already_completed', message: 'Migration 140 already repaired to FAILED (idempotent no-op)' });
    return { repaired: true, idempotent: true, state: 'FAILED' };
  }

  // Precondition A & B: migration_path matches and state is APPLIED
  if (row.state !== 'APPLIED') {
    return { repaired: false, reason: `STATE_IS_${row.state}_NOT_APPLIED` };
  }

  // If not enabled and false APPLIED detected, fail closed
  if (!enabled) {
    const errorMsg = 'GOVERNED_REPAIR_REQUIRED: Migration 140 is in historical false-APPLIED state. Set PPOS_ALLOW_FALSE_APPLIED_140_REPAIR=true to authorize repair.';
    logger.warn({ event: 'migration_140_false_applied_detected_flag_missing', message: errorMsg });
    throw new Error(errorMsg);
  }

  logger.info({ event: 'migration_140_repair_start', message: 'Verifying strict preconditions for migration 140 false-APPLIED repair...' });

  // Precondition C: Historical failure evidence matches
  if (row.failure_code !== 'ER_FK_INCOMPATIBLE_COLUMNS' || Number(row.failed_statement_index) !== 3) {
    throw new Error(`REPAIR_PRECONDITION_FAILED: Historical failure evidence mismatch (observed code='${row.failure_code}', statement_index=${row.failed_statement_index}, expected 'ER_FK_INCOMPATIBLE_COLUMNS' index 3)`);
  }

  // Precondition D: Checksum matches repository baseline
  const baselinePath = path.join(__dirname, '../../../migrations/migration-integrity-baseline.json');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const baselineEntry = baseline.migrations.find(m => (m.path || m.relativePath) === TARGET_MIGRATION_PATH);
  if (!baselineEntry) {
    throw new Error(`REPAIR_PRECONDITION_FAILED: Migration 140 not found in baseline.`);
  }
  const canonicalChecksum = baselineEntry.canonicalSha256 || baselineEntry.sha256;
  if (row.checksum && row.checksum !== canonicalChecksum) {
    throw new Error(`REPAIR_PRECONDITION_FAILED: Checksum mismatch (observed='${row.checksum}', expected='${canonicalChecksum}')`);
  }

  // Precondition E: Partial schema verification
  // Absent tables
  const [absentTableRows] = await connOrDb.query(`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (
      'printhouse_machine_materials',
      'printhouse_site_capacities',
      'printhouse_site_lead_times'
    )
  `);
  if (absentTableRows && absentTableRows.length > 0) {
    const found = absentTableRows.map(t => t.TABLE_NAME).join(', ');
    throw new Error(`REPAIR_PRECONDITION_FAILED: Tables that should be absent are present: [${found}]`);
  }

  // Absent columns on printhouse_machines
  const [absentCols] = await connOrDb.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'printhouse_machines'
      AND COLUMN_NAME IN ('indicative_daily_capacity', 'capacity_unit_name')
  `);
  if (absentCols && absentCols.length > 0) {
    const found = absentCols.map(c => c.COLUMN_NAME).join(', ');
    throw new Error(`REPAIR_PRECONDITION_FAILED: Columns on printhouse_machines that should be absent are present: [${found}]`);
  }

  // Present indexes: uk_mat_cat_id_tenant on materials_catalog and uk_pm_id_tenant on printhouse_machines
  const [presentIndexRows] = await connOrDb.query(`
    SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND (
      (TABLE_NAME = 'materials_catalog' AND INDEX_NAME = 'uk_mat_cat_id_tenant') OR
      (TABLE_NAME = 'printhouse_machines' AND INDEX_NAME = 'uk_pm_id_tenant')
    )
  `);
  if (!presentIndexRows || presentIndexRows.length < 2) {
    throw new Error(`REPAIR_PRECONDITION_FAILED: Partial schema indexes (uk_mat_cat_id_tenant, uk_pm_id_tenant) missing.`);
  }

  // Precondition F & G: Remediation status NOT_STARTED or table absent
  const [remStateCheck] = await connOrDb.query(`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ppos_remediation_state'
  `);
  if (remStateCheck && remStateCheck.length > 0) {
    const [remRows] = await connOrDb.query(`
      SELECT state_value FROM ppos_remediation_state WHERE state_key = 'remediation_140_status'
    `);
    if (remRows && remRows.length > 0 && remRows[0].state_value !== 'NOT_STARTED') {
      throw new Error(`REPAIR_PRECONDITION_FAILED: Remediation status is '${remRows[0].state_value}' (expected 'NOT_STARTED' or absent)`);
    }
  }

  // All 7 preconditions satisfied. Execute governed transition to FAILED with audit marker.
  const auditMarker = {
    action: 'FALSE_APPLIED_REPAIR_RC9',
    repaired_at: new Date().toISOString(),
    previous_state: 'APPLIED',
    new_state: 'FAILED',
    reason: 'Historical false-APPLIED alignment repair'
  };
  prevFailures.push(auditMarker);

  await connOrDb.query(`
    UPDATE schema_versions
    SET
      state = 'FAILED',
      previous_failures = ?,
      failed_at = COALESCE(failed_at, NOW(3))
    WHERE migration_path = ? OR description = '140_phase191e_materials_capacity_leadtimes.sql'
       OR version = '140_phase191e_materials_capacity_leadtimes'
  `, [JSON.stringify(prevFailures), TARGET_MIGRATION_PATH]);

  logger.info({
    event: 'migration_140_repair_success',
    message: 'Governed repair completed: migration 140 state transitioned from APPLIED to FAILED with audit marker FALSE_APPLIED_REPAIR_RC9.'
  });

  return { repaired: true, state: 'FAILED', auditMarker };
}


const TARGET_MIGRATION_161_PATH = 'migrations/161_phase184g_industrial_persistence_ledger.sql';

/**
 * Inspects whether migration 161 is in the failed compatibility view state./**
 * Detects whether migration 161 is in a state requiring governed repair:
 * 1. Historical FAILED state at statement 44 (ER_WRONG_OBJECT / 1347).
 * 2. Orphaned STARTED state where repairFailedMigration161 previously ran (FAILED_161_REPAIR_RETRY)
 *    but execution aborted before applying statements.
 */
async function detectFailedMigration161(connOrDb) {
  const [rows] = await connOrDb.query(`
    SELECT version, description, checksum, state, failure_code, failed_statement_index, previous_failures
    FROM schema_versions
    WHERE migration_path = ? OR description = '161_phase184g_industrial_persistence_ledger.sql'
       OR version = '161_phase184g_industrial_persistence_ledger'
  `, [TARGET_MIGRATION_161_PATH]);

  if (!rows || rows.length === 0) {
    return { detected: false, reason: 'MIGRATION_161_NOT_FOUND' };
  }

  const row = rows[0];

  // Case 1: FAILED state with ER_WRONG_OBJECT at statement 44
  if (row.state === 'FAILED') {
    const isWrongObj = row.failure_code === 'ER_WRONG_OBJECT' || row.failure_code === '1347';
    const isStmt44 = Number(row.failed_statement_index) === 44;
    if (isWrongObj && isStmt44) {
      return { detected: true, state: 'FAILED', row };
    }
    return { detected: false, state: row.state, reason: 'FAILURE_EVIDENCE_NOT_MATCHED' };
  }

  // Case 2: Orphaned STARTED state after a prior repair retry attempt
  if (row.state === 'STARTED') {
    let prevFailures = [];
    try {
      prevFailures = typeof row.previous_failures === 'string'
        ? JSON.parse(row.previous_failures)
        : (row.previous_failures || []);
    } catch (e) {
      prevFailures = [];
    }

    const hasRepairMarker = prevFailures.some(f => f && f.action === 'FAILED_161_REPAIR_RETRY');
    if (hasRepairMarker) {
      return { detected: true, state: 'STARTED', orphanedRetry: true, row };
    }
    return { detected: false, state: row.state, reason: 'STARTED_WITHOUT_REPAIR_MARKER' };
  }

  return { detected: false, state: row.state, reason: `STATE_${row.state}` };
}

/**
 * Governed repair service for Failed / Orphaned Migration 161 (Phase 184G).
 *
 * Preconditions:
 * 1. Explicit opt-in via PPOS_ALLOW_FAILED_161_RETRY='true'.
 * 2. Migration 161 row in schema_versions has state = 'FAILED' (with ER_WRONG_OBJECT at stmt 44)
 *    OR state = 'STARTED' with a prior 'FAILED_161_REPAIR_RETRY' audit marker.
 * 3. Checksum matches canonical baseline in migration-integrity-baseline.json.
 *
 * Action:
 * - If state == 'FAILED':
 *     Appends audit marker FAILED_161_REPAIR_RETRY to previous_failures JSON array.
 *     Transitions row from FAILED to STARTED with fresh heartbeat.
 * - If state == 'STARTED' (orphaned retry recovery):
 *     Appends audit marker ORPHANED_STARTED_161_RECOVERY to previous_failures.
 *     Refreshes heartbeat_at = NOW(3).
 * - If state == 'APPLIED':
 *     Completely idempotent no-op cleanly.
 */
async function repairFailedMigration161(connOrDb) {
  const enabled = process.env.PPOS_ALLOW_FAILED_161_RETRY === 'true';

  // 1. Fetch 161 ledger row
  const [rows] = await connOrDb.query(`
    SELECT version, description, checksum, record_type, migration_path, state,
           execution_id, runner_id, started_at, failed_at, applied_at,
           failure_code, failure_message, failed_statement_index, previous_failures
    FROM schema_versions
    WHERE migration_path = ? OR description = '161_phase184g_industrial_persistence_ledger.sql'
       OR version = '161_phase184g_industrial_persistence_ledger'
  `, [TARGET_MIGRATION_161_PATH]);

  if (!rows || rows.length === 0) {
    return { repaired: false, reason: 'MIGRATION_161_NOT_IN_LEDGER' };
  }

  const row = rows[0];

  let prevFailures = [];
  try {
    prevFailures = typeof row.previous_failures === 'string'
      ? JSON.parse(row.previous_failures)
      : (row.previous_failures || []);
  } catch (e) {
    prevFailures = [];
  }

  // Idempotency: if already APPLIED and contains audit history
  if (row.state === 'APPLIED') {
    logger.info({ event: 'migration_161_repair_already_applied', message: 'Migration 161 already APPLIED (idempotent no-op)' });
    return { repaired: true, idempotent: true, state: 'APPLIED' };
  }

  // Check canonical checksum baseline
  const baselinePath = path.join(__dirname, '../../../migrations/migration-integrity-baseline.json');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const baselineEntry = baseline.migrations.find(m => (m.path || m.relativePath) === TARGET_MIGRATION_161_PATH);
  if (!baselineEntry) {
    throw new Error(`REPAIR_PRECONDITION_FAILED: Migration 161 not found in baseline.`);
  }
  const canonicalChecksum = baselineEntry.canonicalSha256 || baselineEntry.sha256;
  if (row.checksum && row.checksum !== canonicalChecksum) {
    throw new Error(`REPAIR_PRECONDITION_FAILED: Checksum mismatch (observed='${row.checksum}', expected='${canonicalChecksum}')`);
  }

  // Handle case: row.state === 'FAILED'
  if (row.state === 'FAILED') {
    if (!enabled) {
      const errorMsg = 'GOVERNED_REPAIR_REQUIRED: Migration 161 is in FAILED state at statement 44. Set PPOS_ALLOW_FAILED_161_RETRY=true to authorize repair.';
      logger.warn({ event: 'migration_161_failed_detected_flag_missing', message: errorMsg });
      throw new Error(errorMsg);
    }

    logger.info({ event: 'migration_161_repair_start', message: 'Verifying strict preconditions for migration 161 failed recovery...' });

    const isWrongObj = row.failure_code === 'ER_WRONG_OBJECT' || row.failure_code === '1347';
    const isStmt44 = Number(row.failed_statement_index) === 44;
    if (!isWrongObj || !isStmt44) {
      throw new Error(`REPAIR_PRECONDITION_FAILED: Migration 161 failure evidence mismatch (observed code='${row.failure_code}', statement_index=${row.failed_statement_index}, expected 'ER_WRONG_OBJECT' index 44)`);
    }

    const auditMarker = {
      action: 'FAILED_161_REPAIR_RETRY',
      repaired_at: new Date().toISOString(),
      previous_state: 'FAILED',
      failure_code: row.failure_code,
      failed_statement_index: row.failed_statement_index,
      failure_message: row.failure_message,
      execution_id: row.execution_id,
      new_state: 'STARTED',
      reason: 'Governed unblock for migration 161 compatibility views base table conflict'
    };
    prevFailures.push(auditMarker);

    await connOrDb.query(`
      UPDATE schema_versions
      SET
        state = 'STARTED',
        failure_code = NULL,
        failure_message = NULL,
        failed_statement_index = NULL,
        failed_at = NULL,
        heartbeat_at = NOW(3),
        previous_failures = ?
      WHERE migration_path = ? OR description = '161_phase184g_industrial_persistence_ledger.sql'
         OR version = '161_phase184g_industrial_persistence_ledger'
    `, [JSON.stringify(prevFailures), TARGET_MIGRATION_161_PATH]);

    logger.info({
      event: 'migration_161_repair_success',
      message: 'Governed repair completed: migration 161 state transitioned from FAILED to STARTED with audit marker FAILED_161_REPAIR_RETRY.'
    });

    return { repaired: true, state: 'STARTED', auditMarker };
  }

  // Handle case: row.state === 'STARTED' (orphaned retry state)
  if (row.state === 'STARTED') {
    const hasRepairMarker = prevFailures.some(f => f && f.action === 'FAILED_161_REPAIR_RETRY');
    if (!hasRepairMarker) {
      return { repaired: false, reason: 'STATE_IS_STARTED_WITHOUT_REPAIR_MARKER' };
    }

    if (!enabled) {
      const errorMsg = 'GOVERNED_REPAIR_REQUIRED: Migration 161 is in orphaned STARTED state from a prior repair retry. Set PPOS_ALLOW_FAILED_161_RETRY=true to authorize execution.';
      logger.warn({ event: 'migration_161_orphaned_started_detected_flag_missing', message: errorMsg });
      throw new Error(errorMsg);
    }

    logger.info({ event: 'migration_161_orphaned_started_recovery', message: 'Recovering orphaned STARTED migration 161 ledger record...' });

    const auditMarker = {
      action: 'ORPHANED_STARTED_161_RECOVERY',
      repaired_at: new Date().toISOString(),
      previous_state: 'STARTED',
      execution_id: row.execution_id,
      new_state: 'STARTED',
      reason: 'Governed recovery for orphaned STARTED state after abort before statement execution'
    };
    prevFailures.push(auditMarker);

    await connOrDb.query(`
      UPDATE schema_versions
      SET
        heartbeat_at = NOW(3),
        previous_failures = ?
      WHERE migration_path = ? OR description = '161_phase184g_industrial_persistence_ledger.sql'
         OR version = '161_phase184g_industrial_persistence_ledger'
    `, [JSON.stringify(prevFailures), TARGET_MIGRATION_161_PATH]);

    logger.info({
      event: 'migration_161_orphaned_started_success',
      message: 'Orphaned STARTED migration 161 heartbeat refreshed and audit marker appended.'
    });

    return { repaired: true, state: 'STARTED', auditMarker };
  }

  return { repaired: false, reason: `STATE_IS_${row.state}` };
}

module.exports = {
  TARGET_MIGRATION_PATH,
  TARGET_MIGRATION_161_PATH,
  detectFalseAppliedMigration140,
  repairFalseAppliedMigration140,
  detectFailedMigration161,
  repairFailedMigration161
};

