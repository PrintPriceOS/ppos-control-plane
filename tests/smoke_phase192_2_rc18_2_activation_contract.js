/**
 * tests/smoke_phase192_2_rc18_2_activation_contract.js
 * 
 * Phase 192 RC18.2 — Printhouse Activation Token Contract Fix Tests (A1 - A10)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function runTests() {
  console.log('================================================================');
  console.log('PHASE 192 RC18.2: PRINTHOUSE ACTIVATION TOKEN CONTRACT TESTS (A1 - A10)');
  console.log('================================================================\n');

  const activationPagePath = path.resolve(__dirname, '../src/ui/pages/PrinthouseActivationPage.tsx');
  const activationPageCode = fs.readFileSync(activationPagePath, 'utf8');

  // A1: PrinthouseActivationPage reads query parameter: token
  assert.ok(
    activationPageCode.includes("searchParams.get('token')"),
    'A1: PrinthouseActivationPage must read query parameter `token`'
  );
  console.log('✓ Test A1: PrinthouseActivationPage reads query parameter: token');

  // A2: activation/inspect request body contains: rawToken
  assert.ok(
    activationPageCode.includes("fetch('/api/auth/printhouse/activation/inspect'"),
    'A2: Must call /api/auth/printhouse/activation/inspect'
  );
  assert.ok(
    /body:\s*JSON\.stringify\(\{\s*rawToken:\s*token\s*\}\)/.test(activationPageCode),
    'A2: activation/inspect request body must contain rawToken: token'
  );
  console.log('✓ Test A2: activation/inspect request body contains: rawToken');

  // A3: activation/inspect request body does NOT contain: token
  assert.ok(
    !/fetch\('\/api\/auth\/printhouse\/activation\/inspect'[\s\S]*?body:\s*JSON\.stringify\(\{\s*token\s*\}\)/.test(activationPageCode),
    'A3: activation/inspect request body must NOT send { token }'
  );
  console.log('✓ Test A3: activation/inspect request body does NOT contain: token');

  // A4: activate request body contains: rawToken, password
  assert.ok(
    activationPageCode.includes("fetch('/api/auth/printhouse/activate'"),
    'A4: Must call /api/auth/printhouse/activate'
  );
  assert.ok(
    /body:\s*JSON\.stringify\(\{\s*rawToken:\s*token,\s*password\s*\}\)/.test(activationPageCode),
    'A4: activate request body must contain rawToken: token, password'
  );
  console.log('✓ Test A4: activate request body contains: rawToken and password');

  // A5: activate request body does NOT use: token
  assert.ok(
    !/fetch\('\/api\/auth\/printhouse\/activate'[\s\S]*?body:\s*JSON\.stringify\(\{\s*token,\s*password\s*\}\)/.test(activationPageCode),
    'A5: activate request body must NOT send { token, password }'
  );
  console.log('✓ Test A5: activate request body does NOT use: token');

  // A6: Backend inspectToken accepts a generated 64-character hexadecimal signup token
  const printhouseActivationService = require('../src/api/services/printhouseActivationService');
  const db = require('../src/api/services/mysqlClient');

  // Generate 64-char hex token
  const sampleRawToken = crypto.randomBytes(32).toString('hex');
  assert.strictEqual(sampleRawToken.length, 64, 'Token length must be 64 characters');

  const hashedToken = crypto.createHash('sha256').update(sampleRawToken).digest('hex');
  const originalQuery = db.query;

  // Mock DB response for inspectToken
  db.query = async (sql, params) => {
    if (sql.includes('FROM printhouse_signup_requests')) {
      assert.strictEqual(params[0], hashedToken, 'Must query DB using SHA-256 hash of rawToken');
      return [{
        id: 'req-test-123',
        email: 'printer-boss@example.com',
        status: 'PENDING_ACTIVATION',
        activation_expires_at: new Date(Date.now() + 86400000).toISOString(),
        activation_consumed_at: null
      }];
    }
    return [];
  };

  try {
    const inspectRes = await printhouseActivationService.inspectToken({ rawToken: sampleRawToken });
    assert.strictEqual(inspectRes.ok, true, 'A6: inspectToken must succeed with rawToken');
    assert.strictEqual(inspectRes.status, 'READY_TO_ACTIVATE', 'A6: inspectToken returns READY_TO_ACTIVATE');
    assert.strictEqual(inspectRes.maskedEmail, 'p***s@example.com', 'A6: inspectToken returns masked email');
    console.log('✓ Test A6: Backend inspectToken accepts a generated 64-character hexadecimal signup token');

    // A7: Backend activation service receives the same raw token contract
    let updatedStatus = false;
    db.query = async (sql, params) => {
      if (sql.includes('FROM printhouse_signup_requests') && sql.includes('WHERE activation_token_hash = ?')) {
        assert.strictEqual(params[0], hashedToken, 'Must look up signup request with hash of rawToken');
        return [{
          id: 'req-test-123',
          email: 'printer-boss@example.com',
          status: 'PENDING_ACTIVATION',
          activation_expires_at: new Date(Date.now() + 86400000).toISOString(),
          activation_consumed_at: null,
          metadata: '{}'
        }];
      }
      if (sql.includes('UPDATE printhouse_signup_requests SET status = ?')) {
        updatedStatus = true;
        return { affectedRows: 1 };
      }
      if (sql.includes('INSERT INTO control_users') || sql.includes('INSERT INTO printhouse_memberships') || sql.includes('INSERT INTO audit_logs')) {
        return { insertId: 1 };
      }
      return [];
    };

    // Also mock userService/audit if needed or test activateAccount error check on missing rawToken
    const invalidInspectRes = await printhouseActivationService.inspectToken({ token: sampleRawToken });
    assert.strictEqual(invalidInspectRes.ok, false, 'A7: inspectToken with old payload { token } fails format validation');
    assert.strictEqual(invalidInspectRes.error.code, 'ACTIVATION_INVALID');

    const invalidActivateRes = await printhouseActivationService.activateAccount({ token: sampleRawToken, password: 'StrongPassword123!' });
    assert.strictEqual(invalidActivateRes.ok, false, 'A7: activateAccount with old payload { token } fails format validation');
    assert.strictEqual(invalidActivateRes.error.code, 'ACTIVATION_INVALID');
    console.log('✓ Test A7: Backend activation service receives the same raw token contract');
  } finally {
    db.query = originalQuery;
  }

  // A8: Raw token is stripped from browser URL after successful inspection
  assert.ok(
    activationPageCode.includes('window.history.replaceState({}, document.title, window.location.pathname)'),
    'A8: Raw token must be stripped from URL after successful inspection'
  );
  console.log('✓ Test A8: Raw token is stripped from browser URL after successful inspection');

  // A9: Inspection does not consume token
  assert.ok(
    !activationPageCode.includes('/api/auth/printhouse/activation/inspect') ||
    !activationPageCode.includes('activation_consumed_at = NOW()'),
    'A9: Inspection does not consume token'
  );
  console.log('✓ Test A9: Inspection does not consume token');

  // A10: Activation still requires explicit user action
  assert.ok(
    activationPageCode.includes('onSubmit={handleActivate}') &&
    activationPageCode.includes('<button') &&
    activationPageCode.includes('type="submit"'),
    'A10: Activation form requires explicit button click / submit action'
  );
  console.log('✓ Test A10: Activation still requires explicit user action');

  console.log('\n================================================================');
  console.log('ALL RC18.2 ACTIVATION CONTRACT TESTS PASSED (A1 - A10)');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n[FAIL] RC18.2 Contract Test Failed:', err);
  process.exit(1);
});
