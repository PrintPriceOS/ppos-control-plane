/**
 * scripts/test-economic-risk.js
 * 
 * Validates Phase 30 Economic Risk Forecasting.
 */
const riskService = require('../src/api/services/economics/EconomicRiskForecastService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 30 ECONOMIC RISK TEST ---');

  try {
    // 1. Seed some low-margin history to trigger risk
    const [node] = await db.query('SELECT id FROM print_nodes WHERE region = "EU-WEST" LIMIT 1');
    if (node) {
      console.log(`[TEST] Seeding low margin history for node ${node.id} in EU-WEST...`);
      await db.query('INSERT INTO industrial_profitability_history (node_id, dispatch_id, gross_revenue, operational_cost, net_margin) VALUES (?, "seed-1", 100, 98, 2)', [node.id]);
    }

    // 2. Trigger risk forecast
    console.log('[TEST] Forecasting regional economic risks...');
    const forecasts = await riskService.forecastGlobalEconomicRisks();
    
    console.log(`✅ FORECASTS GENERATED (${forecasts.length})`);
    forecasts.forEach(f => {
      console.log(`Region: ${f.region} | Type: ${f.risk_type} | Prob: ${f.probability}`);
    });

    // 3. Detect dangerous nodes
    console.log('[TEST] Detecting economically dangerous nodes...');
    const dangerous = await riskService.detectDangerousNodes();
    console.log(`✅ DETECTION COMPLETE. Dangerous nodes found: ${dangerous.length}`);

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
