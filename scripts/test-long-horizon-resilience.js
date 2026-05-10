/**
 * scripts/test-long-horizon-resilience.js
 * 
 * Validates Phase 32 Long-Horizon Resilience.
 */
const resilienceService = require('../src/api/services/temporal/LongHorizonResilienceService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 32 LONG-HORIZON RESILIENCE TEST ---');

  try {
    // 1. Forecast multi-year resilience
    console.log('[TEST] Evaluating decade-scale survivability trajectories...');
    await resilienceService.forecastLongHorizonResilience();
    
    // 2. Fetch stability data
    const stability = await resilienceService.getResilienceStability();
    console.log(`✅ LONG-HORIZON FORECASTS GENERATED (${stability.length} regions)`);
    stability.slice(0, 3).forEach(s => {
      console.log(`Region: ${s.region} | Decade Survivability: ${s.decade_survivability_pct}%`);
    });

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
