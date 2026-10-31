'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 124A: Printhouse Handoff Package Schema Smoke ===\n');

// 1. Migration 068 exists
const migrationPath = path.join(__dirname, '..', 'migrations', '068_phase124_controlled_printhouse_handoff_file_package_pilot.sql');
const migrationExists = fs.existsSync(migrationPath);
assert(migrationExists, 'Migration 068 file exists');

if (migrationExists) {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Tables
  const tables = [
    'controlled_printhouse_handoff_packages',
    'controlled_printhouse_handoff_package_files',
    'controlled_printhouse_handoff_reviews',
    'controlled_printhouse_handoff_access_grants',
    'controlled_printhouse_handoff_findings',
    'controlled_printhouse_handoff_audits',
    'controlled_printhouse_handoff_evidence_packs',
  ];
  for (const t of tables) {
    assert(sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `Table ${t} defined`);
  }

  // Safety columns
  const safetyColumns = [
    'full_public_enabled', 'open_marketplace_enabled', 'payment_execution_enabled',
    'refund_execution_enabled', 'payout_execution_enabled', 'production_dispatch_enabled',
    'provider_submission_enabled', 'unrestricted_file_access', 'permanent_public_url',
    'external_tax_submission_enabled', 'external_accounting_submission_enabled',
    'provider_external_submission_enabled', 'source_mutation_outside_pilot_scope',
    'production_activation_enabled', 'review_only', 'pilot_only', 'founding_printhouse_only',
    'file_download_audit_required',
  ];
  for (const col of safetyColumns) {
    assert(sql.includes(col), `Safety column ${col} exists`);
  }

  // Safety defaults
  assert(sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'full_public_enabled defaults to 0');
  assert(sql.includes('open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'open_marketplace_enabled defaults to 0');
  assert(sql.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'payment_execution_enabled defaults to 0');
  assert(sql.includes('production_dispatch_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'production_dispatch_enabled defaults to 0');
  assert(sql.includes('provider_submission_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'provider_submission_enabled defaults to 0');
  assert(sql.includes('unrestricted_file_access TINYINT(1) NOT NULL DEFAULT 0'), 'unrestricted_file_access defaults to 0');
  assert(sql.includes('permanent_public_url TINYINT(1) NOT NULL DEFAULT 0'), 'permanent_public_url defaults to 0');
  assert(sql.includes('file_download_audit_required TINYINT(1) NOT NULL DEFAULT 1'), 'file_download_audit_required defaults to 1');
  assert(sql.includes('review_only TINYINT(1) NOT NULL DEFAULT 1'), 'review_only defaults to 1');

  // Access grant columns
  assert(sql.includes('access_grant_id'), 'access_grant_id column');
  assert(sql.includes('grant_status'), 'grant_status column');
  assert(sql.includes('access_scope'), 'access_scope column');
  assert(sql.includes('expires_at'), 'expires_at column');
  assert(sql.includes('revoked_at'), 'revoked_at column');
  assert(sql.includes('revoked_by'), 'revoked_by column');
  assert(sql.includes('download_audit_required'), 'download_audit_required column');

  // File metadata columns
  assert(sql.includes('file_name'), 'file_name column');
  assert(sql.includes('file_type'), 'file_type column');
  assert(sql.includes('file_size_bytes'), 'file_size_bytes column');
  assert(sql.includes('file_scope'), 'file_scope column');
  assert(sql.includes('preflight_status'), 'preflight_status column');

  // Evidence pack columns
  assert(sql.includes('evidence_hash'), 'evidence_hash column');
  assert(sql.includes('evidence_schema_version'), 'evidence_schema_version column');
  assert(sql.includes('redaction_classification'), 'redaction_classification column');

  // Indexes
  const indexes = [
    'idx_cphp_packages_program_id', 'idx_cphp_packages_participant_id', 'idx_cphp_packages_status',
    'idx_cphp_packages_printhouse_tenant', 'idx_cphp_packages_created_at',
    'idx_cphp_files_package_id', 'idx_cphp_files_created_at',
    'idx_cphp_reviews_package_id', 'idx_cphp_reviews_program_id', 'idx_cphp_reviews_status',
    'idx_cphp_grants_package_id', 'idx_cphp_grants_participant_id', 'idx_cphp_grants_status',
    'idx_cphp_grants_expires_at', 'idx_cphp_grants_printhouse_tenant',
    'idx_cphp_findings_package_id', 'idx_cphp_findings_status', 'idx_cphp_findings_blocks_handoff', 'idx_cphp_findings_severity',
    'idx_cphp_audits_package_id', 'idx_cphp_audits_event_type', 'idx_cphp_audits_created_at',
    'idx_cphp_evidence_package_id', 'idx_cphp_evidence_status', 'idx_cphp_evidence_generated_at',
  ];
  for (const idx of indexes) {
    assert(sql.includes(idx), `Index ${idx} exists`);
  }

  // Foreign keys
  assert(sql.includes('fk_cphp_packages_program'), 'FK packages -> programs');
  assert(sql.includes('fk_cphp_packages_participant'), 'FK packages -> participants');
  assert(sql.includes('fk_cphp_files_package'), 'FK files -> packages');
  assert(sql.includes('fk_cphp_reviews_package'), 'FK reviews -> packages');
  assert(sql.includes('fk_cphp_grants_package'), 'FK grants -> packages');
  assert(sql.includes('fk_cphp_grants_participant'), 'FK grants -> participants');
  assert(sql.includes('fk_cphp_findings_package'), 'FK findings -> packages');
  assert(sql.includes('fk_cphp_audits_package'), 'FK audits -> packages');
  assert(sql.includes('fk_cphp_evidence_package'), 'FK evidence -> packages');
  assert(sql.includes('ON DELETE RESTRICT'), 'ON DELETE RESTRICT used');

  // No forbidden patterns
  const forbidden = [
    'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true',
    'paymentExecutionEnabled: true', 'productionDispatchEnabled: true',
    'unrestrictedFileAccess: true', 'permanentPublicUrl: true',
    'charge(', 'capture(', 'refund(', 'payout(',
    'sendToProvider', 'dispatchToMachine', 'submitTax', 'submitVat', 'submitAccounting',
  ];
  for (const f of forbidden) {
    assert(!sql.includes(f), `No forbidden pattern: ${f}`);
  }
}

console.log(`\n=== Phase 124A Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
