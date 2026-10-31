/**
 * Optimization Admin Routes
 * Phase 11 — Autonomous Optimization Layer
 */

const express = require('express');
const router = express.Router();
const engine = require('../services/optimizationEngine');
const shadowRunner = require('../services/optimizationShadowRunner');
const evaluator = require('../services/optimizationEvaluator');
const actions = require('../services/optimizationActions');
const safety = require('../services/optimizationSafety');

// Mock state for candidates and outcomes
let mockCandidatesCache = null;
let shadowCache = null;
let outcomesCache = [];

// GET /api/admin/optimization/candidates
router.get('/candidates', async (req, res) => {
    try {
        if (!mockCandidatesCache) {
            // Generate dummy inputs representing the system state
            const payload = {
                anomalies: [{ id: 'a1', type: 'LATENCY_SPIKE', targetId: 'dep_1', severity: 'HIGH', value: 3000 }],
                insights: [{ id: 'i1', type: 'SUSTAINED_HIGH_LOAD', targetId: 'rt_us_east', successRate: 99.9, load: 500 }],
                tenantRisks: [{ tenantId: 't_enterprise_1', riskScore: 85 }],
                trends: [{ entityType: 'queue', entityId: 'q_render', trend: 'UP_FAST' }],
                contractContext: { 't_enterprise_1': { supportModel: 'dedicated' } } // This will block rebalance/shift
            };
            const result = engine.generateCandidates(payload);
            mockCandidatesCache = result.candidates;
        }
        res.json({ ok: true, candidates: mockCandidatesCache });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/admin/optimization/simulate
router.post('/simulate', async (req, res) => {
    try {
        if (!mockCandidatesCache) return res.status(400).json({ ok: false, error: 'No candidates generated yet' });
        const currentStatePayload = { 'dep_1': 'ACTIVE', 'rt_us_east': 'ACTIVE', 't_enterprise_1': 'ACTIVE', 'q_render': 'ACTIVE' };
        shadowCache = await shadowRunner.runShadowSimulation(mockCandidatesCache, currentStatePayload);
        res.json({ ok: true, shadowResults: shadowCache });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/admin/optimization/apply
router.post('/apply', async (req, res) => {
    try {
        const { candidateId } = req.body;
        if (!mockCandidatesCache) return res.status(400).json({ ok: false, error: 'No candidates' });
        
        const candidate = mockCandidatesCache.find(c => c.id === candidateId);
        if (!candidate) return res.status(404).json({ ok: false, error: 'Candidate not found' });

        const result = await actions.applyActionSafely({
             ...candidate,
             mode: 'BOUNDED_AUTO' // Mock override to allow apply
        });
        
        // Mocking an outcome evaluation
        const currentMetrics = {
            [candidate.expectedBenefit.metric]: candidate.expectedBenefit.expectedDelta.startsWith('-') ? -15 : +20,
            guardrailsTriggered: 0,
            failureRate: 2
        };
        const outcome = evaluator.evaluateOutcome(candidate, currentMetrics);
        outcomesCache.push(outcome);

        res.json({ ok: true, applied: result.applied, outcome });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/optimization/outcomes
router.get('/outcomes', async (req, res) => {
    try {
        res.json({ ok: true, outcomes: outcomesCache });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
