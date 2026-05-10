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
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/federation/factories
 */
router.get('/factories', async (req, res) => {
    try {
        const factories = await registry.getActiveFactories();
        res.json({ ok: true, factories });
    } catch (err) {
        res.json({ ok: true, factories: [], degraded: true, error: err.message });
    }
});

/**
 * GET /api/admin/federation/consensus
 */
router.get('/consensus', async (req, res) => {
    try {
        const events = await db.query('SELECT * FROM swarm_consensus_events ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, events });
    } catch (err) {
        res.json({ ok: true, events: [], degraded: true, error: err.message });
    }
});

/**
 * GET /api/admin/federation/digital-twin
 */
router.get('/digital-twin', async (req, res) => {
    try {
        const snapshots = await twin.getSnapshots();
        res.json({ ok: true, snapshots });
    } catch (err) {
        res.json({ ok: true, snapshots: [], degraded: true, error: err.message });
    }
});

/**
 * GET /api/admin/federation/delegations
 */
router.get('/delegations', async (req, res) => {
    try {
        const delegations = await db.query('SELECT * FROM distributed_dispatch_delegations ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, delegations });
    } catch (err) {
        res.json({ ok: true, delegations: [], degraded: true, error: err.message });
    }
});

/**
 * GET /api/admin/federation/recovery
 */
router.get('/recovery', async (req, res) => {
    try {
        const events = await db.query('SELECT * FROM federation_recovery_events ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, events });
    } catch (err) {
        res.json({ ok: true, events: [], degraded: true, error: err.message });
    }
});

/**
 * POST /api/admin/federation/rebalance
 */
router.post('/rebalance', async (req, res) => {
    try {
        const executed = await orchestration.rebalanceFederationLoad();
        res.json({ ok: true, rebalanceExecuted: executed });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/federation/recover
 */
router.post('/recover', async (req, res) => {
    try {
        const { factoryId } = req.body;
        await recovery.recoverFactory(factoryId);
        res.json({ ok: true, message: `Recovery initiated for factory ${factoryId}` });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/federation/snapshot
 */
router.post('/snapshot', async (req, res) => {
    try {
        const snapshot = await twin.generateFederationSnapshot('MANUAL');
        res.json({ ok: true, snapshot });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
