'use strict';

const evaluator = require('../src/api/services/runtimeActivityCohortHealthEvaluatorService').serviceInstance || require('../src/api/services/runtimeActivityCohortHealthEvaluatorService');

(async () => {
  console.log('=== Smoke 137C: Cohort Health Evaluator Verification ===\n');

  try {
    // Test Case 1: Healthy Snapshot
    const snapshot1 = {
      window_start: new Date(),
      window_end: new Date(),
      summary: { total_events: 10, blocked_attempts_count: 0, anomalies_count: 0, health_signals_count: 0, daily_counters_count: 1 },
      anomalies: [],
      health_signals: [],
      blocked_attempts: []
    };

    const res1 = await evaluator.evaluateCohortHealth(snapshot1);
    if (res1.evaluationResult.riskLevel !== 'LOW' || res1.evaluationResult.recommendedDecision !== 'CONTINUE_COHORT') {
      console.error('FAIL: Healthy snapshot evaluation mismatch:', res1.evaluationResult);
      process.exit(1);
    }
    console.log('  PASS: Healthy snapshot evaluated as LOW risk, CONTINUE_COHORT.');

    // Test Case 2: Degraded Snapshot
    const snapshot2 = {
      window_start: new Date(),
      window_end: new Date(),
      summary: { total_events: 50, blocked_attempts_count: 8, anomalies_count: 1, health_signals_count: 1, daily_counters_count: 1 },
      anomalies: [{ anomaly_key: 'RATE_LIMIT', anomaly_status: 'OPEN' }],
      health_signals: [{ signal_key: 'LAG', severity: 'CRITICAL', signal_status: 'ERROR' }],
      blocked_attempts: [{ blocked_attempt_id: '1', blocked_severity: 'HIGH' }]
    };

    const res2 = await evaluator.evaluateCohortHealth(snapshot2);
    if (res2.evaluationResult.riskLevel !== 'CRITICAL' || res2.evaluationResult.recommendedDecision !== 'PAUSE_COHORT') {
      console.error('FAIL: Degraded snapshot evaluation mismatch:', res2.evaluationResult);
      process.exit(1);
    }
    console.log('  PASS: Degraded snapshot evaluated as CRITICAL risk, PAUSE_COHORT.');

    console.log('\nSmoke 137C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 137C:', e);
    process.exit(1);
  }
})();
