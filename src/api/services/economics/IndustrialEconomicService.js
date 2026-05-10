/**
 * src/api/services/economics/IndustrialEconomicService.js
 * 
 * Industrial Economic Engine (Phase 30).
 * Calculates manufacturing profitability, operational costs, and energy efficiency.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('industrial-economics');

class IndustrialEconomicService {
  /**
   * Calculates real manufacturing profitability for a node.
   */
  async calculateNodeProfitability(nodeId) {
    try {
      const stats = await db.query(`
        SELECT 
          AVG(net_margin) as avg_margin,
          SUM(gross_revenue) as total_revenue,
          AVG(operational_cost) as avg_cost,
          AVG(energy_cost) as avg_energy
        FROM industrial_profitability_history
        WHERE node_id = ? AND recorded_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      `, [nodeId]);

      return stats[0] || { avg_margin: 0, total_revenue: 0, avg_cost: 0, avg_energy: 0 };
    } catch (err) {
      logger.error({ event: 'profitability_calc_failed', node_id: nodeId, error: err.message });
      throw err;
    }
  }

  /**
   * Estimates operational production cost for a job on a specific node.
   */
  async estimateProductionCost(nodeId, jobData) {
    // In a real scenario, this would use rates_json and material costs.
    const [node] = await db.query('SELECT rates_json, region FROM print_nodes WHERE id = ?', [nodeId]);
    const rates = JSON.parse(node?.rates_json || '{}');
    
    const baseCost = rates.base_manufacturing_rate || 50.0;
    const materialCost = (jobData.volume || 1) * (rates.material_multiplier || 1.2);
    
    return baseCost + materialCost;
  }

  /**
   * Computes logistics cost impact based on distance and urgency.
   */
  async estimateLogisticsCost(node, job) {
    const isSameCountry = node.country === job.destination_country;
    const baseRate = isSameCountry ? 15.0 : 45.0;
    const urgencyMultiplier = job.urgency === 'EXPRESS' ? 2.5 : 1.0;
    
    return baseRate * urgencyMultiplier;
  }

  /**
   * Evaluates energy efficiency based on node region and utilization.
   */
  async evaluateEnergyEfficiency(node) {
    // Heuristic: Higher utilization usually means better efficiency per unit, 
    // but regional energy load also matters.
    const util = node.capacity_utilization_pct || 0;
    const regionLoad = await this._getRegionalEnergyLoad(node.region);
    
    return Math.max(0, 100 - (regionLoad * 0.5) + (util * 0.2));
  }

  async _getRegionalEnergyLoad(region) {
    // Mock regional load for Phase 30, would be real telemetry in production.
    const loads = { 'EU-WEST': 65, 'US-EAST': 40, 'ASIA-SOUTH': 80 };
    return loads[region] || 50;
  }

  /**
   * Records a completed dispatch's economic outcome.
   */
  async recordEconomicOutcome(dispatchId, node_id, revenue, costs) {
    const { operational, logistics, energy } = costs;
    const net_margin = revenue - (operational + logistics + energy);

    await db.query(`
      INSERT INTO industrial_profitability_history 
      (node_id, dispatch_id, gross_revenue, operational_cost, logistics_cost, energy_cost, net_margin)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [node_id, dispatchId, revenue, operational, logistics, energy, net_margin]);
  }
}

module.exports = new IndustrialEconomicService();
