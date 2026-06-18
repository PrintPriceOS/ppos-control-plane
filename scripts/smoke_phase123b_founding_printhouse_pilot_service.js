'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 123B: Founding Printhouse Pilot Service Smoke ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const FoundingPrinthousePilotGateService = require('../src/api/services/foundingPrinthousePilotGateService');
const svc = new FoundingPrinthousePilotGateService();

assert(typeof svc.createPilotProgram === 'function', 'createPilotProgram exists');
assert(typeof svc.registerFoundingPrinthouse === 'function', 'registerFoundingPrinthouse exists');
assert(typeof svc.evaluateParticipantReadiness === 'function', 'evaluateParticipantReadiness exists');
assert(typeof svc.approveParticipantForPilot === 'function', 'approveParticipantForPilot exists');
assert(typeof svc.suspendParticipant === 'function', 'suspendParticipant exists');
assert(typeof svc.linkInternalPilotOrder === 'function', 'linkInternalPilotOrder exists');
assert(typeof svc.evaluateOrderHandoffReadiness === 'function', 'evaluateOrderHandoffReadiness exists');
assert(typeof svc.submitPrinthouseReview === 'function', 'submitPrinthouseReview exists');
assert(typeof svc.recordPilotFinding === 'function', 'recordPilotFinding exists');
assert(typeof svc.resolvePilotFinding === 'function', 'resolvePilotFinding exists');
assert(typeof svc.buildPrinthousePilotEvidencePack === 'function', 'buildPrinthousePilotEvidencePack exists');
assert(typeof svc.getPrinthousePilotAuditTimeline === 'function', 'getPrinthousePilotAuditTimeline exists');
assert(typeof svc.getReadiness === 'function', 'getReadiness exists');

