'use strict';

const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 126B: Pilot Evidence Review Service Smoke ===\n');

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

(async () => {
  // Create review board
  const boardResult = await svc.createReviewBoard({ board_name: 'Test Board', created_by: 'smoke' });
  assert(boardResult.review_board, 'createReviewBoard returns review_board');
  assert(boardResult.review_board.review_board_id, 'review_board has id');
  assert(boardResult.review_board.board_status === 'DRAFT', 'board status is DRAFT');
  assert(boardResult.safety, 'createReviewBoard includes safety markers');
  assert(boardResult.safety.betaEnabled === false, 'betaEnabled is false');
  assert(boardResult.safety.fullPublicEnabled === false, 'fullPublicEnabled is false');
  assert(boardResult.safety.paymentExecutionEnabled === false, 'paymentExecutionEnabled is false');

  const boardId = boardResult.review_board.review_board_id;

  // Aggregate evidence
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
    verified_by: 'smoke',
  });
  assert(aggResult.checks, 'aggregatePilotEvidence returns checks');
  assert(aggResult.checks.length === 15, 'All 15 required checks created');
  assert(aggResult.summary.verified === 15, 'All 15 checks verified');
  assert(aggResult.summary.unverified === 0, 'No unverified checks');

  // Evaluate readiness (should be READY)
  const readyResult = await svc.evaluateLimitedBetaReadiness({ review_board_id: boardId });
  assert(readyResult.readiness_status === 'READY_FOR_GO_DECISION', 'Readiness is READY_FOR_GO_DECISION');

  // Record a blocker finding
  const findResult = await svc.recordReviewFinding({
    review_board_id: boardId,
    finding_type: 'BLOCKER',
    blocks_go_decision: true,
    severity: 'CRITICAL',
    summary: 'Test blocker finding',
    created_by: 'smoke',
  });
  assert(findResult.finding, 'recordReviewFinding returns finding');
  assert(findResult.finding.blocks_go_decision === true, 'Finding blocks go decision');
  const findingId = findResult.finding.finding_id;

  // Evaluate readiness (should be BLOCKED)
  const blockedResult = await svc.evaluateLimitedBetaReadiness({ review_board_id: boardId });
  assert(blockedResult.readiness_status === 'BLOCKED_BY_FINDINGS', 'Readiness is BLOCKED_BY_FINDINGS');

  // Attempt GO decision with blocker (should be blocked)
  const blockedDecision = await svc.submitGoNoGoDecision({
    review_board_id: boardId,
    decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION',
    decided_by: 'smoke',
  });
  assert(blockedDecision.blocked === true, 'GO decision blocked by findings');
  assert(blockedDecision.decision === null, 'No decision created when blocked');

  // Resolve finding
  const resolveResult = await svc.resolveReviewFinding({ finding_id: findingId, resolved_by: 'smoke' });
  assert(resolveResult.finding.finding_status === 'RESOLVED', 'Finding resolved');

  // Submit GO decision (should succeed now)
  const goDecision = await svc.submitGoNoGoDecision({
    review_board_id: boardId,
    decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION',
    decision_rationale: 'All checks verified, no blockers',
    decided_by: 'smoke',
  });
  assert(goDecision.blocked === false, 'GO decision not blocked after resolving');
  assert(goDecision.decision, 'GO decision created');
  assert(goDecision.decision.decision_outcome === 'GO_FOR_LIMITED_BETA_PREPARATION', 'Decision outcome is GO');
  assert(goDecision.decision.betaEnabled === false, 'GO decision does NOT enable beta');
  assert(goDecision.decision.productionActivationEnabled === false, 'GO decision does NOT enable production');
  assert(goDecision.decision.fullPublicEnabled === false, 'GO decision does NOT enable FULL_PUBLIC');

  // Submit NO_GO decision
  const noGoDecision = await svc.submitGoNoGoDecision({
    review_board_id: boardId,
    decision_outcome: 'NO_GO',
    decision_rationale: 'Test no-go',
    decided_by: 'smoke',
  });
  assert(noGoDecision.decision.decision_outcome === 'NO_GO', 'NO_GO decision recorded');

  // Evidence pack
  const evidenceResult = await svc.buildPilotReviewEvidencePack({ review_board_id: boardId, generated_by: 'smoke' });
  assert(evidenceResult.evidence_pack, 'Evidence pack generated');
  assert(evidenceResult.evidence_pack.evidence_hash, 'Evidence pack has hash');
  assert(evidenceResult.evidence_pack.evidence_schema_version === '126.0', 'Evidence schema version is 126.0');
  assert(evidenceResult.evidence_pack.redaction_classification === 'INTERNAL_ONLY', 'Redaction classification is INTERNAL_ONLY');

  // Audit timeline
  const auditResult = await svc.getPilotReviewAuditTimeline({ review_board_id: boardId });
  assert(auditResult.audits.length > 0, 'Audit timeline has entries');

  // Readiness endpoint
  const readinessResult = await svc.getReadiness({ review_board_id: boardId });
  assert(readinessResult.phase === 'PHASE_126', 'Readiness reports PHASE_126');
  assert(readinessResult.required_phase_checks.length === 15, 'Readiness includes 15 required checks');

  console.log(`\nPhase 126B Service: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Phase 126B FATAL:', err);
  process.exit(1);
});
