/**
 * scripts/test-resilience-simulator.js
 * 
 * Validates Phase 31 Planetary Resilience Simulator.
 */
const resilienceSimulator = require('../src/api/services/governance/PlanetaryResilienceSimulator');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 31 RESILIENCE SIMULATOR TEST ---');

  try {
    // 1. Run planetary stress test
    console.log('[TEST] Executing planetary resilience stress test...');
    const result = await resilienceSimulator.runPlanetaryStressTest();
    
    console.log('✅ STRESS TEST COMPLETE');
    console.log(`Global Survivability Index: ${result.global_survivability_index.toFixed(2)}%`);
    
    console.log('\nRegional Simulation Sample:');
    result.region_simulations.slice(0, 3).forEach(s => {
      console.log(`Region ${s.region_id}: ${s.survivable ? 'SURVIVABLE' : 'CRITICAL'} | Impact: ${s.impact_level}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
