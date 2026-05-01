/**
 * Learning Admin Routes
 * Phase 12 — Learning & Outcome Optimization Loop
 */

const express = require('express');
const router = express.Router();

// Import backend learning components
// Import backend learning components
let memory = null, ranker = null, adjuster = null, loop = null;
try {
    memory = require('../upstream/src/services/optimizationMemory');
    ranker = require('../upstream/src/services/strategyRanker');
    adjuster = require('../upstream/src/services/confidenceAdjuster');
    loop = require('../upstream/src/services/learningLoop');
} catch (e) {
    console.error('[CORE-ROUTING] Learning services unavailable:', e.message);
}

/**
 * GET /api/admin/learning/outcomes
 */
router.get('/outcomes', (req, res) => {
    try {
        res.json({ ok: true, outcomes: memory ? memory.dumpMemory() : [], degraded: !memory });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/learning/strategies
 */
router.get('/strategies', (req, res) => {
    try {
        const ranked = ranker ? ranker.rankStrategies({ serviceTier: 'enterprise' }) : { bestStrategies: [] };
        res.json({ ok: true, strategies: ranked.bestStrategies, degraded: !ranker });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/learning/confidence
 */
router.get('/confidence', (req, res) => {
    try {
        res.json({ ok: true, confidence: adjuster ? adjuster.getSystemConfidence() : 0, degraded: !adjuster });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
