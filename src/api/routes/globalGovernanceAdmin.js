/**
 * Global Governance Administration Routes
 * Phase 16 — Global Control Plane & Sovereign Network Governance
 */
const express = require('express');
const router = express.Router();
const mysql = require('../services/mysqlClient');

const logger = require('../services/logger').child('global-governance');

let authority = null, registry = null, rolloutEngine = null, postureAggregator = null, auditLogger = null;
try {
    authority = require('../upstream/src/global-governance/globalPolicyAuthority');
    registry = require('../upstream/src/global-governance/globalPolicyRegistry');
    rolloutEngine = require('../upstream/src/global-governance/policyRolloutEngine');
    postureAggregator = require('../upstream/src/global-governance/globalPostureAggregator');
    auditLogger = require('../upstream/src/services/auditLogger');
} catch (e) {
    logger.warn({ event: 'UPSTREAM_SERVICES_UNAVAILABLE', reason: e.message });
}

router.get('/policies', (req, res) => {
    try {
        res.json({ ok: true, policies: registry ? registry.getAll() : [], degraded: !registry });
    } catch (e) {
        res.status(503).json({ ok: false, status: 'DEGRADED', error: e.message });
    }
});

router.get('/rollouts', (req, res) => {
    try {
        res.json({ ok: true, rollouts: rolloutEngine ? rolloutEngine.getRollouts() : [], degraded: !rolloutEngine });
    } catch (e) {
        res.status(503).json({ ok: false, status: 'DEGRADED', error: e.message });
    }
});

router.get('/posture', (req, res) => {
    try {
        res.json({ ok: true, posture: postureAggregator ? postureAggregator.buildNetworkSnapshot() : null, degraded: !postureAggregator });
    } catch (e) {
        res.status(503).json({ ok: false, status: 'DEGRADED', error: e.message });
    }
});

router.get('/audit', (req, res) => {
    try {
        const globalEvents = auditLogger ? auditLogger.getFederationLogs().filter(a => a.event.startsWith('GLOBAL_')) : [];
        res.json({ ok: true, audit: globalEvents, degraded: !auditLogger });
    } catch (e) {
        res.status(503).json({ ok: false, status: 'DEGRADED', error: e.message });
    }
});

router.get('/blocks', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || `trace_${Date.now()}`;
  try {
    // Check if mysql service is available
    if (!mysql || typeof mysql.query !== 'function') {
        throw new Error('DATABASE_UNAVAILABLE');
    }

    const rows = await mysql.query(`
      SELECT id, name, status, scope_type, scope_id
      FROM governance_policies
      WHERE status = 'active'
      ORDER BY updated_at DESC
    `).catch(err => {
        // If table is missing, return empty instead of 500
        if (err.code === 'ER_NO_SUCH_TABLE') return [];
        throw err;
    });

    const blocks = rows.map(r => ({
      id: r.id,
      name: r.name,
      status: 'Enforced',
      impact: r.scope_id || capitalize(r.scope_type),
    }));

    res.json({ ok: true, blocks: blocks || [], source_status: "ACTIVE" });
  } catch (err) {
    logger.warn({
        event: 'BLOCK_FETCH_DEGRADED',
        error: err.message,
        traceId
    });

    return res.json({ 
        ok: true, 
        blocks: [], 
        source_status: "GLOBAL_BLOCKS_UNAVAILABLE" 
    });
  }
});

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

module.exports = router;
