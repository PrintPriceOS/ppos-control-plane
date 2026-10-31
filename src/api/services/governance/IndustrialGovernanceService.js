/**
 * src/api/services/governance/IndustrialGovernanceService.js
 * 
 * Industrial Governance Engine (Phase 31).
 * Evaluates dispatch safety, validates federation routing policies, and enforces continuity.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('industrial-governance');

class IndustrialGovernanceService {
  /**
   * Evaluates if a dispatch is safe according to global governance policies.
   */
  async evaluateDispatchSafety(nodeId, jobData) {
    try {
      const [node] = await db.query('SELECT region, status, capacity_utilization_pct FROM print_nodes WHERE id = ?', [nodeId]);
      if (!node) return { safe: false, reason: 'NODE_NOT_FOUND' };

      // 1. Check for Regional Over-Concentration
      const concentration = await this._getRegionalConcentration(node.region);
      if (concentration > 0.4) { // Max 40% of global load in one region
        return { safe: false, reason: 'REGIONAL_CONCENTRATION_VIOLATION', concentration };
      }

      // 2. Enforce Operational Diversity
      const diversity = await this._getFederationDiversity();
      if (diversity < 60) {
        return { safe: false, reason: 'FEDERATION_DIVERSITY_CRITICAL' };
      }

      // 3. Status Check
      if (node.status === 'DEGRADED') {
        return { safe: false, reason: 'GOVERNANCE_BLOCK:NODE_DEGRADED' };
      }

      return { safe: true };
    } catch (err) {
      logger.error({ event: 'safety_eval_failed', node_id: nodeId, error: err.message });
      return { safe: false, reason: 'INTERNAL_ERROR' };
    }
  }

  async _getRegionalConcentration(region) {
    const total = await db.query('SELECT SUM(capacity_utilization_pct) as total_util FROM print_nodes');
    const regional = await db.query('SELECT SUM(capacity_utilization_pct) as reg_util FROM print_nodes WHERE region = ?', [region]);
    
    if (!total[0]?.total_util) return 0;
    return (regional[0]?.reg_util || 0) / total[0].total_util;
  }

  async _getFederationDiversity() {
    // Number of active regions vs total regions
    const regions = await db.query('SELECT COUNT(DISTINCT region) as active_count FROM print_nodes WHERE status = "ACTIVE"');
    const total = 10; // Assuming 10 target regions
    return (regions[0]?.active_count || 0) / total * 100;
  }

  /**
   * Snapshots global governance resilience.
   */
  async snapshotGovernance() {
    const diversity = await this._getFederationDiversity();
    const status = diversity > 80 ? 'OPTIMAL' : diversity > 50 ? 'STABLE' : 'CRITICAL';

    await db.query(`
      INSERT INTO governance_resilience_snapshots (federation_id, resilience_score, governance_status)
      VALUES ('GLOBAL_FEDERATION', ?, ?)
    `, [Math.round(diversity), status]);
  }
}

module.exports = new IndustrialGovernanceService();
