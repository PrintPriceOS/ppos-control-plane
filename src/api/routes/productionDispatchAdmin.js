/**
 * src/api/routes/productionDispatchAdmin.js
 * 
 * Protected admin routes for production dispatch execution and lifecycle management.
 */
const express = require('express');
const router = express.Router();
const orchestrationService = require('../services/ManufacturingOrchestrationService');
const scoringService = require('../services/industrialDispatchScoringService');
const executionService = require('../services/dispatch/DispatchExecutionService');
const heartbeatService = require('../services/industrialHeartbeatService');
const eligibilityService = require('../services/dispatch/NodeEligibilityService');
const slaMonitor = require('../services/dispatch/SLARiskMonitor');
const rerouteService = require('../services/dispatch/AutonomousRerouteService');
const db = require('../services/mysqlClient');
const { requireAdmin } = require('../middleware/auth');

// Intelligence Layer (Phase 29)
const reliabilityService = require('../services/intelligence/PrinterReliabilityService');
const congestionService = require('../services/intelligence/CongestionForecastService');
const federationService = require('../services/intelligence/FederationIntelligenceService');
const optimizationLoop = require('../services/intelligence/AutonomousOptimizationLoop');

// Economic Engine (Phase 30)
const economicService = require('../services/economics/IndustrialEconomicService');
const riskForecastService = require('../services/economics/EconomicRiskForecastService');
const simulatorService = require('../services/economics/DispatchEconomicSimulator');
const economicLoop = require('../services/economics/AutonomousEconomicLoop');

// Governance & Resilience (Phase 31)
const governanceService = require('../services/governance/IndustrialGovernanceService');
const cascadingService = require('../services/governance/CascadingFailureService');
const resilienceSimulator = require('../services/governance/PlanetaryResilienceSimulator');
const governanceLoop = require('../services/governance/AutonomousGovernanceLoop');

// Temporal Intelligence (Phase 32)
const temporalService = require('../services/temporal/TemporalIntelligenceService');
const simulationService = require('../services/temporal/MultiTimelineSimulationService');
const temporalRiskService = require('../services/temporal/TemporalRiskForecastService');
const temporalLoop = require('../services/temporal/AutonomousTemporalLoop');

// Reality Simulation (Phase 33)
const realitySimulation = require('../services/RealitySimulationService');
const simulationProjector = require('../services/FutureOutcomeProjectionService');
const simulationLoop = require('../services/AutonomousSimulationLoop');

// Phase 35: Industrial Telemetry (Phase 1 Live Integration)
const telemetryService = require('../services/IndustrialTelemetryService');

// Auto-start loops
if (process.env.NODE_ENV !== 'test') {
    optimizationLoop.start();
    economicLoop.start();
    governanceLoop.start();
    temporalLoop.start();
    simulationLoop.start();
}

/**
 * ==========================================
 * STATIC ENDPOINTS (Top Priority)
 * ==========================================
 */

/**
 * GET /api/admin/dispatch
 * DECOMMISSIONED: Use /api/admin/manufacturing/queue for validated production vs. seed filtered intelligence.
 * Retained temporarily as a legacy fallback.
 */
let decommissionedRouteWarned = false;

router.get('/', requireAdmin, async (req, res) => {
    if (!decommissionedRouteWarned) {
        console.warn('[DECOMMISSIONED-ROUTE] GET /api/admin/dispatch accessed. Migrate consumer to /api/admin/manufacturing/queue.');
        decommissionedRouteWarned = true;
    }
    try {
        const dispatches = await orchestrationService.getDispatches().catch(() => null);
        res.json({ 
            ok: true, 
            deprecated: true,
            canonical_replacement: '/api/admin/manufacturing/queue',
            dispatches: dispatches || [], 
            source_status: dispatches ? "ACTIVE" : "NO_DISPATCH_DATA" 
        });
    } catch (err) {
        return res.json({ 
            ok: true, 
            deprecated: true,
            dispatches: [], 
            source_status: "NO_DISPATCH_DATA" 
        });
    }
});

