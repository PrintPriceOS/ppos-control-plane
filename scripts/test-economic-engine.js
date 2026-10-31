/**
 * scripts/test-economic-engine.js
 * 
 * Validates Phase 30 Industrial Economic Engine.
 */
const economicService = require('../src/api/services/economics/IndustrialEconomicService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 30 ECONOMIC ENGINE TEST ---');

  try {
    const [node] = await db.query('SELECT id FROM print_nodes LIMIT 1');
    if (!node) {
      console.error('No nodes found.');
      process.exit(1);
    }

    // 1. Record an economic outcome
    console.log(`[TEST] Recording economic outcome for node ${node.id}...`);
    await economicService.recordEconomicOutcome('test-dispatch-econ', node.id, 200.0, {
      operational: 80.0,
      logistics: 30.0,
      energy: 10.0
    });

    // 2. Calculate profitability
    console.log('[TEST] Calculating profitability stats...');
    const stats = await economicService.calculateNodeProfitability(node.id);
    console.log('✅ STATS COMPUTED');
    console.log(`Total Revenue: $${stats.total_revenue}`);
    console.log(`Avg Margin: $${stats.avg_margin}`);

    // 3. Evaluate Energy Efficiency
    const energy = await economicService.evaluateEnergyEfficiency({ id: node.id, region: 'EU-WEST', capacity_utilization_pct: 75 });
    console.log(`✅ ENERGY EFFICIENCY: ${energy}%`);

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
