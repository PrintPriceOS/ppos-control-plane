'use strict';

const fs = require('fs');
const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.1A: Internal Order Lifecycle Hardening Schema ===\n');

// Migration 065 exists
const migrationPath = path.resolve(__dirname, '..', 'migrations', '065_phase122_1_internal_order_lifecycle_pilot_hardening.sql');
assert(fs.existsSync(migrationPath), 'Migration 065 file exists');

const sql = fs.readFileSync(migrationPath, 'utf8');

// Indexes on runs
assert(sql.includes('idx_iolp_runs_tenant_id'), 'Index on runs.tenant_id');
assert(sql.includes('idx_iolp_runs_status'), 'Index on runs.status');
assert(sql.includes('idx_iolp_runs_created_at'), 'Index on runs.created_at');

// Indexes on orders
assert(sql.includes('idx_iolp_orders_pilot_run_id'), 'Index on orders.pilot_run_id');
assert(sql.includes('idx_iolp_orders_tenant_id'), 'Index on orders.tenant_id');
assert(sql.includes('idx_iolp_orders_order_status'), 'Index on orders.order_status');
assert(sql.includes('idx_iolp_orders_created_at'), 'Index on orders.created_at');

// Indexes on steps
assert(sql.includes('idx_iolp_steps_pilot_run_id'), 'Index on steps.pilot_run_id');
assert(sql.includes('idx_iolp_steps_pilot_order_id'), 'Index on steps.pilot_order_id');
assert(sql.includes('idx_iolp_steps_step_key'), 'Index on steps.step_key');
assert(sql.includes('idx_iolp_steps_step_status'), 'Index on steps.step_status');
assert(sql.includes('idx_iolp_steps_created_at'), 'Index on steps.created_at');

// Indexes on findings
assert(sql.includes('idx_iolp_findings_pilot_run_id'), 'Index on findings.pilot_run_id');
assert(sql.includes('idx_iolp_findings_pilot_order_id'), 'Index on findings.pilot_order_id');
assert(sql.includes('idx_iolp_findings_finding_status'), 'Index on findings.finding_status');
assert(sql.includes('idx_iolp_findings_blocks_lifecycle'), 'Index on findings.blocks_lifecycle');
assert(sql.includes('idx_iolp_findings_severity'), 'Index on findings.severity');

// Indexes on audits
assert(sql.includes('idx_iolp_audits_pilot_run_id'), 'Index on audits.pilot_run_id');
assert(sql.includes('idx_iolp_audits_pilot_order_id'), 'Index on audits.pilot_order_id');
assert(sql.includes('idx_iolp_audits_event_type'), 'Index on audits.event_type');
assert(sql.includes('idx_iolp_audits_created_at'), 'Index on audits.created_at');

// Indexes on rollback points
assert(sql.includes('idx_iolp_rollback_pilot_run_id'), 'Index on rollback.pilot_run_id');
assert(sql.includes('idx_iolp_rollback_pilot_order_id'), 'Index on rollback.pilot_order_id');
assert(sql.includes('idx_iolp_rollback_status'), 'Index on rollback.rollback_point_status');
assert(sql.includes('idx_iolp_rollback_created_at'), 'Index on rollback.created_at');

// Indexes on evidence packs
assert(sql.includes('idx_iolp_evidence_pilot_run_id'), 'Index on evidence.pilot_run_id');
assert(sql.includes('idx_iolp_evidence_pilot_order_id'), 'Index on evidence.pilot_order_id');
assert(sql.includes('idx_iolp_evidence_status'), 'Index on evidence.evidence_status');
assert(sql.includes('idx_iolp_evidence_generated_at'), 'Index on evidence.generated_at');

// Foreign keys
assert(sql.includes('fk_iolp_orders_run'), 'Foreign key orders → runs');
assert(sql.includes('fk_iolp_steps_run'), 'Foreign key steps → runs');
assert(sql.includes('fk_iolp_findings_run'), 'Foreign key findings → runs');
assert(sql.includes('fk_iolp_audits_run'), 'Foreign key audits → runs');
assert(sql.includes('fk_iolp_rollback_run'), 'Foreign key rollback → runs');
assert(sql.includes('fk_iolp_evidence_run'), 'Foreign key evidence → runs');
assert(sql.includes('ON DELETE RESTRICT'), 'Foreign keys use ON DELETE RESTRICT');

// Forbidden patterns
const forbiddenPatterns = [
  'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true',
  'paymentExecutionEnabled: true', 'refundExecutionEnabled: true',
  'payoutExecutionEnabled: true', 'providerExternalSubmissionEnabled: true',
  'charge(', 'capture(', 'refund(', 'payout(', 'submitTax', 'submitVat', 'submitAccounting', 'sendToProvider',
];
for (const p of forbiddenPatterns) {
  assert(!sql.includes(p), `Migration does not contain forbidden pattern: ${p}`);
}

console.log(`\n=== Phase 122.1A Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
