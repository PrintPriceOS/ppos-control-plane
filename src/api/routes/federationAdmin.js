/**
 * src/api/routes/federationAdmin.js
 * 
 * Administrative endpoints for Phase 16 — Industrial Swarm Federation.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const registry = require('../services/federationRegistryService');
const consensus = require('../services/swarmConsensusService');
const twin = require('../services/federatedDigitalTwinService');
const recovery = require('../services/federationRecoveryService');
const orchestration = require('../services/distributedOrchestrationService');
const globalIntel = require('../services/globalIntelligenceService');

/**
 * GET /api/admin/federation/health
 */
router.get('/health', async (req, res) => {
    try {
        const health = await globalIntel.computeGlobalHealth();
        res.json({ ok: true, health });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FEDERATION_HEALTH_ERROR' });
    }
});

router.get('/factories', async (req, res) => {
    try {
        const factories = await registry.getActiveFactories();
        res.json({ ok: true, data: factories });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FEDERATION_FACTORIES_QUERY_ERROR' });
    }
});

router.get('/consensus', async (req, res) => {
    try {
        const events = await db.query('SELECT * FROM swarm_consensus_events ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, data: events });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FEDERATION_CONSENSUS_QUERY_ERROR' });
    }
});

router.get('/digital-twin', async (req, res) => {
    try {
        const snapshots = await twin.getSnapshots();
        res.json({ ok: true, data: snapshots });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FEDERATION_TWIN_QUERY_ERROR' });
    }
});

router.get('/delegations', async (req, res) => {
    try {
        const delegations = await db.query('SELECT * FROM distributed_dispatch_delegations ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, data: delegations });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FEDERATION_DELEGATIONS_QUERY_ERROR' });
    }
});

router.get('/recovery', async (req, res) => {
    try {
        const events = await db.query('SELECT * FROM federation_recovery_events ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, data: events });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FEDERATION_RECOVERY_QUERY_ERROR' });
    }
});

router.post('/rebalance', async (req, res) => {
    try {
        const executed = await orchestration.rebalanceFederationLoad();
        res.json({ ok: true, rebalanceExecuted: executed });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FEDERATION_REBALANCE_ERROR' });
    }
});

router.post('/recover', async (req, res) => {
    try {
        const { factoryId } = req.body;
        await recovery.recoverFactory(factoryId);
        res.json({ ok: true, message: `Recovery initiated for factory ${factoryId}` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FEDERATION_RECOVERY_TRIGGER_ERROR' });
    }
});

router.post('/snapshot', async (req, res) => {
    try {
        const snapshot = await twin.generateFederationSnapshot('MANUAL');
        res.json({ ok: true, data: snapshot });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'FEDERATION_SNAPSHOT_ERROR' });
    }
});

module.exports = router;
