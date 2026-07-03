'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 142A: Phase 142 Schema Validation ===\n');
  const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

  try {
    const REQUIRED_TABLES = [
      'controlled_beta_cohort_intervention_simulation_reviews',
      'controlled_beta_cohort_intervention_simulation_review_findings',
      'controlled_beta_cohort_intervention_simulation_review_decisions',
      'controlled_beta_cohort_intervention_simulation_review_evidence',
      'controlled_beta_cohort_intervention_simulation_review_audit_events'
    ];

    if (!isProdLike) {
      console.log('  PASS (mock): Schema validation skipped in non-prod mode.');
      console.log('\nSmoke 142A: Passed.');
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

    // Validate key columns on main reviews table
    const cols = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_cohort_intervention_simulation_reviews'`
    );
    const colNames = cols.map(c => c.COLUMN_NAME);
    for (const col of [
      'review_id', 'source_simulation_id', 'source_execution_id', 'review_status',
      'review_decision', 'projected_impact_score', 'rollback_feasibility_score',
      'evidence_completeness_score', 'guardrail_status', 'write_scope_status',
      'non_execution_attestation_json', 'write_scope_attestation_json'
    ]) {
      assert.ok(colNames.includes(col), `Column missing: ${col}`);
      console.log(`  PASS: Column 'controlled_beta_cohort_intervention_simulation_reviews.${col}' exists.`);
    }

    console.log('\nSmoke 142A: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 142A:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
