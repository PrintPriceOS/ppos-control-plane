'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 127.1b: DB Persistence Service Verification ===\n');

process.env.NODE_ENV = 'production';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'false';

const LimitedBetaPreparationGateService = require('../src/api/services/limitedBetaPreparationGateService');
const svc = new LimitedBetaPreparationGateService();

(async () => {
  // Test helper methods presence
  assert(typeof svc._dbWrite === 'function', "Service has _dbWrite method");
  assert(typeof svc._dbRead === 'function', "Service has _dbRead method");
  assert(typeof svc._getPersistenceInfo === 'function', "Service has _getPersistenceInfo method");

  // Verify DB load helpers
  assert(typeof svc._getGateFromDb === 'function', "Service has _getGateFromDb method");
  assert(typeof svc._listCohortsFromDb === 'function', "Service has _listCohortsFromDb method");
  assert(typeof svc._listParticipantsFromDb === 'function', "Service has _listParticipantsFromDb method");
  assert(typeof svc._listInviteCodesFromDb === 'function', "Service has _listInviteCodesFromDb method");

  // Mock DB write failing to trigger fail-closed in production mode
  const originalDb = svc._db;
  svc._db = {
    query: async () => { throw new Error("Mock DB connection failure"); }
  };

  try {
    await svc.createPreparationGate({ created_by: 'smoke' });
    assert(false, "Should have thrown on DB write failure in production mode");
  } catch (err) {
    assert(err.message.includes("PRODUCTION_INTEGRITY_VIOLATION") || err.message.includes("Database write failed"), "Threw correct production integrity or database write failed error");
  }

  // Restore DB with a query mock that verifies invite code redaction and hashing
  let capturedWriteArgs = null;
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO limited_beta_invite_codes')) {
        capturedWriteArgs = { sql, params };
      }
      return [{ affectedRows: 1 }];
    }
  };

  try {
    const inviteResult = await svc.issueInviteCode({
      cohort_id: 'cohort_123',
      invite_code: 'SUPER-SECRET-CODE-1234',
      max_uses: 1,
      created_by: 'smoke'
    });

    assert(inviteResult.invite, "Invite result returned");
    assert(inviteResult.invite.invite_code === '[REDACTED]', "Invite code property in returned object is redacted");
    assert(inviteResult.invite.invite_hash, "Invite hash is present");

    assert(capturedWriteArgs !== null, "Write argument captured");
    if (capturedWriteArgs) {
      const inviteCodeParam = capturedWriteArgs.params[3]; // SQL parameters: invite_id, cohort_id, gate_id, invite_code, invite_hash, ...
      assert(inviteCodeParam === '[REDACTED]', "Raw invite code is redacted in the database write payload");
      const hashParam = capturedWriteArgs.params[4];
      assert(hashParam && hashParam !== 'SUPER-SECRET-CODE-1234', "Hash parameter is populated and is not the raw code");
    }
  } catch (err) {
    console.error("  Error during invite persistence test:", err.message);
    failed++;
  }

  // Restore original DB configuration
  svc._db = originalDb;

  console.log(`\nSmoke 127.1b: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 127.1b:", err);
  process.exit(1);
});
