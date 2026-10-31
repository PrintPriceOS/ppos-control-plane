'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 130.0.2: Migration Registry Alignment ===\n');

(async () => {
  const smoke130aCode = fs.readFileSync(path.join(__dirname, 'smoke_phase130a_runtime_observation_schema.js'), 'utf8');
  
  assert(smoke130aCode.includes('schema_versions'), '130A checks schema_versions');
  assert(smoke130aCode.includes('m.version || m.migration || m.migration_name || m.name || m.filename || m.description'), '130A handles the actual schema_versions column shape generically');
  assert(smoke130aCode.includes("v.includes('077') || v.includes('078') || v.includes('phase130')"), '130A accepts registered 077 or 078 migration');
  assert(smoke130aCode.includes('PHASE_130_MIGRATION_REGISTRY_MISSING'), '130A fails if schema_versions has no Phase 130 migration row');
  
  // Verify that it still checks the actual tables
  assert(smoke130aCode.includes("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES"), '130A still verifies INFORMATION_SCHEMA.TABLES');
  assert(smoke130aCode.includes("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS"), '130A still verifies INFORMATION_SCHEMA.COLUMNS');
  assert(smoke130aCode.includes("SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS"), '130A still verifies INFORMATION_SCHEMA.STATISTICS');

  assert(smoke130aCode.includes("isProdLike && process.env.ALLOW_SCHEMA_SMOKE_FALLBACK !== 'true'"), 'no fallback is allowed in production-like mode');
  
  console.log(`\nSmoke 130.0.2: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
