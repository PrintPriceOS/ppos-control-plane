'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 124B: Printhouse Handoff Package Service Smoke ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const ControlledPrinthouseHandoffPackageService = require('../src/api/services/controlledPrinthouseHandoffPackageService');
const FoundingPrinthousePilotGateService = require('../src/api/services/foundingPrinthousePilotGateService');
const p123 = new FoundingPrinthousePilotGateService();
const svc = new ControlledPrinthouseHandoffPackageService({ phase123Service: p123 });

assert(typeof svc.createHandoffPackage === 'function', 'createHandoffPackage exists');
assert(typeof svc.evaluateHandoffReadiness === 'function', 'evaluateHandoffReadiness exists');
assert(typeof svc.addPackageFileMetadata === 'function', 'addPackageFileMetadata exists');
assert(typeof svc.createScopedFileAccessGrant === 'function', 'createScopedFileAccessGrant exists');
assert(typeof svc.revokeFileAccessGrant === 'function', 'revokeFileAccessGrant exists');
assert(typeof svc.submitPrinthouseHandoffReview === 'function', 'submitPrinthouseHandoffReview exists');
assert(typeof svc.acceptHandoffPackage === 'function', 'acceptHandoffPackage exists');
assert(typeof svc.rejectHandoffPackage === 'function', 'rejectHandoffPackage exists');
assert(typeof svc.recordHandoffFinding === 'function', 'recordHandoffFinding exists');
assert(typeof svc.resolveHandoffFinding === 'function', 'resolveHandoffFinding exists');
assert(typeof svc.buildHandoffEvidencePack === 'function', 'buildHandoffEvidencePack exists');
assert(typeof svc.getHandoffAuditTimeline === 'function', 'getHandoffAuditTimeline exists');
assert(typeof svc.getReadiness === 'function', 'getReadiness exists');

