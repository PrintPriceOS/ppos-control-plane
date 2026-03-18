/**
 * Global Governance Administration Routes
 * Phase 16 — Global Control Plane & Sovereign Network Governance
 */
const express = require('express');
const router = express.Router();

const authority = require('../../../../../ppos-preflight-service/src/global-governance/globalPolicyAuthority');
const registry = require('../../../../../ppos-preflight-service/src/global-governance/globalPolicyRegistry');
const rolloutEngine = require('../../../../../ppos-preflight-service/src/global-governance/policyRolloutEngine');
const postureAggregator = require('../../../../../ppos-preflight-service/src/global-governance/globalPostureAggregator');
const auditLogger = require('../../../../../ppos-preflight-service/src/services/auditLogger');

router.get('/policies', (req, res) => {
    try {
        res.json({ ok: true, policies: registry.getAll() });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/rollouts', (req, res) => {
    try {
        res.json({ ok: true, rollouts: rolloutEngine.getRollouts() });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/posture', (req, res) => {
    try {
        res.json({ ok: true, posture: postureAggregator.buildNetworkSnapshot() });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/audit', (req, res) => {
    try {
        const globalEvents = auditLogger.getFederationLogs().filter(a => a.event.startsWith('GLOBAL_'));
        res.json({ ok: true, audit: globalEvents });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
