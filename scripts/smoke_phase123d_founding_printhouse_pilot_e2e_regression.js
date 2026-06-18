'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 123D: Founding Printhouse Pilot E2E Regression Smoke ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const FoundingPrinthousePilotGateService = require('../src/api/services/foundingPrinthousePilotGateService');

(async () => {
  const svc = new FoundingPrinthousePilotGateService();

  // Full E2E flow: program -> register -> approve -> link -> handoff readiness -> review -> finding -> resolve -> evidence -> audit

  // Step 1: Create program
  const prog = await svc.createPilotProgram({ tenant_id: 'e2e-tenant', program_name: 'E2E Test Program', created_by: 'e2e' });
  assert(prog.pilot_program.pilot_program_id, 'E2E: program created');
  const programId = prog.pilot_program.pilot_program_id;

  // Step 2: Register printhouse
  const reg = await svc.registerFoundingPrinthouse({
    pilot_program_id: programId, printhouse_tenant_id: 'e2e-ph-tenant', printhouse_name: 'E2E Printhouse',
    allowed_file_access_level: 'REDACTED_PREVIEW', created_by: 'e2e',
  });
  assert(reg.participant.participant_status === 'REGISTERED', 'E2E: participant registered');
  const participantId = reg.participant.participant_id;

  // Step 3: Cannot link without approval
  try {
    await svc.linkInternalPilotOrder({ pilot_program_id: programId, participant_id: participantId, created_by: 'e2e' });
    assert(false, 'E2E: link should fail without approval');
  } catch (e) {
    assert(true, 'E2E: link correctly fails without approval');
  }

  // Step 4: Approve
  const approved = await svc.approveParticipantForPilot({ participant_id: participantId, approved_by: 'e2e' });
  assert(approved.participant.participant_status === 'APPROVED_FOR_CONTROLLED_PILOT', 'E2E: participant approved');

  // Step 5: Link order
  const link = await svc.linkInternalPilotOrder({
    pilot_program_id: programId, participant_id: participantId, pilot_run_id: 'e2e-run', pilot_order_id: 'e2e-order', created_by: 'e2e',
  });
  assert(link.order_link.order_link_id, 'E2E: order linked');
  const orderLinkId = link.order_link.order_link_id;

  // Step 6: Record blocker finding
  const finding = await svc.recordPilotFinding({
    pilot_program_id: programId, participant_id: participantId, order_link_id: orderLinkId,
    finding_type: 'BLOCKER', blocks_handoff: true, severity: 'HIGH', summary: 'E2E blocker', created_by: 'e2e',
  });
  assert(finding.finding.blocks_handoff === true, 'E2E: blocker finding recorded');

  // Step 7: Handoff readiness blocked
  const handoff1 = await svc.evaluateOrderHandoffReadiness({ order_link_id: orderLinkId });
  assert(handoff1.readiness.handoff_readiness === 'NOT_READY', 'E2E: handoff blocked by findings');
  assert(handoff1.readiness.no_unresolved_blocker_findings === false, 'E2E: blocker findings detected');

  // Step 8: Resolve finding
  await svc.resolvePilotFinding({ finding_id: finding.finding.finding_id, resolved_by: 'e2e' });

  // Step 9: Handoff readiness passes
  const handoff2 = await svc.evaluateOrderHandoffReadiness({ order_link_id: orderLinkId });
  assert(handoff2.readiness.no_unresolved_blocker_findings === true, 'E2E: no blockers after resolve');

  // Step 10: Submit review
  const review = await svc.submitPrinthouseReview({
    pilot_program_id: programId, participant_id: participantId, order_link_id: orderLinkId,
    reviewer: 'e2e', review_status: 'APPROVED', review_notes: 'E2E approved',
  });
  assert(review.review.review_status === 'APPROVED', 'E2E: review submitted');

  // Step 11: Evidence pack
  const evidence = await svc.buildPrinthousePilotEvidencePack({ pilot_program_id: programId, participant_id: participantId });
  assert(evidence.evidence_pack.integrity_hash, 'E2E: evidence pack has integrity hash');
  assert(evidence.evidence_pack.safety_invariants.fullPublicEnabled === false, 'E2E: evidence safety fullPublicEnabled=false');
  assert(evidence.evidence_pack.safety_invariants.paymentExecutionEnabled === false, 'E2E: evidence safety paymentExecutionEnabled=false');

  // Step 12: Audit timeline
  const timeline = await svc.getPrinthousePilotAuditTimeline({ pilot_program_id: programId });
  assert(timeline.audit_timeline.length >= 5, 'E2E: audit timeline has multiple entries');

  // Step 13: All audit events are present
  const eventTypes = timeline.audit_timeline.map(a => a.event_type);
  assert(eventTypes.includes('PILOT_PROGRAM_CREATED'), 'E2E: audit has PILOT_PROGRAM_CREATED');
  assert(eventTypes.includes('FOUNDING_PRINTHOUSE_REGISTERED'), 'E2E: audit has FOUNDING_PRINTHOUSE_REGISTERED');
  assert(eventTypes.includes('PARTICIPANT_APPROVED_FOR_CONTROLLED_PILOT'), 'E2E: audit has PARTICIPANT_APPROVED');
  assert(eventTypes.includes('INTERNAL_PILOT_ORDER_LINKED'), 'E2E: audit has ORDER_LINKED');
  assert(eventTypes.includes('PILOT_FINDING_RECORDED'), 'E2E: audit has FINDING_RECORDED');
  assert(eventTypes.includes('PILOT_FINDING_RESOLVED'), 'E2E: audit has FINDING_RESOLVED');
  assert(eventTypes.includes('PRINTHOUSE_REVIEW_SUBMITTED'), 'E2E: audit has REVIEW_SUBMITTED');
  assert(eventTypes.includes('PRINTHOUSE_PILOT_EVIDENCE_PACK_BUILT'), 'E2E: audit has EVIDENCE_PACK_BUILT');

  // Prior phase regression: Phase 122 files still exist
  assert(fs.existsSync(path.join(__dirname, '..', 'migrations', '065_phase122_1_internal_order_lifecycle_pilot_hardening.sql')), 'Regression: migration 065 exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'migrations', '066_phase122_2_internal_order_lifecycle_runtime_verification.sql')), 'Regression: migration 066 exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecyclePilotService.js')), 'Regression: Phase 122 service exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecycleRuntimeVerificationService.js')), 'Regression: Phase 122.2 service exists');

  console.log(`\n=== Phase 123D Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
