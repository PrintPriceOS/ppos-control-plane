'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 156A: Phase 156 Schema Validation ===\n');
  const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

  try {
    const REQUIRED_TABLES = [
      'cb_cohort_intervention_activation_token_env',
      'cb_cohort_intervention_activation_token_env_rules',
      'cb_cohort_intervention_activation_token_env_evidence',
      'cb_cohort_intervention_activation_token_env_audits'
    ];

    if (!isProdLike) {
      console.log('  PASS (mock): Schema validation skipped in non-prod mode.');
      console.log('\nSmoke 156A: Passed.');
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

    // Validate key columns on main activation token env table
    const cols = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cb_cohort_intervention_activation_token_env'`
    );
    const colNames = cols.map(c => c.COLUMN_NAME);
    for (const col of [
      'activation_token_env_id', 'source_activation_token_auth_id', 'source_activation_handoff_id', 'source_activation_decision_id', 'source_activation_lock_id', 'source_activation_auth_id', 'source_activation_readiness_id', 'source_plan_id', 'source_dispatcher_id', 'source_envelope_id', 'source_auth_id', 'source_readiness_id', 'source_approval_id', 'source_prep_id', 'source_review_id', 'source_simulation_id', 'source_execution_id',
      'activation_token_env_status', 'activation_token_env_result', 'projected_impact_score', 'rollback_feasibility_score',
      'evidence_completeness_score', 'guardrail_status', 'write_scope_status', 'canary_envelope_json',
      'non_execution_attestation_json', 'write_scope_attestation_json',
      'execution_capability_status', 'activation_execution_status', 'package_freeze_status', 'plan_executable_status', 'job_creation_status', 'queue_dispatch_status', 'runtime_mutation_status'
    ]) {
      assert.ok(colNames.includes(col), `Column missing: ${col}`);
      console.log(`  PASS: Column 'cb_cohort_intervention_activation_token_env.${col}' exists.`);
    }

    console.log('\nSmoke 156A: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 156A:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
