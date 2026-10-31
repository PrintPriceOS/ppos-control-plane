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
   * Strictly validates rates_json contract (Phase 190 Part 2).
   */
  async estimateProductionCost(nodeId, jobData) {
    const [node] = await db.query('SELECT rates_json, region FROM print_nodes WHERE id = ?', [nodeId]);

    if (!node || !node.rates_json) {
        const err = new Error("No rate card found for node");
        err.code = "PRICING_INCOMPLETE";
        throw err;
    }

    let rates;
    try {
        rates = JSON.parse(node.rates_json);
    } catch (e) {
        const err = new Error("Invalid rate card JSON format");
        err.code = "INVALID_RATE_CARD";
        throw err;
    }

    if (rates.schemaVersion !== 1) {
        const err = new Error(`Unsupported rate card version: ${rates.schemaVersion}`);
        err.code = "UNSUPPORTED_VERSION";
        throw err;
    }

    if (jobData.currency && rates.currency !== jobData.currency) {
        const err = new Error(`Currency mismatch. Expected ${jobData.currency}, got ${rates.currency}`);
        err.code = "CURRENCY_MISMATCH";
        throw err;
    }

    if (rates.effectiveTo && new Date(rates.effectiveTo) < new Date()) {
        const err = new Error("Rate card has expired");
        err.code = "RATE_CARD_EXPIRED";
        throw err;
    }

    if (rates.effectiveFrom && new Date(rates.effectiveFrom) > new Date()) {
        const err = new Error("Rate card is not yet effective");
        err.code = "RATE_CARD_FUTURE";
        throw err;
    }

    if (!rates.operationalMinimumCost) {
        const err = new Error("Missing mandatory field: operationalMinimumCost");
        err.code = "PRICING_INCOMPLETE";
        throw err;
    }

    let calculatedOperationalCost = 0;

    // Capability-aware checks (simulate validation based on job requirements)
    if (jobData.requiresInterior) {
        if (!rates.interior || !rates.interior.fixed) {
            const err = new Error("Missing required capability pricing: interior");
            err.code = "UNSUPPORTED_CAPABILITY";
            throw err;
        }
        // Mocking capability specific cost logic
        calculatedOperationalCost += Number(rates.interior.fixed.full || 0);
    }

    // Mock baseline for demonstration (in reality, it's granular aggregation)
    const baseCost = rates.base_manufacturing_rate ? Number(rates.base_manufacturing_rate) : 50.0;
    const materialCost = (jobData.volume || 1) * (rates.material_multiplier ? Number(rates.material_multiplier) : 1.2);
    calculatedOperationalCost += (baseCost + materialCost);

    const operationalMinimumCost = Number(rates.operationalMinimumCost);

    // 1. Calculate operational cost with fallback to operational minimum
    const validatedOperationalCost = Math.max(calculatedOperationalCost, operationalMinimumCost);

    return {
        operationalCost: validatedOperationalCost,
        rateCardCurrency: rates.currency,
        rateCardSchemaVersion: rates.schemaVersion,
        rateCardRevision: rates.revision || 1, // fallback to 1 if missing in old schema
        rateCardChecksum: 'sha256:mock' // In reality, calculate hash of rates_json
    };
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
