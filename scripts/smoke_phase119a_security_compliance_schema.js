'use strict';
// Phase 119A Smoke Test — Security/Compliance Pre-Launch Hardening Schema

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

console.log('\n=== Phase 119A — Security Compliance Hardening Schema Smoke ===\n');

const migrationPath = path.join(__dirname, '../migrations/061_phase119_security_secrets_compliance_prelaunch_hardening.sql');
check('Migration file 061 exists', fs.existsSync(migrationPath));

if (fs.existsSync(migrationPath)) {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  check('Table prelaunch_security_checks defined', sql.includes('CREATE TABLE IF NOT EXISTS prelaunch_security_checks'));
  check('Table prelaunch_security_findings defined', sql.includes('CREATE TABLE IF NOT EXISTS prelaunch_security_findings'));
  check('Table prelaunch_security_audits defined', sql.includes('CREATE TABLE IF NOT EXISTS prelaunch_security_audits'));
  check('Table prelaunch_compliance_guardrail_results defined', sql.includes('CREATE TABLE IF NOT EXISTS prelaunch_compliance_guardrail_results'));

  // Safety columns
  check('review_only DEFAULT 1 present in security_checks', sql.includes('review_only TINYINT(1) NOT NULL DEFAULT 1'));
  check('external_submission_enabled DEFAULT 0 present', sql.includes('external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('source_mutation_enabled DEFAULT 0 present', sql.includes('source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('production_activation_enabled DEFAULT 0 present', sql.includes('production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0'));

  // Guardrail safety columns
  check('payment_execution_enabled DEFAULT 0 in guardrails', sql.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('full_public_enabled DEFAULT 0 in guardrails', sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'));
  check('live_provider_connectivity_enabled DEFAULT 0 in guardrails', sql.includes('live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0'));

  // Category column comments
  check('Category comments present', sql.includes('ENV_EXPOSURE'));
  check('Compliance guardrail category present', sql.includes('PRODUCTION_GATE'));

  // No forbidden patterns
  check('No FULL_PUBLIC enabled in SQL', !sql.toLowerCase().includes('full_public_enabled.*default.*1'));
  check('No payment_execution enabled in SQL', !sql.toLowerCase().includes('payment_execution_enabled.*default.*1'));
}

console.log(`\nPhase 119A Schema Smoke: PASS=${pass} FAIL=${fail}\n`);
if (fail > 0) process.exit(1);
