const mysqlClient = require('./mysqlClient');
const logger = require('./logger').child('federation-consensus');
const axios = require('axios');

class FederationConsensusService {
  constructor() {
    this._loopInterval = null;
    this.currentNodeId = process.env.PPOS_NODE_ID || 'node_local_primary';
    this.clusterRole = 'FOLLOWER'; // LEADER or FOLLOWER
    this.isReadOnly = false;
  }

  /**
   * Initializes the core consensus loop daemon on bootstrap
   */
  async start() {
    logger.info({ event: 'consensus_daemon_start', message: 'Starting Multi-Factory Consensus Loop.' });
    this._loopInterval = setInterval(async () => {
      try {
        await this.runElectionCycle();
      } catch (err) {
        logger.error({ event: 'consensus_cycle_error', message: err.message });
      }
    }, 5000); // 5-second nominal heartbeat frequency
  }

  /**
   * Stops the background execution interval daemon cleanly
   */
  async stop() {
    if (this._loopInterval) {
      clearInterval(this._loopInterval);
      logger.info({ event: 'consensus_daemon_stop', message: 'Consensus daemon loops stopped cleanly.' });
    }
  }

  /**
   * Primary Election Cycle execution block
   */
  async runElectionCycle() {
    const nodes = await mysqlClient.query('SELECT * FROM federation_nodes WHERE id != ?', [this.currentNodeId]);
    let activeVotes = 1; // Count local node as inherently active

    // 1. Process Network Heartbeats across siblings
    for (const node of nodes) {
      try {
        const startTs = Date.now();
        await axios.post(`${node.base_url}/api/federation/heartbeat`, {
          originNodeId: this.currentNodeId,
          currentLsn: await this._getLocalMaxLsn()
        }, { timeout: 2000 });
        
        const latency = Date.now() - startTs;
        let nextStatus = 'LIVE';

        if (latency > 500) {
          nextStatus = 'DEGRADED';
          logger.warn({ event: 'node_degraded', message: `High regional latency detected on node ${node.id}: ${latency}ms` });
        }

        await mysqlClient.query(
          'UPDATE federation_nodes SET status = ?, last_heartbeat_at = NOW(), updated_at = NOW() WHERE id = ?',
          [nextStatus, node.id]
        );
        activeVotes++;
      } catch (err) {
        // Evaluate if nodes exceed the 15-second drop criteria
        const lastHb = node.last_heartbeat_at ? new Date(node.last_heartbeat_at).getTime() : 0;
        if (Date.now() - lastHb > 15000 && node.status !== 'OFFLINE') {
          await mysqlClient.query('UPDATE federation_nodes SET status = "OFFLINE", updated_at = NOW() WHERE id = ?', [node.id]);
          logger.error({ event: 'node_timeout', message: `Node ${node.id} missed heartbeats. Triggering circuit breaker.` });
        }
      }
    }

    // 2. Enforce Split-Brain Majority Rule (2N + 1 math matrix)
    const totalNodesCount = nodes.length + 1;
    const dynamicMajorityThreshold = Math.floor(totalNodesCount / 2) + 1;

    if (activeVotes < dynamicMajorityThreshold) {
      this.isReadOnly = true;
      this.clusterRole = 'FOLLOWER';
      logger.error({ event: 'split_brain_lockdown', message: `Active nodes quorum breach (${activeVotes}/${totalNodesCount}). Degrading node to READ_ONLY.` });
      return;
    }

    this.isReadOnly = false;

    // 3. Coordinate Distributed Lock Leader Lease Acquisition (Optimistic Locking)
    await this.evaluateLeaderLease();
  }

  async evaluateLeaderLease() {
    const leaseKey = 'CLUSTER_LEADER_LOCK';
    const leases = await mysqlClient.query('SELECT * FROM federation_leases WHERE lease_key = ?', [leaseKey]);

    const now = new Date();
    const leaseDuration = 10000; // 10s expiration lock window
    const expiresAt = new Date(now.getTime() + leaseDuration);

    if (!leases || leases.length === 0) {
      try {
        await mysqlClient.query(
          'INSERT INTO federation_leases (lease_key, holder_node_id, acquired_at, expires_at, version) VALUES (?, ?, ?, ?, 0)',
          [leaseKey, this.currentNodeId, now, expiresAt]
        );
        this.clusterRole = 'LEADER';
      } catch (e) {
        this.clusterRole = 'FOLLOWER'; // Lost competing race state insertion
      }
    } else {
      const activeLease = leases[0];
      const isExpired = new Date(activeLease.expires_at).getTime() < now.getTime();

      if (activeLease.holder_node_id === this.currentNodeId || isExpired) {
        // Attempt lock lease acquisition or renewal via optimistic version increments
        const affectedRows = await mysqlClient.query(
          'UPDATE federation_leases SET holder_node_id = ?, acquired_at = ?, expires_at = ?, version = version + 1 WHERE lease_key = ? AND version = ?',
          [this.currentNodeId, now, expiresAt, leaseKey, activeLease.version]
        );

        if (affectedRows.affectedRows > 0) {
          this.clusterRole = 'LEADER';
        } else {
          this.clusterRole = 'FOLLOWER';
        }
      } else {
        this.clusterRole = 'FOLLOWER';
      }
    }
  }

  async _getLocalMaxLsn() {
    const rows = await mysqlClient.query('SELECT MAX(lsn) as maxLsn FROM federation_capacity_log');
    return rows[0]?.maxLsn || 0;
  }
}

module.exports = new FederationConsensusService();
