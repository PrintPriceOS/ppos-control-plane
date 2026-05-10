/**
 * src/api/routes/economicAdmin.js
 * 
 * Routes for Phase 15 — Autonomous Economic Optimization.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const orch = require('../services/globalOrchestrationService');
const twin = require('../services/economicDigitalTwinService');

/**
 * GET /api/admin/economic/health
 */
router.get('/health', async (req, res) => {
    try {
        const snapshot = await twin.getLatestEconomicSnapshot();
        res.json({
            ok: true,
            health: {
                state: "ECONOMIC_OPTIMIZATION_ACTIVE",
                profitabilityIndex: snapshot?.global_profitability_index || 100,
                energyEfficiency: snapshot?.global_energy_efficiency_score || 100,
                timestamp: new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/economic/digital-twin
 */
router.get('/digital-twin', async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM economic_digital_twin_snapshots ORDER BY created_at DESC LIMIT 50");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/economic/rebalance
 */
router.post('/rebalance', async (req, res) => {
    try {
        const executed = await orch.executeGlobalRebalance();
        res.json({ ok: true, rebalanceExecuted: executed });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/economic/recompute
 */
router.post('/recompute', async (req, res) => {
    try {
        await twin.generateEconomicSnapshot('MANUAL');
        res.json({ ok: true, message: 'Economic Digital Twin snapshot generated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
