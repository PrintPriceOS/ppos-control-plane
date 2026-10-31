'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 127E: Limited Beta Preparation Gate Acceptance Pack ===\n');

// --- File existence checks ---
const requiredFiles = [
  'migrations/072_phase127_limited_beta_preparation_gate.sql',
  'src/api/services/limitedBetaPreparationGateService.js',
  'src/api/routes/limitedBetaPreparationGateAdmin.js',
  'src/ui/types/limitedBetaPreparationGate.ts',
  'src/ui/api/limitedBetaPreparationGateClient.ts',
  'src/ui/pages/beta/LimitedBetaPreparationGate.tsx',
  'docs/phase127_limited_beta_preparation_gate.md',
  'scripts/smoke_phase127_0_1_blocker_finding_enforcement.js',
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

// --- Service methods check ---
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaPreparationGateService = require('../src/api/services/limitedBetaPreparationGateService');
const svc = new LimitedBetaPreparationGateService();

const requiredMethods = [
  'createPreparationGate', 'createBetaCohort', 'registerCohortParticipant',
  'issueInviteCode', 'revokeInviteCode', 'recordTermsAcceptance',
  'evaluateParticipantEligibility', 'defineRoleBoundary', 'recordSupportEscalationPath',
  'recordIncidentRollbackPlan', 'evaluateLimitedBetaPreparationReadiness',
  'recordBetaFinding', 'resolveBetaFinding', 'buildLimitedBetaEvidencePack',
  'getLimitedBetaAuditTimeline'
];
for (const m of requiredMethods) {
  assert(typeof svc[m] === 'function', `Service method: ${m}`);
}

// --- Safety invariant checks in source ---
const sourceFiles = [
  'src/api/services/limitedBetaPreparationGateService.js',
  'src/api/routes/limitedBetaPreparationGateAdmin.js',
];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert(src.includes('betaRuntimeEnabled: false'), `${f}: betaRuntimeEnabled=false`);
  assert(src.includes('fullPublicEnabled: false'), `${f}: fullPublicEnabled=false`);
  assert(src.includes('openMarketplaceEnabled: false'), `${f}: openMarketplaceEnabled=false`);
  assert(src.includes('paymentExecutionEnabled: false'), `${f}: paymentExecutionEnabled=false`);
  assert(src.includes('refundExecutionEnabled: false'), `${f}: refundExecutionEnabled=false`);
  assert(src.includes('payoutExecutionEnabled: false'), `${f}: payoutExecutionEnabled=false`);
  assert(src.includes('liveProviderConnectivityEnabled: false'), `${f}: liveProviderConnectivityEnabled=false`);
  assert(src.includes('providerExternalSubmissionEnabled: false'), `${f}: providerExternalSubmissionEnabled=false`);
}

// --- Forbidden patterns across all phase 127 files ---
const allPhase127Files = [
  ...sourceFiles,
  'src/ui/pages/beta/LimitedBetaPreparationGate.tsx',
  'src/ui/api/limitedBetaPreparationGateClient.ts',
];

const forbiddenPatterns = [
  'betaRuntimeEnabled: true', 'fullPublicEnabled: true', 'openMarketplaceEnabled: true',
  'productionActivationEnabled: true', 'paymentExecutionEnabled: true',
  'refundExecutionEnabled: true', 'payoutExecutionEnabled: true',
  'liveProviderConnectivityEnabled: true', 'providerExternalSubmissionEnabled: true',
  'externalSubmission: true', 'sourceMutation: true',
];

for (const f of allPhase127Files) {
  const fullPath = path.join(__dirname, '..', f);
  if (!fs.existsSync(fullPath)) continue;
  const src = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert(!src.includes(pattern), `${f}: no forbidden "${pattern}"`);
  }
}

const forbiddenCalls = [
  'charge(', 'capture(', 'refund(', 'payout(', 'sendToProvider', 'submitTax', 'submitVat', 'submitAccounting'
];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const call of forbiddenCalls) {
    assert(!src.includes(call), `${f}: no forbidden call "${call}"`);
  }
}

// --- Full lifecycle acceptance test ---
(async () => {
  let hasEscalation = false;
  let hasRollback = false;

  // Mock DB query to return verified Phase 126.1 evidence
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '071_phase126_1_pilot_evidence_persistence_runtime_truth' }];
      }
      if (sql.includes('pilot_evidence_go_no_go_decisions')) {
        return [{ decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION', runtime_truth_status: 'VERIFIED', persistence_status: 'PERSISTED' }];
      }
      if (sql.includes('SELECT * FROM limited_beta_support_escalations')) {
        return hasEscalation ? [{ escalation_id: 'se-1' }] : [];
      }
      if (sql.includes('SELECT * FROM limited_beta_incident_rollback_plans')) {
        return hasRollback ? [{ plan_id: 'rp-1' }] : [];
      }
      return [];
    }
  };

  const gateResult = await svc.createPreparationGate({ created_by: 'acceptance' });
  assert(gateResult.gate, 'Acceptance: gate created');
  const gateId = gateResult.gate.gate_id;

  const cohortResult = await svc.createBetaCohort({
    gate_id: gateId,
    cohort_name: 'Acceptance Cohort',
    max_participants: 5,
    created_by: 'acceptance'
  });
  const cohortId = cohortResult.cohort.cohort_id;

  const participantResult = await svc.registerCohortParticipant({
    cohort_id: cohortId,
    tenant_id: 'tenant-1',
    participant_type: 'FOUNDING_PRINTHOUSE',
    registered_by: 'acceptance'
  });
  const participantId = participantResult.participant.participant_id;

  // Add boundary and terms acceptance
  await svc.defineRoleBoundary({
    participant_id: participantId,
    allowed_actions_json: ['read'],
    defined_by: 'acceptance'
  });
  await svc.recordTermsAcceptance({
    participant_id: participantId,
    terms_version: '1.0',
    accepted_by: 'user-1'
  });

  // Support & incident rollback plans
  await svc.recordSupportEscalationPath({
    gate_id: gateId,
    path_name: 'Main Support',
    contact_details_json: { email: 'ops@printprice.com' },
    created_by: 'acceptance'
  });
  hasEscalation = true;

  await svc.recordIncidentRollbackPlan({
    gate_id: gateId,
    rollback_steps_json: ['disable_runtime'],
    created_by: 'acceptance'
  });
  hasRollback = true;

  const readyResult = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readyResult.readiness_status === 'READY', 'Acceptance: gate is ready');

  const evidenceResult = await svc.buildLimitedBetaEvidencePack({ gate_id: gateId, generated_by: 'acceptance' });
  assert(evidenceResult.evidence_pack, 'Acceptance: evidence pack generated');
  assert(evidenceResult.evidence_pack.evidence_hash, 'Acceptance: evidence pack has hash');
  assert(evidenceResult.evidence_pack.evidence_schema_version === '127.1', 'Acceptance: schema version 127.1');

  const epData = evidenceResult.evidence_pack.evidence_data_json;
  assert(epData.safety_invariants, 'Acceptance: evidence pack contains safety invariants');
  assert(epData.safety_invariants.betaRuntimeEnabled === false, 'Acceptance: safety invariant betaRuntimeEnabled=false');
  assert(epData.safety_invariants.fullPublicEnabled === false, 'Acceptance: safety invariant fullPublicEnabled=false');

  const auditResult = await svc.getLimitedBetaAuditTimeline({ gate_id: gateId });
  assert(auditResult.audits.length >= 5, 'Acceptance: timeline auditing works');

  console.log(`\nPhase 127E Acceptance Pack: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Phase 127E FATAL:', err);
  process.exit(1);
});
