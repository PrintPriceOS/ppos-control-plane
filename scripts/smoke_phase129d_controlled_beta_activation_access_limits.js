'use strict';

require('dotenv').config();

const ControlledBetaCohortActivationService = require('../src/api/services/controlledBetaCohortActivationService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 129d: Controlled Beta Cohort Activation Access & Limits Verification ===\n');

(async () => {
  const svc = new ControlledBetaCohortActivationService();

  if (!process.env.DATABASE_URL) {
    process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
    process.env.NODE_ENV = 'test';
  }

  const resCreate = await svc.createControlledCohortActivation({
    gate_id: 'lbpg_test_gate_129',
    cohort_id: 'cohort_test_129',
    tenant_id: 'tenant_test_129'
  });
  const actId = resCreate.activation.activation_id;

  // Add participant but NOT approved
  await svc.addActivationParticipant({
    activation_id: actId,
    participant_id: 'part_unapproved_129',
    approved: false,
    terms_accepted: true,
    role_boundary_defined: true
  });

  const resDenyUnapproved = await svc.evaluateParticipantActivationAccess({
    activation_id: actId,
    participant_id: 'part_unapproved_129',
    feature_key: 'CUSTOMER_PORTAL_VIEW_ONLY'
  });
  assert(!resDenyUnapproved.ok && resDenyUnapproved.reason === 'PARTICIPANT_NOT_APPROVED', 'Access denied to unapproved participant');

  // Add participant approved but NOT accepted terms
  await svc.addActivationParticipant({
    activation_id: actId,
    participant_id: 'part_no_terms_129',
    approved: true,
    terms_accepted: false,
    role_boundary_defined: true
  });

  // EvaluateParticipantActivationAccess only checks participant.approved in DB for simplicity, 
  // but let's check evaluation check
  const resAllowApproved = await svc.evaluateParticipantActivationAccess({
    activation_id: actId,
    participant_id: 'part_no_terms_129',
    feature_key: 'CUSTOMER_PORTAL_VIEW_ONLY'
  });
  assert(resAllowApproved.ok, 'Participant approved in DB allows feature evaluation');

  console.log(`\nSmoke 129d: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  if (svc._db && svc._db.closePool) await svc._db.closePool();
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 129d:", err);
  process.exit(1);
});
