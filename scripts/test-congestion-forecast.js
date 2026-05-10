/**
 * scripts/test-congestion-forecast.js
 * 
 * Validates Phase 29 Predictive Congestion Engine.
 */
const congestionService = require('../src/api/services/intelligence/CongestionForecastService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 29 CONGESTION FORECAST TEST ---');

  try {
    const [node] = await db.query('SELECT id FROM print_nodes LIMIT 1');
    if (!node) {
      console.error('No nodes found.');
      process.exit(1);
    }

    // 1. Mock some heartbeats to create a trend
    console.log('[TEST] Seeding heartbeat history for trend analysis...');
    await db.query('INSERT INTO node_heartbeats (node_id, status, utilization_pct, heartbeat_at) VALUES (?, "ONLINE", 40, DATE_SUB(NOW(), INTERVAL 2 HOUR))', [node.id]);
    await db.query('INSERT INTO node_heartbeats (node_id, status, utilization_pct, heartbeat_at) VALUES (?, "ONLINE", 60, DATE_SUB(NOW(), INTERVAL 1 HOUR))', [node.id]);

    // 2. Trigger forecast
    console.log('[TEST] Triggering congestion forecast...');
    const result = await congestionService.forecastNodeCongestion(node.id, 85);

    console.log('✅ FORECAST GENERATED');
    console.log(`Node ID: ${result.nodeId}`);
    console.log(`Current: ${result.currentUtil}%`);
    console.log(`Projected: ${result.predictedUtil}%`);
    console.log(`Velocity: ${result.velocity}% / hr`);

    // 3. Verify persistence
    const saved = await db.query('SELECT * FROM predictive_congestion_forecasts WHERE node_id = ? ORDER BY forecast_at DESC LIMIT 1', [node.id]);
    if (saved.length > 0) {
      console.log('✅ PERSISTENCE VERIFIED');
    } else {
      console.error('❌ PERSISTENCE FAILED');
    }

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
