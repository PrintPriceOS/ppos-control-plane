'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128c: Beta Runtime Access Control Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaRuntimeService = require('../src/api/services/limitedBetaRuntimeService');
const svc = new LimitedBetaRuntimeService();

(async () => {
  // Test 1: Forbidden features are denied immediately
  const forbiddenFeatures = [
    'PUBLIC_SIGNUP',
    'FULL_PUBLIC_MARKETPLACE',
    'OPEN_MARKETPLACE_ORDERING',
    'PAYMENT_CAPTURE',
    'PAYMENT_REFUND',
    'PAYOUT_EXECUTION',
    'TAX_SUBMISSION',
    'ACCOUNTING_EXPORT_SUBMISSION',
    'PROVIDER_EXTERNAL_SUBMISSION',
    'LIVE_PROVIDER_AUTO_DISPATCH',
    'UNCONTROLLED_SOURCE_MUTATION'
  ];

  for (const f of forbiddenFeatures) {
    const res = await svc.evaluateRuntimeAccess({
      gate_id: 'gate_123',
      cohort_id: 'cohort_123',
      participant_id: 'part_123',
      tenant_id: 'tenant_123',
      feature_key: f
    });
    assert(res.ok === false, `Forbidden feature ${f} is denied`);
    assert(res.access_status === 'DENIED', `Status for ${f} is DENIED`);
    assert(res.reason === 'FORBIDDEN_FEATURE', `Reason is FORBIDDEN_FEATURE`);
  }

  // Test 2: Incomplete eligibility checks deny access
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '073_phase127_1_limited_beta_preparation_persistence_truth' }];
      }
      if (sql.includes('limited_beta_evidence_packs')) {
        return [{ evidence_data_json: JSON.stringify({ runtimeTruthStatus: 'VERIFIED', persistenceStatus: 'PERSISTED' }) }];
      }
      if (sql.includes('limited_beta_preparation_gates')) {
        return [{ readiness_status: 'READY', invite_only: 1, full_public_enabled: 0 }];
      }
      if (sql.includes('limited_beta_support_escalations')) {
        return [{ escalation_id: 'se-1' }];
      }
      if (sql.includes('limited_beta_incident_rollback_plans')) {
        return [{ plan_id: 'rp-1' }];
      }
      if (sql.includes('limited_beta_findings')) {
        return [];
      }
      if (sql.includes('limited_beta_cohort_participants')) {
        return [{ participant_id: 'part_123', cohort_id: 'cohort_123', participant_status: 'APPROVED_FOR_LIMITED_BETA_PREPARATION' }];
      }
      if (sql.includes('limited_beta_role_boundaries')) {
        return []; // No boundaries accepted!
      }
      if (sql.includes('limited_beta_terms_acceptances')) {
        return [{ participant_id: 'part_123' }];
      }
      return [];
    }
  };

  const resEl = await svc.evaluateRuntimeAccess({
    gate_id: 'gate_123',
    cohort_id: 'cohort_123',
    participant_id: 'part_123',
    tenant_id: 'tenant_123',
    feature_key: 'BETA_FEATURE'
  });
  assert(resEl.ok === false, "Access denied when role boundaries are missing");
  assert(resEl.reason === 'ELIGIBILITY_CHECKS_FAILED', "Reason is ELIGIBILITY_CHECKS_FAILED");

  console.log(`\nSmoke 128c: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128c:", err);
  process.exit(1);
});
