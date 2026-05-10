/**
 * scripts/test-simulation-outcome-evaluator.js
 * 
 * Validates Phase 33 Simulation Outcome Evaluator.
 */
const evaluator = require('../src/api/services/SimulationOutcomeEvaluator');
const { v4: uuidv4 } = require('uuid');

async function runTest() {
  console.log('--- PHASE 33 OUTCOME EVALUATOR TEST ---');

  try {
    const simulationId = uuidv4();
    const outcome = {
      survivability_delta: 0.08,
      economic_impact_pct: -0.01,
      governance_delta: 0.05
    };

    // 1. Evaluate outcome
    console.log(`[TEST] Evaluating synthetic outcome for ID ${simulationId}...`);
    const result = await evaluator.evaluateOutcome(simulationId, outcome);
    
    console.log('✅ EVALUATION COMPLETE');
    console.log(`Recommendation: ${result.recommendation.action}`);
    console.log(`Confidence: ${result.recommendation.confidence}`);

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
