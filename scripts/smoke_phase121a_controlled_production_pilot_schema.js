'use strict';
// Phase 121A Smoke Test — Controlled Production Pilot Schema

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

console.log('\n=== Phase 121A — Controlled Production Pilot Schema ===\n');

// Migration file exists
const migrationPath = path.join(__dirname, '../migrations/063_phase121_controlled_production_pilot_activation_gate.sql');
check('Migration 063 file exists', fs.existsSync(migrationPath));

if (fs.existsSync(migrationPath)) {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Required tables
  const requiredTables = [
    'controlled_production_pilot_runs',
    'controlled_production_pilot_tenants',
    'controlled_production_pilot_checks',
    'controlled_production_pilot_findings',
    'controlled_production_pilot_audits',
    'controlled_production_pilot_rollback_points',
  ];
  for (const t of requiredTables) {
    check(`Table ${t} defined`, sql.includes(t));
  }

  // Pilot run statuses
  const runStatuses = ['DRAFT', 'IN_REVIEW', 'READY_FOR_TENANT_ACTIVATION', 'ACTIVE_LIMITED_PILOT', 'SUSPENDED', 'COMPLETED', 'REJECTED'];
  for (const s of runStatuses) {
    check(`Run status ${s} in migration`, sql.includes(s));
  }

  // Tenant statuses
  const tenantStatuses = ['REGISTERED', 'READY_FOR_PILOT', 'PILOT_ACTIVE', 'PILOT_SUSPENDED', 'PILOT_COMPLETED'];
  for (const s of tenantStatuses) {
    check(`Tenant status ${s} in migration`, sql.includes(s));
  }

  // Safety columns
  check('controlled_pilot_only column exists', sql.includes('controlled_pilot_only'));
  check('full_public_enabled column exists', sql.includes('full_public_enabled'));
  check('open_marketplace_enabled column exists', sql.includes('open_marketplace_enabled'));
  check('payment_execution_enabled column exists', sql.includes('payment_execution_enabled'));
  check('external_submission column exists', sql.includes('external_submission'));
  check('source_mutation column exists', sql.includes('source_mutation'));

  // Static safety: no unsafe activation patterns
  check('No fullPublicEnabled: true', !sql.includes('fullPublicEnabled: true'));
  check('No openMarketplaceEnabled: true', !sql.includes('openMarketplaceEnabled: true'));
  check('No charge( call', !sql.includes('charge('));
  check('No refund( call', !sql.includes('refund('));
  check('No payout( call', !sql.includes('payout('));
}

console.log(`\n  Phase 121A: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
