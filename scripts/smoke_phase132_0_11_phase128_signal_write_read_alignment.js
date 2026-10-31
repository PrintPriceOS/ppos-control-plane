const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Smoke 132.0.11: Phase 128.1 Signal Write/Read Alignment ===\n');

try {
  const servicePath = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  if (!serviceCode.includes('payload.recovered_from_db')) {
    throw new Error('FAIL: Service is missing payload.recovered_from_db logic');
  }

  if (!serviceCode.includes('memory_state_detected === 0 || row.memory_state_detected === false')) {
    throw new Error('FAIL: Service is missing explicit false check for memory_state_detected');
  }

  console.log('PASS: Service correctly supports reading Phase 128.1 recovery signals from direct columns and payloads.');

  const smoke132cPath = path.join(__dirname, 'smoke_phase132c_expansion_preparation_readiness.js');
  const testCode = fs.readFileSync(smoke132cPath, 'utf8');
  if (!testCode.includes('restart_safe: true')) {
     throw new Error('FAIL: 132c missing restart_safe: true in JSON payload');
  }
  
  console.log('PASS: 132c positive fixture creates payloads with the required Phase 128.1 recovery signals.');
  
  console.log('Running 132C...');
  try {
    execSync('node ' + smoke132cPath, { stdio: 'inherit' });
    console.log('PASS: 132C passes (positive readiness case reaches READY).');
  } catch (e) {
    throw new Error('FAIL: 132C failed. Signal write/read contract is still not fully aligned.');
  }

  const smoke132_0_1Path = path.join(__dirname, 'smoke_phase132_0_1_readiness_evidence_dependency_repair.js');
  console.log('Running 132.0.1...');
  try {
    execSync('node ' + smoke132_0_1Path, { stdio: 'inherit' });
    console.log('PASS: 132.0.1 passes.');
  } catch (e) {
    throw new Error('FAIL: 132.0.1 failed.');
  }

  const smoke132_0_10Path = path.join(__dirname, 'smoke_phase132_0_10_phase128_positive_contract_alignment.js');
  console.log('Running 132.0.10...');
  try {
    execSync('node ' + smoke132_0_10Path, { stdio: 'inherit' });
    console.log('PASS: 132.0.10 passes.');
  } catch (e) {
    throw new Error('FAIL: 132.0.10 failed.');
  }

  console.log('\nSUCCESS: Phase 132.0.11 Phase 128.1 Signal Write/Read Alignment Passed.');
  process.exit(0);

} catch (error) {
  console.error(error.message);
  process.exit(1);
}
