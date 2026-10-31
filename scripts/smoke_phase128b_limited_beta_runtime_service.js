'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128b: Beta Runtime Service Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaRuntimeService = require('../src/api/services/limitedBetaRuntimeService');
const svc = new LimitedBetaRuntimeService();

const requiredMethods = [
  'evaluateRuntimeActivationReadiness', 'createRuntimeScopePolicy', 'updateRuntimeScopePolicy',
  'enableRuntimeForGate', 'disableRuntimeForGate', 'createRuntimeAccessGrant',
  'revokeRuntimeAccessGrant', 'evaluateRuntimeAccess', 'createRuntimeSession',
  'terminateRuntimeSession', 'recordRuntimeActivity', 'recordRuntimeAccessDenial',
  'recordRuntimeGuardrailEvent', 'triggerRuntimeKillSwitch', 'clearRuntimeKillSwitch',
  'recordRuntimeRollbackEvent', 'recordRuntimeFinding', 'resolveRuntimeFinding',
  'buildRuntimeEvidencePack', 'getRuntimeAuditTimeline'
];
for (const m of requiredMethods) {
  assert(typeof svc[m] === 'function', `Service method: ${m}`);
}

(async () => {
  // Test 1: Readiness fails when Phase 127.1 evidence is missing/degraded
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return []; // No 073 migration
      }
      return [];
    }
  };

  try {
    const readiness = await svc.evaluateRuntimeActivationReadiness('gate_123');
    assert(readiness.ok === false, "Readiness is blocked when 127.1 migration is missing");
    assert(readiness.checks.verified_from_db === false, "verified_from_db is false");
    assert(readiness.readiness_status === 'BLOCKED', "Readiness status is BLOCKED");
  } catch (err) {
    console.error("  Readiness check error:", err.message);
    failed++;
  }

  // Test 2: Readiness fails when unresolved blocker findings exist
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
        return [{ finding_id: 'f-1', finding_status: 'OPEN', blocks_readiness: 1, severity: 'BLOCKER' }];
      }
      return [];
    }
  };

  try {
    const readiness = await svc.evaluateRuntimeActivationReadiness('gate_123');
    assert(readiness.ok === false, "Readiness is blocked when unresolved blocker findings exist");
    assert(readiness.checks.noBlockers === false, "noBlockers check is false");
  } catch (err) {
    console.error("  Blocker check error:", err.message);
    failed++;
  }

  // Test 3: Readiness passes when all conditions met
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
      return [];
    }
  };

  try {
    const readiness = await svc.evaluateRuntimeActivationReadiness('gate_123');
    assert(readiness.ok === true, "Readiness is ok when all Phase 127.1 invariants are verified");
    assert(readiness.readiness_status === 'READY', "Readiness status is READY");
    assert(readiness.runtimeTruthStatus === 'VERIFIED', "runtimeTruthStatus is returned");
    assert(readiness.persistenceStatus === 'PERSISTED', "persistenceStatus is returned");
  } catch (err) {
    console.error("  Valid readiness check error:", err.message);
    failed++;
  }

  console.log(`\nSmoke 128b: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128b:", err);
  process.exit(1);
});
