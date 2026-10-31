const express = require('express');
const router = express.Router();
const consensusService = require('../services/federationConsensusService');
const mysqlClient = require('../services/mysqlClient');

// POST /api/federation/heartbeat
router.post('/heartbeat', async (req, res) => {
  try {
    const { originNodeId, currentLsn } = req.body;
    if (!originNodeId) return res.status(400).json({ error: 'Missing identity constraints.' });

    await mysqlClient.query(
      'UPDATE federation_nodes SET current_lsn = ?, last_heartbeat_at = NOW(), updated_at = NOW() WHERE id = ?',
      [currentLsn || 0, originNodeId]
    );

    return res.status(200).json({
      acknowledged: true,
      role: consensusService.clusterRole,
      isReadOnly: consensusService.isReadOnly
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/federation/replicate-event
router.post('/replicate-event', async (req, res) => {
  try {
    const { lsn, originNodeId, resourceType, capacityDelta, payloadJson } = req.body;

    await mysqlClient.query(
      'INSERT INTO federation_capacity_log (lsn, origin_node_id, resource_type, capacity_delta, payload_json) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE lsn=lsn',
      [lsn, originNodeId, resourceType, capacityDelta, typeof payloadJson === 'string' ? payloadJson : JSON.stringify(payloadJson)]
    );

    return res.status(200).json({ replication: 'SUCCESS' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/federation/log-sync
router.get('/log-sync', async (req, res) => {
  try {
    const lastLsn = parseInt(req.query.lastLsn || '0');
    const logs = await mysqlClient.query(
      'SELECT lsn, origin_node_id, resource_type, capacity_delta, payload_json, timestamp FROM federation_capacity_log WHERE lsn > ? ORDER BY lsn ASC LIMIT 500',
      [lastLsn]
    );
    return res.status(200).json(logs);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/federation/status
router.get('/status', async (req, res) => {
  try {
    const nodes = await mysqlClient.query('SELECT * FROM federation_nodes');
    const leases = await mysqlClient.query('SELECT * FROM federation_leases WHERE lease_key = "CLUSTER_LEADER_LOCK"');
    const activeLease = leases[0] || null;

    return res.status(200).json({
      nodes,
      activeLease,
      localNodeId: consensusService.currentNodeId,
      isReadOnly: consensusService.isReadOnly
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
