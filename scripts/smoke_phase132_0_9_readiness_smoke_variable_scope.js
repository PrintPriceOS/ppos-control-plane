const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Smoke 132.0.9: Readiness Smoke Result Variable Scope ===\n');

try {
  const servicePath = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  if (serviceCode.includes('result.blocked_reasons.push')) {
    throw new Error('FAIL: service code still contains undefined "result" variable.');
  }
  
  const smoke132cPath = path.join(__dirname, 'smoke_phase132c_expansion_preparation_readiness.js');
  const smoke13201Path = path.join(__dirname, 'smoke_phase132_0_1_readiness_evidence_dependency_repair.js');

  const cCode = fs.readFileSync(smoke132cPath, 'utf8');
  if (cCode.includes('result.readiness_status')) {
     throw new Error('FAIL: 132c still contains undefined "result" variable reference.');
  }
  
  const oCode = fs.readFileSync(smoke13201Path, 'utf8');
  if (oCode.includes('result.readiness_status')) {
     throw new Error('FAIL: 132.0.1 still contains undefined "result" variable reference.');
  }

  console.log('PASS: No executable undefined "result" reference found in service or smoke tests.');

  console.log('\nSUCCESS: Phase 132.0.9 Readiness Smoke Result Variable Scope Passed.');
  process.exit(0);

} catch (error) {
  console.error(error.message);
  process.exit(1);
}
