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
const profitability = require('../services/profitabilityScoringService');
const energy = require('../services/energyOptimizationService');
const efficiency = require('../services/industrialEfficiencyService');
const balancing = require('../services/networkLoadBalancingService');
const swarm = require('../services/swarmCoordinationService');

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
                profitabilityIndex: snapshot?.global_profitability_index ?? 100,
                energyEfficiency: snapshot?.global_energy_efficiency_score ?? 100,
                timestamp: new Date().toISOString(),
                is_stale: !snapshot
            }
        });
    } catch (err) {
        console.error('[ECONOMIC-ADMIN] Health check failed:', err);
        res.status(500).json({ 
            ok: false,
            error: err.message || 'Internal Server Error',
            code: 'ECONOMIC_HEALTH_ERROR'
        });
    }
});

router.get('/network', async (req, res) => {
    try {
        const nodes = await db.query("SELECT * FROM printer_capacity_state");
        const imbalance = balancing.detectImbalance(nodes);
        res.json({
            ok: true,
            nodeCount: nodes.length,
            imbalanceIndex: imbalance,
            nodes: nodes.map(n => ({
                id: n.printer_id,
                utilization: n.utilization_percent,
                balancingPenalty: balancing.calculateBalancingPenalty(n.utilization_percent)
            }))
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'ECONOMIC_NETWORK_QUERY_ERROR' });
    }
});

router.get('/profitability', async (req, res) => {
    try {
        const dispatches = await db.query("SELECT * FROM manufacturing_dispatches WHERE status NOT IN ('CANCELED', 'FAILED') LIMIT 100");
        const highValue = dispatches.filter(d => profitability.isStrategicAllocation(d));
        res.json({
            ok: true,
            activeDispatchCount: dispatches.length,
            strategicAllocationCount: highValue.length,
            averageScore: dispatches.reduce((acc, d) => acc + profitability.calculateProfitabilityScore(d), 0) / (dispatches.length || 1)
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'ECONOMIC_PROFITABILITY_QUERY_ERROR' });
    }
});

router.get('/efficiency', async (req, res) => {
    try {
        const [stats] = await db.query("SELECT AVG(reliability_score) as avgRel, AVG(utilization_percent) as avgUtil FROM printer_reliability_metrics JOIN printer_capacity_state ON printer_reliability_metrics.printer_id = printer_capacity_state.printer_id");
        const score = efficiency.calculateEfficiency({
            reliabilityScore: stats.avgRel || 0,
            utilization: stats.avgUtil || 0
        });
        res.json({
            ok: true,
            globalEfficiencyScore: score,
            metrics: {
                avgReliability: stats.avgRel || 0,
                avgUtilization: stats.avgUtil || 0
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'ECONOMIC_EFFICIENCY_QUERY_ERROR' });
    }
});

router.get('/energy', async (req, res) => {
    try {
        const nodes = await db.query("SELECT * FROM printer_capacity_state");
        const metrics = nodes.map(n => ({
            id: n.printer_id,
            efficiency: energy.calculateEnergyEfficiency(n.utilization_percent, n.active_jobs),
            pressure: energy.isEnergyPressureDetected(n.utilization_percent)
        }));
        res.json({
            ok: true,
            avgEfficiency: metrics.reduce((acc, m) => acc + m.efficiency, 0) / (metrics.length || 1),
            pressureNodes: metrics.filter(m => m.pressure).length
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'ECONOMIC_ENERGY_QUERY_ERROR' });
    }
});

router.get('/swarm', async (req, res) => {
    try {
        const nodes = await db.query("SELECT * FROM printer_capacity_state");
        const score = swarm.calculateCoordinationScore(nodes);
        res.json({
            ok: true,
            coordinationScore: score,
            swarmSize: nodes.length,
            status: score > 70 ? 'OPTIMIZED' : 'DEGRADED'
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'ECONOMIC_SWARM_QUERY_ERROR' });
    }
});

router.get('/digital-twin', async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM economic_digital_twin_snapshots ORDER BY created_at DESC LIMIT 50");
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'ECONOMIC_TWIN_QUERY_ERROR' });
    }
});

router.post('/rebalance', async (req, res) => {
    try {
        const executed = await orch.executeGlobalRebalance();
        res.json({ ok: true, rebalanceExecuted: executed });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'ECONOMIC_REBALANCE_ERROR' });
    }
});

router.post('/recompute', async (req, res) => {
    try {
        await twin.generateEconomicSnapshot('MANUAL');
        res.json({ ok: true, message: 'Economic Digital Twin snapshot generated.' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'ECONOMIC_RECOMPUTE_ERROR' });
    }
});

module.exports = router;
