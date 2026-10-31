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

console.log('=== Smoke 136C: Runtime Activity Observation Readiness ===\n');

(async () => {
  try {
    const obsGateId = 'obs_test_136c';
    const sessionGateId = 'sg_test_136c';
    const runtimeSessionId = 'sess_test_136c';
    const participantId = 'part_test_136c';

    // 1. Blocks when observation gate is missing
    const res1 = await service.evaluateRuntimeActivityObservationReadiness('missing_obs_gate');
    assert(!res1.ok, 'Readiness fails when observation gate is missing');
    assert(res1.blocked_reasons.includes('OBSERVATION_GATE_MISSING'), 'Blocks with OBSERVATION_GATE_MISSING');

    // Create the observation gate in mockState
    service.setMockState('gates', obsGateId, {
      observation_gate_id: obsGateId,
      session_gate_id: sessionGateId,
      runtime_session_id: runtimeSessionId,
      participant_id: participantId,
      tenant_id: 'tenant_136c',
      cohort_id: 'cohort_136c',
      observation_enabled: 1,
      kill_switch_active: 0
    });

    // 2. Blocks when Phase 135 session is missing
    const res2 = await service.evaluateRuntimeActivityObservationReadiness(obsGateId);
    assert(!res2.ok, 'Readiness fails when Phase 135 session is missing');
    assert(res2.blocked_reasons.includes('PHASE_135_SESSION_MISSING'), 'Blocks with PHASE_135_SESSION_MISSING');

    // Create predecessor session in mockState
    runtimeSessionService.setMockState('gates', sessionGateId, {
      session_gate_id: sessionGateId,
      gate_status: 'APPROVED',
      kill_switch_active: 0,
      tenant_id: 'tenant_136c',
      cohort_id: 'cohort_136c',
      participant_id: participantId,
      acceptance_gate_id: 'acc_136c'
    });

    runtimeSessionService.setMockState('sessions', runtimeSessionId, {
      runtime_session_id: runtimeSessionId,
      session_gate_id: sessionGateId,
      session_status: 'ACTIVE',
      expires_at: new Date(Date.now() + 3600000),
      tenant_id: 'tenant_136c',
      cohort_id: 'cohort_136c',
      participant_id: participantId,
      session_scope_json: { tenant_id: 'tenant_136c', cohort_id: 'cohort_136c' }
    });

    runtimeSessionService.setMockState('evidencePacks', sessionGateId, {
      session_gate_id: sessionGateId,
      evidence_integrity_hash: 'hash_136c'
    });

    // 3. READY when all prerequisites are met
    const res3 = await service.evaluateRuntimeActivityObservationReadiness(obsGateId);
    assert(res3.ok, 'Readiness passes (reaches READY) when all prerequisites present');

    // 4. Blocks when kill switch active
    const gateObj = service._mockState.gates.get(obsGateId);
    gateObj.kill_switch_active = 1;
    service.setMockState('gates', obsGateId, gateObj);

    const res4 = await service.evaluateRuntimeActivityObservationReadiness(obsGateId);
    assert(!res4.ok, 'Readiness fails when kill switch active');
    assert(res4.blocked_reasons.includes('ACTIVE_KILL_SWITCH_PRESENT'), 'Blocks with ACTIVE_KILL_SWITCH_PRESENT');

    gateObj.kill_switch_active = 0;
    service.setMockState('gates', obsGateId, gateObj);

    // 5. Blocks with safety flag FULL_PUBLIC
    gateObj.full_public_enabled = 1;
    service.setMockState('gates', obsGateId, gateObj);

    const res5 = await service.evaluateRuntimeActivityObservationReadiness(obsGateId);
    assert(!res5.ok, 'Readiness fails when FULL_PUBLIC_ENABLED is true');
    assert(res5.blocked_reasons.includes('FULL_PUBLIC_ENABLED'), 'Blocks with FULL_PUBLIC_ENABLED');

    console.log(`\nSmoke 136C: Finished execution. ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('FAIL: Readiness smoke test threw error: ', e);
    process.exit(1);
  }
})();
