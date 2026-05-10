/**
 * scripts/test-synthetic-operations-twin.js
 * 
 * Validates Phase 33 Synthetic Operations Twin.
 */
const twinService = require('../src/api/services/SyntheticOperationsTwinService');
const { v4: uuidv4 } = require('uuid');

async function runTest() {
  console.log('--- PHASE 33 SYNTHETIC TWIN TEST ---');

  try {
    const simulationId = uuidv4();
    
    // 1. Capture snapshot
    console.log(`[TEST] Capturing synthetic federation snapshot for ID ${simulationId}...`);
    const snapshot = await twinService.captureSnapshot(simulationId);
    
    console.log('✅ SNAPSHOT CAPTURED');
    console.log(`Node Count: ${snapshot.nodes.length}`);
    console.log(`Queue Count: ${snapshot.queues.length}`);

    // 2. Fetch latest snapshot
    const fetched = await twinService.getLatestSnapshot(simulationId);
    if (fetched && fetched.nodes.length === snapshot.nodes.length) {
      console.log('✅ SNAPSHOT RETRIEVAL VERIFIED');
    } else {
      console.log('❌ SNAPSHOT RETRIEVAL FAILED');
    }

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
