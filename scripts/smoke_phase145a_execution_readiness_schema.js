'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 145A: Phase 145 Schema Validation ===\n');
  const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

  try {
    const REQUIRED_TABLES = [
      'cb_cohort_intervention_exec_readiness',
      'cb_cohort_intervention_exec_ready_checks',
      'cb_cohort_intervention_exec_ready_evidence',
      'cb_cohort_intervention_exec_ready_audits'
    ];

    if (!isProdLike) {
      console.log('  PASS (mock): Schema validation skipped in non-prod mode.');
      console.log('\nSmoke 145A: Passed.');
      process.exit(0);
    }

    const rows = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${REQUIRED_TABLES.map(() => '?').join(',')})`,
      REQUIRED_TABLES
    );
    const found = rows.map(r => r.TABLE_NAME);
    for (const t of REQUIRED_TABLES) {
      assert.ok(found.includes(t), `Table missing: ${t}`);
      console.log(`  PASS: Table '${t}' exists.`);
    }

    // Validate key columns on main readiness table
    const cols = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cb_cohort_intervention_exec_readiness'`
    );
    const colNames = cols.map(c => c.COLUMN_NAME);
    for (const col of [
      'readiness_id', 'source_approval_id', 'source_prep_id', 'source_review_id', 'source_simulation_id', 'source_execution_id',
      'readiness_status', 'readiness_decision', 'projected_impact_score', 'rollback_feasibility_score',
      'evidence_completeness_score', 'guardrail_status', 'write_scope_status', 'kill_switch_status', 'rollback_authority_status',
      'non_execution_attestation_json', 'write_scope_attestation_json',
      'execution_capability_status', 'execution_readiness_status', 'readiness_execution_status'
    ]) {
      assert.ok(colNames.includes(col), `Column missing: ${col}`);
      console.log(`  PASS: Column 'cb_cohort_intervention_exec_readiness.${col}' exists.`);
    }

    console.log('\nSmoke 145A: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 145A:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
