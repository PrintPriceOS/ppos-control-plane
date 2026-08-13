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

module.exports = {
  TARGET_MIGRATION_PATH,
  detectFalseAppliedMigration140,
  repairFalseAppliedMigration140
};
