/**
 * Phase 13 Validation Script
 * Controlled Autonomy Expansion
 */

const engine = require('../src/api/services/optimizationEngine');
const loop = require('../../ppos-preflight-service/src/services/learningLoop');
const adjuster = require('../../ppos-preflight-service/src/services/confidenceAdjuster');
const actions = require('../src/api/services/optimizationActions');
const lifecycleManager = require('../../ppos-preflight-service/src/services/strategyLifecycleManager');

async function runValidation() {
    console.log('=== PHASE 13 CONTROLLED AUTONOMY EXPANSION VALIDATION ===\n');
    let issues = [];

    console.log('[1] Seeding System Confidence to trigger Autonomy Eligibility...');
    // Seed CONCURRENCY_TUNE organically past the 75% boundary and 5 sample size
    for (let i = 0; i < 6; i++) {
        loop.ingestEvaluatorOutcome({
            candidateId: `seed_c_${i}`, type: 'CONCURRENCY_TUNE', targetType: 'deployment', targetId: 'dep_1',
            expectedBenefit: { metric: 'latency' }, verdict: 'IMPROVED', 
            metricsBefore: { latency: 500 }, metricsAfter: { latency: 200 }
        });
    }

    const confScore = adjuster.getScore('CONCURRENCY_TUNE');
    console.log(`System Confidence for CONCURRENCY_TUNE: ${(confScore * 100).toFixed(0)}%`);

    console.log('\n[2] Generating Candidates...');
    const payload = {
        anomalies: [{ id: 'a1', type: 'LATENCY_SPIKE', targetId: 'dep_1', severity: 'HIGH', value: 3000 }],
        tenantRisks: [{ tenantId: 't1', riskScore: 80 }]
    };
    
    const { candidates } = engine.generateCandidates(payload);
    
    // Validate CONCURRENCY_TUNE Promotion
    const tune = candidates.find(c => c.type === 'CONCURRENCY_TUNE');
    if (tune && tune.mode === 'BOUNDED_AUTO') {
        console.log('  ✅ CONCURRENCY_TUNE correctly promoted to BOUNDED_AUTO');
    } else {
        issues.push(`CONCURRENCY_TUNE failed to promote. Expected: BOUNDED_AUTO, Got: ${tune?.mode}`);
    }

    // Validate ROUTING_SHIFT Policy Blocking
    const shift = candidates.find(c => c.type === 'ROUTING_SHIFT');
    if (shift && shift.mode === 'SHADOW') {
        console.log('  ✅ ROUTING_SHIFT appropriately blocked from autonomy by static policy (SHADOW state)');
    } else {
        issues.push(`ROUTING_SHIFT policy leak. Expected: SHADOW, Got: ${shift?.mode}`);
    }

    console.log('\n[3] Testing Autonomous Execution Guard...');
    try {
        const tuneExec = await actions.applyActionSafely(tune);
        if (tuneExec.applied) {
            console.log('  ✅ Autonomous Action Execution passed bounds and eligibility guards');
        } else {
            issues.push(`CONCURRENCY_TUNE execution blocked: ${tuneExec.reason}`);
        }
    } catch(err) {
        issues.push(`CONCURRENCY_TUNE execution threw unhandled error: ${err.message}`);
    }

    // Test Advisory/Shadow rejection
    try {
        const shiftExec = await actions.applyActionSafely(shift);
        if (!shiftExec.applied && shiftExec.reason === 'MODE_SHADOW') {
            console.log('  ✅ Shadow execution safely halted at action layer');
        }
    } catch (e) {}

    console.log('\n[4] Simulating Emergency Demotion (UNSAFE outcome)...');
    loop.ingestEvaluatorOutcome({
        candidateId: `seed_c_emerg`, type: 'CONCURRENCY_TUNE', targetType: 'deployment', targetId: 'dep_1',
        expectedBenefit: { metric: 'latency' }, verdict: 'UNSAFE', 
        metricsBefore: { latency: 200 }, metricsAfter: { latency: 5000 }
    });
    
    const demotedConfScore = adjuster.getScore('CONCURRENCY_TUNE');
    console.log(`Confidence after UNSAFE: ${(demotedConfScore * 100).toFixed(0)}%`);
    
    const postCrashCandidates = engine.generateCandidates(payload).candidates;
    const postTune = postCrashCandidates.find(c => c.type === 'CONCURRENCY_TUNE');
    
    if (postTune && postTune.mode === 'ADVISORY') {
        console.log('  ✅ Active Strategy automatically DEMOTED following UNSAFE incident.');
    } else if (!postTune) {
        // Suppressed
        console.log('  ✅ Active Strategy automatically SUPPRESSED following UNSAFE incident.');
    } else {
        issues.push(`Strategy failed to demote gracefully. Mode is still: ${postTune.mode}`);
    }

    console.log('\n=== PHASE 13 VALIDATION SUMMARY ===');
    console.log(`Issues Found: ${issues.length}`);
    issues.forEach(i => console.log('  ❌ Error:', i));

    if (issues.length === 0) {
        console.log('\nFINAL DECISION: GO');
    } else {
        console.log('\nFINAL DECISION: NO-GO');
        process.exit(1);
    }
}

runValidation().catch(console.error);
