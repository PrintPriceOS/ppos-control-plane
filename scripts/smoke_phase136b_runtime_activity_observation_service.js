'use strict';

// Force service isolation from actual DB to prevent unique/duplicate ID collisions
process.env.DB_UNREACHABLE = 'true';

const { serviceInstance: service } = require('../src/api/services/controlledBetaRuntimeActivityObservationService');
const runtimeSessionService = require('../src/api/services/controlledBetaRuntimeSessionService').serviceInstance || require('../src/api/services/controlledBetaRuntimeSessionService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 136B: Runtime Activity Observation Service ===\n');

(async () => {
  try {
    const methods = [
      'evaluateRuntimeActivityObservationReadiness',
      'createRuntimeActivityObservationGate',
      'ingestRuntimeActivityEvent',
      'normalizeRuntimeActivityEvent',
      'recordBlockedRuntimeAttempt',
      'updateFeatureUsageCounters',
      'updateDailyActivityCounters',
      'recordRuntimeActivityAnomalySignal',
      'recordRuntimeActivityHealthSignal',
      'buildParticipantUsageSummary',
      'buildCohortUsageSummary',
      'runRuntimeActivityObservationGuardrails',
      'recordRuntimeActivityFinding',
      'resolveRuntimeActivityFinding',
      'buildRuntimeActivityObservationEvidencePack',
      'getRuntimeActivityObservationAuditTimeline',
      'getRuntimeActivityObservationDashboardState'
    ];

    for (const m of methods) {
      assert(typeof service[m] === 'function', `Service exports ${m}`);
    }

    // 1. Create predecessor runtime session in mock state
    const sessionGateId = 'sg_test_136b';
    const runtimeSessionId = 'sess_test_136b';
    const participantId = 'part_test_136b';

    runtimeSessionService.setMockState('gates', sessionGateId, {
      session_gate_id: sessionGateId,
      gate_status: 'APPROVED',
      kill_switch_active: 0,
      tenant_id: 'tenant_136b',
      cohort_id: 'cohort_136b',
      participant_id: participantId,
      acceptance_gate_id: 'acc_136b'
    });

    runtimeSessionService.setMockState('sessions', runtimeSessionId, {
      runtime_session_id: runtimeSessionId,
      session_gate_id: sessionGateId,
      session_status: 'ACTIVE',
      expires_at: new Date(Date.now() + 3600000),
      tenant_id: 'tenant_136b',
      cohort_id: 'cohort_136b',
      participant_id: participantId,
      session_scope_json: { tenant_id: 'tenant_136b', cohort_id: 'cohort_136b' }
    });

    runtimeSessionService.setMockState('evidencePacks', sessionGateId, {
      session_gate_id: sessionGateId,
      evidence_integrity_hash: 'hash_136b'
    });

    // 2. Create activity observation gate
    const obsGateId = 'obs_test_136b';
    const obsGate = await service.createRuntimeActivityObservationGate({
      observation_gate_id: obsGateId,
      session_gate_id: sessionGateId,
      runtime_session_id: runtimeSessionId,
      participant_id: participantId,
      tenant_id: 'tenant_136b',
      cohort_id: 'cohort_136b'
    });

    assert(obsGate.observation_gate_id === obsGateId, 'Observation gate created');
    assert(obsGate.gate_status === 'DRAFT', 'Default gate status is DRAFT');

    // 3. Ingest activity event
    // Enable observation first
    await service.enableObservationGate(obsGateId);

    const event = await service.ingestRuntimeActivityEvent(
      obsGateId,
      runtimeSessionId,
      'API_REQUEST',
      'ALLOWED',
      'feature:billing',
      'read',
      new Date(),
      { page: 'billing' }
    );

    assert(event.activity_event_id !== undefined, 'Activity event ingested');
    assert(event.normalized_event_key === 'api_request:feature:billing:read:allowed', 'Event normalized correctly');

    // 4. Blocked attempt recording
    const block = await service.recordBlockedRuntimeAttempt(
      obsGateId,
      runtimeSessionId,
      'feature:admin',
      'write',
      'UNAUTHORIZED_ROLE',
      'HIGH'
    );
    assert(block.blocked_attempt_id !== undefined, 'Blocked attempt recorded');

    // 5. Anomaly Signal
    const anom = await service.recordRuntimeActivityAnomalySignal(obsGateId, runtimeSessionId, participantId, 'tenant_136b', 'cohort_136b', 'SPIKE');
    assert(anom.anomaly_signal_id !== undefined, 'Anomaly signal recorded');

    // 6. Health Signal
    const hlth = await service.recordRuntimeActivityHealthSignal(obsGateId, runtimeSessionId, participantId, 'tenant_136b', 'cohort_136b', 'LAG');
    assert(hlth.health_signal_id !== undefined, 'Health signal recorded');

    // 7. Summaries
    const pSum = await service.buildParticipantUsageSummary(obsGateId, participantId);
    assert(pSum.participant_summary_id !== undefined, 'Participant usage summary generated');

    const cSum = await service.buildCohortUsageSummary('tenant_136b', 'cohort_136b');
    assert(cSum.cohort_summary_id !== undefined, 'Cohort usage summary generated');

    // 8. Evidence Pack
    const ep = await service.buildRuntimeActivityObservationEvidencePack(obsGateId);
    assert(ep.evidence_pack_id !== undefined, 'Evidence pack generated');
    assert(ep.evidence_schema_version === '136.0', 'Evidence schema version is 136.0');

    // 9. Timeline
    const timeline = await service.getRuntimeActivityObservationAuditTimeline(obsGateId);
    assert(timeline.length > 0, 'Audit timeline returns audit logs');

    console.log(`\nSmoke 136B: Finished execution. ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('FAIL: Service smoke test threw error: ', e);
    process.exit(1);
  }
})();
