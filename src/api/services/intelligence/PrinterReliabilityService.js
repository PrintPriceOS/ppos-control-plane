/**
 * src/api/services/intelligence/PrinterReliabilityService.js
 * 
 * Dynamic Printer Reliability Engine (Phase 29).
 * Computes live trust scores based on historical memory and real-time stability.
 */
const db = require('../mysqlClient');
const memoryService = require('./IndustrialMemoryService');
const logger = require('../logger').child('printer-reliability');

class PrinterReliabilityService {
  /**
   * Recalculates reliability metrics for all active nodes.
   */
  async recalibrateAllNodes() {
    try {
      const nodes = await db.query('SELECT id FROM print_nodes WHERE status != "REJECTED"');
      let count = 0;

      for (const node of nodes) {
        await this.updateNodeMetrics(node.id);
        count++;
      }

      logger.info({ event: 'recalibration_complete', nodes_processed: count });
      return count;
    } catch (err) {
      logger.warn({ event: 'recalibration_failed', error: err.message });
      throw err;
    }
  }

  /**
   * Updates reliability metrics for a specific node.
   */
  async updateNodeMetrics(nodeId) {
    const history = await memoryService.getNodeHistory(nodeId);
    
    // Heartbeat Stability: fraction of heartbeats received in last 24h vs expected
    const hbStats = await db.query(`
      SELECT COUNT(*) as hb_count 
      FROM node_heartbeats 
      WHERE node_id = ? AND heartbeat_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `, [nodeId]);
    
    const expectedHbs = 24 * 60; // 1 per minute
    const hbStability = Math.min(1.0, (hbStats[0]?.hb_count || 0) / expectedHbs);

    // Reroute Frequency (lower is better)
    const rerouteStats = await db.query(`
      SELECT COUNT(*) as reroute_count 
      FROM production_events 
      WHERE node_id = ? AND event_type = 'AUTONOMOUS_REROUTE' AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    `, [nodeId]);
    const rerouteFreq = Math.min(1.0, (rerouteStats[0]?.reroute_count || 0) / 10);

    // Compute Dynamic Trust Score (0-100)
    // Weights: SLA 40%, HB Stability 30%, Reroutes 20%, Accuracy 10%
    const slaScore = history.sla_compliance_rate || 1.0;
    const trustScore = Math.round(
      (slaScore * 40) + 
      (hbStability * 30) + 
      ((1 - rerouteFreq) * 20) + 
      (history.avg_quality * 0.1)
    );

    const metrics = {
      sla_success_rate: slaScore,
      heartbeat_stability: hbStability,
      reroute_frequency: rerouteFreq,
      trust_score: trustScore,
      failure_probability: 1.0 - (slaScore * hbStability)
    };

    await db.query(`
      INSERT INTO printer_reliability_metrics 
      (printer_id, sla_success_rate, heartbeat_stability, reroute_frequency, trust_score, failure_probability)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        sla_success_rate = VALUES(sla_success_rate),
        heartbeat_stability = VALUES(heartbeat_stability),
        reroute_frequency = VALUES(reroute_frequency),
        trust_score = VALUES(trust_score),
        failure_probability = VALUES(failure_probability),
        last_updated_at = CURRENT_TIMESTAMP
    `, [nodeId, metrics.sla_success_rate, metrics.heartbeat_stability, metrics.reroute_frequency, metrics.trust_score, metrics.failure_probability]);

    return metrics;
  }

  /**
   * Returns current reliability metrics for a node.
   */
  async getNodeMetrics(nodeId) {
    const rows = await db.query('SELECT * FROM printer_reliability_metrics WHERE printer_id = ?', [nodeId]);
    return rows[0] || { trust_score: 80, failure_probability: 0.1 }; // Default for new nodes
  }

  async listReliabilityRanking() {
    return db.query(`
      SELECT prm.*, n.company_name, n.city, n.country
      FROM printer_reliability_metrics prm
      JOIN print_nodes n ON prm.printer_id = n.id
      ORDER BY prm.trust_score DESC
    `);
  }
}

module.exports = new PrinterReliabilityService();
