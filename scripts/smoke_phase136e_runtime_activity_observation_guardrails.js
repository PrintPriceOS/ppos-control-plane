'use strict';

process.env.DB_UNREACHABLE = 'true';

const { serviceInstance: service } = require('../src/api/services/controlledBetaRuntimeActivityObservationService');
const runtimeSessionService = require('../src/api/services/controlledBetaRuntimeSessionService').serviceInstance || require('../src/api/services/controlledBetaRuntimeSessionService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 136E: Runtime Activity Observation Guardrails ===\n');

(async () => {
  try {
    const obsGateId = 'obs_test_136e';
    const sessionGateId = 'sg_test_136e';
    const runtimeSessionId = 'sess_test_136e';
    const participantId = 'part_test_136e';

    // Seed observation gate
    service.setMockState('gates', obsGateId, {
      observation_gate_id: obsGateId,
      session_gate_id: sessionGateId,
      runtime_session_id: runtimeSessionId,
      participant_id: participantId,
      tenant_id: 'tenant_136e',
      cohort_id: 'cohort_136e',
      observation_enabled: 1,
      kill_switch_active: 0
    });

    // Seed active predecessor session
    runtimeSessionService.setMockState('gates', sessionGateId, {
      session_gate_id: sessionGateId,
      gate_status: 'APPROVED',
      kill_switch_active: 0,
      tenant_id: 'tenant_136e',
      cohort_id: 'cohort_136e',
      participant_id: participantId,
      acceptance_gate_id: 'acc_136e'
    });

    runtimeSessionService.setMockState('sessions', runtimeSessionId, {
      runtime_session_id: runtimeSessionId,
      session_gate_id: sessionGateId,
      session_status: 'ACTIVE',
      expires_at: new Date(Date.now() + 3600000),
      tenant_id: 'tenant_136e',
      cohort_id: 'cohort_136e',
      participant_id: participantId,
      session_scope_json: { tenant_id: 'tenant_136e', cohort_id: 'cohort_136e' }
    });

    runtimeSessionService.setMockState('evidencePacks', sessionGateId, {
      session_gate_id: sessionGateId,
      evidence_integrity_hash: 'hash_136e'
    });

    // 1. Event ingestion blocks raw session tokens/secrets
    let rejectedToken = false;
    try {
      await service.ingestRuntimeActivityEvent(
        obsGateId,
        runtimeSessionId,
        'API_REQUEST',
        'ALLOWED',
        'feature:x',
        'read',
        new Date(),
        { token: 'tok_abc123' } // Raw token in metadata
      );
    } catch (e) {
      if (e.message.includes('RAW_TOKEN_OR_SECRET_DETECTED')) {
        rejectedToken = true;
      }
    }
    assert(rejectedToken, 'Event ingestion blocks raw session token in metadata payload');

    // 2. Event Ingestion does not grant access
    const statusBefore = service._mockState.gates.get(obsGateId).gate_status;
    await service.ingestRuntimeActivityEvent(obsGateId, runtimeSessionId, 'API_REQUEST', 'ALLOWED', 'feature:x', 'read', new Date(), {});
    const statusAfter = service._mockState.gates.get(obsGateId).gate_status;
    assert(statusBefore === statusAfter, 'Event ingestion does not modify the gate status');

    // 3. Anomaly detection does not auto-enforce or auto-revoke
    const resAnom = await service.recordRuntimeActivityAnomalySignal(obsGateId, runtimeSessionId, participantId, 'tenant_136e', 'cohort_136e', 'SPIKE_RATE');
    assert(resAnom.anomaly_status === 'OPEN', 'Anomaly status starts as OPEN (observational only)');
    
    const sessObj = runtimeSessionService._mockState.sessions.get(runtimeSessionId);
    assert(sessObj.session_status === 'ACTIVE', 'Predecessor session remains ACTIVE after recording anomaly');

    console.log(`\nSmoke 136E: Finished execution. ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('FAIL: Guardrails smoke test threw error: ', e);
    process.exit(1);
  }
})();
