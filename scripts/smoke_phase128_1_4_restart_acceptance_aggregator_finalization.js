'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1.4: Restart Acceptance Aggregator Finalization Validation ===\n');

const markerPath = path.join(__dirname, 'smoke_phase128_1h_real_pm2_restart_drill_marker.js');
const markerExists = fs.existsSync(markerPath);
assert(markerExists, '128.1h file exists');

if (markerExists) {
  const markerContent = fs.readFileSync(markerPath, 'utf8');
  assert(markerContent.includes('--verify-completed'), '128.1h supports --verify-completed');
}

const aggregatorPath = path.join(__dirname, 'smoke_phase128_1g_runtime_restart_acceptance_pack.js');
const aggregatorExists = fs.existsSync(aggregatorPath);
assert(aggregatorExists, '128.1g aggregator file exists');

if (aggregatorExists) {
  const aggregatorContent = fs.readFileSync(aggregatorPath, 'utf8');
  assert(aggregatorContent.includes('--verify-completed'), '128.1g uses --verify-completed');
  assert(!aggregatorContent.includes("'--after'"), '128.1g does not re-run --after');
  assert(aggregatorContent.includes('drills && drills.length > 0'), '128.1g checks completed drill existence');
  assert(aggregatorContent.includes('recoveredFromDb === true'), '128.1g fails if recovered_from_db is not true');
  assert(aggregatorContent.includes('memoryStateDetected === false'), '128.1g fails if memory_state_detected is not false');
  assert(aggregatorContent.includes('restartSafe === true'), '128.1g fails if restart_safe is not true');
  assert(aggregatorContent.includes('recoveryHash'), '128.1g fails if recovery_integrity_hash is missing');
  assert(aggregatorContent.includes('isProductionLike && !isFallbackAllowed && !hasDbConfig'), '128.1g does not use fallback PASS in production-like mode');
}

console.log(`\nSmoke 128.1.4: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
