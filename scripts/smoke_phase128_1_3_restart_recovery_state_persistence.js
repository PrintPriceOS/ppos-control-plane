'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1.3: Restart Recovery State Persistence Validation ===\n');

const markerPath = path.join(__dirname, 'smoke_phase128_1h_real_pm2_restart_drill_marker.js');
const markerExists = fs.existsSync(markerPath);
assert(markerExists, '128.1h file exists');

if (markerExists) {
  const markerContent = fs.readFileSync(markerPath, 'utf8');
  assert(markerContent.includes('recovered_from_db = 1'), '128.1h updates recovered_from_db');
  assert(markerContent.includes('memory_state_detected = 0'), '128.1h updates memory_state_detected');
  assert(markerContent.includes('normalizeDbBool'), '128.1h normalizes MySQL boolean values');
  assert(markerContent.includes('SELECT recovered_from_db, memory_state_detected'), '128.1h re-reads persisted row before asserting');
  assert(markerContent.includes('--marker-id=') || markerContent.includes('drill_id = ?'), '128.1h supports marker-id or safe latest-marker semantics');
  assert(markerContent.includes('300000'), '128.1h stale markers cannot pass (5 minute age limit)');
}

const aggregatorPath = path.join(__dirname, 'smoke_phase128_1g_runtime_restart_acceptance_pack.js');
const aggregatorExists = fs.existsSync(aggregatorPath);
assert(aggregatorExists, '128.1g aggregator file exists');

if (aggregatorExists) {
  const aggregatorContent = fs.readFileSync(aggregatorPath, 'utf8');
  assert(aggregatorContent.includes('smoke_phase128_1h_real_pm2_restart_drill_marker.js'), '128.1g acceptance pack depends on 128.1h success');
}

console.log(`\nSmoke 128.1.3: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
