'use strict';

process.env.DB_UNREACHABLE = 'true';

const { serviceInstance: service } = require('../src/api/services/controlledBetaRuntimeActivityObservationService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 136D: Runtime Activity Counters & Summaries ===\n');

(async () => {
  try {
    const obsGateId = 'obs_test_136d';
    const runtimeSessionId = 'sess_test_136d';
    const participantId = 'part_test_136d';

    // 1. Update feature counters directly
    await service.updateFeatureUsageCounters(obsGateId, runtimeSessionId, participantId, 'tenant_d', 'cohort_d', 'feature:x', true, false, false);
    await service.updateFeatureUsageCounters(obsGateId, runtimeSessionId, participantId, 'tenant_d', 'cohort_d', 'feature:x', false, true, false);

    const fKey = `${runtimeSessionId}:feature:x`;
    const usage = service._mockState.featureUsage.get(fKey);
    assert(usage !== undefined, 'Feature usage record created in mock state');
    assert(usage.usage_count === 2, 'Feature total usage count incremented to 2');
    assert(usage.allowed_count === 1, 'Feature allowed count incremented to 1');
    assert(usage.blocked_count === 1, 'Feature blocked count incremented to 1');

    // 2. Update daily counters
    const today = new Date();
    await service.updateDailyActivityCounters(obsGateId, participantId, 'tenant_d', 'cohort_d', today, true, false, false);
    await service.updateDailyActivityCounters(obsGateId, participantId, 'tenant_d', 'cohort_d', today, false, false, true);

    const dateStr = today.toISOString().split('T')[0];
    const dKey = `${obsGateId}:${dateStr}`;
    const daily = service._mockState.dailyCounters.get(dKey);
    assert(daily !== undefined, 'Daily counter record created in mock state');
    assert(daily.total_events === 2, 'Daily total events incremented to 2');
    assert(daily.allowed_events === 1, 'Daily allowed events incremented to 1');
    assert(daily.denied_events === 1, 'Daily denied events incremented to 1');

    // 3. Build and verify participant summary is redacted
    // Seed events first
    service.setMockState('events', obsGateId, [
      { event_type: 'API_REQUEST', event_status: 'ALLOWED', feature_key: 'feature:x' },
      { event_type: 'API_REQUEST', event_status: 'BLOCKED', feature_key: 'feature:y' }
    ]);

    const pSum = await service.buildParticipantUsageSummary(obsGateId, participantId);
    assert(pSum.total_events === 2, 'Participant summary contains total events count');
    assert(pSum.allowed_events === 1, 'Participant summary contains allowed events count');
    assert(pSum.blocked_events === 1, 'Participant summary contains blocked events count');
    
    // Check redaction
    const summaryStr = JSON.stringify(pSum);
    assert(!summaryStr.includes('@') && !summaryStr.includes('tok_') && !summaryStr.includes('192.168.'), 'Participant summary does not contain raw emails, session tokens, or IP addresses');

    // 4. Cohort summary redaction check
    const cSum = await service.buildCohortUsageSummary('tenant_d', 'cohort_d');
    const cStr = JSON.stringify(cSum);
    assert(!cStr.includes('@') && !cStr.includes('tok_'), 'Cohort summary does not contain raw emails or tokens');

    console.log(`\nSmoke 136D: Finished execution. ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('FAIL: Counters and summaries smoke test threw error: ', e);
    process.exit(1);
  }
})();
