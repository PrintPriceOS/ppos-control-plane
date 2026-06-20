const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Smoke 132.0.8: Phase 128.1 Positive Evidence Context Match ===\n');

try {
  const servicePath = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  // Verify findPhase128RestartEvidenceAdaptive parses payload
  if (!serviceCode.includes('debug.rejected_reasons.push(`${t}: missing_payload_for_context_match`)')) {
    throw new Error('FAIL: Service is missing payload context checking logic in findPhase128RestartEvidenceAdaptive');
  }

  console.log('PASS: Service correctly supports resolving Phase 128.1 evidence from payload context.');

  const smoke132cPath = path.join(__dirname, 'smoke_phase132c_expansion_preparation_readiness.js');
  const testCode = fs.readFileSync(smoke132cPath, 'utf8');
  if (!testCode.includes('activation_id: actId')) {
     throw new Error('FAIL: 132c missing context in JSON payload of Phase 128.1 fixture.');
  }
  
  console.log('PASS: Positive readiness fixture correctly injects activation_id context into Phase 128.1 payload.');
  
  console.log('Running 132C...');
  try {
    execSync('node ' + smoke132cPath, { stdio: 'ignore' });
    console.log('PASS: 132C passes (positive readiness case reaches READY).');
  } catch (e) {
    throw new Error('FAIL: 132C failed. Positive Phase 128.1 evidence still not satisfying readiness.');
  }

  const smoke132_0_1Path = path.join(__dirname, 'smoke_phase132_0_1_readiness_evidence_dependency_repair.js');
  console.log('Running 132.0.1...');
  try {
    execSync('node ' + smoke132_0_1Path, { stdio: 'ignore' });
    console.log('PASS: 132.0.1 passes.');
  } catch (e) {
    throw new Error('FAIL: 132.0.1 failed. Positive Phase 128.1 evidence still not satisfying readiness.');
  }

  console.log('\nSUCCESS: Phase 132.0.8 Phase 128.1 Positive Evidence Context Match Passed.');
  process.exit(0);

} catch (error) {
  console.error(error.message);
  process.exit(1);
}
