/**
 * scripts/test-future-governance.js
 * 
 * Validates Phase 32 Future-State Governance.
 */
const governanceService = require('../src/api/services/temporal/FutureGovernanceService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 32 FUTURE GOVERNANCE TEST ---');

  try {
    // 1. Snapshot future governance
    console.log('[TEST] Evaluating policy evolution trajectories...');
    const projections = await governanceService.snapshotFutureGovernance();
    
    console.log(`✅ GOVERNANCE PROJECTIONS RECORDED (${projections.length})`);
    projections.forEach(p => {
      console.log(`Policy: ${p.id} | Survivability: ${p.score} | Evolution: ${p.evolution}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
