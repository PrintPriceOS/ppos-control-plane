/**
 * scripts/test-reliability-engine.js
 * 
 * Validates Phase 29 Dynamic Printer Reliability Engine.
 */
const reliabilityService = require('../src/api/services/intelligence/PrinterReliabilityService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 29 RELIABILITY ENGINE TEST ---');

  try {
    const [node] = await db.query('SELECT id FROM print_nodes LIMIT 1');
    if (!node) {
      console.error('No nodes found.');
      process.exit(1);
    }

    // 1. Run recalibration
    console.log('[TEST] Recalibrating reliability metrics...');
    const metrics = await reliabilityService.updateNodeMetrics(node.id);

    console.log('✅ RELIABILITY COMPUTED');
    console.log(`Node: ${node.id}`);
    console.log(`Trust Score: ${metrics.trust_score}`);
    console.log(`Failure Prob: ${metrics.failure_probability.toFixed(4)}`);
    console.log(`HB Stability: ${metrics.heartbeat_stability.toFixed(2)}`);

    // 2. Check ranking
    console.log('[TEST] Verifying global ranking...');
    const ranking = await reliabilityService.listReliabilityRanking();
    if (ranking.length > 0) {
      console.log(`✅ RANKING VERIFIED (${ranking.length} nodes)`);
      console.log(`Top Node: ${ranking[0].company_name} (Score: ${ranking[0].trust_score})`);
    }

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
