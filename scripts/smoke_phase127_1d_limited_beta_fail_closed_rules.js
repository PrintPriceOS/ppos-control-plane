'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 127.1d: Limited Beta Fail-Closed & Eligibility Rules ===\n');

process.env.NODE_ENV = 'production';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'false';

const LimitedBetaPreparationGateService = require('../src/api/services/limitedBetaPreparationGateService');
const svc = new LimitedBetaPreparationGateService();

(async () => {
  // Mock DB structure
  let mockParticipant = {
    participant_id: 'p-1',
    cohort_id: 'c-1',
    participant_type: 'FOUNDING_PRINTHOUSE',
    participant_status: 'DRAFT'
  };
  
  let mockBoundary = {
    participant_id: 'p-1',
    allowed_actions_json: ['read'],
    restricted_actions_json: ['write']
  };

  let mockTerms = {
    participant_id: 'p-1',
    terms_version: '1.0',
    accepted_by: 'user-1'
  };

  let mockInvite = {
    invite_id: 'i-1',
    cohort_id: 'c-1',
    invite_code: '[REDACTED]',
    invite_hash: 'somehash',
    revoked: 0,
    expires_at: null
  };

  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('SELECT * FROM limited_beta_cohort_participants WHERE participant_id = ?')) {
        return [mockParticipant];
      }
      if (sql.includes('SELECT gate_id FROM limited_beta_cohorts WHERE cohort_id = ?')) {
        return [{ gate_id: 'gate-123' }];
      }
      if (sql.includes('SELECT * FROM limited_beta_role_boundaries WHERE participant_id = ?')) {
        return mockBoundary ? [mockBoundary] : [];
      }
      if (sql.includes('SELECT * FROM limited_beta_terms_acceptances WHERE participant_id = ?')) {
        return mockTerms ? [mockTerms] : [];
      }
      if (sql.includes('SELECT * FROM limited_beta_invite_codes WHERE cohort_id = ?')) {
        return mockInvite ? [mockInvite] : [];
      }
      if (sql.includes('UPDATE limited_beta_cohort_participants')) {
        return [{ affectedRows: 1 }];
      }
      return [];
    }
  };

  // 1. Participant is eligible
  try {
    const res = await svc.evaluateParticipantEligibility({ participant_id: 'p-1' });
    assert(res.eligible === true, "Participant is eligible with boundary, terms, and active invite");
  } catch (err) {
    console.error("  Eligibility validation failed:", err.message);
    failed++;
  }

  // 2. Participant not eligible due to missing role boundary
  mockBoundary = null;
  try {
    const res = await svc.evaluateParticipantEligibility({ participant_id: 'p-1' });
    assert(res.eligible === false, "Participant is ineligible if role boundary is missing");
  } catch (err) {
    console.error("  Eligibility validation error (role boundary):", err.message);
    failed++;
  }
  mockBoundary = { participant_id: 'p-1', allowed_actions_json: ['read'], restricted_actions_json: ['write'] };

  // 3. Participant not eligible due to missing terms acceptance
  mockTerms = null;
  try {
    const res = await svc.evaluateParticipantEligibility({ participant_id: 'p-1' });
    assert(res.eligible === false, "Participant is ineligible if terms are not accepted");
  } catch (err) {
    console.error("  Eligibility validation error (terms):", err.message);
    failed++;
  }
  mockTerms = { participant_id: 'p-1', terms_version: '1.0', accepted_by: 'user-1' };

  // 4. Participant not eligible due to revoked invite
  mockInvite.revoked = 1;
  try {
    const res = await svc.evaluateParticipantEligibility({ participant_id: 'p-1' });
    assert(res.eligible === false, "Participant is ineligible if invite is revoked");
  } catch (err) {
    console.error("  Eligibility validation error (revoked invite):", err.message);
    failed++;
  }
  mockInvite.revoked = 0;

  // 5. Participant not eligible due to expired invite
  mockInvite.expires_at = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
  try {
    const res = await svc.evaluateParticipantEligibility({ participant_id: 'p-1' });
    assert(res.eligible === false, "Participant is ineligible if invite is expired");
  } catch (err) {
    console.error("  Eligibility validation error (expired invite):", err.message);
    failed++;
  }
  mockInvite.expires_at = null;

  // 6. Support escalation / Rollback plan verification
  let hasEscalation = true;
  let hasRollback = true;
  let mockBlockers = [];

  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '071_phase126_1_pilot_evidence_persistence_runtime_truth' }];
      }
      if (sql.includes('pilot_evidence_go_no_go_decisions')) {
        return [{ decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION', runtime_truth_status: 'VERIFIED', persistence_status: 'PERSISTED' }];
      }
      if (sql.includes('limited_beta_support_escalations')) {
        return hasEscalation ? [{ escalation_id: 'se-1' }] : [];
      }
      if (sql.includes('limited_beta_incident_rollback_plans')) {
        return hasRollback ? [{ plan_id: 'rp-1' }] : [];
      }
      if (sql.includes('limited_beta_findings')) {
        return mockBlockers;
      }
      return [];
    }
  };

  try {
    let readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: 'gate-123' });
    assert(readiness.readiness_status === 'READY', "Readiness is READY initially");

    // Missing escalation
    hasEscalation = false;
    readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: 'gate-123' });
    assert(readiness.readiness_status === 'BLOCKED', "Readiness is BLOCKED if support escalation path is missing");
    assert(readiness.reason === 'CONFIGURATION_INCOMPLETE', "Reason is CONFIGURATION_INCOMPLETE for missing escalation path");
    hasEscalation = true;

    // Missing rollback plan
    hasRollback = false;
    readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: 'gate-123' });
    assert(readiness.readiness_status === 'BLOCKED', "Readiness is BLOCKED if rollback plan is missing");
    assert(readiness.reason === 'CONFIGURATION_INCOMPLETE', "Reason is CONFIGURATION_INCOMPLETE for missing rollback plan");
    hasRollback = true;

    // Blocker findings presence
    mockBlockers = [{
      finding_id: 'f-1',
      gate_id: 'gate-123',
      finding_type: 'BLOCKER',
      finding_status: 'OPEN',
      blocks_readiness: 1,
      severity: 'CRITICAL',
      summary: 'Critical security bug'
    }];
    readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: 'gate-123' });
    assert(readiness.readiness_status === 'BLOCKED', "Readiness is BLOCKED if there is an unresolved blocker finding");
    assert(readiness.reason === 'UNRESOLVED_BLOCKER_FINDINGS', "Reason is UNRESOLVED_BLOCKER_FINDINGS");
  } catch (err) {
    console.error("  Readiness validation logic failed:", err.message);
    failed++;
  }

  console.log(`\nSmoke 127.1d: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 127.1d:", err);
  process.exit(1);
});
