/**
 * scripts/test-future-outcome-projection.js
 * 
 * Validates Phase 33 Future Outcome Projection.
 */
const projector = require('../src/api/services/FutureOutcomeProjectionService');
const { v4: uuidv4 } = require('uuid');

async function runTest() {
  console.log('--- PHASE 33 FUTURE PROJECTION TEST ---');

  try {
    const simulationId = uuidv4();
    
    // 1. Generate projection
    console.log(`[TEST] Generating 72-hour synthetic projection for ID ${simulationId}...`);
    const projection = await projector.projectOutcome(simulationId, 72);
    
    console.log('✅ PROJECTION GENERATED');
    console.log(`Horizon: ${projection.horizon_hours}H`);
    console.log(`State: ${JSON.stringify(projection.projected_state)}`);

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
