/**
 * src/api/services/dispatch/SLARiskMonitor.js
 * 
 * Industrial supervision service that predicts SLA violations and manufacturing bottlenecks.
 * 100% REAL DATA.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('sla-monitor');

class SLARiskMonitor {
  /**
   * Scans all active dispatches and predicts failure probability.
   */
  async runGlobalSLAScan() {
    logger.info({ event: 'sla_scan_start', message: 'Starting global SLA risk assessment' });
    
    try {
      // 1. Get active dispatches with node telemetry
      const activeDispatches = await db.query(`
        SELECT d.*, n.capacity_utilization_pct, n.status as node_status, n.last_heartbeat_at,
               p.book_spec_json
        FROM production_dispatches d
        JOIN print_nodes n ON d.print_node_id = n.id
        JOIN production_packages p ON d.production_package_id = p.id
        WHERE d.status IN ('QUEUED', 'ALLOCATED', 'IN_PRODUCTION')
      `);

      for (const dispatch of activeDispatches) {
        await this.evaluateDispatchRisk(dispatch);
      }

      // 2. Get nodes to predict bottlenecks
      const nodes = await db.query('SELECT * FROM print_nodes');
      for (const node of nodes) {
        await this.evaluateNodeBottleneck(node);
      }

      return { processedDispatches: activeDispatches.length, processedNodes: nodes.length };
    } catch (err) {
      logger.error({ event: 'sla_scan_failed', error: err.message });
      throw err;
    }
  }

  /**
   * Predicts failure for a single dispatch.
   */
  async evaluateDispatchRisk(dispatch) {
    let failureProbability = 0;
    let reasonCode = 'OPTIMAL';
    let mitigation = 'No action required.';

    const NOW = new Date();
    const lastHeartbeat = dispatch.last_heartbeat_at ? new Date(dispatch.last_heartbeat_at) : null;
    const heartbeatAgeMin = lastHeartbeat ? (NOW - lastHeartbeat) / 60000 : 999;

    // Logic for failure probability
    if (dispatch.node_status === 'OFFLINE') {
      failureProbability = 0.95;
      reasonCode = 'NODE_OFFLINE';
      mitigation = 'Immediate reroute recommended. Node is unreachable.';
    } else if (heartbeatAgeMin > 10) {
      failureProbability = 0.70;
      reasonCode = 'STALE_TELEMETRY';
      mitigation = 'Monitor node connection. Telemetry is stale.';
    } else if (dispatch.capacity_utilization_pct > 95) {
      failureProbability = 0.60;
      reasonCode = 'NODE_SATURATED';
      mitigation = 'High risk of production delay due to queue pressure.';
    }

    // Persist snapshot
    await db.query(`
      INSERT INTO failure_prediction_snapshots (dispatch_id, failure_probability, reason_code, mitigation_recommendation)
      VALUES (?, ?, ?, ?)
    `, [dispatch.id, failureProbability, reasonCode, mitigation]);

    return { failureProbability, reasonCode };
  }

  /**
   * Predicts bottleneck for a node.
   */
  async evaluateNodeBottleneck(node) {
    let congestionScore = 0;
    let riskLevel = 'LOW';

    const utilization = node.capacity_utilization_pct || 0;
    
    if (utilization > 90) {
      congestionScore = 0.9;
      riskLevel = 'CRITICAL';
    } else if (utilization > 70) {
      congestionScore = 0.6;
      riskLevel = 'MEDIUM';
    } else if (utilization > 40) {
      congestionScore = 0.3;
      riskLevel = 'LOW';
    }

    await db.query(`
      INSERT INTO predictive_bottleneck_snapshots (node_id, congestion_score, predicted_delay_minutes, risk_level)
      VALUES (?, ?, ?, ?)
    `, [node.id, congestionScore, Math.round(utilization * 2), riskLevel]);
  }
}

module.exports = new SLARiskMonitor();
