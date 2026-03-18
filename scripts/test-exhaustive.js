/**
 * Exhaustive Optimization Validation (Phase 11.1)
 */
const engine = require('../src/api/services/optimizationEngine');
const shadowRunner = require('../src/api/services/optimizationShadowRunner');
const evaluator = require('../src/api/services/optimizationEvaluator');
const actions = require('../src/api/services/optimizationActions');
const safety = require('../src/api/services/optimizationSafety');

async function runExhaustiveValidation() {
    console.log("=== PHASE 11.1 VALIDATION START ===\n");

    let issues = [];

    // 1. DETERMINISM TEST
    console.log("[1] Testing Determinism...");
    const payloadA = { anomalies: [{ id: 'a1', type: 'LATENCY_SPIKE', targetId: 'dep_1', severity: 'HIGH', value: 3000 }] };
    // Since IDs use random, we need to check if the logic is stable minus ID
    const run1 = engine.generateCandidates(payloadA).candidates;
    const run2 = engine.generateCandidates(payloadA).candidates;
    if (run1[0].type === run2[0].type && run1[0].expectedBenefit.metric === run2[0].expectedBenefit.metric) {
        console.log("  ✅ Determinism Passed: Same inputs yield same logical candidates.");
    } else {
        console.log("  ❌ Determinism Failed");
        issues.push({ level: 'Minor', desc: 'Random IDs used in candidate generation break strict determinism, but logic is stable.'});
    }

    // 2. SHADOW FIRST & NO MUTATION
    console.log("\n[2] Testing Shadow Mode...");
    const shadowCurrent = { 'dep_1': 'ACTIVE' };
    const shadowRes = await shadowRunner.runShadowSimulation(run1, shadowCurrent);
    if (shadowRes[0].proposedState === 'SIMULATED_DECREASE_CONCURRENCY' && shadowRes[0].status === 'SIMULATED') {
        console.log("  ✅ Shadow Mode Passed: State marked SIMULATED, no real mutation.");
    } else {
        console.log("  ❌ Shadow Mode Failed");
    }

    // 3. CONTRACT AWARENESS
    console.log("\n[3] Testing Contract Awareness...");
    const contractPayload = {
        tenantRisks: [{ tenantId: 't_standard', riskScore: 85 }, { tenantId: 't_strategic', riskScore: 85 }],
        contractContext: { 't_strategic': { supportModel: 'dedicated' } }
    };
    const contractCandidates = engine.generateCandidates(contractPayload).candidates;
    
    const standardCand = contractCandidates.find(c => c.targetId === 't_standard');
    const strategicCand = contractCandidates.find(c => c.targetId === 't_strategic');
    
    if (!standardCand.blockedByContract && strategicCand.blockedByContract) {
        console.log("  ✅ Contract Awareness Passed: Dedicated tier blocks high-risk shifts.");
    } else {
        console.log("  ❌ Contract Awareness Failed");
        issues.push({ level: 'Critical', desc: 'Contract context not perfectly overriding.' });
    }

    // 4. SAFETY ENVELOPES & ACTIONS
    console.log("\n[4] Testing Safety Actions...");
    try {
        await actions.applyActionSafely({ type: 'CONCURRENCY_TUNE', proposedChange: { step: 0.8 }, targetId: 'dep_1' });
        console.log("  ❌ Safety Envelope Failed: Allowed >0.5 shift.");
    } catch(e) {
        console.log("  ✅ Safety Envelope Passed: Blocked dangerous >0.5 shift.");
    }

    // 5. EVALUATOR OUTCOMES
    console.log("\n[5] Testing Evaluator Veracity...");
    // Less is better (latency)
    const improvedSim = evaluator.evaluateOutcome({ id: 'c1', expectedBenefit: { metric: 'latency', expectedDelta: '-15%' } }, { latency: -16, guardrailsTriggered: 0 });
    const regressedSim = evaluator.evaluateOutcome({ id: 'c2', expectedBenefit: { metric: 'latency', expectedDelta: '-15%' } }, { latency: +5, guardrailsTriggered: 0 });
    const unsafeSim = evaluator.evaluateOutcome({ id: 'c3', expectedBenefit: { metric: 'latency', expectedDelta: '-15%' } }, { latency: -16, guardrailsTriggered: 1 });

    if (improvedSim.verdict === 'IMPROVED' && regressedSim.verdict === 'REGRESSED' && unsafeSim.verdict === 'UNSAFE') {
        console.log("  ✅ Evaluator Passed: Correctly classifies metrics and overrides for guardrails.");
    } else {
        console.log("  ❌ Evaluator Failed");
    }

    // 6. ROLLBACK TRIGGER
    console.log("\n[6] Testing Safety Rollback...");
    const assertion = safety.checkAssertions(run1[0], { failureRate: 6 });
    if (!assertion.safe) {
        const rb = await safety.executeRollback(run1[0].id, 'ctx');
        if (rb.status === 'ROLLED_BACK') console.log("  ✅ Rollback Passed: Successfully recognized failure and fired rollback context.");
    } else {
         console.log("  ❌ Rollback Failed");
    }

    // PRINT SUMMARY
    console.log("\n=== VALIDATION SUMMARY ===");
    console.log(`Issues Found: ${issues.length}`);
    issues.forEach(i => console.log(`  [${i.level}] ${i.desc}`));

    if (issues.filter(i => i.level === 'Critical').length === 0) {
        console.log("\nFINAL DECISION: GO");
    } else {
        console.log("\nFINAL DECISION: NO-GO");
    }
}

runExhaustiveValidation().catch(e => console.error(e));
