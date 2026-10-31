/**
 * src/api/services/intelligence/IndustrialMemoryService.js
 * 
 * Industrial Memory Engine (Phase 29).
 * Persists and retrieves historical dispatch outcomes and operational events.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('industrial-memory');

class IndustrialMemoryService {
  /**
   * Records the final outcome of a dispatch for historical learning.
   */
  async recordDispatchOutcome(dispatchId, outcomeData) {
    const { 
      node_id, 
      status, 
      sla_met = true, 
      latency_ms = 0, 
      quality_score = 100 
    } = outcomeData;

    try {
      await db.query(`
        INSERT INTO dispatch_outcome_history 
        (dispatch_id, node_id, outcome_status, sla_met, latency_ms, quality_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [dispatchId, node_id, status, sla_met, latency_ms, quality_score]);

      // Also record a memory graph relationship if successful
      if (status === 'COMPLETED' && sla_met) {
        await this.strengthenMemoryLink(node_id, 'RELIABLE_EXECUTION', dispatchId, 0.1);
      } else if (status === 'FAILED' || !sla_met) {
        await this.strengthenMemoryLink(node_id, 'EXECUTION_FAILURE', dispatchId, -0.2);
      }

      logger.info({ event: 'outcome_recorded', dispatch_id: dispatchId, node_id, status });
    } catch (err) {
      logger.error({ event: 'outcome_recording_failed', dispatch_id: dispatchId, error: err.message });
    }
  }

  /**
   * Strengthens or weakens a relationship in the industrial memory graph.
   */
  async strengthenMemoryLink(nodeId, type, entityId, delta) {
    try {
      await db.query(`
        INSERT INTO industrial_memory_graph (node_id, entity_type, entity_id, relationship_type, weight)
        VALUES (?, 'DISPATCH', ?, ?, ?)
        ON DUPLICATE KEY UPDATE weight = weight + ?
      `, [nodeId, entityId, type, delta, delta]);
    } catch (err) {
      logger.error({ event: 'memory_link_update_failed', node_id: nodeId, error: err.message });
    }
  }

  /**
   * Retrieves historical performance metrics for a specific node.
   */
  async getNodeHistory(nodeId) {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_dispatches,
        SUM(CASE WHEN outcome_status = 'COMPLETED' THEN 1 ELSE 0 END) as successful_dispatches,
        AVG(CASE WHEN sla_met = 1 THEN 1 ELSE 0 END) as sla_compliance_rate,
        AVG(latency_ms) as avg_latency,
        AVG(quality_score) as avg_quality
      FROM dispatch_outcome_history
      WHERE node_id = ?
    `, [nodeId]);

    return stats[0] || { total_dispatches: 0, successful_dispatches: 0, sla_compliance_rate: 1.0 };
  }

  /**
   * Records a learning cycle.
   */
  async recordLearningCycle(type, size, delta, metadata = {}) {
    await db.query(`
      INSERT INTO industrial_learning_cycles (cycle_type, input_size, improvement_delta, metadata_json)
      VALUES (?, ?, ?, ?)
    `, [type, size, delta, JSON.stringify(metadata)]);
  }
}

module.exports = new IndustrialMemoryService();
