const mysqlClient = require('./mysqlClient');
const consensusService = require('./federationConsensusService');
const logger = require('./logger').child('federation-sync');
const axios = require('axios');

class FederationSyncService {
  constructor() {
    this._syncInterval = null;
  }

  async start() {
    logger.info({ event: 'sync_daemon_start', message: 'Starting Batch Synchronization Poll Loop.' });
    this._syncInterval = setInterval(async () => {
      try {
        if (!consensusService.isReadOnly) {
          await this.reconcileLsnGaps();
        }
      } catch (err) {
        logger.error({ event: 'sync_cycle_error', message: err.message });
      }
    }, 30000); // Reconciliation step fired every 30 seconds
  }

  async stop() {
    if (this._syncInterval) {
      clearInterval(this._syncInterval);
      logger.info({ event: 'sync_daemon_stop', message: 'Batch reconciliation loop stopped cleanly.' });
    }
  }

  /**
   * Reactive PUSH: Dispatches log events immediately to all healthy cluster paths
   */
  async broadcastEvent(resourceType, delta, metaPayload) {
    if (consensusService.isReadOnly) {
      throw new Error('Mutation rejected: Federation Node is running in restricted READ_ONLY state.');
    }

    const payloadJson = JSON.stringify(metaPayload);
    const result = await mysqlClient.query(
      'INSERT INTO federation_capacity_log (origin_node_id, resource_type, capacity_delta, payload_json) VALUES (?, ?, ?, ?)',
      [consensusService.currentNodeId, resourceType, delta, payloadJson]
    );

    const insertedLsn = result.insertId;
    await mysqlClient.query('UPDATE federation_nodes SET current_lsn = ? WHERE id = ?', [insertedLsn, consensusService.currentNodeId]);

    // Async Fire-and-Forget PUSH routing
    const targetSiblings = await mysqlClient.query('SELECT base_url FROM federation_nodes WHERE id != ? AND status = "LIVE"', [consensusService.currentNodeId]);
    targetSiblings.forEach((sibling) => {
      axios.post(`${sibling.base_url}/api/federation/replicate-event`, {
        lsn: insertedLsn,
        originNodeId: consensusService.currentNodeId,
        resourceType,
        capacityDelta: delta,
        payloadJson
      }, { timeout: 2000 }).catch((err) => {
        logger.warn({ event: 'push_delivery_miss', message: `Immediate push failed for path: ${sibling.base_url}. Handled by background pull.` });
      });
    });

    return insertedLsn;
  }

  /**
   * Batch PULL Synchronization: Resolves structural LSN gaps caused by network drops
   */
  async reconcileLsnGaps() {
    const localMaxLsn = await consensusService._getLocalMaxLsn();
    const liveSiblings = await mysqlClient.query('SELECT id, base_url FROM federation_nodes WHERE id != ? AND status = "LIVE"', [consensusService.currentNodeId]);

    for (const sibling of liveSiblings) {
      try {
        const response = await axios.get(`${sibling.base_url}/api/federation/log-sync?lastLsn=${localMaxLsn}`, { timeout: 4000 });
        const missingLogs = response.data;

        if (missingLogs && missingLogs.length > 0) {
          logger.info({ event: 'pull_delta_reconciliation', message: `Pulling ${missingLogs.length} missing logs from node ${sibling.id}` });
          for (const log of missingLogs) {
            await mysqlClient.query(
              'INSERT INTO federation_capacity_log (lsn, origin_node_id, resource_type, capacity_delta, payload_json) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE lsn=lsn',
              [log.lsn, log.origin_node_id, log.resource_type, log.capacity_delta, JSON.stringify(log.payload_json)]
            );
          }
          const updatedMaxLsn = await consensusService._getLocalMaxLsn();
          await mysqlClient.query('UPDATE federation_nodes SET current_lsn = ? WHERE id = ?', [updatedMaxLsn, consensusService.currentNodeId]);
        }
      } catch (err) {
        logger.error({ event: 'pull_sync_error', message: `Could not reconcile delta logs from sibling ${sibling.id}: ${err.message}` });
      }
    }
  }
}

module.exports = new FederationSyncService();
