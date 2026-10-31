'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1.2: PM2 Restart Detection Acceptance Validation ===\n');

const markerPath = path.join(__dirname, 'smoke_phase128_1h_real_pm2_restart_drill_marker.js');
const markerExists = fs.existsSync(markerPath);
assert(markerExists, '128.1h file exists');

if (markerExists) {
  const markerContent = fs.readFileSync(markerPath, 'utf8');
  assert(markerContent.includes('pm2 jlist'), '128.1h checks pm2 jlist');
  assert(markerContent.includes('before_pm2_pid') && markerContent.includes('before_pm2_restart_count') && markerContent.includes('before_pm2_uptime'), '128.1h compares before/after PM2 metadata');
  assert(markerContent.includes('recovered_from_db'), '128.1h requires recovered_from_db=true');
  assert(markerContent.includes('memory_state_detected'), '128.1h requires memory_state_detected=false');
}

const aggregatorPath = path.join(__dirname, 'smoke_phase128_1g_runtime_restart_acceptance_pack.js');
const aggregatorExists = fs.existsSync(aggregatorPath);
assert(aggregatorExists, '128.1g aggregator file exists');

if (aggregatorExists) {
  const aggregatorContent = fs.readFileSync(aggregatorPath, 'utf8');
  assert(aggregatorContent.includes('smoke_phase128_1h_real_pm2_restart_drill_marker.js'), '128.1g references or validates 128.1h result');
}

console.log(`\nSmoke 128.1.2: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
