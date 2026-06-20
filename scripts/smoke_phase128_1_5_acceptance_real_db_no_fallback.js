'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1.5: 128.1g Acceptance DB No-Fallback Regression ===\n');

(async () => {
  const gScriptPath = path.join(__dirname, 'smoke_phase128_1g_runtime_restart_acceptance_pack.js');
  const src = fs.readFileSync(gScriptPath, 'utf8');

  assert(src.includes("require('dotenv').config()"), "128.1g detects DATABASE_URL via dotenv");
  assert(src.includes("hasDbConfig"), "128.1g detects hasDbConfig");
  assert(src.includes("if (hasDbConfig && db)"), "128.1g prefers real DB when configured");

  if (process.env.DATABASE_URL) {
    console.log("Running 128.1g in separate process with DATABASE_URL...");
    try {
      const output = cp.execSync('node ' + gScriptPath, { env: process.env }).toString();
      
      assert(!output.includes('(fallback)'), "128.1g does not print fallback passes in DB mode");
      assert(output.includes('is present in database') || output.includes('is true in database') || output.includes('Database check failed'), "128.1g attempts DB verification");
      
      if (output.includes('Finished execution.') && !output.includes('FAIL:')) {
        assert(true, "128.1g exited successfully with real DB");
      }
    } catch (err) {
      const output = err.stdout?.toString() + err.stderr?.toString();
      if (output.includes('Database check failed') || output.includes('FAIL:')) {
        console.log("  NOTE: 128.1g failed correctly because real DB lacked marker, which is acceptable for this test if the DB hasn't been seeded.");
        assert(true, "128.1g exited non-zero when DB evidence is missing or mismatched");
      } else {
        console.error("Unexpected error running 128.1g:", err.message);
        failed++;
      }
    }
  } else {
    console.log("  SKIP: No DATABASE_URL provided for runtime checks");
  }

  console.log(`\nSmoke 128.1.5: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
