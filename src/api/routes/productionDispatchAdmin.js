/**
 * src/api/routes/productionDispatchAdmin.js
 * 
 * Protected admin routes for production dispatch execution and lifecycle management.
 */
const express = require('express');
const router = express.Router();
const orchestrationService = require('../services/productionOrchestrationService');
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

// Auto-start loops
if (process.env.NODE_ENV !== 'test') {
    optimizationLoop.start();
    economicLoop.start();
    governanceLoop.start();
    temporalLoop.start();
    simulationLoop.start();
}

/**
 * GET /api/admin/dispatch
 * Lists recent production dispatches.
 */
router.get('/', requireAdmin, async (req, res) => {
    try {
        const dispatches = await orchestrationService.getDispatches();
        res.json({ ok: true, dispatches });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/assign
 * Executes a production assignment from a recommendation.
 */
router.post('/assign', requireAdmin, async (req, res) => {
    try {
        const { jobId, recommendation } = req.body;
        if (!jobId || !recommendation) {
            return res.status(400).json({ ok: false, error: 'MISSING_DATA' });
        }

        const result = await orchestrationService.assignDispatch(jobId, recommendation);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/:id
 * Returns full dispatch detail including events and reservations.
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
 * POST /api/admin/dispatch/:id/status
 * Updates dispatch status.
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
 * Triggers a reroute for a dispatch.
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
 * POST /api/admin/dispatch/score
 * Simulates dispatch scoring for a hypothetical job.
 * SIMULATION ONLY.
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
 * GET /api/admin/dispatch/live-state
 * Returns aggregated live operational state of the industrial grid.
 */
router.get('/live-state', requireAdmin, async (req, res) => {
    try {
        const stats = await heartbeatService.getIndustrialTelemetryOverview();
        res.json({ ok: true, stats });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/active
 * Returns all active dispatches currently in the orchestration pipeline.
 */
router.get('/active', requireAdmin, async (req, res) => {
    try {
        const dispatches = await db.query(`
            SELECT d.*, n.company_name as node_name, p.status as package_status
            FROM production_dispatches d
            JOIN print_nodes n ON d.print_node_id = n.id
            JOIN production_packages p ON d.production_package_id = p.id
            WHERE d.status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'REROUTED', 'ROLLED_BACK')
            ORDER BY d.created_at DESC
        `);
        res.json({ ok: true, dispatches });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/sla-risks
 * Returns current failure prediction and SLA risk snapshots.
 */
router.get('/sla-risks', requireAdmin, async (req, res) => {
    try {
        const risks = await db.query(`
            SELECT f.*, d.print_node_id, n.company_name as node_name
            FROM failure_prediction_snapshots f
            JOIN production_dispatches d ON f.dispatch_id = d.id
            JOIN print_nodes n ON d.print_node_id = n.id
            WHERE f.snapshot_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            ORDER BY f.failure_probability DESC
        `);
        res.json({ ok: true, risks });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/reroutes
 * Returns historical reroute events and autonomous actions.
 */
router.get('/reroutes', requireAdmin, async (req, res) => {
    try {
        const events = await db.query(`
            SELECT * FROM production_events 
            WHERE event_type IN ('AUTONOMOUS_REROUTE', 'SLA_DRIFT_DETECTED')
            ORDER BY created_at DESC LIMIT 50
        `);
        res.json({ ok: true, events });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/capacity
 * Returns node-level capacity and utilization heatmap data.
 */
router.get('/capacity', requireAdmin, async (req, res) => {
    try {
        const nodes = await db.query(`
            SELECT id, company_name, status, capacity_utilization_pct, country, city, last_heartbeat_at
            FROM print_nodes
            ORDER BY capacity_utilization_pct DESC
        `);
        res.json({ ok: true, nodes });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/node/:id
 * Returns detailed industrial state for a specific node.
 */
router.get('/node/:id', requireAdmin, async (req, res) => {
    try {
        const [node] = await db.query('SELECT * FROM print_nodes WHERE id = ?', [req.params.id]);
        if (!node) return res.status(404).json({ ok: false, error: 'NODE_NOT_FOUND' });
        
        const heartbeats = await db.query('SELECT * FROM node_heartbeats WHERE node_id = ? ORDER BY heartbeat_at DESC LIMIT 20', [req.params.id]);
        const dispatches = await db.query('SELECT * FROM production_dispatches WHERE print_node_id = ? ORDER BY created_at DESC LIMIT 10', [req.params.id]);
        
        res.json({ ok: true, node, heartbeats, dispatches });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/scan
 * Manually triggers an industrial SLA scan.
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
 * Manually triggers autonomous rerouting engine.
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
 * POST /api/admin/dispatch/create
 * Executes a real industrial dispatch.
 */
router.post('/create', requireAdmin, async (req, res) => {
    try {
        const { jobInput, selectedCandidate, options } = req.body;
        if (!jobInput || !selectedCandidate) {
            return res.status(400).json({ ok: false, error: 'MISSING_DATA' });
        }

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
 * POST /api/admin/dispatch/:id/rollback
 * Rolls back an active dispatch and releases capacity.
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
 * POST /api/admin/dispatch/heartbeat
 * Ingests real-time node heartbeat.
 * In a real production scenario, this might use a node-specific API key.
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
 * GET /api/admin/dispatch/telemetry
 * Returns global industrial telemetry overview.
 */
router.get('/telemetry/overview', requireAdmin, async (req, res) => {
    try {
        const telemetry = await heartbeatService.getIndustrialTelemetryOverview();
        res.json({ ok: true, telemetry });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/reliability
 * Returns dynamic printer reliability ranking.
 */
router.get('/intelligence/reliability', requireAdmin, async (req, res) => {
    try {
        const ranking = await reliabilityService.listReliabilityRanking();
        res.json({ ok: true, ranking });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/congestion
 * Returns predictive congestion forecasts.
 */
router.get('/intelligence/congestion', requireAdmin, async (req, res) => {
    try {
        const forecasts = await congestionService.forecastGlobalCongestion();
        res.json({ ok: true, forecasts });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/federation
 * Returns federation resilience and health snapshots.
 */
router.get('/intelligence/federation', requireAdmin, async (req, res) => {
    try {
        const snapshots = await federationService.snapshotFederationIntelligence();
        const loadDrift = await federationService.predictLoadDrift();
        res.json({ ok: true, snapshots, loadDrift });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/optimization
 * Returns autonomous optimization history.
 */
router.get('/intelligence/optimization', requireAdmin, async (req, res) => {
    try {
        const history = await db.query('SELECT * FROM optimization_learning_snapshots ORDER BY created_at DESC LIMIT 50');
        const cycles = await db.query('SELECT * FROM industrial_learning_cycles ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, history, cycles });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/intelligence/predictions
 * Returns high-fidelity manufacturing predictions.
 */
router.get('/intelligence/predictions', requireAdmin, async (req, res) => {
    try {
        const predictions = await db.query('SELECT * FROM failure_prediction_snapshots ORDER BY snapshot_at DESC LIMIT 50');
        res.json({ ok: true, predictions });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/economics/overview
 * Returns global industrial economic overview.
 */
router.get('/economics/overview', requireAdmin, async (req, res) => {
    try {
        const snapshots = await db.query('SELECT * FROM economic_optimization_snapshots ORDER BY created_at DESC LIMIT 20');
        res.json({ ok: true, snapshots });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/economics/risk
 * Returns predictive economic risk forecasts.
 */
router.get('/economics/risk', requireAdmin, async (req, res) => {
    try {
        const risks = await riskForecastService.forecastGlobalEconomicRisks();
        res.json({ ok: true, risks });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/economics/profitability
 * Returns historical profitability data.
 */
router.get('/economics/profitability', requireAdmin, async (req, res) => {
    try {
        const history = await db.query('SELECT * FROM industrial_profitability_history ORDER BY recorded_at DESC LIMIT 50');
        res.json({ ok: true, history });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/economics/simulator
 * Simulates economic routing for a job.
 */
router.post('/economics/simulator', requireAdmin, async (req, res) => {
    try {
        const { jobData, candidateIds } = req.body;
        const simulation = await simulatorService.simulateDispatchEconomic(jobData, candidateIds);
        res.json({ ok: true, simulation });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/economics/node/:id
 * Returns detailed economic state for a specific node.
 */
router.get('/economics/node/:id', requireAdmin, async (req, res) => {
    try {
        const profitability = await economicService.calculateNodeProfitability(req.params.id);
        const pressure = await db.query('SELECT * FROM economic_pressure_snapshots WHERE node_id = ? ORDER BY snapshot_at DESC LIMIT 10', [req.params.id]);
        res.json({ ok: true, profitability, pressure });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/governance/overview
 * Returns global governance overview.
 */
router.get('/governance/overview', requireAdmin, async (req, res) => {
    try {
        const snapshots = await db.query('SELECT * FROM governance_resilience_snapshots ORDER BY snapshot_at DESC LIMIT 20');
        res.json({ ok: true, snapshots });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/governance/resilience
 * Returns regional survivability forecasts.
 */
router.get('/governance/resilience', requireAdmin, async (req, res) => {
    try {
        const resilience = await db.query('SELECT * FROM regional_survivability_forecasts ORDER BY forecast_at DESC LIMIT 50');
        res.json({ ok: true, resilience });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/governance/systemic-risk
 * Returns cascading failure and systemic risk forecasts.
 */
router.get('/governance/systemic-risk', requireAdmin, async (req, res) => {
    try {
        const risks = await cascadingService.getActiveRisks();
        const cascading = await db.query('SELECT * FROM cascading_failure_snapshots ORDER BY snapshot_at DESC LIMIT 20');
        res.json({ ok: true, risks, cascading });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/governance/simulation
 * Runs a planetary resilience stress test simulation.
 */
router.get('/governance/simulation', requireAdmin, async (req, res) => {
    try {
        const simulation = await resilienceSimulator.runPlanetaryStressTest();
        res.json({ ok: true, simulation });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/temporal/overview
 * Returns global temporal overview.
 */
router.get('/temporal/overview', requireAdmin, async (req, res) => {
    try {
        const snapshots = await db.query('SELECT * FROM temporal_intelligence_snapshots ORDER BY snapshot_at DESC LIMIT 20');
        res.json({ ok: true, snapshots });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/temporal/futures
 * Returns future-state forecasts.
 */
router.get('/temporal/futures', requireAdmin, async (req, res) => {
    try {
        const forecasts = await db.query('SELECT * FROM future_state_forecasts ORDER BY forecast_at DESC LIMIT 50');
        res.json({ ok: true, forecasts });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/temporal/timelines
 * Returns parallel timeline simulations.
 */
router.get('/temporal/timelines', requireAdmin, async (req, res) => {
    try {
        const timelines = await simulationService.simulateParallelTimelines();
        res.json({ ok: true, timelines });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/temporal/risk
 * Returns temporal risk forecasts.
 */
router.get('/temporal/risk', requireAdmin, async (req, res) => {
    try {
        const risks = await temporalRiskService.getImminentRisks();
        res.json({ ok: true, risks });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/simulation/overview
 * Returns global simulation overview.
 */
router.get('/dispatch/simulation/overview', requireAdmin, async (req, res) => {
    try {
        const snapshots = await db.query('SELECT * FROM synthetic_operations_snapshots ORDER BY created_at DESC LIMIT 20');
        res.json({ ok: true, snapshots });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/dispatch/simulation/run
 * Runs a manual reality simulation.
 */
router.post('/dispatch/simulation/run', requireAdmin, async (req, res) => {
    try {
        const { type, config } = req.body;
        const result = await realitySimulation.runSimulation(type || 'MANUAL_TEST', config || {});
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/simulation/runs
 * Returns history of reality simulation runs.
 */
router.get('/dispatch/simulation/runs', requireAdmin, async (req, res) => {
    try {
        const runs = await realitySimulation.getSimulationRuns();
        res.json({ ok: true, runs });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/simulation/recommendations
 * Returns autonomous simulation recommendations.
 */
router.get('/dispatch/simulation/recommendations', requireAdmin, async (req, res) => {
    try {
        const recommendations = await db.query('SELECT * FROM autonomous_simulation_recommendations ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, recommendations });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/simulation/future-projections
 * Returns future projections derived from simulations.
 */
router.get('/dispatch/simulation/future-projections', requireAdmin, async (req, res) => {
    try {
        const projections = await simulationProjector.getLatestProjections();
        res.json({ ok: true, projections });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/:id/evidence
 * Returns all evidence ledger entries for a specific dispatch.
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
 * GET /api/admin/dispatch/:id/evidence/verify
 * Verifies the integrity of the evidence chain for a specific dispatch.
 */
router.get('/:id/evidence/verify', requireAdmin, async (req, res) => {
    try {
        const evidenceLedger = require('../services/ProductionEvidenceLedgerService');
        const verification = await evidenceLedger.verifyChain(req.params.id);
        res.json(verification);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/sla/live
 * Triggers a refresh and returns live SLA state.
 */
router.get('/sla/live', requireAdmin, async (req, res) => {
    try {
        const slaService = require('../services/LiveSLAEvidenceService');
        await slaService.refreshSLASnapshots();
        const risks = await slaService.getLiveSLARisks();
        res.json({ ok: true, risks });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/sla/risks
 * Returns current evidence-backed SLA risks.
 */
router.get('/sla/risks', requireAdmin, async (req, res) => {
    try {
        const slaService = require('../services/LiveSLAEvidenceService');
        const risks = await slaService.getLiveSLARisks();
        res.json({ ok: true, risks });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/dispatch/:id/sla-evidence
 * Returns detailed SLA evidence for a specific dispatch.
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

module.exports = router;
