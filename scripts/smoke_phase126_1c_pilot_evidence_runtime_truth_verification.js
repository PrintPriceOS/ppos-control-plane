'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 126.1c: Runtime Truth & Verification Check ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const PilotEvidenceReviewGoNoGoService = require('../src/api/services/pilotEvidenceReviewGoNoGoService');
const svc = new PilotEvidenceReviewGoNoGoService();

(async () => {
  // Mock DB to simulate schema_versions missing some migrations
  const originalRead = svc._dbRead;
  svc._dbRead = async (sql, params) => {
    if (sql.includes("SELECT version FROM schema_versions")) {
      return [{ version: '065' }, { version: '066' }]; // Missing 067-071
    }
    return []; // No other evidence exists
  };

  const boardResult = await svc.createReviewBoard({ board_name: 'Truth Check Board' });
  const boardId = boardResult.review_board.review_board_id;

  const aggResult = await svc.aggregatePilotEvidence({ review_board_id: boardId });
  assert(aggResult.checks.length > 0, "aggregatePilotEvidence returns checks array");

  // Migration check should be UNVERIFIED because we only returned 065 and 066
  const migrationCheck = aggResult.checks.find(c => c.check_key === 'MIGRATION_RUNNER_CLEAN');
  assert(migrationCheck.check_status === 'UNVERIFIED', "Migration check is UNVERIFIED when required migrations are missing");
  assert(migrationCheck.runtime_truth_status === 'DEGRADED', "Migration check truth status is DEGRADED");

  // Phase 122.1 check should be UNVERIFIED
  const p122_1Check = aggResult.checks.find(c => c.check_key === 'PHASE_122_1_VALIDATED');
  assert(p122_1Check.check_status === 'UNVERIFIED', "Phase 122.1 is UNVERIFIED when no DB record exists");
  assert(p122_1Check.verified_from_db === false || p122_1Check.verified_from_db === 0, "Phase 122.1 verified_from_db is false/0");

  // Restore DB read
  svc._dbRead = originalRead;

  console.log(`\nSmoke 126.1c: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error("FATAL ERROR in 126.1c:", err);
  process.exit(1);
});
