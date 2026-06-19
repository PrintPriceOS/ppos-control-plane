'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 127.1c: Limited Beta Runtime Truth Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaPreparationGateService = require('../src/api/services/limitedBetaPreparationGateService');
const svc = new LimitedBetaPreparationGateService();

(async () => {
  const gateId = 'gate-123';

  // 1. Simulate DB returning no migration or no decision (evidence missing)
  svc._db = {
    query: async (sql, params) => {
      // Return empty array for all reads
      return [];
    }
  };

  try {
    const readinessResult = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
    assert(readinessResult.readiness_status === 'BLOCKED', "Readiness is BLOCKED when Phase 126.1 evidence is missing");
    assert(readinessResult.checks.phase126_1_verified === false, "Checks indicate Phase 126.1 is not verified");
    assert(readinessResult.reason === 'PHASE_126_1_EVIDENCE_MISSING_OR_DEGRADED', "Blocked reason is correct");
  } catch (err) {
    console.error("  Error during evidence missing test:", err.message);
    failed++;
  }

  // 2. Simulate DB returning migration but incorrect decision status
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '071_phase126_1_pilot_evidence_persistence_runtime_truth' }];
      }
      if (sql.includes('pilot_evidence_go_no_go_decisions')) {
        return [{ decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION', runtime_truth_status: 'DEGRADED', persistence_status: 'FALLBACK_ONLY' }];
      }
      return [];
    }
  };

  try {
    const readinessResult = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
    assert(readinessResult.readiness_status === 'BLOCKED', "Readiness is BLOCKED when decision runtime truth is degraded");
    assert(readinessResult.checks.phase126_1_verified === false, "Checks indicate Phase 126.1 is not verified");
  } catch (err) {
    console.error("  Error during evidence degraded test:", err.message);
    failed++;
  }

  // 3. Simulate DB returning both migration and verified/persisted decision status
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '071_phase126_1_pilot_evidence_persistence_runtime_truth' }];
      }
      if (sql.includes('pilot_evidence_go_no_go_decisions')) {
        return [{ decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION', runtime_truth_status: 'VERIFIED', persistence_status: 'PERSISTED' }];
      }
      if (sql.includes('limited_beta_support_escalations')) {
        return [{ escalation_id: 'se-1' }];
      }
      if (sql.includes('limited_beta_incident_rollback_plans')) {
        return [{ plan_id: 'rp-1' }];
      }
      return [];
    }
  };

  try {
    const readinessResult = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
    assert(readinessResult.checks.phase126_1_verified === true, "Checks indicate Phase 126.1 is verified when database records are valid");
    assert(readinessResult.readiness_status === 'READY', "Readiness is READY when evidence is verified and support/rollback plans are in place");
  } catch (err) {
    console.error("  Error during evidence verified test:", err.message);
    failed++;
  }

  console.log(`\nSmoke 127.1c: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 127.1c:", err);
  process.exit(1);
});
