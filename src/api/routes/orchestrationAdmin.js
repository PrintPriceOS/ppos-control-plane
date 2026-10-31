/**
 * Orchestration Admin Router
 * 
 * API endpoints for managing distributed industrial execution,
 * incidents, and artifact lifecycles.
 */
const express = require('express');
const router = express.Router();
const orchestration = require('../services/orchestrationService');
const telemetry = require('../services/telemetryService');
const lifecycle = require('../services/artifactLifecycleManager');
const incidentService = require('../services/incidentService');

/**
 * POST /api/admin/orchestration/analyze
 * Manually trigger a full fleet health analysis.
 */
router.post('/analyze', async (req, res) => {
    try {
        const result = await telemetry.analyzeOperationalHealth();
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/orchestration/lifecycle/process
 * Manually trigger artifact tiering and retention processing.
 */
router.post('/lifecycle/process', async (req, res) => {
    try {
        const results = await lifecycle.processLifecycleTransitions();
        res.json({ ok: true, results });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/orchestration/incidents
 * Manually raise an incident (for testing or human-detected issues).
 */
router.post('/incidents', async (req, res) => {
    try {
        const result = await incidentService.raiseIncident(req.body);
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