(async () => {
  // Create program
  const prog = await svc.createPilotProgram({ tenant_id: 'test-tenant-1', program_name: 'Test Pilot Program', created_by: 'smoke' });
  assert(prog.pilot_program && prog.pilot_program.pilot_program_id, 'createPilotProgram returns pilot_program');
  assert(prog.safety && prog.safety.fullPublicEnabled === false, 'createPilotProgram safety fullPublicEnabled=false');
  assert(prog.safety.paymentExecutionEnabled === false, 'createPilotProgram safety paymentExecutionEnabled=false');
  assert(prog.safety.openMarketplaceAccessEnabled === false, 'createPilotProgram safety openMarketplaceAccessEnabled=false');
  assert(prog.safety_message && prog.safety_message.length > 0, 'createPilotProgram has safety_message');
  const programId = prog.pilot_program.pilot_program_id;

  // Register printhouse
  const reg = await svc.registerFoundingPrinthouse({
    pilot_program_id: programId, printhouse_tenant_id: 'printhouse-tenant-1', printhouse_name: 'Test Printhouse', allowed_file_access_level: 'REDACTED_PREVIEW', created_by: 'smoke',
  });
  assert(reg.participant && reg.participant.participant_id, 'registerFoundingPrinthouse returns participant');
  assert(reg.participant.participant_status === 'REGISTERED', 'participant status is REGISTERED');
  assert(reg.participant.payment_execution_allowed === false, 'participant payment_execution_allowed=false');
  assert(reg.participant.provider_submission_allowed === false, 'participant provider_submission_allowed=false');
  const participantId = reg.participant.participant_id;

  // Evaluate readiness (should NOT be ready — not approved)
  const readiness1 = await svc.evaluateParticipantReadiness({ participant_id: participantId });
  assert(readiness1.readiness, 'evaluateParticipantReadiness returns readiness');
  assert(readiness1.readiness.participant_approved === false, 'participant not yet approved');
  assert(readiness1.readiness.overall_readiness === 'NOT_READY', 'overall readiness NOT_READY before approval');

  // Approve
  const approved = await svc.approveParticipantForPilot({ participant_id: participantId, approved_by: 'smoke' });
  assert(approved.participant.participant_status === 'APPROVED_FOR_CONTROLLED_PILOT', 'participant approved');

  // Evaluate readiness again
  const readiness2 = await svc.evaluateParticipantReadiness({ participant_id: participantId });
  assert(readiness2.readiness.participant_approved === true, 'participant approved in readiness');

  // Suspend
  const suspended = await svc.suspendParticipant({ participant_id: participantId, suspended_by: 'smoke', reason: 'test' });
  assert(suspended.participant.participant_status === 'SUSPENDED', 'participant suspended');

  // Re-approve for linking
  await svc.approveParticipantForPilot({ participant_id: participantId, approved_by: 'smoke' });

  // Link order
  const link = await svc.linkInternalPilotOrder({
    pilot_program_id: programId, participant_id: participantId, pilot_run_id: 'run-1', pilot_order_id: 'order-1', created_by: 'smoke',
  });
  assert(link.order_link && link.order_link.order_link_id, 'linkInternalPilotOrder returns order_link');
  assert(link.order_link.link_status === 'LINKED', 'order link status LINKED');
  const orderLinkId = link.order_link.order_link_id;

  // Link order fails for non-approved participant
  const suspendAgain = await svc.suspendParticipant({ participant_id: participantId, suspended_by: 'smoke' });
  try {
    await svc.linkInternalPilotOrder({
      pilot_program_id: programId, participant_id: participantId, pilot_run_id: 'run-2', created_by: 'smoke',
    });
    assert(false, 'linkInternalPilotOrder should fail for non-approved participant');
  } catch (e) {
    assert(e.message.includes('APPROVED_FOR_CONTROLLED_PILOT'), 'linkInternalPilotOrder rejects non-approved participant');
  }
  await svc.approveParticipantForPilot({ participant_id: participantId, approved_by: 'smoke' });

  // Order handoff readiness
  const handoff = await svc.evaluateOrderHandoffReadiness({ order_link_id: orderLinkId });
  assert(handoff.readiness, 'evaluateOrderHandoffReadiness returns readiness');

  // Record finding
  const finding = await svc.recordPilotFinding({
    pilot_program_id: programId, participant_id: participantId, finding_type: 'BLOCKER', blocks_handoff: true, severity: 'HIGH', summary: 'Test blocker', created_by: 'smoke',
  });
  assert(finding.finding && finding.finding.finding_id, 'recordPilotFinding returns finding');
  assert(finding.finding.finding_status === 'OPEN', 'finding is OPEN');
  assert(finding.finding.blocks_handoff === true, 'finding blocks_handoff=true');
  const findingId = finding.finding.finding_id;

  // Handoff readiness blocked by findings
  const handoff2 = await svc.evaluateOrderHandoffReadiness({ order_link_id: orderLinkId });
  assert(handoff2.readiness.no_unresolved_blocker_findings === false, 'handoff blocked by unresolved findings');
  assert(handoff2.readiness.handoff_readiness === 'NOT_READY', 'handoff NOT_READY with blockers');

  // Approve should fail with unresolved blockers
  const newReg = await svc.registerFoundingPrinthouse({
    pilot_program_id: programId, printhouse_tenant_id: 'printhouse-tenant-2', printhouse_name: 'Test PH 2', created_by: 'smoke',
  });
  const blockerFinding = await svc.recordPilotFinding({
    pilot_program_id: programId, participant_id: newReg.participant.participant_id, finding_type: 'BLOCKER', blocks_handoff: true, severity: 'CRITICAL', summary: 'Blocker for approve test', created_by: 'smoke',
  });
  try {
    await svc.approveParticipantForPilot({ participant_id: newReg.participant.participant_id, approved_by: 'smoke' });
    assert(false, 'approve should fail with unresolved blockers');
  } catch (e) {
    assert(e.message.includes('unresolved blocker'), 'approve blocked by unresolved blocker findings');
  }

  // Resolve finding
  const resolved = await svc.resolvePilotFinding({ finding_id: findingId, resolved_by: 'smoke' });
  assert(resolved.finding.finding_status === 'RESOLVED', 'finding resolved');

  // Review
  const review = await svc.submitPrinthouseReview({
    pilot_program_id: programId, participant_id: participantId, reviewer: 'smoke', review_status: 'APPROVED', review_notes: 'test',
  });
  assert(review.review && review.review.review_id, 'submitPrinthouseReview returns review');

  // Evidence pack
  const evidence = await svc.buildPrinthousePilotEvidencePack({ pilot_program_id: programId, participant_id: participantId });
  assert(evidence.evidence_pack, 'buildPrinthousePilotEvidencePack returns evidence_pack');
  assert(evidence.evidence_pack.integrity_hash, 'evidence pack has integrity_hash');
  assert(evidence.evidence_pack.evidence_schema_version === '123.0', 'evidence schema version 123.0');
  assert(evidence.evidence_pack.redaction_classification === 'INTERNAL_ONLY', 'redaction classification INTERNAL_ONLY');
  assert(Array.isArray(evidence.evidence_pack.redacted_fields), 'evidence has redacted_fields list');
  assert(evidence.evidence_pack.safety_invariants.fullPublicEnabled === false, 'evidence safety fullPublicEnabled=false');

  // Audit timeline
  const timeline = await svc.getPrinthousePilotAuditTimeline({ pilot_program_id: programId });
  assert(timeline.audit_timeline && timeline.audit_timeline.length > 0, 'audit timeline has entries');

  // Readiness
  const readiness = await svc.getReadiness({ pilot_program_id: programId });
  assert(readiness.readiness, 'getReadiness returns readiness');
  assert(readiness.readiness.tenant_allowlist_fail_closed !== undefined, 'readiness has tenant_allowlist_fail_closed');

  // Tenant allowlist fail-closed test
  const savedEnv = process.env.NODE_ENV;
  const savedAllow = process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS;
  delete process.env.PILOT_TENANT_ALLOWLIST;
  try {
    await svc.createPilotProgram({ tenant_id: 'should-fail-tenant', program_name: 'Should Fail', created_by: 'smoke' });
    assert(false, 'createPilotProgram should fail with empty allowlist in production');
  } catch (e) {
    assert(e.message.includes('PILOT_TENANT_ALLOWLIST'), 'fail-closed: tenant rejected when allowlist empty in production');
  }
  process.env.NODE_ENV = savedEnv;
  process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = savedAllow;

  console.log(`\n=== Phase 123B Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
