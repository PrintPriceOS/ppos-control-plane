/**
 * src/api/services/economics/EconomicRiskForecastService.js
 * 
 * Economic Risk Forecasting Engine (Phase 30).
 * Predicts cost escalation and detects economic bottlenecks across the federation.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('economic-risk');

class EconomicRiskForecastService {
  /**
   * Forecasts economic risks for all active regions.
   */
  async forecastGlobalEconomicRisks() {
    try {
      const regions = await db.query('SELECT DISTINCT region FROM print_nodes WHERE region IS NOT NULL');
      const forecasts = [];

      for (const { region } of regions) {
        const forecast = await this.forecastRegionalRisk(region);
        forecasts.push(forecast);
      }

      return forecasts;
    } catch (err) {
      logger.error({ event: 'global_risk_forecast_failed', error: err.message });
      throw err;
    }
  }

  /**
   * Forecasts economic risk for a specific region.
   */
  async forecastRegionalRisk(region) {
    // 1. Analyze Margin Compression Trend
    const history = await db.query(`
      SELECT AVG(net_margin) as avg_margin, recorded_at
      FROM industrial_profitability_history h
      JOIN print_nodes n ON h.node_id = n.id
      WHERE n.region = ? AND h.recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(recorded_at)
      ORDER BY recorded_at DESC
    `, [region]);

    // Simple trend detection
    const recentMargin = history[0]?.avg_margin || 0;
    const pastMargin = history[history.length - 1]?.avg_margin || recentMargin;
    const marginCompression = pastMargin > recentMargin ? (pastMargin - recentMargin) / pastMargin : 0;

    // 2. Evaluate Capacity Pressure
    const capacity = await db.query(`
      SELECT AVG(capacity_utilization_pct) as avg_util
      FROM print_nodes WHERE region = ?
    `, [region]);
    const util = capacity[0]?.avg_util || 0;

    // 3. Determine Risk Type and Score
    let riskType = 'STABLE';
    let impactScore = 0;
    let probability = 0.1;

    if (marginCompression > 0.15) {
      riskType = 'MARGIN_COLLAPSE';
      impactScore = 80;
      probability = 0.7;
    } else if (util > 85) {
      riskType = 'COST_ESCALATION';
      impactScore = 60;
      probability = 0.8;
    }

    const forecast = {
      region,
      risk_type: riskType,
      probability,
      impact_score: impactScore,
      forecast_window_hours: 24
    };

    await db.query(`
      INSERT INTO economic_risk_forecasts 
      (region, risk_type, probability, impact_score, forecast_window_hours)
      VALUES (?, ?, ?, ?, ?)
    `, [forecast.region, forecast.risk_type, forecast.probability, forecast.impact_score, forecast.forecast_window_hours]);

    return forecast;
  }

  /**
   * Detects economically dangerous nodes (consistently low margin).
   */
  async detectDangerousNodes() {
    return db.query(`
      SELECT node_id, AVG(net_margin) as avg_margin, COUNT(*) as dispatch_count
      FROM industrial_profitability_history
      WHERE recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY node_id
      HAVING avg_margin < 5.0 AND dispatch_count > 3
    `);
  }
}

module.exports = new EconomicRiskForecastService();
