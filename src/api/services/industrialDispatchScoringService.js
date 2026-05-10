/**
 * src/api/services/industrialDispatchScoringService.js
 * 
 * Temporal Industrial Intelligence Scoring Layer (Phase 32).
 * Ranks production nodes based on future survivability and multi-timeline stability.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('dispatch-scoring');
const marginService = require('./economics/MarginOptimizationService');
const governanceService = require('./governance/IndustrialGovernanceService');
const temporalService = require('./temporal/TemporalIntelligenceService');

class IndustrialDispatchScoringService {
  /**
   * Main entry point for scoring production candidates.
   */
  async scoreDispatchCandidates(jobInput, options = {}) {
    // Phase 32: Dynamic Weights based on temporal stability
    const weights = await this._resolveDynamicWeights(jobInput);
    
    const result = {
      ok: true,
      mode: "TEMPORAL_FUTURE_ENGINE",
      generated_at: new Date().toISOString(),
      job_input: jobInput,
      candidates: [],
      rejected: []
    };

    try {
      // 1. Fetch nodes with live reliability metrics
      const nodes = await db.query(`
        SELECT p.*, 
               rm.trust_score,
               rm.sla_success_rate,
               rm.failure_probability,
               rm.heartbeat_stability
        FROM print_nodes p
        LEFT JOIN printer_reliability_metrics rm ON p.id = rm.printer_id
        WHERE p.status != 'REJECTED'
      `);

      for (const node of nodes) {
        const evaluation = await this._evaluateNodeTemporal(node, jobInput, weights);
        if (evaluation.eligible) {
          result.candidates.push(evaluation);
        } else {
          result.rejected.push({
            node_id: node.id,
            display_name: node.company_name || node.name,
            reason: evaluation.reasons[0] || 'Unknown rejection'
          });
        }
      }

      // Sort candidates by total score descending
      result.candidates.sort((a, b) => b.score_total - a.score_total);

      // Assign ranks
      result.candidates.forEach((c, idx) => {
        c.rank = idx + 1;
      });

      return result;
    } catch (err) {
      logger.error({ event: 'scoring_failed', error: err.message });
      return { ok: false, error: err.message };
    }
  }

  /**
   * Resolves scoring weights dynamically based on temporal state.
   */
  async _resolveDynamicWeights(job) {
    const globalPressure = await db.query('SELECT AVG(capacity_utilization_pct) as avg_util FROM print_nodes');
    const pressure = globalPressure[0]?.avg_util || 0;

    // Phase 32: Temporal & Long-term focus
    if (pressure > 85) {
      // High load: prioritize future survivability and timeline stability
      return {
        temporal: 40,
        governance: 25,
        reliability: 15,
        profitability: 10,
        geographic: 10
      };
    }

    return {
      temporal: 25,
      governance: 20,
      reliability: 20,
      profitability: 20,
      geographic: 15
    };
  }

  /**
   * Internal node evaluation logic using temporal and future intelligence.
   */
  async _evaluateNodeTemporal(node, job, weights) {
    const reasons = [];
    let eligible = true;

    // 1. Hard Governance Blocks (Phase 31)
    const safety = await governanceService.evaluateDispatchSafety(node.id, job);
    if (!safety.safe) {
      eligible = false;
      reasons.push(safety.reason);
    }

    // 2. Economic Block (Phase 30)
    const marginValidation = await marginService.validateDispatchEconomics(node.id, job);
    if (!marginValidation.ok) {
      eligible = false;
      reasons.push(marginValidation.reason);
    }

    if (!eligible) {
      return { eligible: false, reasons };
    }

    // 3. Phase 32 Temporal Scores
    const timelineStability = 95; // Baseline
    const futureSurvivability = await this._scoreFutureSurvivability(node);
    const temporalRiskScore = 100 - (node.failure_probability * 150 || 0);
    const geographicScore = this._scoreGeography(node, job);
    const profitabilityScore = marginValidation.projection?.profitability_score || 70;

    // Weighted Total Calculation
    const score_total = Math.round(
      (futureSurvivability * weights.temporal +
       timelineStability * weights.governance +
       temporalRiskScore * weights.reliability +
       profitabilityScore * weights.profitability +
       geographicScore * weights.geographic) / 100
    );

    return {
      eligible: true,
      node_id: node.id,
      display_name: node.company_name || node.name,
      score_total,
      temporal_breakdown: {
        timeline_stability_score: timelineStability,
        future_survivability_score: futureSurvivability,
        temporal_risk_score: temporalRiskScore,
        future_congestion_probability: (node.capacity_utilization_pct || 0) / 100,
        timeline_resilience_weight: weights.temporal / 100
      },
      reasons
    };
  }

  async _scoreFutureSurvivability(node) {
    // Heuristic: Nodes with lower current utilization and higher redundancy have better future survivability
    const util = node.capacity_utilization_pct || 0;
    const stability = node.heartbeat_stability || 1.0;
    return Math.round((100 - util) * stability);
  }

  _scoreGeography(node, job) {
    const destCountry = (job.destination_country || '').toUpperCase();
    const nodeCountry = (node.country || '').toUpperCase();
    if (nodeCountry === destCountry) return 100;
    if (node.region && node.region === job.destination_region) return 70;
    return 40;
  }
}

module.exports = new IndustrialDispatchScoringService();
