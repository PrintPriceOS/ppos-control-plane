'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 127.1F: Limited Beta Preparation Persistence Acceptance Pack ===\n');

// 1. File existence checks
const requiredFiles = [
  'migrations/073_phase127_1_limited_beta_preparation_persistence_truth.sql',
  'src/api/services/limitedBetaPreparationGateService.js',
  'src/api/routes/limitedBetaPreparationGateAdmin.js',
  'src/ui/types/limitedBetaPreparationGate.ts',
  'src/ui/pages/beta/LimitedBetaPreparationGate.tsx',
  'scripts/smoke_phase127_1a_limited_beta_persistence_schema.js',
  'scripts/smoke_phase127_1b_limited_beta_db_persistence_service.js',
  'scripts/smoke_phase127_1c_limited_beta_runtime_truth_verification.js',
  'scripts/smoke_phase127_1d_limited_beta_fail_closed_rules.js',
  'scripts/smoke_phase127_1e_limited_beta_admin_api_ui_hardening.js',
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

// 2. Service safety invariants & forbidden patterns check
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

// 3. Lifecycle acceptance validation with 127.1 schema check
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaPreparationGateService = require('../src/api/services/limitedBetaPreparationGateService');
const svc = new LimitedBetaPreparationGateService();

(async () => {
  // Mock DB query to return verified Phase 126.1 evidence & support/rollback info
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

  const gateResult = await svc.createPreparationGate({ created_by: 'acceptance' });
  assert(gateResult.gate, 'Acceptance: gate created');
  const gateId = gateResult.gate.gate_id;

  const readyResult = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readyResult.readiness_status === 'READY', 'Acceptance: gate readiness is READY');

  const evidenceResult = await svc.buildLimitedBetaEvidencePack({ gate_id: gateId, generated_by: 'acceptance' });
  assert(evidenceResult.evidence_pack, 'Acceptance: evidence pack generated');
  assert(evidenceResult.evidence_pack.evidence_hash, 'Acceptance: evidence pack has hash');
  assert(evidenceResult.evidence_pack.evidence_schema_version === '127.1', 'Acceptance: schema version matches 127.1 exactly');

  console.log(`\nPhase 127.1F Acceptance Pack: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error('Phase 127.1F FATAL:', err);
  process.exit(1);
});
