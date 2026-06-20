const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Smoke 132.0.10: Phase 128.1 Positive Evidence Resolver/Fixture Contract Alignment ===\n');

try {
  const servicePath = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  if (!serviceCode.includes('payload.restart || payload.recovery || payload')) {
    throw new Error('FAIL: Service is missing nested payload fallback support in normalizeRestartEvidence');
  }

  if (!serviceCode.includes('const pCtx = payload.context || payload;')) {
    throw new Error('FAIL: Service is missing nested context parsing logic in findPhase128RestartEvidenceAdaptive');
  }

  console.log('PASS: Service correctly supports resolving Phase 128.1 evidence from nested context payloads.');

  const smoke132cPath = path.join(__dirname, 'smoke_phase132c_expansion_preparation_readiness.js');
  const testCode = fs.readFileSync(smoke132cPath, 'utf8');
  if (!testCode.includes('inserted128.context_used.activation_id ===')) {
     throw new Error('FAIL: 132c missing assertion for what insertPhase128EvidenceAdaptive returns.');
  }
  if (!testCode.includes('Safe debug info')) {
     throw new Error('FAIL: 132c missing safe debug info printing on positive case failure.');
  }

  console.log('PASS: Positive readiness fixture asserts on its returned payload and prints safe debug info.');
  
  console.log('Running 132C...');
  try {
    execSync('node ' + smoke132cPath, { stdio: 'inherit' });
    console.log('PASS: 132C passes (positive readiness case reaches READY).');
  } catch (e) {
    throw new Error('FAIL: 132C failed. The resolver contract alignment might be incomplete.');
  }

  const smoke132_0_1Path = path.join(__dirname, 'smoke_phase132_0_1_readiness_evidence_dependency_repair.js');
  console.log('Running 132.0.1...');
  try {
    execSync('node ' + smoke132_0_1Path, { stdio: 'inherit' });
    console.log('PASS: 132.0.1 passes.');
  } catch (e) {
    throw new Error('FAIL: 132.0.1 failed.');
  }

  const smoke132_0_8Path = path.join(__dirname, 'smoke_phase132_0_8_phase128_positive_context_evidence.js');
  console.log('Running 132.0.8...');
  try {
    execSync('node ' + smoke132_0_8Path, { stdio: 'inherit' });
    console.log('PASS: 132.0.8 passes.');
  } catch (e) {
    throw new Error('FAIL: 132.0.8 failed.');
  }

  console.log('\nSUCCESS: Phase 132.0.10 Phase 128.1 Positive Evidence Resolver/Fixture Contract Alignment Passed.');
  process.exit(0);

} catch (error) {
  console.error(error.message);
  process.exit(1);
}
