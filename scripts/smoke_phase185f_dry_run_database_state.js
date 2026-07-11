'use strict';

const assert = require('assert').strict;
const { spawn } = require('child_process');
const path = require('path');

console.log('=== Smoke Test 185F: Dry-Run Database Exit Codes ===\n');

// This test executes run_control_plane_migrations.js with --dry-run
// in a subprocess and validates exit statuses.
const cliPath = path.join(__dirname, 'run_control_plane_migrations.js');

function runDryRun(mockEnv = {}) {
  return new Promise((resolve) => {
    const proc = spawn('node', [cliPath, '--dry-run'], {
      env: { ...process.env, ...mockEnv }
    });
    
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

(async () => {
  // Test: Dry-run fails fast on checksum mismatch or ledger unavailability
  // We simulate by setting a bad database config so it fails ledger status read
  const res = await runDryRun({
    MYSQL_HOST: 'localhost-invalid-db',
    MYSQL_PORT: '9999'
  });

  // Database is unreachable -> exit code must be 5
  assert.equal(res.code, 5, `Expected exit code 5 (ledger incompatible/unreachable), got ${res.code}`);
  assert(res.stdout.includes('DATABASE_UNREACHABLE'), 'Output should report unreachable state');


  console.log('  PASS: Dry-run correctly exits with code 5 on unreachable databases.');
})().catch(err => {
  console.error('Smoke test 185F failed:', err);
  process.exit(1);
});
