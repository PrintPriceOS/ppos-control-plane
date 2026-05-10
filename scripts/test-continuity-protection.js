/**
 * scripts/test-continuity-protection.js
 * 
 * Validates Phase 31 Continuity Protection Engine.
 */
const continuityService = require('../src/api/services/governance/ContinuityProtectionService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 31 CONTINUITY PROTECTION TEST ---');

  try {
    // 1. Evaluate global continuity
    console.log('[TEST] Evaluating federation continuity metrics...');
    const metrics = await continuityService.evaluateContinuity();
    
    console.log('✅ CONTINUITY METRICS COMPUTED');
    console.log(`Redundancy Ratio: ${metrics.redundancy.toFixed(2)}x`);
    console.log(`Diversity Score: ${metrics.diversity}%`);
    console.log(`Critical Node Count: ${metrics.criticality}`);

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
