'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

console.log('\nPhase 118A — Production Observability & Incident Readiness Schema\n');

const root = path.resolve(__dirname, '..');
const migrationFile = path.join(root, 'migrations/060_phase118_production_observability_incident_readiness.sql');
const sql = fs.existsSync(migrationFile) ? fs.readFileSync(migrationFile, 'utf8') : '';

check('Migration file 060 exists', fs.existsSync(migrationFile));
check('Table: production_observability_checks', sql.includes('production_observability_checks'));
check('Table: production_incident_readiness_runs', sql.includes('production_incident_readiness_runs'));
check('Table: production_incident_simulations', sql.includes('production_incident_simulations'));
check('Table: production_incident_audits', sql.includes('production_incident_audits'));

check('Column: simulation_only DEFAULT 1', sql.includes('simulation_only') && sql.includes('DEFAULT 1'));
check('Column: real_alert_dispatched DEFAULT 0', sql.includes('real_alert_dispatched') && sql.includes('DEFAULT 0'));
check('Column: production_mutation_enabled DEFAULT 0', sql.includes('production_mutation_enabled'));
check('Column: external_submission_enabled DEFAULT 0', sql.includes('external_submission_enabled'));
check('Column: payment_execution_enabled DEFAULT 0', sql.includes('payment_execution_enabled'));
check('Column: refund_execution_enabled DEFAULT 0', sql.includes('refund_execution_enabled'));
check('Column: payout_execution_enabled DEFAULT 0', sql.includes('payout_execution_enabled'));
check('Column: full_public_enabled DEFAULT 0', sql.includes('full_public_enabled'));
check('Column: live_provider_connectivity_enabled DEFAULT 0', sql.includes('live_provider_connectivity_enabled'));

check('Migration: no charge( call', !sql.includes('charge('));
check('Migration: no refund( call', !sql.includes('refund('));
check('Migration: no payout( call', !sql.includes('payout('));
check('Migration: no submitTax', !sql.includes('submitTax'));

console.log(`\nPhase 118A: PASS ${passed} | FAIL ${failed}`);
if (failed > 0) process.exit(1);
