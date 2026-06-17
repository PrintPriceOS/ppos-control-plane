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

console.log('\nPhase 117A — Production Deployment Dry Run Schema Smoke Test\n');

const migrationFile = path.resolve(__dirname, '../migrations/059_phase117_production_deployment_dry_run_rollback_drill.sql');
const sql = fs.existsSync(migrationFile) ? fs.readFileSync(migrationFile, 'utf8') : '';

check('Migration file 059 exists', fs.existsSync(migrationFile));
check('Contains production_deployment_dry_runs table', sql.includes('CREATE TABLE IF NOT EXISTS production_deployment_dry_runs'));
check('Contains production_deployment_dry_run_steps table', sql.includes('CREATE TABLE IF NOT EXISTS production_deployment_dry_run_steps'));
check('Contains production_deployment_rollback_drills table', sql.includes('CREATE TABLE IF NOT EXISTS production_deployment_rollback_drills'));
check('Contains production_deployment_dry_run_audits table', sql.includes('CREATE TABLE IF NOT EXISTS production_deployment_dry_run_audits'));
check('Safety column: deployment_dry_run_only DEFAULT TRUE', sql.includes('deployment_dry_run_only BOOLEAN NOT NULL DEFAULT TRUE'));
check('Safety column: real_deployment_executed DEFAULT FALSE', sql.includes('real_deployment_executed BOOLEAN NOT NULL DEFAULT FALSE'));
check('Safety column: service_restart_executed DEFAULT FALSE', sql.includes('service_restart_executed BOOLEAN NOT NULL DEFAULT FALSE'));
check('Safety column: rollback_executed DEFAULT FALSE', sql.includes('rollback_executed BOOLEAN NOT NULL DEFAULT FALSE'));
check('Safety column: production_activation_enabled DEFAULT FALSE', sql.includes('production_activation_enabled BOOLEAN NOT NULL DEFAULT FALSE'));
check('Safety column: payment_execution_enabled DEFAULT FALSE', sql.includes('payment_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'));
check('Safety column: source_mutation_enabled DEFAULT FALSE', sql.includes('source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE'));
check('Rollback table has rollback_simulated_only column', sql.includes('rollback_simulated_only BOOLEAN NOT NULL DEFAULT TRUE'));
check('Rollback table has real_rollback_executed DEFAULT FALSE', sql.includes('real_rollback_executed BOOLEAN NOT NULL DEFAULT FALSE'));
check('Audit table has deployment_dry_run_only DEFAULT TRUE', sql.includes('deployment_dry_run_only BOOLEAN NOT NULL DEFAULT TRUE'));

console.log(`\nPhase 117A: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('STATUS: PASS');
