/**
 * src/api/services/SyntheticOperationsTwinService.js
 * 
 * Synthetic Operations Twin (Phase 33).
 * Maintains synthetic snapshots of the federation state for simulation.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('synthetic-twin');

class SyntheticOperationsTwinService {
  /**
   * Captures a synthetic snapshot of the current federation state.
   */
  async captureSnapshot(simulationId) {
    try {
      // Fetch live nodes, queues, and economic state (READ ONLY)
      const nodes = await db.query('SELECT * FROM print_nodes');
      const queues = await db.query('SELECT * FROM manufacturing_queues');
      
      const snapshot = {
        nodes,
        queues,
        captured_at: new Date().toISOString()
      };

      await db.query(`
        INSERT INTO synthetic_operations_snapshots (simulation_id, snapshot_data)
        VALUES (?, ?)
      `, [simulationId, JSON.stringify(snapshot)]);

      return snapshot;
    } catch (err) {
      logger.error({ event: 'snapshot_failed', error: err.message });
      throw err;
    }
  }

  async getLatestSnapshot(simulationId) {
    const rows = await db.query('SELECT snapshot_data FROM synthetic_operations_snapshots WHERE simulation_id = ? ORDER BY created_at DESC LIMIT 1', [simulationId]);
    return rows[0] ? JSON.parse(rows[0].snapshot_data) : null;
  }
}

module.exports = new SyntheticOperationsTwinService();
