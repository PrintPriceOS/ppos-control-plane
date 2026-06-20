const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Smoke 132.0.4: Phase 131 Decision Hash Schema Alignment ===\n');

try {
  const servicePath = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  // Verify the hardcoded select is removed
  if (serviceCode.includes('SELECT decision_status, decision_type, evidence_integrity_hash')) {
    if (serviceCode.includes('FROM controlled_beta_operational_exit_decisions')) {
      throw new Error('FAIL: Service still contains hardcoded SELECT evidence_integrity_hash FROM controlled_beta_operational_exit_decisions');
    }
  }

  // Verify new helpers are used
  const requiredHelpers = [
    'findApprovedPhase131DecisionAdaptive',
    'findPhase131DecisionEvidenceHashAdaptive',
    'INFORMATION_SCHEMA.COLUMNS'
  ];

  for (const helper of requiredHelpers) {
    if (!serviceCode.includes(helper)) {
      throw new Error(`FAIL: Service is missing required helper/logic: ${helper}`);
    }
  }

  // Verify candidate tables
  const candidateTables = [
    'controlled_beta_operational_exit_decisions',
    'controlled_beta_operational_review_evidence_packs'
  ];
  for (const t of candidateTables) {
    if (!serviceCode.includes(t)) {
      throw new Error(`FAIL: Service is missing candidate table for hash resolution: ${t}`);
    }
  }

  console.log('PASS: Service introspects INFORMATION_SCHEMA.COLUMNS to adaptively query Phase 131 decision/evidence hash.');
  console.log('PASS: Service supports alternate hash columns and fallback tables.');

  // Run the 132c and 132.0.1 scripts to verify they work
  const smoke132cPath = path.join(__dirname, 'smoke_phase132c_expansion_preparation_readiness.js');
  const smoke132_0_1Path = path.join(__dirname, 'smoke_phase132_0_1_readiness_evidence_dependency_repair.js');

  console.log('Running 132C...');
  try {
    execSync('node ' + smoke132cPath, { stdio: 'ignore' });
    console.log('PASS: 132C passes (readiness blocks appropriately when Phase 131 evidence hash is missing).');
  } catch (e) {
    throw new Error('FAIL: 132C failed. Adaptive logic might be broken or test missing.');
  }

  console.log('Running 132.0.1...');
  try {
    execSync('node ' + smoke132_0_1Path, { stdio: 'ignore' });
    console.log('PASS: 132.0.1 passes.');
  } catch (e) {
    throw new Error('FAIL: 132.0.1 failed. Adaptive logic might be broken or test missing.');
  }

  console.log('\nSUCCESS: Phase 132.0.4 Phase 131 Decision Hash Schema Alignment Passed.');
  process.exit(0);

} catch (error) {
  console.error(error.message);
  process.exit(1);
}
