/**
 * Phase 12 Validation Script
 * Learning & Outcome Optimization Loop
 */

const engine = require('../src/api/services/optimizationEngine');
const loop = require('../../ppos-preflight-service/src/services/learningLoop');
const memory = require('../../ppos-preflight-service/src/services/optimizationMemory');
const ranker = require('../../ppos-preflight-service/src/services/strategyRanker');
const adjuster = require('../../ppos-preflight-service/src/services/confidenceAdjuster');

async function runValidation() {
    console.log('=== PHASE 12 LEARNING LOOP VALIDATION ===\n');

    let issues = [];

    console.log('[1] Seeding Initial State...');
    const payload = {
        anomalies: [{ id: 'a1', type: 'LATENCY_SPIKE', targetId: 'dep_1', severity: 'HIGH', value: 3000 }],
        insights: [{ id: 'i1', type: 'SUSTAINED_HIGH_LOAD', targetId: 'rt_1', successRate: 99.9, load: 800 }],
        tenantRisks: [],
        trends: [],
        contractContext: { 'dep_1': { serviceTier: 'standard' } }
    };

    const initialCandidates = engine.generateCandidates(payload).candidates;
    console.log(`Generated ${initialCandidates.length} initial candidates. System Default Confidence: 50%`);
    
    // Simulate outcomes for CONCURRENCY_TUNE
    console.log('\n[2] Feeding "IMPROVED" outcomes to CONCURRENCY_TUNE...');
    for (let i = 0; i < 5; i++) {
        loop.ingestEvaluatorOutcome({
            candidateId: `c_tune_${i}`, type: 'CONCURRENCY_TUNE', targetType: 'deployment', targetId: 'dep_1',
            expectedBenefit: { metric: 'latency' }, verdict: 'IMPROVED', 
            metricsBefore: { latency: 500 }, metricsAfter: { latency: 200 },
            contractContext: { serviceTier: 'standard' }
        });
    }

    // Simulate outcomes for ROUTING_SHIFT
    console.log('\n[3] Feeding "UNSAFE/REGRESSED" outcomes to ROUTING_SHIFT...');
    for (let i = 0; i < 3; i++) {
        loop.ingestEvaluatorOutcome({
            candidateId: `c_shift_${i}`, type: 'ROUTING_SHIFT', targetType: 'route', targetId: 'rt_1',
            expectedBenefit: { metric: 'latency' }, verdict: 'UNSAFE', 
            metricsBefore: { latency: 500 }, metricsAfter: { latency: 500 },
            contractContext: { serviceTier: 'standard' }
        });
    }

    console.log('\n[4] Verifying Memory and Ranker...');
    const recorded = memory.dumpMemory().length;
    if (recorded >= 8) console.log(`  ✅ Memory Persistence Passed (${recorded} records)`);
    else issues.push('Memory persistence failed to store all outcomes.');

    const rankings = ranker.rankStrategies({ serviceTier: 'standard' }).bestStrategies;
    console.log('  Rankings:', rankings);
    if (rankings[0].type === 'CONCURRENCY_TUNE' && rankings.find(r => r.type === 'ROUTING_SHIFT').successRate === 0) {
        console.log('  ✅ Strategy Ranker Passed (Accurately ranked and penalized strategies)');
    } else {
        issues.push('Strategy ranker failed to correctly penalize the unsafe strategy.');
    }

    console.log('\n[5] Verifying Confidence Evolution...');
    const confShift = adjuster.getScore('ROUTING_SHIFT');
    const confTune = adjuster.getScore('CONCURRENCY_TUNE');
    console.log(`  CONCURRENCY_TUNE Confidence: ${(confTune * 100).toFixed(0)}%`);
    console.log(`  ROUTING_SHIFT Confidence: ${(confShift * 100).toFixed(0)}%`);
    
    if (confTune > 0.5 && confShift < 0.3) {
        console.log('  ✅ Confidence Adjuster Passed (Organically evolved bounds)');
    } else {
        issues.push('Confidence adjuster failed to break bounds.');
    }

    console.log('\n[6] Verifying Adaptive Optimization Suppression...');
    const finalCandidates = engine.generateCandidates(payload).candidates;
    const hasShift = finalCandidates.find(c => c.type === 'ROUTING_SHIFT');
    const hasTune = finalCandidates.find(c => c.type === 'CONCURRENCY_TUNE');

    if (hasTune && !hasShift) {
        console.log('  ✅ Engine Suppression Passed (ROUTING_SHIFT was suppressed due to low confidence)');
    } else {
        issues.push('Engine failed to suppress low-confidence candidate.');
    }

    console.log('\n=== VALIDATION SUMMARY ===');
    console.log(`Issues Found: ${issues.length}`);
    issues.forEach(i => console.log('  ❌ Error:', i));

    if (issues.length === 0) {
        console.log('\nFINAL DECISION: GO');
    } else {
        console.log('\nFINAL DECISION: NO-GO');
    }
}

runValidation().catch(err => console.error(err));
