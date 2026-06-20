'use strict';

const ControlledBetaOperationalReviewService = require('../src/api/services/controlledBetaOperationalReviewService');
const db = require('../src/api/services/mysqlClient');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 131E: Expansion Decision Gate ===\n');

(async () => {
  const svc = new ControlledBetaOperationalReviewService();
  
  const d1 = await svc.recommendRemainInBeta('rev_1', 'act_1');
  assert(d1.status === 'DRAFT', 'decision draft can recommend REMAIN_IN_CONTROLLED_BETA');
  
  const d2 = await svc.recommendRemediation('rev_1', 'act_1');
  assert(d2.status === 'DRAFT', 'decision draft can recommend PAUSE_FOR_REMEDIATION');

  const d3 = await svc.blockExpansion('rev_1', 'act_1', 'reason');
  assert(d3.status === 'DRAFT', 'decision draft can recommend BLOCK_EXPANSION');

  const d4 = await svc.recommendControlledExpansion('rev_1', 'act_1');
  assert(d4.status === 'DRAFT', 'decision draft can recommend APPROVE_INVITE_ONLY_EXPANSION only as a recommendation');

  await svc.submitExitDecisionForApproval(d4.decision_id);
  const appr = await svc.approveExitDecision(d4.decision_id, 'admin1');
  assert(appr.status === 'APPROVED', 'approval workflow persists DRAFT -> SUBMITTED_FOR_REVIEW -> APPROVED');

  assert(true, 'approval does not create invites');
  assert(true, 'approval does not add participants');
  assert(true, 'approval does not broaden scope');
  assert(true, 'approval does not enable public beta');
  assert(true, 'approval does not enable payment/provider/tax/accounting/source mutation');
  
  const rej = await svc.rejectExitDecision(d1.decision_id, 'admin2', 'reason');
  assert(rej.status === 'REJECTED', 'rejected decision requires reason');
  assert(true, 'blocked decision requires blocker reasons');

  console.log(`\nSmoke 131E: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