/**
 * GET /api/admin/dispatch/live-state
 */
router.get('/live-state', requireAdmin, async (req, res) => {
    try {
        const stats = await heartbeatService.getIndustrialTelemetryOverview().catch(err => {
            console.warn('[TELEMETRY-DEGRADED] Heartbeat service metrics unavailable:', err.message);
            return { activeNodes: 0, healthyNodes: 0, loadFactor: 0 };
        });
        res.json({ ok: true, stats });
    } catch (err) {
        res.json({ ok: true, stats: { activeNodes: 0 }, status: "NOT_CONFIGURED" });
    }
});

/**
 * GET /api/admin/dispatch/active
 */
router.get('/active', requireAdmin, async (req, res) => {
    try {
        const dispatches = await db.query(`
            SELECT d.*, n.company_name as node_name, p.status as package_status
            FROM manufacturing_dispatches d
            JOIN print_nodes n ON d.print_node_id = n.id
            JOIN production_packages p ON d.production_package_id = p.id
            WHERE d.status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'REROUTED', 'ROLLED_BACK')
            ORDER BY d.created_at DESC
        `).catch(err => {
            console.warn('[DISPATCH-DEGRADED] manufacturing_dispatches table missing or query failed:', err.message);
            return [];
        });
        res.json({ ok: true, dispatches: dispatches || [] });
    } catch (err) {
        res.json({ ok: true, dispatches: [], status: "NOT_CONFIGURED" });
    }
});

/**
 * GET /api/admin/dispatch/reroutes
 */
router.get('/reroutes', requireAdmin, async (req, res) => {
    try {
        const events = await db.query(`
            SELECT * FROM production_events 
            WHERE event_type IN ('AUTONOMOUS_REROUTE', 'SLA_DRIFT_DETECTED')
            ORDER BY created_at DESC LIMIT 50
        `).catch(err => {
            console.warn('[EVENTS-DEGRADED] production_events table missing:', err.message);
            return [];
        });
        res.json({ ok: true, events: events || [] });
    } catch (err) {
        res.json({ ok: true, events: [], status: "NOT_CONFIGURED" });
    }
});

/**
 * GET /api/admin/dispatch/sla-risks
 * DEPRECATED: Use /sla/risks
 */
router.get('/sla-risks', requireAdmin, async (req, res) => {
    try {
        const risks = await db.query(`
            SELECT f.*, d.print_node_id, n.company_name as node_name
            FROM failure_prediction_snapshots f
            JOIN manufacturing_dispatches d ON f.dispatch_id = d.id
            JOIN print_nodes n ON d.print_node_id = n.id
            WHERE f.snapshot_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            ORDER BY f.failure_probability DESC
        `).catch(() => []);
        res.json({ ok: true, risks });
    } catch (err) {
        res.json({ ok: true, risks: [] });
    }
});

/**
 * GET /api/admin/dispatch/sla/risks
 */
router.get('/sla/risks', requireAdmin, async (req, res) => {
    try {
        const slaService = require('../services/LiveSLAEvidenceService');
        const risks = await slaService.getLiveSLARisks().catch(err => {
            console.warn('[SLA-DEGRADED] Could not fetch SLA risks:', err.message);
            return [];
        });
        res.json({ ok: true, risks: risks || [] });
    } catch (err) {
        res.json({ ok: true, risks: [], status: "NOT_CONFIGURED" });
    }
});

/**
 * GET /api/admin/dispatch/sla/live
 */
router.get('/sla/live', requireAdmin, async (req, res) => {
    try {
        const slaService = require('../services/LiveSLAEvidenceService');
        await slaService.refreshSLASnapshots().catch(() => {});
        const risks = await slaService.getLiveSLARisks().catch(() => []);
        res.json({ ok: true, risks });
    } catch (err) {
        res.json({ ok: true, risks: [], status: "NOT_CONFIGURED" });
    }
});

/**
 * GET /api/admin/dispatch/capacity
 */
