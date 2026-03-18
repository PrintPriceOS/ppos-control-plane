/**
 * Learning Admin Routes
 * Phase 12 — Learning & Outcome Optimization Loop
 */

const express = require('express');
const router = express.Router();

// Import backend learning components
let memory, ranker, adjuster, loop;
try {
    memory = require('../../../../../ppos-preflight-service/src/services/optimizationMemory');
    ranker = require('../../../../../ppos-preflight-service/src/services/strategyRanker');
    adjuster = require('../../../../../ppos-preflight-service/src/services/confidenceAdjuster');
    loop = require('../../../../../ppos-preflight-service/src/services/learningLoop');
} catch (e) {
    console.warn('[DEGRADED-MODE] Learning Admin routes using sharedMocks:', e.message);
    const mocks = require('../services/sharedMocks');
    mocks.markUsed();
    memory = mocks.optimizationMemory;
    ranker = mocks.strategyRanker;
    adjuster = mocks.confidenceAdjuster;
    loop = mocks.learningLoop;
}

// Mock data injection to seed UI if empty for demonstration
if (memory.dumpMemory().length === 0) {
    loop.ingestEvaluatorOutcome({
        candidateId: 'mock_c1', type: 'CONCURRENCY_TUNE', targetType: 'deployment', targetId: 'dep_eu',
        expectedBenefit: { metric: 'latency' }, actualOutcome: null, verdict: 'IMPROVED',
        metricsBefore: { latency: 300 }, metricsAfter: { latency: 150 }, timestamp: new Date().toISOString(),
        contractContext: { serviceTier: 'enterprise' }
    });
    loop.ingestEvaluatorOutcome({
        candidateId: 'mock_c2', type: 'ROUTING_SHIFT', targetType: 'tenant', targetId: 't_enterprise',
        expectedBenefit: { metric: 'errorRate' }, actualOutcome: null, verdict: 'UNSAFE',
        metricsBefore: { errorRate: 2 }, metricsAfter: { errorRate: 6 }, timestamp: new Date().toISOString(),
        contractContext: { serviceTier: 'enterprise' }
    });
}

/**
 * GET /api/admin/learning/outcomes
 */
router.get('/outcomes', (req, res) => {
    try {
        res.json({ ok: true, outcomes: memory.dumpMemory() });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/learning/strategies
 */
router.get('/strategies', (req, res) => {
    try {
        const ranked = ranker.rankStrategies({ serviceTier: 'enterprise' });
        res.json({ ok: true, strategies: ranked.bestStrategies });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/learning/confidence
 */
router.get('/confidence', (req, res) => {
    try {
        res.json({ ok: true, confidence: adjuster.getSystemConfidence() });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
