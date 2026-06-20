'use strict';

const ControlledBetaInviteIssuanceService = require('../src/api/services/controlledBetaInviteIssuanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 133D: Invite Issuance Limits and Scoping ===');
  const service = new ControlledBetaInviteIssuanceService();
  process.env.DB_UNREACHABLE = 'true';

  const gateId = 'gate_test_133d';
  const batchId = 'batch_test_133d';

  const gate = await service.createInviteIssuanceGate({
    issuance_gate_id: gateId,
    preparation_id: 'prep_d',
    tenant_id: 'tenant_d',
    cohort_id: 'cohort_d',
    max_invites_allowed: 2,
    max_invites_to_issue: 2
  });

  const batch = await service.createInviteIssuanceBatch({
    issuance_batch_id: batchId,
    issuance_gate_id: gateId,
    preparation_id: 'prep_d',
    tenant_id: 'tenant_d',
    cohort_id: 'cohort_d',
    requested_invite_count: 2
  });

  // Add a recipient correctly
  await service.addInviteIssuanceRecipient({
    issuance_recipient_id: 'recip_d1',
    issuance_batch_id: batchId,
    candidate_participant_id: 'cand_d1',
    tenant_id: 'tenant_d',
    cohort_id: 'cohort_d',
    recipient_email: 'user1@example.com'
  });

  // 1. Add duplicate recipient
  await service.addInviteIssuanceRecipient({
    issuance_recipient_id: 'recip_d2_dup',
    issuance_batch_id: batchId,
    candidate_participant_id: 'cand_d2',
    tenant_id: 'tenant_d',
    cohort_id: 'cohort_d',
    recipient_email: 'user1@example.com' // Duplicate Email
  });

  let val = await service.validateInviteIssuanceBatch(batchId);
  assert(val.ok === false && val.reason === 'DUPLICATE_RECIPIENT', 'Rejects duplicate email recipients in batch');

  // Remove the duplicate mock recipient and add a distinct one
  service._mockState.recipients.delete('recip_d2_dup');

  await service.addInviteIssuanceRecipient({
    issuance_recipient_id: 'recip_d2',
    issuance_batch_id: batchId,
    candidate_participant_id: 'cand_d2',
    tenant_id: 'tenant_d',
    cohort_id: 'cohort_d',
    recipient_email: 'user2@example.com'
  });

  val = await service.validateInviteIssuanceBatch(batchId);
  assert(val.ok === true, 'Validation passes for distinct recipients');

  // 2. Out of scope recipient
  await service.addInviteIssuanceRecipient({
    issuance_recipient_id: 'recip_d_out',
    issuance_batch_id: batchId,
    candidate_participant_id: 'cand_d3',
    tenant_id: 'tenant_other', // Mismatched tenant
    cohort_id: 'cohort_d',
    recipient_email: 'user3@example.com'
  });

  val = await service.validateInviteIssuanceBatch(batchId);
  assert(val.ok === false && val.reason === 'RECIPIENT_OUT_OF_SCOPE', 'Rejects out-of-scope recipient');

  service._mockState.recipients.delete('recip_d_out');

  // 3. Verify cap limits
  gate.invites_issued_count = 3; // Exceeds max_invites_to_issue (2)
  let r = await service.evaluateInviteIssuanceReadiness(gateId);
  assert(r.blocked_reasons.includes('INVITE_CAP_EXCEEDED'), 'Fails readiness when issued count exceeds cap limits');

  console.log(`Smoke 133D: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
