'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 127B: Limited Beta Preparation Gate Service Smoke ===\n');

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

(async () => {
  let mockBoundary = null;
  let mockTerms = null;
  let mockFindings = [];
  let hasEscalation = false;
  let hasRollback = false;

  // Mock DB query interface returning flat rows
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '071_phase126_1_pilot_evidence_persistence_runtime_truth' }];
      }
      if (sql.includes('pilot_evidence_go_no_go_decisions')) {
        return [{ decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION', runtime_truth_status: 'VERIFIED', persistence_status: 'PERSISTED' }];
      }
      if (sql.includes('SELECT * FROM limited_beta_role_boundaries')) {
        return mockBoundary ? [mockBoundary] : [];
      }
      if (sql.includes('SELECT * FROM limited_beta_terms_acceptances')) {
        return mockTerms ? [mockTerms] : [];
      }
      if (sql.includes('SELECT * FROM limited_beta_invite_codes')) {
        return [{ invite_id: 'i-1', cohort_id: cohortId, revoked: 0, expires_at: null }];
      }
      if (sql.includes('SELECT * FROM limited_beta_support_escalations')) {
        return hasEscalation ? [{ escalation_id: 'se-1' }] : [];
      }
      if (sql.includes('SELECT * FROM limited_beta_incident_rollback_plans')) {
        return hasRollback ? [{ plan_id: 'rp-1' }] : [];
      }
      if (sql.includes('SELECT * FROM limited_beta_findings')) {
        return mockFindings;
      }
      return [];
    }
  };

  // 1. Create Gate
  const gateResult = await svc.createPreparationGate({ created_by: 'smoke' });
  assert(gateResult.gate, 'createPreparationGate returns gate');
  assert(gateResult.gate.gate_id, 'gate has id');
  assert(gateResult.gate.readiness_status === 'DRAFT', 'gate status is DRAFT');
  assert(gateResult.safety.betaRuntimeEnabled === false, 'safety.betaRuntimeEnabled is false');
  assert(gateResult.safety.fullPublicEnabled === false, 'safety.fullPublicEnabled is false');
  assert(gateResult.safety.paymentExecutionEnabled === false, 'safety.paymentExecutionEnabled is false');

  const gateId = gateResult.gate.gate_id;

  // 2. Create Cohort
  const cohortResult = await svc.createBetaCohort({
    gate_id: gateId,
    cohort_name: 'Beta Cohort 1',
    cohort_description: 'Test beta cohort',
    max_participants: 5,
    created_by: 'smoke'
  });
  assert(cohortResult.cohort, 'createBetaCohort returns cohort');
  assert(cohortResult.cohort.cohort_id, 'cohort has id');
  const cohortId = cohortResult.cohort.cohort_id;

  // 3. Register Cohort Participant
  const participantResult = await svc.registerCohortParticipant({
    cohort_id: cohortId,
    tenant_id: 'tenant-1',
    participant_type: 'FOUNDING_PRINTHOUSE',
    registered_by: 'smoke'
  });
  assert(participantResult.participant, 'registerCohortParticipant returns participant');
  assert(participantResult.participant.participant_id, 'participant has id');
  assert(participantResult.participant.participant_status === 'DRAFT', 'status defaults to DRAFT');
  const participantId = participantResult.participant.participant_id;

  // 4. Issue and Revoke Invite Codes
  const inviteResult = await svc.issueInviteCode({
    cohort_id: cohortId,
    invite_code: 'SMOKE-BETA-CODE',
    max_uses: 1,
    created_by: 'smoke'
  });
  assert(inviteResult.invite, 'issueInviteCode returns invite');
  assert(inviteResult.invite.invite_code === '[REDACTED]', 'invite code matches');
  const inviteId = inviteResult.invite.invite_id;

  const revokeResult = await svc.revokeInviteCode({
    invite_id: inviteId,
    revoked_by: 'smoke'
  });
  assert(revokeResult.invite.revoked === 1, 'revokeInviteCode revokes code');

  // 5. Eligibility and Role Boundaries
  let eligibility = await svc.evaluateParticipantEligibility({ participant_id: participantId });
  assert(eligibility.eligible === false, 'participant not eligible initially (needs boundary and terms)');

  // Define boundary
  mockBoundary = {
    participant_id: participantId,
    allowed_actions_json: ['read_dashboard'],
    restricted_actions_json: ['payout']
  };
  await svc.defineRoleBoundary({
    participant_id: participantId,
    allowed_actions_json: ['read_dashboard'],
    restricted_actions_json: ['payout'],
    defined_by: 'smoke'
  });

  // External participant also needs terms acceptance
  mockTerms = {
    participant_id: participantId,
    terms_version: '1.0',
    accepted_by: 'user-1'
  };
  await svc.recordTermsAcceptance({
    participant_id: participantId,
    terms_version: '1.0',
    accepted_by: 'user-1'
  });

  eligibility = await svc.evaluateParticipantEligibility({ participant_id: participantId });
  assert(eligibility.eligible === true, 'participant is eligible after boundary and terms defined');
  assert(eligibility.participant.participant_status === 'APPROVED_FOR_LIMITED_BETA_PREPARATION', 'participant is approved');

  // 6. Support Escalation & Incident Rollback Plans
  hasEscalation = true;
  await svc.recordSupportEscalationPath({
    gate_id: gateId,
    path_name: 'Escalation Path A',
    contact_details_json: { email: 'ops@printprice.com' },
    created_by: 'smoke'
  });

  hasRollback = true;
  await svc.recordIncidentRollbackPlan({
    gate_id: gateId,
    rollback_steps_json: ['disable_runtime'],
    created_by: 'smoke'
  });

  // 7. Evaluate Readiness
  let readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'READY', 'Gate is READY when all items are complete');

  // Record Blocker Finding
  const findingResult = await svc.recordBetaFinding({
    gate_id: gateId,
    finding_type: 'BLOCKER',
    blocks_readiness: true,
    severity: 'CRITICAL',
    summary: 'Blocker finding',
    created_by: 'smoke'
  });
  const findingId = findingResult.finding.finding_id;

  mockFindings = [{
    finding_id: findingId,
    gate_id: gateId,
    finding_type: 'BLOCKER',
    finding_status: 'OPEN',
    blocks_readiness: 1,
    severity: 'CRITICAL',
    summary: 'Blocker finding'
  }];

  readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'BLOCKED', 'Gate is BLOCKED by blocker findings');
  assert(readiness.blockerFindings && readiness.blockerFindings.length > 0, 'blockerFindings length > 0');
  assert(readiness.reason === 'UNRESOLVED_BLOCKER_FINDINGS', 'reason = UNRESOLVED_BLOCKER_FINDINGS');

  // Resolve Blocker Finding
  await svc.resolveBetaFinding({
    finding_id: findingId,
    resolved_by: 'smoke'
  });
  mockFindings = [];

  readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'READY', 'Gate is READY again after resolving blockers');

  // 8. Evidence Pack & Auditing
  const packResult = await svc.buildLimitedBetaEvidencePack({
    gate_id: gateId,
    generated_by: 'smoke'
  });
  assert(packResult.evidence_pack, 'Evidence pack generated');
  assert(packResult.evidence_pack.evidence_hash, 'Evidence pack has hash');
  assert(packResult.safety.betaRuntimeEnabled === false, 'safety remains disabled in evidence pack');

  const auditResult = await svc.getLimitedBetaAuditTimeline({ gate_id: gateId });
  assert(auditResult.audits.length > 0, 'Audit timeline has entries');

  console.log(`\nPhase 127B Service: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Phase 127B FATAL:', err);
  process.exit(1);
});
