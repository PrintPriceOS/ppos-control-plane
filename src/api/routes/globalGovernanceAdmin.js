/**
 * Global Governance Administration Routes
 * Phase 16 — Global Control Plane & Sovereign Network Governance
 */
const express = require('express');
const router = express.Router();
const mysql = require('../services/mysqlClient');

let authority = null, registry = null, rolloutEngine = null, postureAggregator = null, auditLogger = null;
try {
    authority = require('../upstream/src/global-governance/globalPolicyAuthority');
    registry = require('../upstream/src/global-governance/globalPolicyRegistry');
    rolloutEngine = require('../upstream/src/global-governance/policyRolloutEngine');
    postureAggregator = require('../upstream/src/global-governance/globalPostureAggregator');
    auditLogger = require('../upstream/src/services/auditLogger');
} catch (e) {
    console.error('[CORE-ROUTING] Global Governance services unavailable:', e.message);
}

router.get('/policies', (req, res) => {
    try {
        res.json({ ok: true, policies: registry ? registry.getAll() : [], degraded: !registry });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/rollouts', (req, res) => {
    try {
        res.json({ ok: true, rollouts: rolloutEngine ? rolloutEngine.getRollouts() : [], degraded: !rolloutEngine });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/posture', (req, res) => {
    try {
        res.json({ ok: true, posture: postureAggregator ? postureAggregator.buildNetworkSnapshot() : null, degraded: !postureAggregator });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/audit', (req, res) => {
    try {
        const globalEvents = auditLogger ? auditLogger.getFederationLogs().filter(a => a.event.startsWith('GLOBAL_')) : [];
        res.json({ ok: true, audit: globalEvents, degraded: !auditLogger });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/blocks', async (req, res) => {
  try {
    const rows = await mysql.query(`
      SELECT id, name, status, scope_type, scope_id
      FROM governance_policies
      WHERE status = 'active'
      ORDER BY updated_at DESC
    `);

    const blocks = rows.map(r => ({
      id: r.id,
      name: r.name,
      status: 'Enforced',
      impact: r.scope_id || capitalize(r.scope_type),
    }));

    res.json({ ok: true, blocks });
  } catch (err) {
    console.error('[GOVERNANCE] Error fetching blocks:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

module.exports = router;