(async () => {
  // Setup: create Phase 123 program and approved participant
  const prog = await p123.createPilotProgram({ tenant_id: 'test-tenant-hp', program_name: 'Handoff Test Program', created_by: 'smoke' });
  const programId = prog.pilot_program.pilot_program_id;

  const reg = await p123.registerFoundingPrinthouse({
    pilot_program_id: programId, printhouse_tenant_id: 'hp-ph-tenant', printhouse_name: 'Handoff PH',
    allowed_file_access_level: 'REDACTED_PREVIEW', created_by: 'smoke',
  });
  const participantId = reg.participant.participant_id;
  await p123.approveParticipantForPilot({ participant_id: participantId, approved_by: 'smoke' });

  // Create handoff package
  const pkg = await svc.createHandoffPackage({
    pilot_program_id: programId, participant_id: participantId, printhouse_tenant_id: 'hp-ph-tenant',
    pilot_order_id: 'order-1', file_access_scope: 'REDACTED_PREVIEW', created_by: 'smoke',
  });
  assert(pkg.handoff_package && pkg.handoff_package.handoff_package_id, 'createHandoffPackage returns handoff_package');
  assert(pkg.handoff_package.package_status === 'DRAFT', 'package status is DRAFT');
  assert(pkg.safety && pkg.safety.fullPublicEnabled === false, 'safety fullPublicEnabled=false');
  assert(pkg.safety.paymentExecutionEnabled === false, 'safety paymentExecutionEnabled=false');
  assert(pkg.safety.productionDispatchEnabled === false, 'safety productionDispatchEnabled=false');
  assert(pkg.safety.unrestrictedFileAccess === false, 'safety unrestrictedFileAccess=false');
  assert(pkg.safety.permanentPublicUrl === false, 'safety permanentPublicUrl=false');
  assert(pkg.safety_message && pkg.safety_message.length > 0, 'has safety_message');
  const packageId = pkg.handoff_package.handoff_package_id;

  // Add file metadata
  const file = await svc.addPackageFileMetadata({
    handoff_package_id: packageId, file_name: 'test.pdf', file_type: 'application/pdf',
    file_size_bytes: 2048, file_scope: 'REDACTED_PREVIEW', preflight_status: 'PASSED', created_by: 'smoke',
  });
  assert(file.package_file && file.package_file.package_file_id, 'addPackageFileMetadata returns package_file');
  assert(file.package_file.file_scope === 'REDACTED_PREVIEW', 'file scope is REDACTED_PREVIEW');

  // Create scoped access grant
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const grant = await svc.createScopedFileAccessGrant({
    handoff_package_id: packageId, participant_id: participantId, printhouse_tenant_id: 'hp-ph-tenant',
    access_scope: 'REDACTED_PREVIEW', expires_at: expires, created_by: 'smoke',
  });
  assert(grant.access_grant && grant.access_grant.access_grant_id, 'createScopedFileAccessGrant returns access_grant');
  assert(grant.access_grant.grant_status === 'ACTIVE', 'grant status is ACTIVE');
  assert(grant.access_grant.expires_at, 'grant has expires_at');
  assert(grant.access_grant.download_audit_required === true, 'grant download_audit_required=true');
  assert(grant.access_grant.unrestricted_file_access === false, 'grant unrestricted_file_access=false');
  assert(grant.access_grant.permanent_public_url === false, 'grant permanent_public_url=false');
  const grantId = grant.access_grant.access_grant_id;

  // Access grant requires expiration
  try {
    await svc.createScopedFileAccessGrant({
      handoff_package_id: packageId, participant_id: participantId, printhouse_tenant_id: 'hp-ph-tenant',
      access_scope: 'REDACTED_PREVIEW', created_by: 'smoke',
    });
    assert(false, 'access grant should fail without expires_at');
  } catch (e) {
    assert(e.message.includes('expires_at'), 'access grant rejects missing expiration');
  }

  // Revoke access grant
  const revoked = await svc.revokeFileAccessGrant({ access_grant_id: grantId, revoked_by: 'smoke' });
  assert(revoked.access_grant.grant_status === 'REVOKED', 'grant revoked');
  assert(revoked.access_grant.revoked_at, 'grant has revoked_at');

  // Handoff readiness
  const readiness = await svc.evaluateHandoffReadiness({ handoff_package_id: packageId });
  assert(readiness.readiness, 'evaluateHandoffReadiness returns readiness');

  // Submit review
  const review = await svc.submitPrinthouseHandoffReview({
    handoff_package_id: packageId, pilot_program_id: programId, participant_id: participantId,
    reviewer: 'smoke', review_status: 'APPROVED', review_notes: 'test',
  });
  assert(review.review && review.review.review_id, 'submitPrinthouseHandoffReview returns review');

  // Accept package
  const accepted = await svc.acceptHandoffPackage({ handoff_package_id: packageId, accepted_by: 'smoke' });
  assert(accepted.handoff_package.package_status === 'ACCEPTED_BY_PRINTHOUSE', 'package accepted');

  // Record finding
  const finding = await svc.recordHandoffFinding({
    handoff_package_id: packageId, pilot_program_id: programId, participant_id: participantId,
    finding_type: 'BLOCKER', blocks_handoff: true, severity: 'HIGH', summary: 'Test blocker', created_by: 'smoke',
  });
  assert(finding.finding && finding.finding.finding_id, 'recordHandoffFinding returns finding');
  assert(finding.finding.finding_status === 'OPEN', 'finding is OPEN');
  assert(finding.finding.blocks_handoff === true, 'finding blocks_handoff=true');
  const findingId = finding.finding.finding_id;

  // Accept should fail with unresolved blockers
  // Reset package status for this test
  const pkg2 = await svc.createHandoffPackage({
    pilot_program_id: programId, participant_id: participantId, printhouse_tenant_id: 'hp-ph-tenant',
    created_by: 'smoke',
  });
  const pkg2Id = pkg2.handoff_package.handoff_package_id;
  await svc.recordHandoffFinding({
    handoff_package_id: pkg2Id, pilot_program_id: programId, finding_type: 'BLOCKER',
    blocks_handoff: true, severity: 'CRITICAL', summary: 'Blocker for accept test', created_by: 'smoke',
  });
  try {
    await svc.acceptHandoffPackage({ handoff_package_id: pkg2Id, accepted_by: 'smoke' });
    assert(false, 'accept should fail with unresolved blockers');
  } catch (e) {
    assert(e.message.includes('unresolved blocker'), 'accept blocked by unresolved blocker findings');
  }

  // Resolve finding
  const resolved = await svc.resolveHandoffFinding({ finding_id: findingId, resolved_by: 'smoke' });
  assert(resolved.finding.finding_status === 'RESOLVED', 'finding resolved');

  // Reject package
  const rejected = await svc.rejectHandoffPackage({ handoff_package_id: pkg2Id, rejected_by: 'smoke', reason: 'test rejection' });
  assert(rejected.handoff_package.package_status === 'REJECTED_BY_PRINTHOUSE', 'package rejected');

  // Evidence pack
  const evidence = await svc.buildHandoffEvidencePack({ handoff_package_id: packageId });
  assert(evidence.evidence_pack, 'buildHandoffEvidencePack returns evidence_pack');
  assert(evidence.evidence_pack.integrity_hash, 'evidence pack has integrity_hash');
  assert(evidence.evidence_pack.evidence_schema_version === '124.0', 'evidence schema version 124.0');
  assert(evidence.evidence_pack.redaction_classification === 'INTERNAL_ONLY', 'redaction classification INTERNAL_ONLY');
  assert(Array.isArray(evidence.evidence_pack.redacted_fields), 'evidence has redacted_fields list');
  assert(evidence.evidence_pack.safety_invariants.fullPublicEnabled === false, 'evidence safety fullPublicEnabled=false');
  assert(evidence.evidence_pack.safety_invariants.productionDispatchEnabled === false, 'evidence safety productionDispatchEnabled=false');
  assert(evidence.evidence_pack.safety_invariants.unrestrictedFileAccess === false, 'evidence safety unrestrictedFileAccess=false');

  // Audit timeline
  const timeline = await svc.getHandoffAuditTimeline({ handoff_package_id: packageId });
  assert(timeline.audit_timeline && timeline.audit_timeline.length > 0, 'audit timeline has entries');

  // Readiness
  const overall = await svc.getReadiness({});
  assert(overall.readiness, 'getReadiness returns readiness');
  assert(overall.readiness.tenant_allowlist_fail_closed !== undefined, 'readiness has tenant_allowlist_fail_closed');

  // Tenant allowlist fail-closed test
  const savedEnv = process.env.NODE_ENV;
  const savedAllow = process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS;
  delete process.env.PILOT_TENANT_ALLOWLIST;
  try {
    await svc.createHandoffPackage({
      pilot_program_id: programId, participant_id: participantId, printhouse_tenant_id: 'should-fail',
      created_by: 'smoke',
    });
    assert(false, 'createHandoffPackage should fail with empty allowlist in production');
  } catch (e) {
    assert(e.message.includes('PILOT_TENANT_ALLOWLIST'), 'fail-closed: tenant rejected when allowlist empty in production');
  }
  process.env.NODE_ENV = savedEnv;
  process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = savedAllow;

  console.log(`\n=== Phase 124B Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
