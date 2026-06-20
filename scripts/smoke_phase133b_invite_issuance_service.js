'use strict';

const ControlledBetaInviteIssuanceService = require('../src/api/services/controlledBetaInviteIssuanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 133B: Invite Issuance Service ===');
  const service = new ControlledBetaInviteIssuanceService();

  // Test Exports
  const requiredFns = [
    'evaluateInviteIssuanceReadiness',
    'createInviteIssuanceGate',
    'bindPreparationToIssuanceGate',
    'createInviteIssuanceBatch',
    'addInviteIssuanceRecipient',
    'validateInviteIssuanceBatch',
    'runInviteIssuanceGuardrailChecks',
    'submitInviteIssuanceForApproval',
    'approveInviteIssuance',
    'rejectInviteIssuance',
    'blockInviteIssuance',
    'issueApprovedInviteBatch',
    'revokeIssuedInvite',
    'revokeInviteBatch',
    'recordInviteIssuanceFinding',
    'resolveInviteIssuanceFinding',
    'buildInviteIssuanceEvidencePack',
    'getInviteIssuanceAuditTimeline',
    'getInviteIssuanceDashboardState'
  ];

  for (const fn of requiredFns) {
    assert(typeof service[fn] === 'function', `Service exports ${fn}()`);
  }

  // Force mock mode
  process.env.DB_UNREACHABLE = 'true';

  // Gate Creation
  const gateId = 'gate_test_133b';
  const gate = await service.createInviteIssuanceGate({
    issuance_gate_id: gateId,
    preparation_id: 'prep_test_133b',
    phase132_evidence_pack_id: 'ev_test_133b',
    tenant_id: 'tenant_test_133b',
    cohort_id: 'cohort_test_133b',
    max_invites_allowed: 10,
    max_invites_to_issue: 5
  });
  assert(gate.gate_status === 'DRAFT', 'Gate created with DRAFT status');

  // Batch Creation
  const batchId = 'batch_test_133b';
  const batch = await service.createInviteIssuanceBatch({
    issuance_batch_id: batchId,
    issuance_gate_id: gateId,
    preparation_id: 'prep_test_133b',
    tenant_id: 'tenant_test_133b',
    cohort_id: 'cohort_test_133b',
    requested_invite_count: 5
  });
  assert(batch.batch_status === 'DRAFT', 'Batch created with DRAFT status');

  // Recipient draft addition
  const recip = await service.addInviteIssuanceRecipient({
    issuance_batch_id: batchId,
    candidate_participant_id: 'cand_test_133b',
    tenant_id: 'tenant_test_133b',
    cohort_id: 'cohort_test_133b',
    recipient_email: 'tester@example.com',
    recipient_label: 'Beta Tester'
  });
  assert(recip.recipient_email_hash.length === 64, 'Recipient email hashed properly');
  assert(recip.recipient_label.includes('REDACTED'), 'Recipient label redacted');

  // Validation
  const valResult = await service.validateInviteIssuanceBatch(batchId);
  assert(valResult.ok === true, 'Batch validation passes');

  // Guardrails
  const grResult = await service.runInviteIssuanceGuardrailChecks(gateId);
  assert(grResult.ok === true, 'Guardrail safety checks pass');

  // Approval Workflow
  const submitRes = await service.submitInviteIssuanceForApproval(gateId);
  assert(submitRes.status === 'PENDING_APPROVAL', 'Submit workflow transitions state');

  const appRes = await service.approveInviteIssuance(gateId, 'admin');
  assert(appRes.status === 'APPROVED', 'Approve workflow transitions state to APPROVED');

  // Evidence Pack
  const pack = await service.buildInviteIssuanceEvidencePack(gateId);
  assert(pack.evidence_schema_version === '133.0', 'Evidence pack built with version 133.0');

  // Audit timeline
  const timeline = await service.getInviteIssuanceAuditTimeline(gateId);
  assert(timeline.length > 0, 'Audit timeline returns non-empty logs list');

  console.log(`Smoke 133B: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
