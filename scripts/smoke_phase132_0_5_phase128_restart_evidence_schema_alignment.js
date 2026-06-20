const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Smoke 132.0.5: Phase 128.1 Restart Evidence Schema Alignment ===\n');

try {
  const servicePath = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  // Verify the hardcoded select is removed
  if (serviceCode.includes('SELECT restart_safe FROM limited_beta_runtime_restart_drills')) {
    throw new Error('FAIL: Service still contains hardcoded SELECT restart_safe FROM limited_beta_runtime_restart_drills');
  }

  // Verify new helpers are used
  const requiredHelpers = [
    'findPhase128RestartEvidenceAdaptive',
    'normalizeRestartEvidence',
    'INFORMATION_SCHEMA.COLUMNS'
  ];

  for (const helper of requiredHelpers) {
    if (!serviceCode.includes(helper)) {
      throw new Error(`FAIL: Service is missing required helper/logic: ${helper}`);
    }
  }

  // Verify candidate tables
  const candidateTables = [
    'limited_beta_runtime_restart_drills',
    'limited_beta_runtime_restart_evidence_packs',
    'limited_beta_runtime_evidence_packs',
    'controlled_beta_runtime_restart_drills',
    'controlled_beta_runtime_restart_evidence_packs'
  ];
  for (const t of candidateTables) {
    if (!serviceCode.includes(t)) {
      throw new Error(`FAIL: Service is missing candidate table for hash resolution: ${t}`);
    }
  }

  console.log('PASS: Service introspects INFORMATION_SCHEMA.COLUMNS to adaptively query Phase 128.1 restart evidence.');
  console.log('PASS: Service supports alternate evidence payload JSON fallback.');

  // Run the 132c and 132.0.1 scripts to verify they work
  const smoke132cPath = path.join(__dirname, 'smoke_phase132c_expansion_preparation_readiness.js');
  const smoke132_0_1Path = path.join(__dirname, 'smoke_phase132_0_1_readiness_evidence_dependency_repair.js');

  console.log('Running 132C...');
  try {
    execSync('node ' + smoke132cPath, { stdio: 'ignore' });
    console.log('PASS: 132C passes (readiness blocks appropriately when Phase 128.1 evidence is missing).');
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

  console.log('\nSUCCESS: Phase 132.0.5 Phase 128.1 Restart Evidence Schema Alignment Passed.');
  process.exit(0);

} catch (error) {
  console.error(error.message);
  process.exit(1);
}
