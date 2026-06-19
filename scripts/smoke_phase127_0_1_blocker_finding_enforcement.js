'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 127.0.1: Blocker Finding Enforcement Regression Smoke ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaPreparationGateService = require('../src/api/services/limitedBetaPreparationGateService');

(async () => {
  // Setup clean service
  const svc = new LimitedBetaPreparationGateService();

  // Mock DB query to return verified Phase 126.1 evidence, and empty SELECTs otherwise
  let mockDbFindings = [];
  let hasEscalation = false;
  let hasRollback = false;

  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '071_phase126_1_pilot_evidence_persistence_runtime_truth' }];
      }
      if (sql.includes('pilot_evidence_go_no_go_decisions')) {
        return [{ decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION', runtime_truth_status: 'VERIFIED', persistence_status: 'PERSISTED' }];
      }
      if (sql.includes('SELECT * FROM limited_beta_findings')) {
        return mockDbFindings;
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

  const gateResult = await svc.createPreparationGate({ created_by: 'smoke' });
  const gateId = gateResult.gate.gate_id;

  // Setup basic readiness criteria (escalation path and rollback plan)
  await svc.recordSupportEscalationPath({
    gate_id: gateId,
    path_name: 'Support Line',
    contact_details_json: { email: 'ops@printprice.com' }
  });
  hasEscalation = true;

  await svc.recordIncidentRollbackPlan({
    gate_id: gateId,
    rollback_steps_json: ['disable_runtime']
  });
  hasRollback = true;

  // Verify initially ready
  let readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'READY', 'Initial readiness status is READY');

  // 1. Test memory-mode blocker finding blocks readiness (blocks_readiness = true)
  const memoryFinding = await svc.recordBetaFinding({
    gate_id: gateId,
    finding_type: 'BLOCKER',
    blocks_readiness: true,
    severity: 'MEDIUM',
    summary: 'Memory blocker finding'
  });
  const memoryFindingId = memoryFinding.finding.finding_id;

  readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'BLOCKED', 'Memory blocker finding blocks readiness');
  assert(readiness.reason === 'UNRESOLVED_BLOCKER_FINDINGS', 'Reason is UNRESOLVED_BLOCKER_FINDINGS');
  assert(readiness.blockerFindings && readiness.blockerFindings.length === 1, 'One blocker finding returned');
  assert(readiness.betaRuntimeEnabled === false, 'betaRuntimeEnabled remains false');
  assert(readiness.fullPublicEnabled === false, 'fullPublicEnabled remains false');

  // Resolve memory blocker
  await svc.resolveBetaFinding({ finding_id: memoryFindingId });
  readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'READY', 'Gate is READY again after resolving memory blocker');

  // 2. Test DB-style blocker finding blocks readiness
  mockDbFindings = [{
    finding_id: 'db-f-1',
    gate_id: gateId,
    finding_type: 'BLOCKER',
    finding_status: 'OPEN',
    blocks_beta_preparation: 1,
    severity: 'HIGH',
    summary: 'DB Blocker finding',
    details_json: JSON.stringify({ blocks_readiness: true })
  }];

  readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'BLOCKED', 'DB-style blocker finding blocks readiness');
  assert(readiness.blockerFindings && readiness.blockerFindings.length === 1, 'One blocker finding returned from DB mockup');

  // Clear DB blocker
  mockDbFindings = [];
  readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'READY', 'Gate is READY again after clearing DB blocker');

  // 3. Test severity BLOCKER blocks readiness
  const blockerSeverity = await svc.recordBetaFinding({
    gate_id: gateId,
    finding_type: 'OBSERVATION',
    severity: 'BLOCKER',
    summary: 'Severity blocker finding'
  });
  const blockerSeverityId = blockerSeverity.finding.finding_id;

  readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'BLOCKED', 'Severity BLOCKER blocks readiness');

  await svc.resolveBetaFinding({ finding_id: blockerSeverityId });

  // 4. Test severity CRITICAL without blocker flag does NOT block readiness unless intended
  const criticalSeverity = await svc.recordBetaFinding({
    gate_id: gateId,
    finding_type: 'OBSERVATION',
    severity: 'CRITICAL',
    summary: 'Severity critical finding without blocker flag'
  });
  const criticalSeverityId = criticalSeverity.finding.finding_id;

  readiness = await svc.evaluateLimitedBetaPreparationReadiness({ gate_id: gateId });
  assert(readiness.readiness_status === 'READY', 'Severity CRITICAL without blocker flags does not block readiness');

  await svc.resolveBetaFinding({ finding_id: criticalSeverityId });

  console.log(`\nPhase 127.0.1 blocker findings regression: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Phase 127.0.1 blocker findings regression FATAL:', err);
  process.exit(1);
});
