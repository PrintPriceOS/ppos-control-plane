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
                highRiskDispatches: (Number(riskStats?.criticalCount || 0)) + (Number(riskStats?.highCount || 0)),
                avgRiskScore: parseFloat(riskStats?.avgScore || 0).toFixed(2),
                timestamp: new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'PREDICTIVE_HEALTH_ERROR' });
    }
});

router.get('/bottlenecks', async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM predictive_capacity_forecasts ORDER BY created_at DESC LIMIT 50");
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'PREDICTIVE_BOTTLENECK_QUERY_ERROR' });
    }
});

router.get('/materials', async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM predictive_material_inventory");
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'PREDICTIVE_MATERIAL_QUERY_ERROR' });
    }
});

router.get('/risk', async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM predictive_dispatch_risk ORDER BY risk_score DESC LIMIT 100");
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'PREDICTIVE_RISK_QUERY_ERROR' });
    }
});

router.post('/recompute', async (req, res) => {
    try {
        const dispatches = await db.query("SELECT id FROM manufacturing_dispatches WHERE status NOT IN ('DELIVERED', 'CANCELED', 'FAILED')");
        for (const d of dispatches) {
            await riskScoringService.calculateDispatchRisk(d.id);
        }
        res.json({ ok: true, recomputed: dispatches.length });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'PREDICTIVE_RECOMPUTE_ERROR' });
    }
});

module.exports = router;
