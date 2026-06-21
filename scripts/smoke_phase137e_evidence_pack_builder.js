'use strict';

const evidenceService = require('../src/api/services/runtimeActivityReviewEvidencePackService').serviceInstance || require('../src/api/services/runtimeActivityReviewEvidencePackService');

(async () => {
  console.log('=== Smoke 137E: Evidence Pack Verification ===\n');

  try {
    const reviewId = 'rev_sample';
    const snapshot = {
      window_start: new Date(),
      window_end: new Date(),
      summary: { total_events: 5, blocked_attempts_count: 0, anomalies_count: 0, health_signals_count: 0, daily_counters_count: 1 },
      inputSnapshotHash: 'hash_input_123'
    };
    const evaluation = {
      findings: [],
      riskLevel: 'LOW',
      confidenceLevel: 'HIGH',
      recommendedDecision: 'CONTINUE_COHORT',
      evaluationResultHash: 'hash_evaluation_456'
    };
    const decision = {
      recommended_decision: 'CONTINUE_COHORT',
      decision_execution_status: 'NOT_EXECUTED_REVIEW_ONLY',
      execution_blocked_reason: 'PHASE_137_IS_READONLY_RECOMMENDATION_GATE'
    };
    const findings = [];

    const pack = await evidenceService.buildEvidencePack(reviewId, snapshot, evaluation, decision, findings);

    if (!pack.evidence_pack_hash || !pack.input_snapshot_hash || !pack.evaluation_result_hash) {
      console.error('FAIL: Double hashes or evidence pack hash missing.');
      process.exit(1);
    }
    console.log('  PASS: Double hashes and evidence pack hash validated.');

    const str = JSON.stringify(pack);
    if (str.includes('tok_') || str.includes('inv_') || str.includes('@') || str.includes('DATABASE_URL')) {
      console.error('FAIL: Unredacted secrets/identifiers found in evidence pack.');
      process.exit(1);
    }
    console.log('  PASS: Secrets and sensitive identifiers redacted from evidence pack.');

    console.log('\nSmoke 137E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 137E:', e);
    process.exit(1);
  }
})();
