/**
 * src/api/services/governance/CascadingFailureService.js
 * 
 * Cascading Failure Detection Engine (Phase 31).
 * Detects regional overload propagation and predicts federation destabilization.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('cascading-failure');

class CascadingFailureService {
  /**
   * Analyzes systemic risk across the federation.
   */
  async analyzeSystemicRisk() {
    try {
      const regions = await db.query('SELECT region, AVG(capacity_utilization_pct) as avg_util FROM print_nodes GROUP BY region');
      const criticalRegions = regions.filter(r => r.avg_util > 85);
      
      if (criticalRegions.length > 1) {
        await this._recordSystemicRisk('MULTI_REGION_SATURATION', criticalRegions.length * 20, 0.7);
      }

      for (const source of criticalRegions) {
        await this._predictPropagation(source.region, regions);
      }
    } catch (err) {
      logger.error({ event: 'systemic_analysis_failed', error: err.message });
    }
  }

  async _predictPropagation(sourceRegion, allRegions) {
    // If a region fails, where does the load go?
    // Heuristic: Load propagates to geographically nearest regions.
    const neighbors = allRegions.filter(r => r.region !== sourceRegion && r.avg_util < 80);
    
    for (const target of neighbors) {
      const prob = 0.5; // Simplified probability
      await db.query(`
        INSERT INTO cascading_failure_snapshots (source_region, target_region, failure_probability, propagation_vector)
        VALUES (?, ?, ?, 'GEOGRAPHIC_SPILLOVER')
      `, [sourceRegion, target.region, prob]);
    }
  }

  async _recordSystemicRisk(type, impact, prob) {
    await db.query(`
      INSERT INTO systemic_risk_forecasts (risk_type, systemic_impact_pct, probability)
      VALUES (?, ?, ?)
    `, [type, impact, prob]);
  }

  async getActiveRisks() {
    return db.query('SELECT * FROM systemic_risk_forecasts WHERE forecast_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) ORDER BY probability DESC');
  }
}

module.exports = new CascadingFailureService();
