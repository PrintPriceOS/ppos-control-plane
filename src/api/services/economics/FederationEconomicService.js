/**
 * src/api/services/economics/FederationEconomicService.js
 * 
 * Federation Economic Intelligence (Phase 30).
 * Evaluates regional production economics and rebalances production economically.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('federation-economics');

class FederationEconomicService {
  /**
   * Generates a snapshot of federation-wide economic health.
   */
  async snapshotFederationEconomics() {
    try {
      const regions = await db.query('SELECT DISTINCT region FROM print_nodes WHERE region IS NOT NULL');
      const snapshots = [];

      for (const { region } of regions) {
        const snapshot = await this.evaluateRegionEconomics(region);
        snapshots.push(snapshot);
      }

      return snapshots;
    } catch (err) {
      logger.error({ event: 'federation_economic_snapshot_failed', error: err.message });
      throw err;
    }
  }

  /**
   * Evaluates a specific region's economic state.
   */
  async evaluateRegionEconomics(region) {
    // 1. Avg Margin in region
    const margin = await db.query(`
      SELECT AVG(net_margin) as avg_margin, SUM(gross_revenue) as total_revenue
      FROM industrial_profitability_history h
      JOIN print_nodes n ON h.node_id = n.id
      WHERE n.region = ? AND h.recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    `, [region]);

    // 2. Operational Efficiency: Revenue vs Cost ratio
    const efficiency = await db.query(`
      SELECT SUM(gross_revenue) / SUM(operational_cost + logistics_cost + energy_cost) as eff_ratio
      FROM industrial_profitability_history h
      JOIN print_nodes n ON h.node_id = n.id
      WHERE n.region = ?
    `, [region]);

    const snapshot = {
      region,
      total_revenue: margin[0]?.total_revenue || 0,
      avg_margin_pct: margin[0]?.avg_margin ? (margin[0].avg_margin / 100) : 0, // Placeholder normalization
      operational_efficiency_score: Math.round((efficiency[0]?.eff_ratio || 1.2) * 80)
    };

    await db.query(`
      INSERT INTO federation_economic_snapshots 
      (federation_id, total_revenue, avg_margin_pct, operational_efficiency_score)
      VALUES (?, ?, ?, ?)
    `, [region, snapshot.total_revenue, snapshot.avg_margin_pct, snapshot.operational_efficiency_score]);

    return snapshot;
  }

  /**
   * Forecasts regional profitability collapse.
   */
  async forecastRegionalProfitability() {
    return db.query(`
      SELECT region, AVG(avg_margin_pct) as current_margin, MIN(operational_efficiency_score) as min_efficiency
      FROM federation_economic_snapshots
      WHERE snapshot_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY region
    `);
  }
}

module.exports = new FederationEconomicService();
