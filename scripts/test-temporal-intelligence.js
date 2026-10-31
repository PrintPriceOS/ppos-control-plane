/**
 * scripts/test-temporal-intelligence.js
 * 
 * Validates Phase 32 Temporal Industrial Intelligence.
 */
const temporalService = require('../src/api/services/temporal/TemporalIntelligenceService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 32 TEMPORAL INTELLIGENCE TEST ---');

  try {
    // 1. Generate future projection
    console.log('[TEST] Generating 24-hour future federation projection...');
    const projection = await temporalService.generateFutureProjection(24);
    
    console.log('✅ PROJECTION GENERATED');
    console.log(`Horizon: ${projection.horizon_hours}H`);
    console.log(`Predicted Congestion: ${projection.predicted_congestion_pct.toFixed(1)}%`);
    console.log(`Survivability Index: ${projection.survivability_index}`);

    // 2. Snapshot stability
    console.log('[TEST] Taking temporal stability snapshot...');
    await temporalService.snapshotTemporalStability();
    console.log('✅ STABILITY SNAPSHOT RECORDED');

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
