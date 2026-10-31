'use strict';
// Phase 122A Smoke Test — Internal Order Lifecycle Pilot Schema

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}`);
    fail++;
  }
}

console.log('\n=== Phase 122A — Internal Order Lifecycle Pilot Schema ===\n');

const migrationPath = path.join(__dirname, '../migrations/064_phase122_internal_order_lifecycle_pilot.sql');
check('Migration 064 file exists', fs.existsSync(migrationPath));

if (fs.existsSync(migrationPath)) {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const requiredTables = [
    'internal_order_lifecycle_pilot_runs',
    'internal_order_lifecycle_pilot_orders',
    'internal_order_lifecycle_pilot_steps',
    'internal_order_lifecycle_pilot_findings',
    'internal_order_lifecycle_pilot_audits',
    'internal_order_lifecycle_pilot_rollback_points',
    'internal_order_lifecycle_pilot_evidence_packs',
  ];
  for (const t of requiredTables) {
    check(`Table ${t} defined`, sql.includes(t));
  }

  // Safety columns
  check('pilot_only column exists', sql.includes('pilot_only'));
  check('internal_order_lifecycle_only column exists', sql.includes('internal_order_lifecycle_only'));
  check('review_only column exists', sql.includes('review_only'));
  check('full_public_enabled column exists', sql.includes('full_public_enabled'));
  check('open_marketplace_access_enabled column exists', sql.includes('open_marketplace_access_enabled'));
  check('live_provider_connectivity_enabled column exists', sql.includes('live_provider_connectivity_enabled'));
  check('payment_execution_enabled column exists', sql.includes('payment_execution_enabled'));
  check('refund_execution_enabled column exists', sql.includes('refund_execution_enabled'));
  check('payout_execution_enabled column exists', sql.includes('payout_execution_enabled'));
  check('external_tax_submission_enabled column exists', sql.includes('external_tax_submission_enabled'));
  check('external_accounting_submission_enabled column exists', sql.includes('external_accounting_submission_enabled'));
  check('provider_external_submission_enabled column exists', sql.includes('provider_external_submission_enabled'));
  check('source_mutation_outside_pilot_scope column exists', sql.includes('source_mutation_outside_pilot_scope'));

  // Rollback columns
  check('rollback_simulated_only DEFAULT 1', sql.includes('rollback_simulated_only') && sql.includes('DEFAULT 1'));
  check('rollback_executed DEFAULT 0', sql.includes('rollback_executed') && sql.includes('DEFAULT 0'));

  // Evidence pack table
  check('evidence_pack_json column exists', sql.includes('evidence_pack_json'));
  check('redacted_preview_json column exists', sql.includes('redacted_preview_json'));

  // Static safety: no unsafe patterns
  check('No fullPublicEnabled: true', !sql.includes('fullPublicEnabled: true'));
  check('No charge( call', !sql.includes('charge('));
  check('No refund( call', !sql.includes('refund('));
  check('No payout( call', !sql.includes('payout('));
}

console.log(`\n  Phase 122A: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
