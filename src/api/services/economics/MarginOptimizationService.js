/**
 * src/api/services/economics/MarginOptimizationService.js
 * 
 * Real-Time Margin Engine (Phase 30).
 * Optimizes routing for profitability and prevents economically destructive dispatches.
 */
const db = require('../mysqlClient');
const economicService = require('./IndustrialEconomicService');
const logger = require('../logger').child('margin-optimization');

class MarginOptimizationService {
  /**
   * Calculates the projected margin for a specific node/job pair.
   */
  async calculateProjectedMargin(nodeId, jobData) {
    try {
      const [node] = await db.query('SELECT * FROM print_nodes WHERE id = ?', [nodeId]);
      if (!node) throw new Error('NODE_NOT_FOUND');

      const revenue = jobData.quoted_price || 150.0;
      const opCost = await economicService.estimateProductionCost(nodeId, jobData);
      const logisticsCost = await economicService.estimateLogisticsCost(node, jobData);
      const energyCost = 5.0; // Baseline
      const slaPenaltyRisk = this._calculateSLAPenaltyRisk(node, jobData);

      const totalCost = opCost + logisticsCost + energyCost + slaPenaltyRisk;
      const margin = revenue - totalCost;
      const marginPct = (margin / revenue) * 100;

      return {
        estimated_margin: margin,
        margin_percentage: marginPct,
        cost_breakdown: {
          operational: opCost,
          logistics: logisticsCost,
          energy: energyCost,
          sla_risk: slaPenaltyRisk
        },
        profitability_score: Math.max(0, Math.min(100, marginPct * 2)) // Simple 0-100 score
      };
    } catch (err) {
      logger.error({ event: 'margin_calc_failed', node_id: nodeId, error: err.message });
      return null;
    }
  }

  /**
   * Prevents economically destructive dispatches.
   */
  async validateDispatchEconomics(nodeId, jobData) {
    const projection = await this.calculateProjectedMargin(nodeId, jobData);
    if (!projection) return { ok: false, reason: 'ECONOMIC_DATA_UNAVAILABLE' };

    if (projection.estimated_margin < 0) {
      return { 
        ok: false, 
        reason: 'NEGATIVE_MARGIN_DETECTED', 
        projected_loss: Math.abs(projection.estimated_margin) 
      };
    }

    if (projection.margin_percentage < 5) {
      return { 
        ok: true, 
        warning: 'LOW_MARGIN_THRESHOLD', 
        margin_pct: projection.margin_percentage 
      };
    }

    return { ok: true, projection };
  }

  _calculateSLAPenaltyRisk(node, job) {
    const util = node.capacity_utilization_pct || 0;
    if (util > 90) return 25.0; // High risk of delay penalty
    if (util > 75) return 10.0;
    return 0;
  }
}

module.exports = new MarginOptimizationService();
