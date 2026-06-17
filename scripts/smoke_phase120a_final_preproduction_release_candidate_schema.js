'use strict';
// Phase 120A Smoke Test — Final Pre-Production Release Candidate Schema

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

console.log('\n=== Phase 120A — Final Pre-Production Release Candidate Schema ===\n');

const migPath = path.join(__dirname, '../migrations/062_phase120_final_preproduction_release_candidate.sql');
check('Migration 062 exists', fs.existsSync(migPath));

if (fs.existsSync(migPath)) {
  const sql = fs.readFileSync(migPath, 'utf8');
  check('Table final_preproduction_release_candidates exists in migration', sql.includes('final_preproduction_release_candidates'));
  check('Table final_preproduction_release_candidate_checks exists', sql.includes('final_preproduction_release_candidate_checks'));
  check('Table final_preproduction_release_candidate_findings exists', sql.includes('final_preproduction_release_candidate_findings'));
  check('Table final_preproduction_release_candidate_audits exists', sql.includes('final_preproduction_release_candidate_audits'));
  check('review_only DEFAULT 1 in schema', sql.includes('review_only TINYINT(1) NOT NULL DEFAULT 1'));
  check('external_submission_enabled DEFAULT 0 in schema', sql.includes('external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('source_mutation_enabled DEFAULT 0 in schema', sql.includes('source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('production_activation_enabled DEFAULT 0 in schema', sql.includes('production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('full_public_enabled DEFAULT 0 in schema', sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('live_provider_connectivity_enabled DEFAULT 0 in schema', sql.includes('live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('payment_execution_enabled DEFAULT 0 in schema', sql.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('refund_execution_enabled DEFAULT 0 in schema', sql.includes('refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('payout_execution_enabled DEFAULT 0 in schema', sql.includes('payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('phase_113_status column present', sql.includes('phase_113_status'));
  check('phase_119_status column present', sql.includes('phase_119_status'));
  check('Status ENUM includes VALIDATED', sql.includes("'VALIDATED'"));
  check('Status ENUM includes REJECTED', sql.includes("'REJECTED'"));
}

console.log(`\nPhase 120A: PASS=${pass} FAIL=${fail}`);
if (fail > 0) process.exit(1);
