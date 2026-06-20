const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Smoke 132.0.7: Phase 128.1 Evidence Context Isolation ===\n');

try {
  const servicePath = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  // Verify findPhase128RestartEvidenceAdaptive call has requireContextBoundEvidence
  if (!serviceCode.includes('requireContextBoundEvidence: true')) {
    throw new Error('FAIL: Service is missing requireContextBoundEvidence: true in findPhase128RestartEvidenceAdaptive options');
  }

  console.log('PASS: Service correctly passes options to restrict Phase 128.1 evidence to context-bound only.');
  
  // Run the 132c and 132.0.1 scripts to verify they work
  const smoke132cPath = path.join(__dirname, 'smoke_phase132c_expansion_preparation_readiness.js');
  const smoke132_0_1Path = path.join(__dirname, 'smoke_phase132_0_1_readiness_evidence_dependency_repair.js');

  console.log('Running 132C...');
  try {
    execSync('node ' + smoke132cPath, { stdio: 'ignore' });
    console.log('PASS: 132C passes (readiness properly isolates missing 128.1 evidence).');
  } catch (e) {
    throw new Error('FAIL: 132C failed. Adaptive 128.1 evidence context isolation might be broken or test missing.');
  }

  console.log('Running 132.0.1...');
  try {
    execSync('node ' + smoke132_0_1Path, { stdio: 'ignore' });
    console.log('PASS: 132.0.1 passes.');
  } catch (e) {
    throw new Error('FAIL: 132.0.1 failed. Adaptive 128.1 evidence context isolation might be broken or test missing.');
  }

  console.log('\nSUCCESS: Phase 132.0.7 Phase 128.1 Evidence Context Isolation Passed.');
  process.exit(0);

} catch (error) {
  console.error(error.message);
  process.exit(1);
}
