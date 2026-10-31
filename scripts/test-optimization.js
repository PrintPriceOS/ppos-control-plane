/**
 * Optimization Layer Validation Script
 * Phase 11
 */

const engine = require('../src/api/services/optimizationEngine');
const shadowRunner = require('../src/api/services/optimizationShadowRunner');
const evaluator = require('../src/api/services/optimizationEvaluator');
const actions = require('../src/api/services/optimizationActions');
const safety = require('../src/api/services/optimizationSafety');

async function runValidation() {
    console.log('--- Phase 11 Optimization Layer Validation ---\n');

    const mockPayload = {
        anomalies: [
            { id: 'a1', type: 'LATENCY_SPIKE', targetId: 'dep_eu_west', severity: 'HIGH', value: 3500 }
        ],
        insights: [
            { id: 'i1', type: 'SUSTAINED_HIGH_LOAD', targetId: 'rt_us_east', successRate: 99.9, load: 800 }
        ],
        tenantRisks: [
            { tenantId: 't_enterprise_1', riskScore: 82 }
        ],
        trends: [
            { entityType: 'queue', entityId: 'q_render', trend: 'UP_FAST' }
        ],
        contractContext: {
            't_enterprise_1': { supportModel: 'dedicated' }
        }
    };

    console.log('[1] Generating Candidates...');
    const generateResult = engine.generateCandidates(mockPayload);
    console.log(`Generated ${generateResult.candidates.length} candidates.\n`);

    console.log('[2] Running Shadow Simulation...');
    const shadowCurrentState = {
        'dep_eu_west': 'ACTIVE',
        'rt_us_east': 'ACTIVE',
        't_enterprise_1': 'ACTIVE',
        'q_render': 'ACTIVE'
    };
    
    const shadowResults = await shadowRunner.runShadowSimulation(generateResult.candidates, shadowCurrentState);
    console.log(`Simulated ${shadowResults.length} candidates.`);
    shadowResults.forEach(r => console.log(`  -> ${r.candidateId} [${r.status}]: ${r.proposedState}`));
    console.log();

    console.log('[3] Applying Safe Action (BOUNDED_AUTO override)...');
    let appliedCount = 0;
    for (const raw of generateResult.candidates) {
        // Enforce mode for test
        const candidateToApply = { ...raw, mode: 'BOUNDED_AUTO' };
        
        try {
            const res = await actions.applyActionSafely(candidateToApply);
            if (res.applied) appliedCount++;
        } catch (err) {
            console.log(`  -> Blocked applying ${candidateToApply.type}: ${err.message}`);
        }
    }
    console.log(`Applied ${appliedCount} test actions.\n`);

    console.log('[4] Evaluating Outcomes...');
    // We will evaluate the 't_enterprise_1' routing shift candidate, even if blocked by contract in shadow mode
    const routingCandidate = generateResult.candidates.find(c => c.type === 'ROUTING_SHIFT');
    
    if (routingCandidate) {
        const fakeMetricsRegressed = { failure_rate: 5.0, guardrailsTriggered: 1 };
        const outcomeUnsafe = evaluator.evaluateOutcome(routingCandidate, fakeMetricsRegressed);
        console.log(`Outcome Simulation (Regressed): Verdict=${outcomeUnsafe.verdict}, Match Expectation=${outcomeUnsafe.matchedExpectation}`);

        const fakeMetricsImproved = { failure_rate: -35.0, guardrailsTriggered: 0 };
        const outcomeImproved = evaluator.evaluateOutcome(routingCandidate, fakeMetricsImproved);
        console.log(`Outcome Simulation (Improved):  Verdict=${outcomeImproved.verdict}, Match Expectation=${outcomeImproved.matchedExpectation}`);
        
        console.log('\n[5] Safety Assertion & Rollback Test...');
        const assertion = safety.checkAssertions(routingCandidate, fakeMetricsRegressed);
        console.log(`Assertions Check Safe? ${assertion.safe}`);
        if (!assertion.safe) {
            console.log(`Failures: ${assertion.failures.join(', ')}`);
            const rb = await safety.executeRollback(routingCandidate.id, `restore_${routingCandidate.id}`);
            console.log(`Rollback Status: ${rb.status}`);
        }

    }

    console.log('\n--- Validation Complete ---');
}

runValidation().catch(err => {
    console.error('Validation failed:', err);
    process.exit(1);
});
