/**
 * src/api/services/intelligence/CongestionForecastService.js
 * 
 * Predictive Congestion Engine (Phase 29).
 * Forecasts future node saturation based on historical trends and current queue depth.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('congestion-forecast');

class CongestionForecastService {
  /**
   * Generates congestion forecasts for all nodes.
   */
  async forecastGlobalCongestion() {
    try {
      const nodes = await db.query('SELECT id, capacity_utilization_pct FROM print_nodes WHERE status != "REJECTED"');
      const results = [];

      for (const node of nodes) {
        const forecast = await this.forecastNodeCongestion(node.id, node.capacity_utilization_pct);
        results.push(forecast);
      }

      return results;
    } catch (err) {
      logger.error({ event: 'global_forecast_failed', error: err.message });
      throw err;
    }
  }

  /**
   * Forecasts congestion for a specific node in the next N minutes.
   */
  async forecastNodeCongestion(nodeId, currentUtil) {
    // Trend analysis: compare utilization now vs 1 hour ago
    const historical = await db.query(`
      SELECT utilization_pct 
      FROM node_heartbeats 
      WHERE node_id = ? AND heartbeat_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
      ORDER BY heartbeat_at DESC LIMIT 1
    `, [nodeId]);

    const pastUtil = historical[0]?.utilization_pct || currentUtil;
    const velocity = currentUtil - pastUtil; // Change per hour
    
    // Simple linear projection for next 60 mins
    const predictedUtil = Math.max(0, Math.min(100, currentUtil + velocity));
    const confidence = 0.85; // Heuristic for now

    await db.query(`
      INSERT INTO predictive_congestion_forecasts 
      (node_id, forecast_window_minutes, predicted_utilization_pct, confidence_score)
      VALUES (?, 60, ?, ?)
    `, [nodeId, predictedUtil, confidence]);

    // If critical, record a bottleneck snapshot
    if (predictedUtil > 90) {
      await db.query(`
        INSERT INTO predictive_bottleneck_snapshots 
        (node_id, congestion_score, predicted_delay_minutes, risk_level)
        VALUES (?, ?, ?, 'CRITICAL')
      `, [nodeId, predictedUtil / 100, 120]);
    }

    return { nodeId, currentUtil, predictedUtil, velocity };
  }

  /**
   * Returns recent forecasts for a region.
   */
  async getRegionalForecast(region) {
    return db.query(`
      SELECT f.*, n.company_name
      FROM predictive_congestion_forecasts f
      JOIN print_nodes n ON f.node_id = n.id
      WHERE n.region = ? AND f.forecast_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)
      ORDER BY f.forecast_at DESC
    `, [region]);
  }
}

module.exports = new CongestionForecastService();
