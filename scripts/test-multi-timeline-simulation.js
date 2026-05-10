/**
 * scripts/test-multi-timeline-simulation.js
 * 
 * Validates Phase 32 Multi-Timeline Simulation.
 */
const simulationService = require('../src/api/services/temporal/MultiTimelineSimulationService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 32 MULTI-TIMELINE SIMULATION TEST ---');

  try {
    // 1. Simulate parallel timelines
    console.log('[TEST] Simulating alternative industrial futures...');
    const timelines = await simulationService.simulateParallelTimelines();
    
    console.log(`✅ TIMELINES SIMULATED (${timelines.length} scenarios)`);
    timelines.forEach(t => {
      console.log(`ID: ${t.id} | Ranking: ${t.ranking}% | Desc: ${t.desc}`);
    });

    // 2. Fetch top timelines
    const top = await simulationService.getTopTimelines();
    console.log(`✅ TOP TIMELINE: ${top[0].timeline_id} (${top[0].stability_ranking}%)`);

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