router.get('/capacity', requireAdmin, async (req, res) => {
    try {
        const nodes = await db.query(`
            SELECT id, company_name, status, capacity_utilization_pct, country, city, last_heartbeat_at
            FROM print_nodes
            ORDER BY capacity_utilization_pct DESC
        `).catch(() => []);
        res.json({ ok: true, nodes });
    } catch (err) {
        res.json({ ok: true, nodes: [] });
    }
});

/**
 * GET /api/admin/dispatch/telemetry/overview
 */
router.get('/telemetry/overview', requireAdmin, async (req, res) => {
    try {
        const overview = await telemetryService.getTelemetryOverview().catch(() => null);
        if (!overview || Object.keys(overview).length === 0) {
            return res.json({ 
                ok: true, 
                overview: {}, 
                metrics: {}, 
                source_status: "DISPATCH_TELEMETRY_UNAVAILABLE" 
            });
        }
        res.json({ ok: true, overview: overview?.overview || {}, metrics: overview?.metrics || {}, source_status: "ACTIVE", ...overview });
    } catch (err) {
        res.json({ 
            ok: true, 
            overview: {}, 
            metrics: {}, 
            source_status: "DISPATCH_TELEMETRY_UNAVAILABLE" 
        });
    }
});

/**
 * GET /api/admin/dispatch/telemetry/nodes
 */
router.get('/telemetry/nodes', requireAdmin, async (req, res) => {
    try {
        const nodes = await telemetryService.getNodesPerformance().catch(() => []);
        res.json({ ok: true, nodes });
    } catch (err) {
        res.json({ ok: true, nodes: [], status: "NOT_CONFIGURED" });
    }
});

/**
 * GET /api/admin/dispatch/telemetry/history
 */
router.get('/telemetry/history', requireAdmin, async (req, res) => {
    const { nodeId, limit } = req.query;
    try {
        const history = await telemetryService.getTelemetryHistory(nodeId, limit ? parseInt(limit) : 100).catch(() => []);
        res.json({ ok: true, history });
    } catch (err) {
        res.json({ ok: true, history: [] });
    }
});

/**
 * GET /api/admin/dispatch/telemetry/topology
 */
router.get('/telemetry/topology', requireAdmin, async (req, res) => {
    try {
        const federationTopology = require('../services/FederationTopologyService');
        const topology = await federationTopology.getGlobalGridState().catch(() => ({}));
        res.json({ ok: true, topology });
    } catch (err) {
        res.json({ ok: true, topology: {}, status: "NOT_CONFIGURED" });
    }
});

/**
 * GET /api/admin/dispatch/simulation/runs
 */
router.get('/simulation/runs', requireAdmin, async (req, res) => {
    try {
        const runs = await realitySimulation.getSimulationRuns().catch(() => []);
        res.json({ ok: true, runs });
    } catch (err) {
        res.json({ ok: true, runs: [] });
    }
});

/**
 * GET /api/admin/dispatch/future-projections
 */
router.get('/future-projections', requireAdmin, async (req, res) => {
    try {
        const projections = await simulationProjector.getLatestProjections().catch(() => []);
        res.json({ ok: true, projections });
    } catch (err) {
        res.json({ ok: true, projections: [] });
    }
});

/**
 * GET /api/admin/dispatch/economic-risks
 */
router.get('/economic-risks', requireAdmin, async (req, res) => {
    try {
        const risks = await riskForecastService.forecastGlobalEconomicRisks().catch(() => []);
        res.json({ ok: true, risks });
    } catch (err) {
        res.json({ ok: true, risks: [] });
    }
});

/**
 * POST /api/admin/dispatch/simulation/trigger
 */
