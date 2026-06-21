'use strict';

const aggregator = require('../src/api/services/runtimeActivityReviewAggregatorService').serviceInstance || require('../src/api/services/runtimeActivityReviewAggregatorService');

(async () => {
  console.log('=== Smoke 137B: Review Aggregation from Phase 136 ===\n');

  try {
    const tenantId = 'tenant_beta_01';
    const cohortId = 'cohort_beta_01';
    const start = new Date(Date.now() - 86400000);
    const end = new Date();

    const { payload, inputSnapshotHash } = await aggregator.aggregateCohortObservations(tenantId, cohortId, start, end);

    if (!payload || !inputSnapshotHash) {
      console.error('FAIL: Snapshot aggregation returned empty or no hash.');
      process.exit(1);
    }

    if (payload.tenant_id !== tenantId || payload.cohort_id !== cohortId) {
      console.error('FAIL: Snapshot metadata mismatch.');
      process.exit(1);
    }

    console.log('  PASS: Successfully aggregated observations snapshot.');
    console.log(`  PASS: Generated input snapshot hash: ${inputSnapshotHash}`);
    console.log('\nSmoke 137B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 137B:', e);
    process.exit(1);
  }
})();
