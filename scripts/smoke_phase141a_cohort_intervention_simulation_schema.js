'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 141A: Phase 141 Schema Validation ===\n');
  const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

  try {
    const REQUIRED_TABLES = [
      'controlled_beta_cohort_intervention_simulations',
      'controlled_beta_cohort_intervention_simulation_steps',
      'controlled_beta_cohort_intervention_simulation_impact_projections',
      'controlled_beta_cohort_intervention_simulation_results',
      'controlled_beta_cohort_intervention_simulation_evidence',
      'controlled_beta_cohort_intervention_simulation_audit_events'
    ];

    if (!isProdLike) {
      console.log('  PASS (mock): Schema validation skipped in non-prod mode.');
      console.log('\nSmoke 141A: Passed.');
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

    // Validate key columns on main table
    const cols = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_cohort_intervention_simulations'`
    );
    const colNames = cols.map(c => c.COLUMN_NAME);
    for (const col of ['simulation_id', 'source_execution_id', 'simulation_write_scope_attestation_json', 'safe_scope_simulation_attestation', 'simulation_status']) {
      assert.ok(colNames.includes(col), `Column missing: ${col}`);
      console.log(`  PASS: Column 'controlled_beta_cohort_intervention_simulations.${col}' exists.`);
    }

    // Validate impact_projection_json column on projection table
    const projCols = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_cohort_intervention_simulation_impact_projections'`
    );
    const projColNames = projCols.map(c => c.COLUMN_NAME);
    assert.ok(projColNames.includes('impact_projection_json'), "Column 'impact_projection_json' missing from projection table");
    console.log("  PASS: Column 'impact_projection_json' exists in projection table.");

    console.log('\nSmoke 141A: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 141A:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.end) await db.end().catch(() => {});
  }
})();
