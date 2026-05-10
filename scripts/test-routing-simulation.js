/**
 * scripts/test-routing-simulation.js
 * 
 * Validates Phase 30 Dispatch Economic Simulator.
 */
const simulatorService = require('../src/api/services/economics/DispatchEconomicSimulator');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 30 ROUTING SIMULATION TEST ---');

  try {
    const nodes = await db.query('SELECT id FROM print_nodes LIMIT 3');
    if (nodes.length < 1) {
      console.error('No nodes found.');
      process.exit(1);
    }

    const jobData = {
      id: 'sim-job-1',
      quoted_price: 250.0,
      volume: 10,
      destination_country: 'IE',
      urgency: 'EXPRESS'
    };

    const candidateIds = nodes.map(n => n.id);

    // 1. Run simulation
    console.log(`[TEST] Simulating economic routing for ${candidateIds.length} candidates...`);
    const result = await simulatorService.simulateDispatchEconomic(jobData, candidateIds);

    console.log('✅ SIMULATION COMPLETE');
    console.log(`Top Node Recommended: ${result.recommendation.node_id}`);
    console.log(`Risk-Adjusted Margin: $${result.recommendation.risk_adjusted_margin.toFixed(2)}`);
    console.log(`Efficiency Score: ${result.recommendation.efficiency_score}`);

    console.log('\nScenarios:');
    result.scenarios.forEach((s, idx) => {
      console.log(`${idx + 1}. Node ${s.node_id} | Margin: $${s.margin.toFixed(2)} | Prob SLA: ${s.sla_met_probability}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
