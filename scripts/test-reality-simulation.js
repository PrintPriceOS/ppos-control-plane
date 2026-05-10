/**
 * scripts/test-reality-simulation.js
 * 
 * Validates Phase 33 Reality Simulation Engine.
 */
const simulationService = require('../src/api/services/RealitySimulationService');

async function runTest() {
  console.log('--- PHASE 33 REALITY SIMULATION TEST ---');

  try {
    // 1. Run manual simulation
    console.log('[TEST] Triggering reality simulation: FEDERATION_STABILITY...');
    const result = await simulationService.runSimulation('FEDERATION_STABILITY', { depth: 'SYSTEMIC' });
    
    console.log('✅ SIMULATION EXECUTED');
    console.log(`Simulation ID: ${result.simulation_id}`);
    console.log(`Outcome Recommendation: ${result.outcome.recommendation}`);

    // 2. Fetch history
    const runs = await simulationService.getSimulationRuns();
    console.log(`✅ SIMULATION HISTORY VERIFIED (${runs.length} runs found)`);

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
