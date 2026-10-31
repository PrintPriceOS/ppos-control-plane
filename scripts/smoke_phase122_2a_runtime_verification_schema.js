'use strict';

const fs = require('fs');
const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.2A: Runtime Verification Schema ===\n');

// Migration 066 exists
const migrationPath = path.resolve(__dirname, '..', 'migrations', '066_phase122_2_internal_order_lifecycle_runtime_verification.sql');
assert(fs.existsSync(migrationPath), 'Migration 066 file exists');

const sql = fs.readFileSync(migrationPath, 'utf8');

// Tables
assert(sql.includes('internal_order_lifecycle_runtime_verification_runs'), 'Table: runtime_verification_runs');
assert(sql.includes('internal_order_lifecycle_runtime_verification_checks'), 'Table: runtime_verification_checks');
assert(sql.includes('internal_order_lifecycle_runtime_verification_audits'), 'Table: runtime_verification_audits');

// Safety columns on runs
assert(sql.includes('pilot_only TINYINT(1) NOT NULL DEFAULT 1'), 'Runs: pilot_only default true');
assert(sql.includes('runtime_verification_only TINYINT(1) NOT NULL DEFAULT 1'), 'Runs: runtime_verification_only default true');
assert(sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Runs: full_public_enabled default false');
assert(sql.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Runs: payment_execution_enabled default false');
assert(sql.includes('production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Runs: production_activation_enabled default false');
assert(sql.includes('service_restart_executed TINYINT(1) NOT NULL DEFAULT 0'), 'Runs: service_restart_executed default false');
assert(sql.includes('real_restart_executed TINYINT(1) NOT NULL DEFAULT 0'), 'Runs: real_restart_executed default false');

// Check table columns
assert(sql.includes('memory_fallback_production_valid TINYINT(1) NOT NULL DEFAULT 0'), 'Checks: memory_fallback_production_valid default false');
assert(sql.includes('persistence_mode'), 'Checks: persistence_mode column');
assert(sql.includes('persistence_status'), 'Checks: persistence_status column');

// Indexes on runs
assert(sql.includes('idx_iolrv_runs_tenant_id'), 'Index on runs.tenant_id');
assert(sql.includes('idx_iolrv_runs_status'), 'Index on runs.status');
assert(sql.includes('idx_iolrv_runs_created_at'), 'Index on runs.created_at');
assert(sql.includes('idx_iolrv_runs_linked_pilot_run'), 'Index on runs.linked_pilot_run_id');

// Indexes on checks
assert(sql.includes('idx_iolrv_checks_verification_run_id'), 'Index on checks.verification_run_id');
assert(sql.includes('idx_iolrv_checks_check_type'), 'Index on checks.check_type');
assert(sql.includes('idx_iolrv_checks_check_status'), 'Index on checks.check_status');
assert(sql.includes('idx_iolrv_checks_created_at'), 'Index on checks.created_at');

// Indexes on audits
assert(sql.includes('idx_iolrv_audits_verification_run_id'), 'Index on audits.verification_run_id');
assert(sql.includes('idx_iolrv_audits_check_id'), 'Index on audits.check_id');
assert(sql.includes('idx_iolrv_audits_event_type'), 'Index on audits.event_type');
assert(sql.includes('idx_iolrv_audits_created_at'), 'Index on audits.created_at');

// Foreign keys
assert(sql.includes('fk_iolrv_checks_run'), 'Foreign key checks → runs');
assert(sql.includes('fk_iolrv_audits_run'), 'Foreign key audits → runs');
assert(sql.includes('ON DELETE RESTRICT'), 'Foreign keys use ON DELETE RESTRICT');

// Forbidden patterns
const forbiddenPatterns = [
  'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true',
  'paymentExecutionEnabled: true', 'refundExecutionEnabled: true',
  'payoutExecutionEnabled: true', 'providerExternalSubmissionEnabled: true',
  'productionActivationEnabled: true',
  'charge(', 'capture(', 'refund(', 'payout(', 'submitTax', 'submitVat', 'submitAccounting', 'sendToProvider',
  'pm2 restart', 'child_process',
];
for (const p of forbiddenPatterns) {
  assert(!sql.includes(p), `Migration does not contain forbidden pattern: ${p}`);
}

console.log(`\n=== Phase 122.2A Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
