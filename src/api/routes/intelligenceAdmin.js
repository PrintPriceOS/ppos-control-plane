/**
 * Intelligence Admin Routes
 * Phase 10 — Batch C (Autonomous Guardrails)
 */

const express = require('express');
const router = express.Router();
const intelligenceEngine = require('../services/intelligenceEngine');
const guardrailSafety = require('../services/guardrailSafety');
const circuitBreaker = require('../services/circuitBreaker');

/**
 * GET /api/admin/intelligence/overview
 */
router.get('/overview', async (req, res) => {
    try {
        const pkg = await intelligenceEngine.getIntelligencePackage();
        res.json({
            ok: true,
            summary: pkg.summary,
            cbStatus: pkg.cbStatus,
            guardrailDecisions: pkg.guardrailDecisions,
            timestamp: pkg.timestamp
        });
    } catch (err) {
        console.error('[INTEL-API] Error fetching overview:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ... (existing anomalies, insights, recommendations routes)

/**
 * GET /api/admin/intelligence/risk/tenants
 */
router.get('/risk/tenants', async (req, res) => {
    try {
        const pkg = await intelligenceEngine.getIntelligencePackage();
        res.json({
            ok: true,
            tenantRisks: pkg.tenantRisks
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/risk/deployments
 */
router.get('/risk/deployments', async (req, res) => {
    try {
        const pkg = await intelligenceEngine.getIntelligencePackage();
        res.json({
            ok: true,
            deploymentRisks: pkg.deploymentRisks
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/trends
 */
router.get('/trends', async (req, res) => {
    try {
        const pkg = await intelligenceEngine.getIntelligencePackage();
        res.json({
            ok: true,
            trends: pkg.trends
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/guardrails/safety
 */
router.get('/guardrails/safety', async (req, res) => {
    try {
        const state = await guardrailSafety.getSafetyState();
        res.json({ ok: true, data: state });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/intelligence/guardrails/toggle
 */
router.post('/guardrails/toggle', async (req, res) => {
    try {
        const { flag, value, reason } = req.body;
        const state = await guardrailSafety.toggleFlag(flag, value, reason);
        res.json({ ok: true, data: state });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/circuit-breaker
 */
router.get('/circuit-breaker', async (req, res) => {
    try {
        const status = await circuitBreaker.getStatus();
        res.json({ ok: true, data: status });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/intelligence/circuit-breaker/reset
 */
router.post('/circuit-breaker/reset', async (req, res) => {
    try {
        const status = await circuitBreaker.manualReset();
        res.json({ ok: true, data: status });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/anomalies/:id
 */
router.get('/anomalies/:id', async (req, res) => {
    try {
        const pkg = await intelligenceEngine.getIntelligencePackage();
        const anomaly = pkg.anomalies.find(a => a.id === req.params.id);
        if (!anomaly) return res.status(404).json({ ok: false, error: 'Not found' });
        res.json({ ok: true, anomaly });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/insights/:id
 */
router.get('/insights/:id', async (req, res) => {
    try {
        const pkg = await intelligenceEngine.getIntelligencePackage();
        const insight = pkg.insights.find(i => i.id === req.params.id);
        if (!insight) return res.status(404).json({ ok: false, error: 'Not found' });
        res.json({ ok: true, insight });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/recommendations/:id
 */
router.get('/recommendations/:id', async (req, res) => {
    try {
        const pkg = await intelligenceEngine.getIntelligencePackage();
        const rec = pkg.recommendations.find(r => r.id === req.params.id);
        if (!rec) return res.status(404).json({ ok: false, error: 'Not found' });
        res.json({ ok: true, recommendation: rec });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
