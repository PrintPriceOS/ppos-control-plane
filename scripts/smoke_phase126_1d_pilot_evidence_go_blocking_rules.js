'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 126.1d: Go Decision Blocking Rules Check ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const PilotEvidenceReviewGoNoGoService = require('../src/api/services/pilotEvidenceReviewGoNoGoService');
const svc = new PilotEvidenceReviewGoNoGoService();

(async () => {
  const boardResult = await svc.createReviewBoard({ board_name: 'Blocking Board' });
  const boardId = boardResult.review_board.review_board_id;

  // 1. With no checks run, all checks are incomplete, GO should be blocked
  const blockedDecision1 = await svc.submitGoNoGoDecision({
    review_board_id: boardId,
    decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION',
  });
  assert(blockedDecision1.blocked === true, "GO is blocked when checks are incomplete");
  assert(blockedDecision1.betaEnabled === false, "betaEnabled remains false");

  // 2. Add an unresolved blocker finding, GO should be blocked
  await svc.recordReviewFinding({
    review_board_id: boardId,
    finding_type: 'BLOCKER',
    blocks_go_decision: true,
    severity: 'CRITICAL',
    summary: 'Blocker finding',
  });

  const blockedDecision2 = await svc.submitGoNoGoDecision({
    review_board_id: boardId,
    decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION',
  });
  assert(blockedDecision2.blocked === true, "GO is blocked when unresolved blockers exist");

  console.log(`\nSmoke 126.1d: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error("FATAL ERROR in 126.1d:", err);
  process.exit(1);
});
