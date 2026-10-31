/**
 * scripts/test-margin-optimization.js
 * 
 * Validates Phase 30 Real-Time Margin Engine.
 */
const marginService = require('../src/api/services/economics/MarginOptimizationService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 30 MARGIN OPTIMIZATION TEST ---');

  try {
    const [node] = await db.query('SELECT id FROM print_nodes LIMIT 1');
    if (!node) {
      console.error('No nodes found.');
      process.exit(1);
    }

    const jobData = {
      id: 'test-job-margin',
      quoted_price: 180.0,
      volume: 5,
      destination_country: 'IE',
      urgency: 'STANDARD'
    };

    // 1. Validate economics
    console.log('[TEST] Validating dispatch economics...');
    const result = await marginService.validateDispatchEconomics(node.id, jobData);
    
    if (result.ok) {
      console.log('✅ ECONOMIC VALIDATION PASSED');
      console.log(`Estimated Margin: $${result.projection.estimated_margin.toFixed(2)}`);
      console.log(`Margin %: ${result.projection.margin_percentage.toFixed(2)}%`);
      console.log('Breakdown:', JSON.stringify(result.projection.cost_breakdown, null, 2));
    } else {
      console.log('❌ ECONOMIC VALIDATION REJECTED:', result.reason);
    }

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
