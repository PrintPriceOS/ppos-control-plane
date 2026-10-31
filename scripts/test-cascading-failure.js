/**
 * scripts/test-cascading-failure.js
 * 
 * Validates Phase 31 Cascading Failure Detection.
 */
const cascadingService = require('../src/api/services/governance/CascadingFailureService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
  console.log('--- PHASE 31 CASCADING FAILURE TEST ---');

  try {
    // 1. Trigger systemic risk analysis
    console.log('[TEST] Analyzing systemic risk and cascading failure paths...');
    await cascadingService.analyzeSystemicRisk();
    
    // 2. Fetch active risks
    const risks = await cascadingService.getActiveRisks();
    console.log(`✅ SYSTEMIC RISKS ANALYZED (${risks.length} active)`);
    risks.forEach(r => {
      console.log(`Risk: ${r.risk_type} | Impact: ${r.systemic_impact_pct}% | Prob: ${r.probability}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('TEST CRASHED:', err.message);
    process.exit(1);
  }
}

runTest();
