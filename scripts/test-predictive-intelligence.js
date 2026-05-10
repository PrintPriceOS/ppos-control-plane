/**
 * scripts/test-predictive-intelligence.js
 * 
 * Validates Phase 29 Predictive Intelligence Layer.
 */
const scoringService = require('../src/api/services/industrialDispatchScoringService');
const memoryService = require('../src/api/services/intelligence/IndustrialMemoryService');
const reliabilityService = require('../src/api/services/intelligence/PrinterReliabilityService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 29 PREDICTIVE INTELLIGENCE TEST ---');

  try {
    // 1. Seed some historical data
    const [node] = await db.query('SELECT id FROM print_nodes LIMIT 1');
    if (!node) {
      console.error('No nodes found. Run seed first.');
      process.exit(1);
    }

    console.log(`[TEST] Recording outcomes for node ${node.id}...`);
    await memoryService.recordDispatchOutcome('test-dispatch-1', {
      node_id: node.id,
      status: 'COMPLETED',
      sla_met: true,
      latency_ms: 1200,
      quality_score: 98
    });

    await memoryService.recordDispatchOutcome('test-dispatch-2', {
      node_id: node.id,
      status: 'FAILED',
      sla_met: false,
      latency_ms: 5000,
      quality_score: 20
    });

    // 2. Trigger reliability recalibration
    console.log('[TEST] Recalibrating reliability...');
    await reliabilityService.updateNodeMetrics(node.id);

    // 3. Test predictive scoring
    console.log('[TEST] Running predictive scoring simulation...');
    const result = await scoringService.scoreDispatchCandidates({
      destination_country: 'IE',
      destination_region: 'EU-WEST',
      required_delivery_days: 7
    });

    if (result.ok && result.mode === 'PREDICTIVE_INTELLIGENCE') {
      console.log('✅ PREDICTIVE SCORING SUCCESS');
      console.log(`Candidates: ${result.candidates.length}`);
      if (result.candidates.length > 0) {
        console.log(`Top Score: ${result.candidates[0].score_total}`);
        console.log('Breakdown:', JSON.stringify(result.candidates[0].intelligence_breakdown, null, 2));
      }
    } else {
      console.error('❌ PREDICTIVE SCORING FAILED', result);
    }

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
