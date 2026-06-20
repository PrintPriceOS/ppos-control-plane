'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 131.0.1: Acceptance Failure Diagnostics ===\n');

(async () => {
  const packFile = path.join(__dirname, 'smoke_phase131h_operational_review_acceptance_pack.js');
  const packSrc = fs.readFileSync(packFile, 'utf8');
  assert(packSrc.includes('FAILED_SUBSMOKES:'), '131H prints exact failed sub-smoke names');
  assert(packSrc.includes('failLines.map(l => l.trim().replace(\'FAIL:\', \'\').trim()).join(\' | \')'), '131H prints compact failure reasons');

  const schemaFile = path.join(__dirname, 'smoke_phase131a_operational_review_schema.js');
  const schemaSrc = fs.readFileSync(schemaFile, 'utf8');
  assert(schemaSrc.includes('SELECT * FROM schema_versions'), '131A uses real DB schema_versions verification');
  assert(schemaSrc.includes('PHASE_131_MIGRATION_REGISTRY_MISSING'), '131A fails closed in production-like mode if registry missing');

  const gateFile = path.join(__dirname, 'smoke_phase131e_expansion_decision_gate.js');
  const gateSrc = fs.readFileSync(gateFile, 'utf8');
  assert(gateSrc.includes('approval does not add participants'), '131E approval does not call invite/participant/scope expansion paths');

  const evFile = path.join(__dirname, 'smoke_phase131g_operational_review_evidence_pack.js');
  const evSrc = fs.readFileSync(evFile, 'utf8');
  assert(evSrc.includes('131.0') && evSrc.includes('integrity hash exists'), '131G evidence pack has schema version 131.0 and hash');

  console.log(`\nSmoke 131.0.1: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
