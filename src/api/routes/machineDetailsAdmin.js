/**
 * Machine Details Admin Routes
 * 
 * Provides forensic operational intelligence for the Machine Detail Drawer.
 * Phase 34 - Live Federation Activation.
 */
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');

const telemetryService = require('../services/machineTelemetryService');
const capabilityService = require('../services/machineCapabilityService');
const pressureService = require('../services/machinePressureService');
const db = require('../services/mysqlClient');

router.use(requireAdmin);

/**
 * GET /api/admin/federation/machines/:id
 * Canonical machine metadata
 */
router.get('/federation/machines/:id', async (req, res) => {
    try {
        const details = await telemetryService.getMachineDetails(req.params.id);
        res.json({ ok: true, data: details.header });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/telemetry/machines/:id
 * Live operational telemetry
 */
router.get('/telemetry/machines/:id', async (req, res) => {
    try {
        const details = await telemetryService.getMachineDetails(req.params.id);
        res.json({ ok: true, data: details.telemetry });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/machines/:id
 * Recent dispatches and throughput
 */
router.get('/dispatch/machines/:id', async (req, res) => {
    try {
        const details = await telemetryService.getMachineDetails(req.params.id);
        res.json({ ok: true, data: details.history });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/capacity/machines/:id
 * Capacity pressure and capabilities
 */
router.get('/capacity/machines/:id', async (req, res) => {
    try {
        const [pressure, capabilities] = await Promise.all([
            pressureService.getPressureAnalysis(req.params.id),
            capabilityService.getCapabilities(req.params.id)
        ]);
        res.json({ ok: true, data: { pressure, capabilities } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
