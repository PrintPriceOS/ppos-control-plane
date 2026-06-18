'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 126D: Pilot Evidence Review E2E Regression Smoke ===\n');

// --- Verify prior phase files still exist ---
const priorPhaseFiles = [
  'migrations/065_phase122_1_internal_order_lifecycle_pilot_hardening.sql',
  'migrations/066_phase122_2_internal_order_lifecycle_runtime_verification.sql',
  'migrations/067_phase123_founding_printhouse_pilot_gate.sql',
  'migrations/068_phase124_controlled_printhouse_handoff_file_package_pilot.sql',
  'migrations/069_phase125_sandbox_commercial_invoice_payment_handoff_pilot.sql',
  'migrations/070_phase126_pilot_evidence_review_go_no_go.sql',
  'src/api/services/internalOrderLifecyclePilotService.js',
  'src/api/services/internalOrderLifecycleRuntimeVerificationService.js',
  'src/api/services/foundingPrinthousePilotGateService.js',
  'src/api/services/controlledPrinthouseHandoffPackageService.js',
  'src/api/services/sandboxCommercialPilotService.js',
  'src/api/services/pilotEvidenceReviewGoNoGoService.js',
  'src/api/routes/internalOrderLifecyclePilotAdmin.js',
  'src/api/routes/internalOrderLifecycleRuntimeVerificationAdmin.js',
  'src/api/routes/foundingPrinthousePilotGateAdmin.js',
  'src/api/routes/controlledPrinthouseHandoffPackageAdmin.js',
  'src/api/routes/sandboxCommercialPilotAdmin.js',
  'src/api/routes/pilotEvidenceReviewGoNoGoAdmin.js',
];
for (const f of priorPhaseFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `Prior phase file exists: ${f}`);
}

// --- Forbidden patterns ---
const forbiddenPatterns = [
  'fullPublicEnabled: true',
  'openMarketplaceEnabled: true',
  'betaEnabled: true',
  'productionActivationEnabled: true',
  'paymentExecutionEnabled: true',
  'refundExecutionEnabled: true',
  'payoutExecutionEnabled: true',
  'providerExternalSubmissionEnabled: true',
  'externalSubmission: true',
  'sourceMutation: true',
];

const phase126Files = [
  'src/api/services/pilotEvidenceReviewGoNoGoService.js',
  'src/api/routes/pilotEvidenceReviewGoNoGoAdmin.js',
];

for (const f of phase126Files) {
  const fullPath = path.join(__dirname, '..', f);
  if (!fs.existsSync(fullPath)) continue;
  const src = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert(!src.includes(pattern), `${f}: no forbidden pattern "${pattern}"`);
  }
}

const forbiddenCalls = [
  'charge(', 'refund(', 'payout(', 'sendToProvider', 'submitTax', 'submitAccounting',
];

for (const f of phase126Files) {
  const fullPath = path.join(__dirname, '..', f);
  if (!fs.existsSync(fullPath)) continue;
  const src = fs.readFileSync(fullPath, 'utf8');
  for (const call of forbiddenCalls) {
    assert(!src.includes(call), `${f}: no forbidden call "${call}"`);
  }
}

// --- Verify readiness requires phases 122.1–125 ---
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const PilotEvidenceReviewGoNoGoService = require('../src/api/services/pilotEvidenceReviewGoNoGoService');
const svc = new PilotEvidenceReviewGoNoGoService();

(async () => {
  const readiness = await svc.getReadiness({});
  const requiredKeys = readiness.required_phase_checks.map(c => c.key);
  assert(requiredKeys.includes('PHASE_122_1_VALIDATED'), 'Readiness requires Phase 122.1');
  assert(requiredKeys.includes('PHASE_122_2_VALIDATED'), 'Readiness requires Phase 122.2');
  assert(requiredKeys.includes('PHASE_123_VALIDATED'), 'Readiness requires Phase 123');
  assert(requiredKeys.includes('PHASE_124_VALIDATED'), 'Readiness requires Phase 124');
  assert(requiredKeys.includes('PHASE_125_VALIDATED'), 'Readiness requires Phase 125');
  assert(requiredKeys.includes('NO_UNRESOLVED_BLOCKERS'), 'Readiness requires no unresolved blockers');
  assert(requiredKeys.includes('TENANT_ALLOWLIST_FAIL_CLOSED'), 'Readiness requires tenant allowlist fail-closed');
  assert(requiredKeys.includes('NO_REAL_PAYMENT_EXECUTION'), 'Readiness requires no real payment execution');
  assert(requiredKeys.includes('NO_FULL_PUBLIC'), 'Readiness requires no FULL_PUBLIC');
  assert(requiredKeys.includes('NO_OPEN_MARKETPLACE'), 'Readiness requires no open marketplace');

  // Verify unresolved blockers prevent GO
  const boardResult = await svc.createReviewBoard({ board_name: 'E2E Test Board', created_by: 'smoke' });
  const boardId = boardResult.review_board.review_board_id;

  await svc.aggregatePilotEvidence({ review_board_id: boardId, evidence: {}, verified_by: 'smoke' });

  const findResult = await svc.recordReviewFinding({
    review_board_id: boardId, finding_type: 'BLOCKER', blocks_go_decision: true,
    severity: 'CRITICAL', summary: 'E2E blocker', created_by: 'smoke',
  });

  const blockedGo = await svc.submitGoNoGoDecision({
    review_board_id: boardId, decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION', decided_by: 'smoke',
  });
  assert(blockedGo.blocked === true, 'Unresolved blocker prevents GO decision');

  // GO does not enable beta
  await svc.resolveReviewFinding({ finding_id: findResult.finding.finding_id, resolved_by: 'smoke' });
  const goResult = await svc.submitGoNoGoDecision({
    review_board_id: boardId, decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION', decided_by: 'smoke',
  });
  assert(goResult.decision.betaEnabled === false, 'GO decision does not enable beta');
  assert(goResult.decision.productionActivationEnabled === false, 'GO decision does not enable production');
  assert(goResult.decision.fullPublicEnabled === false, 'GO decision does not enable FULL_PUBLIC');

  // All actions audited
  const auditResult = await svc.getPilotReviewAuditTimeline({ review_board_id: boardId });
  assert(auditResult.audits.length >= 4, 'All actions are audited');

  console.log(`\nPhase 126D E2E Regression: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Phase 126D FATAL:', err);
  process.exit(1);
});
