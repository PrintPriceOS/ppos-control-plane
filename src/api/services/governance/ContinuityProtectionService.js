/**
 * src/api/services/governance/ContinuityProtectionService.js
 * 
 * Continuity Protection Engine (Phase 31).
 * Preserves manufacturing diversity and prevents regional over-centralization.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('continuity-protection');

class ContinuityProtectionService {
  /**
   * Evaluates global continuity status.
   */
  async evaluateContinuity() {
    const metrics = {
      redundancy: await this._calculateRedundancyRatio(),
      diversity: await this._calculateDiversityScore(),
      criticality: await this._detectCriticalNodes()
    };

    await db.query(`
      INSERT INTO federation_resilience_snapshots (region, redundancy_ratio, diversity_score, criticality_index)
      VALUES ('GLOBAL', ?, ?, ?)
    `, [metrics.redundancy, metrics.diversity, metrics.criticality]);

    return metrics;
  }

  async _calculateRedundancyRatio() {
    // Total capacity / Peak load
    const stats = await db.query('SELECT SUM(capacity_utilization_pct) as total_util, COUNT(*) as node_count FROM print_nodes WHERE status = "ACTIVE"');
    if (!stats[0]?.node_count) return 0;
    const avgUtil = stats[0].total_util / stats[0].node_count;
    return (100 / (avgUtil || 1)); // Higher is better redundancy
  }

  async _calculateDiversityScore() {
    // Unique countries with active nodes
    const countries = await db.query('SELECT COUNT(DISTINCT country) as c_count FROM print_nodes WHERE status = "ACTIVE"');
    return Math.min(100, (countries[0]?.c_count || 0) * 10);
  }

  async _detectCriticalNodes() {
    // Nodes that handle more than 15% of total federation load
    const totalLoad = await db.query('SELECT SUM(capacity_utilization_pct) as total_util FROM print_nodes');
    const nodes = await db.query('SELECT id, capacity_utilization_pct FROM print_nodes WHERE status = "ACTIVE"');
    
    let criticalCount = 0;
    for (const node of nodes) {
      if (node.capacity_utilization_pct / (totalLoad[0]?.total_util || 1) > 0.15) {
        criticalCount++;
      }
    }
    return criticalCount;
  }
}

module.exports = new ContinuityProtectionService();
