'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 126E: Pilot Evidence Review Acceptance Pack ===\n');

// --- File existence checks ---
const requiredFiles = [
  'migrations/070_phase126_pilot_evidence_review_go_no_go.sql',
  'src/api/services/pilotEvidenceReviewGoNoGoService.js',
  'src/api/routes/pilotEvidenceReviewGoNoGoAdmin.js',
  'src/ui/types/pilotEvidenceReviewGoNoGo.ts',
  'src/ui/api/pilotEvidenceReviewGoNoGoClient.ts',
  'src/ui/pages/production/PilotEvidenceReviewGoNoGo.tsx',
  'docs/phase126_pilot_evidence_review_go_no_go.md',
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

// --- Service methods ---
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const PilotEvidenceReviewGoNoGoService = require('../src/api/services/pilotEvidenceReviewGoNoGoService');
const svc = new PilotEvidenceReviewGoNoGoService();

const requiredMethods = [
  'createReviewBoard', 'aggregatePilotEvidence', 'evaluateLimitedBetaReadiness',
  'recordReviewFinding', 'resolveReviewFinding', 'submitGoNoGoDecision',
  'buildPilotReviewEvidencePack', 'getPilotReviewAuditTimeline', 'getReadiness',
];
for (const m of requiredMethods) {
  assert(typeof svc[m] === 'function', `Service method: ${m}`);
}

// --- Safety invariant checks ---
const sourceFiles = [
  'src/api/services/pilotEvidenceReviewGoNoGoService.js',
  'src/api/routes/pilotEvidenceReviewGoNoGoAdmin.js',
];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert(src.includes('fullPublicEnabled: false'), `${f}: fullPublicEnabled=false`);
  assert(src.includes('paymentExecutionEnabled: false'), `${f}: paymentExecutionEnabled=false`);
  assert(src.includes('refundExecutionEnabled: false'), `${f}: refundExecutionEnabled=false`);
  assert(src.includes('payoutExecutionEnabled: false'), `${f}: payoutExecutionEnabled=false`);
  assert(src.includes('providerExternalSubmissionEnabled: false'), `${f}: providerExternalSubmissionEnabled=false`);
  assert(src.includes('productionActivationEnabled: false'), `${f}: productionActivationEnabled=false`);
  assert(src.includes('betaEnabled: false'), `${f}: betaEnabled=false`);
  assert(src.includes('sourceMutationOutsidePilotScope: false'), `${f}: sourceMutationOutsidePilotScope=false`);
}

// --- Forbidden patterns across all phase 126 files ---
const allPhase126Files = [
  ...sourceFiles,
  'src/ui/pages/production/PilotEvidenceReviewGoNoGo.tsx',
  'src/ui/api/pilotEvidenceReviewGoNoGoClient.ts',
];

const forbiddenPatterns = [
  'fullPublicEnabled: true', 'openMarketplaceEnabled: true', 'betaEnabled: true',
  'productionActivationEnabled: true', 'paymentExecutionEnabled: true',
  'refundExecutionEnabled: true', 'payoutExecutionEnabled: true',
  'providerExternalSubmissionEnabled: true', 'externalSubmission: true',
  'sourceMutation: true',
];

for (const f of allPhase126Files) {
  const fullPath = path.join(__dirname, '..', f);
  if (!fs.existsSync(fullPath)) continue;
  const src = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert(!src.includes(pattern), `${f}: no forbidden "${pattern}"`);
  }
}

const forbiddenCalls = ['charge(', 'refund(', 'payout(', 'sendToProvider', 'submitTax', 'submitAccounting'];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const call of forbiddenCalls) {
    assert(!src.includes(call), `${f}: no forbidden call "${call}"`);
  }
}

