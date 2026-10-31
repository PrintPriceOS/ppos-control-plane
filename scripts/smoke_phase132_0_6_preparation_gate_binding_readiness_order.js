const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Smoke 132.0.6: Phase 132 Preparation Gate Binding & Readiness Order ===\n');

try {
  const servicePath = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  // Verify the hardcoded select is removed
  if (serviceCode.includes('FROM controlled_beta_expansion_preparation_gates WHERE preparation_id = ? AND review_id = ?')) {
    throw new Error('FAIL: Service still contains hardcoded SELECT from controlled_beta_expansion_preparation_gates');
  }

  // Verify new helpers are used
  const requiredHelpers = [
    'findExpansionPreparationGateAdaptive',
    'INFORMATION_SCHEMA.COLUMNS'
  ];

  for (const helper of requiredHelpers) {
    if (!serviceCode.includes(helper)) {
      throw new Error(`FAIL: Service is missing required helper/logic: ${helper}`);
    }
  }

  console.log('PASS: Service uses findExpansionPreparationGateAdaptive to lookup preparation gate adaptively.');
  
  // Run the 132c and 132.0.1 scripts to verify they work
  const smoke132cPath = path.join(__dirname, 'smoke_phase132c_expansion_preparation_readiness.js');
  const smoke132_0_1Path = path.join(__dirname, 'smoke_phase132_0_1_readiness_evidence_dependency_repair.js');

  console.log('Running 132C...');
  try {
    execSync('node ' + smoke132cPath, { stdio: 'ignore' });
    console.log('PASS: 132C passes (readiness properly differentiates missing gate vs missing dependencies).');
  } catch (e) {
    throw new Error('FAIL: 132C failed. Adaptive gate creation logic might be broken or test missing.');
  }

  console.log('Running 132.0.1...');
  try {
    execSync('node ' + smoke132_0_1Path, { stdio: 'ignore' });
    console.log('PASS: 132.0.1 passes.');
  } catch (e) {
    throw new Error('FAIL: 132.0.1 failed. Adaptive gate creation logic might be broken or test missing.');
  }

  console.log('\nSUCCESS: Phase 132.0.6 Preparation Gate Binding & Readiness Order Passed.');
  process.exit(0);

} catch (error) {
  console.error(error.message);
  process.exit(1);
}
