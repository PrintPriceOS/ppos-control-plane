/**
 * scripts/test-governance-engine.js
 * 
 * Validates Phase 31 Industrial Governance Engine.
 */
const governanceService = require('../src/api/services/governance/IndustrialGovernanceService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 31 GOVERNANCE ENGINE TEST ---');

  try {
    const [node] = await db.query('SELECT id, region FROM print_nodes LIMIT 1');
    if (!node) {
      console.error('No nodes found.');
      process.exit(1);
    }

    // 1. Evaluate dispatch safety
    console.log(`[TEST] Evaluating dispatch safety for node ${node.id} in ${node.region}...`);
    const safety = await governanceService.evaluateDispatchSafety(node.id, { id: 'test-job-gov' });
    
    if (safety.safe) {
      console.log('✅ GOVERNANCE SAFETY PASSED');
    } else {
      console.log('❌ GOVERNANCE SAFETY BLOCKED:', safety.reason);
    }

    // 2. Trigger governance snapshot
    console.log('[TEST] Taking governance snapshot...');
    await governanceService.snapshotGovernance();
    console.log('✅ SNAPSHOT RECORDED');

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
