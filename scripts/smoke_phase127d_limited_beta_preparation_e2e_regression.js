'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 127D: Limited Beta Preparation Gate E2E Regression Smoke ===\n');

// --- Verify prior phase files still exist ---
const priorPhaseFiles = [
  'migrations/070_phase126_pilot_evidence_review_go_no_go.sql',
  'migrations/071_phase126_1_pilot_evidence_persistence_runtime_truth.sql',
  'src/api/services/pilotEvidenceReviewGoNoGoService.js',
  'src/api/routes/pilotEvidenceReviewGoNoGoAdmin.js',
];
for (const f of priorPhaseFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `Prior phase file exists: ${f}`);
}

// --- Forbidden patterns check ---
const forbiddenPatterns = [
  'betaRuntimeEnabled: true',
  'fullPublicEnabled: true',
  'openMarketplaceEnabled: true',
  'productionActivationEnabled: true',
  'paymentExecutionEnabled: true',
  'refundExecutionEnabled: true',
  'payoutExecutionEnabled: true',
  'liveProviderConnectivityEnabled: true',
  'providerExternalSubmissionEnabled: true',
  'externalSubmission: true',
  'sourceMutation: true',
];

const phase127Files = [
  'src/api/services/limitedBetaPreparationGateService.js',
  'src/api/routes/limitedBetaPreparationGateAdmin.js',
];

for (const f of phase127Files) {
  const fullPath = path.join(__dirname, '..', f);
  if (!fs.existsSync(fullPath)) continue;
  const src = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert(!src.includes(pattern), `${f}: no forbidden pattern "${pattern}"`);
  }
}

const forbiddenCalls = [
  'charge(', 'capture(', 'refund(', 'payout(', 'sendToProvider', 'submitTax', 'submitVat', 'submitAccounting',
];

for (const f of phase127Files) {
  const fullPath = path.join(__dirname, '..', f);
  if (!fs.existsSync(fullPath)) continue;
  const src = fs.readFileSync(fullPath, 'utf8');
  for (const call of forbiddenCalls) {
    assert(!src.includes(call), `${f}: no forbidden call "${call}"`);
  }
}

// --- E2E Verification Logic ---
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaPreparationGateService = require('../src/api/services/limitedBetaPreparationGateService');
const svc = new LimitedBetaPreparationGateService();

(async () => {
  // Test 1: Gate starts blocked if Phase 126.1 evidence is missing/degraded (db read returns null/empty)
  svc._db = {
    query: async (sql, params) => {
      // Simulate no 126.1 verified decision
      return [[]];
    }
  };

  const gateResult = await svc.createPreparationGate({ created_by: 'smoke' });
  const gateId = gateResult.gate.gate_id;

  let readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'BLOCKED', 'Gate is BLOCKED when Phase 126.1 evidence is missing');
  assert(readiness.reason === 'PHASE_126_1_EVIDENCE_MISSING_OR_DEGRADED', 'Correct block reason reported');

  // Test 2: Gate requires role boundary and terms acceptance to approve cohort participants
  const cohortResult = await svc.createBetaCohort({
    gate_id: gateId,
    cohort_name: 'Test Cohort',
    max_participants: 5,
    created_by: 'smoke'
  });
  const cohortId = cohortResult.cohort.cohort_id;

  const participantResult = await svc.registerCohortParticipant({
    cohort_id: cohortId,
    tenant_id: 'tenant-1',
    participant_type: 'FOUNDING_PRINTHOUSE',
    registered_by: 'smoke'
  });
  const participantId = participantResult.participant.participant_id;

  let el = await svc.evaluateParticipantEligibility({ participant_id: participantId });
  assert(el.eligible === false, 'Cannot approve participant without role boundary and terms acceptance');

  // Add boundary but no terms yet
  await svc.defineRoleBoundary({
    participant_id: participantId,
    allowed_actions_json: ['read'],
    defined_by: 'smoke'
  });
  el = await svc.evaluateParticipantEligibility({ participant_id: participantId });
  assert(el.eligible === false, 'External participant still ineligible without terms acceptance');

  // Add terms
  await svc.recordTermsAcceptance({
    participant_id: participantId,
    terms_version: '1.0',
    accepted_by: 'user-1'
  });
  el = await svc.evaluateParticipantEligibility({ participant_id: participantId });
  assert(el.eligible === true, 'Approved after adding both role boundary and terms acceptance');

  console.log(`\nPhase 127D E2E Regression: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Phase 127D FATAL:', err);
  process.exit(1);
});