// --- Full lifecycle acceptance test ---
(async () => {
  const boardResult = await svc.createReviewBoard({ board_name: 'Acceptance Board', created_by: 'acceptance' });
  assert(boardResult.review_board, 'Acceptance: board created');
  const boardId = boardResult.review_board.review_board_id;

  const aggResult = await svc.aggregatePilotEvidence({
    review_board_id: boardId,
    evidence: {
      PHASE_122_1_VALIDATED: { status: 'VALIDATED' },
      PHASE_122_2_VALIDATED: { status: 'VALIDATED' },
      PHASE_123_VALIDATED: { status: 'VALIDATED' },
      PHASE_124_VALIDATED: { status: 'VALIDATED' },
      PHASE_125_VALIDATED: { status: 'VALIDATED' },
      MIGRATION_RUNNER_CLEAN: { status: 'VERIFIED' },
      NPM_BUILD_PASSING: { status: 'VERIFIED' },
      DB_BACKUP_EVIDENCE: { status: 'VERIFIED' },
      NO_UNRESOLVED_BLOCKERS: { status: 'VERIFIED' },
      TENANT_ALLOWLIST_FAIL_CLOSED: { status: 'VERIFIED' },
      FILE_ACCESS_SCOPED_REVOCABLE: { status: 'VERIFIED' },
      NO_REAL_PAYMENT_EXECUTION: { status: 'VERIFIED' },
      NO_PROVIDER_EXTERNAL_SUBMISSION: { status: 'VERIFIED' },
      NO_FULL_PUBLIC: { status: 'VERIFIED' },
      NO_OPEN_MARKETPLACE: { status: 'VERIFIED' },
    },
    verified_by: 'acceptance',
  });
  assert(aggResult.summary.verified === 15, 'Acceptance: all 15 checks verified');

  const readyResult = await svc.evaluateLimitedBetaReadiness({ review_board_id: boardId });
  assert(readyResult.readiness_status === 'READY_FOR_GO_DECISION', 'Acceptance: ready for go decision');

  const goResult = await svc.submitGoNoGoDecision({
    review_board_id: boardId,
    decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION',
    decision_rationale: 'Full acceptance test passed',
    decided_by: 'acceptance',
  });
  assert(goResult.decision, 'Acceptance: GO decision created');
  assert(goResult.decision.betaEnabled === false, 'Acceptance: GO does NOT auto-enable beta');
  assert(goResult.decision.fullPublicEnabled === false, 'Acceptance: GO does NOT enable FULL_PUBLIC');
  assert(goResult.decision.paymentExecutionEnabled === false, 'Acceptance: GO does NOT enable payment');

  const evidenceResult = await svc.buildPilotReviewEvidencePack({ review_board_id: boardId, generated_by: 'acceptance' });
  assert(evidenceResult.evidence_pack, 'Acceptance: evidence pack generated');
  assert(evidenceResult.evidence_pack.evidence_hash, 'Acceptance: evidence pack has integrity hash');
  assert(evidenceResult.evidence_pack.evidence_schema_version === '126.0', 'Acceptance: schema version 126.0');
  assert(evidenceResult.evidence_pack.redaction_classification === 'INTERNAL_ONLY', 'Acceptance: redaction INTERNAL_ONLY');

  const epData = evidenceResult.evidence_pack.evidence_data_json;
  assert(epData.safety_markers, 'Acceptance: evidence pack contains safety markers');
  assert(epData.safety_markers.betaEnabled === false, 'Acceptance: evidence safety betaEnabled=false');
  assert(epData.safety_markers.fullPublicEnabled === false, 'Acceptance: evidence safety fullPublicEnabled=false');

  const auditResult = await svc.getPilotReviewAuditTimeline({ review_board_id: boardId });
  assert(auditResult.audits.length >= 4, 'Acceptance: all actions audited');

  for (const a of auditResult.audits) {
    assert(a.safety_snapshot_json, 'Acceptance: audit has safety snapshot');
    assert(a.safety_snapshot_json.betaEnabled === false, 'Acceptance: audit safety betaEnabled=false');
  }

  console.log(`\nPhase 126E Acceptance Pack: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Phase 126E FATAL:', err);
  process.exit(1);
});
