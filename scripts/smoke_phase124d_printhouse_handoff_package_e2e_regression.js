'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 124D: Printhouse Handoff Package E2E Regression Smoke ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const FoundingPrinthousePilotGateService = require('../src/api/services/foundingPrinthousePilotGateService');
const ControlledPrinthouseHandoffPackageService = require('../src/api/services/controlledPrinthouseHandoffPackageService');

(async () => {
  const p123 = new FoundingPrinthousePilotGateService();
  const svc = new ControlledPrinthouseHandoffPackageService({ phase123Service: p123 });

  // Step 1: Create Phase 123 program and participant
  const prog = await p123.createPilotProgram({ tenant_id: 'e2e-tenant-124', program_name: 'E2E Phase 124 Program', created_by: 'e2e' });
  assert(prog.pilot_program.pilot_program_id, 'E2E: Phase 123 program created');
  const programId = prog.pilot_program.pilot_program_id;

  const reg = await p123.registerFoundingPrinthouse({
    pilot_program_id: programId, printhouse_tenant_id: 'e2e-ph-124', printhouse_name: 'E2E PH 124',
    allowed_file_access_level: 'REDACTED_PREVIEW', created_by: 'e2e',
  });
  const participantId = reg.participant.participant_id;
  await p123.approveParticipantForPilot({ participant_id: participantId, approved_by: 'e2e' });

  // Step 2: Cannot create package without approval
  const suspended = await p123.suspendParticipant({ participant_id: participantId, suspended_by: 'e2e' });
  try {
    await svc.createHandoffPackage({
      pilot_program_id: programId, participant_id: participantId, printhouse_tenant_id: 'e2e-ph-124', created_by: 'e2e',
    });
    assert(false, 'E2E: create package should fail for non-approved participant');
  } catch (e) {
    assert(true, 'E2E: create package correctly fails for non-approved participant');
  }
  await p123.approveParticipantForPilot({ participant_id: participantId, approved_by: 'e2e' });

  // Step 3: Create handoff package
  const pkg = await svc.createHandoffPackage({
    pilot_program_id: programId, participant_id: participantId, printhouse_tenant_id: 'e2e-ph-124',
    pilot_order_id: 'e2e-order', file_access_scope: 'REDACTED_PREVIEW', created_by: 'e2e',
  });
  assert(pkg.handoff_package.handoff_package_id, 'E2E: handoff package created');
  const packageId = pkg.handoff_package.handoff_package_id;

  // Step 4: Add file metadata
  const file = await svc.addPackageFileMetadata({
    handoff_package_id: packageId, file_name: 'artwork.pdf', file_type: 'application/pdf',
    file_size_bytes: 4096, file_scope: 'REDACTED_PREVIEW', preflight_status: 'PASSED', created_by: 'e2e',
  });
  assert(file.package_file.package_file_id, 'E2E: file metadata added');

  // Step 5: Create access grant with expiration
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const grant = await svc.createScopedFileAccessGrant({
    handoff_package_id: packageId, participant_id: participantId, printhouse_tenant_id: 'e2e-ph-124',
    access_scope: 'REDACTED_PREVIEW', expires_at: expires, created_by: 'e2e',
  });
  assert(grant.access_grant.access_grant_id, 'E2E: access grant created');
  assert(grant.access_grant.expires_at, 'E2E: access grant has expiration');
  assert(grant.access_grant.unrestricted_file_access === false, 'E2E: grant not unrestricted');
  assert(grant.access_grant.permanent_public_url === false, 'E2E: grant not permanent URL');

  // Step 6: Record blocker finding
  const finding = await svc.recordHandoffFinding({
    handoff_package_id: packageId, pilot_program_id: programId, participant_id: participantId,
    finding_type: 'BLOCKER', blocks_handoff: true, severity: 'HIGH', summary: 'E2E blocker', created_by: 'e2e',
  });
  assert(finding.finding.blocks_handoff === true, 'E2E: blocker finding recorded');

  // Step 7: Accept blocked by findings
  try {
    await svc.acceptHandoffPackage({ handoff_package_id: packageId, accepted_by: 'e2e' });
    assert(false, 'E2E: accept should fail with blockers');
  } catch (e) {
    assert(e.message.includes('unresolved blocker'), 'E2E: accept blocked by unresolved findings');
  }

  // Step 8: Readiness blocked
  const readiness = await svc.evaluateHandoffReadiness({ handoff_package_id: packageId });
  assert(readiness.readiness.no_unresolved_blocker_findings === false, 'E2E: readiness blocked by findings');
  assert(readiness.readiness.handoff_readiness === 'NOT_READY', 'E2E: handoff NOT_READY');

  // Step 9: Resolve finding
  await svc.resolveHandoffFinding({ finding_id: finding.finding.finding_id, resolved_by: 'e2e' });

  // Step 10: Readiness passes after resolve
  const readiness2 = await svc.evaluateHandoffReadiness({ handoff_package_id: packageId });
  assert(readiness2.readiness.no_unresolved_blocker_findings === true, 'E2E: no blockers after resolve');

  // Step 11: Accept
  const accepted = await svc.acceptHandoffPackage({ handoff_package_id: packageId, accepted_by: 'e2e' });
  assert(accepted.handoff_package.package_status === 'ACCEPTED_BY_PRINTHOUSE', 'E2E: package accepted');

  // Step 12: Revoke access grant
  const revoked = await svc.revokeFileAccessGrant({ access_grant_id: grant.access_grant.access_grant_id, revoked_by: 'e2e' });
  assert(revoked.access_grant.grant_status === 'REVOKED', 'E2E: grant revoked');

  // Step 13: Review
  const review = await svc.submitPrinthouseHandoffReview({
    handoff_package_id: packageId, pilot_program_id: programId, participant_id: participantId,
    reviewer: 'e2e', review_status: 'APPROVED', review_notes: 'E2E approved',
  });
  assert(review.review.review_status === 'APPROVED', 'E2E: review submitted');

  // Step 14: Evidence pack
  const evidence = await svc.buildHandoffEvidencePack({ handoff_package_id: packageId });
  assert(evidence.evidence_pack.integrity_hash, 'E2E: evidence pack has integrity hash');
  assert(evidence.evidence_pack.safety_invariants.fullPublicEnabled === false, 'E2E: evidence safety fullPublicEnabled=false');
  assert(evidence.evidence_pack.safety_invariants.productionDispatchEnabled === false, 'E2E: evidence safety productionDispatchEnabled=false');
  assert(evidence.evidence_pack.safety_invariants.unrestrictedFileAccess === false, 'E2E: evidence safety unrestrictedFileAccess=false');

  // Step 15: Audit timeline
  const timeline = await svc.getHandoffAuditTimeline({ handoff_package_id: packageId });
  assert(timeline.audit_timeline.length >= 5, 'E2E: audit timeline has multiple entries');

  const eventTypes = timeline.audit_timeline.map(a => a.event_type);
  assert(eventTypes.includes('HANDOFF_PACKAGE_CREATED'), 'E2E: audit has HANDOFF_PACKAGE_CREATED');
  assert(eventTypes.includes('PACKAGE_FILE_METADATA_ADDED'), 'E2E: audit has FILE_METADATA_ADDED');
  assert(eventTypes.includes('FILE_ACCESS_GRANT_CREATED'), 'E2E: audit has ACCESS_GRANT_CREATED');
  assert(eventTypes.includes('HANDOFF_FINDING_RECORDED'), 'E2E: audit has FINDING_RECORDED');
  assert(eventTypes.includes('HANDOFF_FINDING_RESOLVED'), 'E2E: audit has FINDING_RESOLVED');
  assert(eventTypes.includes('HANDOFF_PACKAGE_ACCEPTED'), 'E2E: audit has PACKAGE_ACCEPTED');
  assert(eventTypes.includes('FILE_ACCESS_GRANT_REVOKED'), 'E2E: audit has GRANT_REVOKED');
  assert(eventTypes.includes('HANDOFF_REVIEW_SUBMITTED'), 'E2E: audit has REVIEW_SUBMITTED');
  assert(eventTypes.includes('HANDOFF_EVIDENCE_PACK_BUILT'), 'E2E: audit has EVIDENCE_PACK_BUILT');

  // Prior phase regression
  assert(fs.existsSync(path.join(__dirname, '..', 'migrations', '065_phase122_1_internal_order_lifecycle_pilot_hardening.sql')), 'Regression: migration 065 exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'migrations', '066_phase122_2_internal_order_lifecycle_runtime_verification.sql')), 'Regression: migration 066 exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'migrations', '067_phase123_founding_printhouse_pilot_gate.sql')), 'Regression: migration 067 exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecyclePilotService.js')), 'Regression: Phase 122 service exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecycleRuntimeVerificationService.js')), 'Regression: Phase 122.2 service exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'src', 'api', 'services', 'foundingPrinthousePilotGateService.js')), 'Regression: Phase 123 service exists');

  console.log(`\n=== Phase 124D Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