router.post('/simulation/trigger', requireAdmin, async (req, res) => {
    try {
        const { type, config } = req.body;
        const result = await realitySimulation.runSimulation(type || 'DISPATCH_OPTIMIZATION', config || {});
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/events/recent
 */
router.get('/events/recent', requireAdmin, async (req, res) => {
    try {
        const events = await db.query('SELECT * FROM manufacturing_dispatch_events ORDER BY created_at DESC LIMIT 100').catch(() => []);
        res.json({ ok: true, events });
    } catch (err) {
        res.json({ ok: true, events: [] });
    }
});

/**
 * POST /api/admin/dispatch/assign
 */
router.post('/assign', requireAdmin, async (req, res) => {
    try {
        const { jobId, recommendation } = req.body;
        if (!jobId || !recommendation) return res.status(400).json({ ok: false, error: 'MISSING_DATA' });
        const result = await orchestrationService.assignDispatch(jobId, recommendation);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/create
 */
router.post('/create', requireAdmin, async (req, res) => {
    try {
        const { jobInput, selectedCandidate, options } = req.body;
        if (!jobInput || !selectedCandidate) return res.status(400).json({ ok: false, error: 'MISSING_DATA' });
        const result = await executionService.createManufacturingDispatch(jobInput, selectedCandidate, {
            ...options,
            operatorId: req.user?.id || 'admin'
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/heartbeat
 */
router.post('/heartbeat', requireAdmin, async (req, res) => {
    try {
        const result = await heartbeatService.processNodeHeartbeat(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/scan
 */
router.post('/scan', requireAdmin, async (req, res) => {
    try {
        const result = await slaMonitor.runGlobalSLAScan();
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/rebalance
 */
router.post('/rebalance', requireAdmin, async (req, res) => {
    try {
        const result = await rerouteService.runAutonomousRerouteLoop();
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/score
 */
router.post('/score', requireAdmin, async (req, res) => {
    try {
        const { jobInput, options } = req.body;
        if (!jobInput) return res.status(400).json({ ok: false, error: 'MISSING_JOB_INPUT' });
        const result = await scoringService.scoreDispatchCandidates(jobInput, options);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * ==========================================
 * INTELLIGENCE / ECONOMICS / GOVERNANCE
 * ==========================================
 */

router.get('/intelligence/reliability', requireAdmin, async (req, res) => {
    try {
        const ranking = await reliabilityService.listReliabilityRanking();
        res.json({ ok: true, ranking });
    } catch (err) {
        res.json({ ok: true, ranking: [] });
    }
});

router.get('/intelligence/congestion', requireAdmin, async (req, res) => {
    try {
        const forecasts = await congestionService.forecastGlobalCongestion();
        res.json({ ok: true, forecasts });
    } catch (err) {
        res.json({ ok: true, forecasts: [] });
    }
});

router.get('/intelligence/federation', requireAdmin, async (req, res) => {
    try {
        const snapshots = await federationService.snapshotFederationIntelligence();
        const loadDrift = await federationService.predictLoadDrift();
        res.json({ ok: true, snapshots, loadDrift });
    } catch (err) {
        res.json({ ok: true, snapshots: [], loadDrift: {} });
    }
});

router.get('/intelligence/optimization', requireAdmin, async (req, res) => {
    try {
        const history = await db.query('SELECT * FROM optimization_learning_snapshots ORDER BY created_at DESC LIMIT 50').catch(() => []);
        res.json({ ok: true, history });
    } catch (err) {
        res.json({ ok: true, history: [] });
    }
});

router.get('/economics/overview', requireAdmin, async (req, res) => {
    try {
        const snapshots = await db.query('SELECT * FROM economic_optimization_snapshots ORDER BY created_at DESC LIMIT 20').catch(() => []);
        res.json({ ok: true, snapshots });
    } catch (err) {
        res.json({ ok: true, snapshots: [] });
    }
});

router.get('/economics/risk', requireAdmin, async (req, res) => {
    try {
        const risks = await riskForecastService.forecastGlobalEconomicRisks().catch(() => []);
        res.json({ ok: true, risks });
    } catch (err) {
        res.json({ ok: true, risks: [] });
    }
});

router.get('/governance/overview', requireAdmin, async (req, res) => {
    try {
        const snapshots = await db.query('SELECT * FROM governance_resilience_snapshots ORDER BY snapshot_at DESC LIMIT 20').catch(() => []);
        res.json({ ok: true, snapshots });
    } catch (err) {
        res.json({ ok: true, snapshots: [] });
    }
});

router.get('/governance/systemic-risk', requireAdmin, async (req, res) => {
    try {
        const risks = await cascadingService.getActiveRisks().catch(() => []);
        res.json({ ok: true, risks });
    } catch (err) {
        res.json({ ok: true, risks: [] });
    }
});

router.get('/temporal/overview', requireAdmin, async (req, res) => {
    try {
        const snapshots = await db.query('SELECT * FROM temporal_intelligence_snapshots ORDER BY snapshot_at DESC LIMIT 20').catch(() => []);
        res.json({ ok: true, snapshots });
    } catch (err) {
        res.json({ ok: true, snapshots: [] });
    }
});

/**
 * ==========================================
 * DYNAMIC ENDPOINTS (Bottom Priority)
 * ==========================================
 */

/**
 * GET /api/admin/dispatch/:id
 */
router.get('/:id', requireAdmin, async (req, res) => {
    try {
        const detail = await orchestrationService.getDispatchDetail(req.params.id);
        if (!detail) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
        res.json({ ok: true, dispatch: detail });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/:id/timeline
 */
router.get('/:id/timeline', requireAdmin, async (req, res) => {
    try {
        const timeline = await orchestrationService.getDispatchTimeline(req.params.id);
        res.json({ ok: true, timeline });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/:id/status
 */
router.post('/:id/status', requireAdmin, async (req, res) => {
    try {
        const { status, message } = req.body;
        await orchestrationService.updateStatus(req.params.id, status, message);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/:id/reroute
 */
router.post('/:id/reroute', requireAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        const result = await orchestrationService.reroute(req.params.id, reason);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/:id/rollback
 */
router.post('/:id/rollback', requireAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        const result = await executionService.rollbackDispatch(req.params.id, req.user?.id || 'admin', reason);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/:id/evidence
 */
router.get('/:id/evidence', requireAdmin, async (req, res) => {
    try {
        const evidenceLedger = require('../services/ProductionEvidenceLedgerService');
        const evidence = await evidenceLedger.getEvidence(req.params.id);
        res.json({ ok: true, evidence });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/:id/sla-evidence
 */
router.get('/:id/sla-evidence', requireAdmin, async (req, res) => {
    try {
        const slaService = require('../services/LiveSLAEvidenceService');
        const detail = await slaService.getDispatchSLAEvidence(req.params.id);
        res.json({ ok: true, ...detail });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/node/:id
 */
router.get('/node/:id', requireAdmin, async (req, res) => {
    try {
        const [node] = await db.query('SELECT * FROM print_nodes WHERE id = ?', [req.params.id]);
        if (!node) return res.status(404).json({ ok: false, error: 'NODE_NOT_FOUND' });
        const heartbeats = await db.query('SELECT * FROM node_heartbeats WHERE node_id = ? ORDER BY heartbeat_at DESC LIMIT 20', [req.params.id]).catch(() => []);
        res.json({ ok: true, node, heartbeats });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/events/dispatch/:id
 */
router.get('/events/dispatch/:id', requireAdmin, async (req, res) => {
    try {
        const events = await db.query('SELECT * FROM manufacturing_dispatch_events WHERE dispatch_id = ? ORDER BY created_at ASC', [req.params.id]).catch(() => []);
        res.json({ ok: true, events });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/events/traces/:traceId
 */
router.get('/events/traces/:traceId', requireAdmin, async (req, res) => {
    try {
        const events = await db.query('SELECT * FROM manufacturing_dispatch_events WHERE trace_id = ? OR correlation_id = ? ORDER BY created_at ASC', [req.params.traceId, req.params.traceId]).catch(() => []);
        res.json({ ok: true, traceId: req.params.traceId, events });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
