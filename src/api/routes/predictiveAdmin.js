/**
 * src/api/routes/predictiveAdmin.js
 * 
 * Routes for Phase 13 — Predictive Industrial Constraints.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const materialService = require('../services/materialAvailabilityService');
const bottleneckService = require('../services/predictiveBottleneckService');
const riskScoringService = require('../services/riskScoringService');

/**
 * GET /api/admin/predictive/health
 */
router.get('/health', async (req, res) => {
    try {
        const [dispatches] = await db.query("SELECT COUNT(*) as count FROM manufacturing_dispatches");
        const [riskStats] = await db.query(`
            SELECT 
                AVG(risk_score) as avgScore,
                COUNT(CASE WHEN risk_level = 'CRITICAL' THEN 1 END) as criticalCount,
                COUNT(CASE WHEN risk_level = 'HIGH' THEN 1 END) as highCount
            FROM predictive_dispatch_risk
        `);

        res.json({
            ok: true,
            health: {
                state: "PREDICTIVE_ACTIVE",
                materialShortages: 0, // Simplified for health check
                predictedBottlenecks: 0, // Simplified for health check
                highRiskDispatches: (riskStats[0]?.criticalCount || 0) + (riskStats[0]?.highCount || 0),
                avgRiskScore: parseFloat(riskStats[0]?.avgScore || 0).toFixed(2),
                futureSlaBreaches: 0,
                rerouteProbability: 0.15,
                timestamp: new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/predictive/bottlenecks
 */
router.get('/bottlenecks', async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM predictive_capacity_forecasts ORDER BY created_at DESC LIMIT 50");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/predictive/materials
 */
router.get('/materials', async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM predictive_material_inventory");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/predictive/risk
 */
router.get('/risk', async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM predictive_dispatch_risk ORDER BY risk_score DESC LIMIT 100");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/predictive/recompute
 */
router.post('/recompute', async (req, res) => {
    try {
        const dispatches = await db.query("SELECT id FROM manufacturing_dispatches WHERE status NOT IN ('DELIVERED', 'CANCELED', 'FAILED')");
        for (const d of dispatches) {
            await riskScoringService.calculateDispatchRisk(d.id);
        }
        res.json({ ok: true, recomputed: dispatches.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
