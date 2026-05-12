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
const eventOrchestrator = require('./IndustrialEventOrchestrationService');

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

      // Phase 34: Immutable Evidence Ledger - Record Scoring Decision
      try {
        const evidenceLedger = require('./ManufacturingEvidenceLedgerService');
        const evidencePayload = {
          dispatch_id: jobInput.id || 'SCORING_SIMULATION',
          tenant_id: jobInput.tenant_id,
          evidence_type: 'DISPATCH_SCORING',
          payload: {
            job_input: jobInput,
            weights,
            top_candidates: result.candidates.slice(0, 3).map(c => ({ id: c.node_id, score: c.score_total })),
            rejected_count: result.rejected.length
          }
        };
        await evidenceLedger.appendEvidence(evidencePayload);

        // Phase C: Emit Failover Routing Evidence if we have candidates
        if (result.candidates.length > 0) {
            await eventOrchestrator._publish('federation.failover.evidence', {
                jobId: jobInput.id,
                best_candidate: result.candidates[0].node_id,
                alternative_count: result.candidates.length - 1,
                scoring_mode: result.mode
            });
        }
      } catch (e) {
        logger.warn({ event: 'scoring_evidence_failed', error: e.message });
      }

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

    // 2.5 Live Capacity Eligibility (Phase 34)
    const now = new Date();
    const lastHeartbeat = node.last_heartbeat_at ? new Date(node.last_heartbeat_at) : null;
    const heartbeatAgeMinutes = lastHeartbeat ? (now - lastHeartbeat) / (1000 * 60) : 9999;
    
    if (node.status === 'OFFLINE' || heartbeatAgeMinutes > 15) {
      return { eligible: false, reasons: ['NODE_OFFLINE_OR_STALE_TELEMETRY'] };
    }

    // 3. Phase 1 Industrial Performance Scores (Live Topology)
    const timelineStability = node.uptime_score || 95; 
    const futureSurvivability = await this._scoreFutureSurvivability(node);
    const temporalRiskScore = 100 - (node.failure_probability * 150 || 0);
    const geographicScore = this._scoreGeography(node, job);
    
    // Industrial Performance Scaling (Phase 1)
    const economicFactor = node.economic_efficiency || 1.0;
    const profitabilityScore = (marginValidation.projection?.profitability_score || 70) * economicFactor;

    // 3.5 Live Capacity & Throughput Scoring (Phase 34 + Phase 1)
    let liveCapacityScore = 100;
    if (node.capacity_utilization_pct > 95) liveCapacityScore = 10;
    else if (node.capacity_utilization_pct > 80) liveCapacityScore = 40;
    else if (node.capacity_utilization_pct > 60) liveCapacityScore = 70;

    const throughputBonus = Math.min(20, (node.throughput || 0) / 1000); // Small bonus for higher throughput capacity

    // Weighted Total Calculation (Phase 1 Industrial Mix)
    const score_total = Math.round(
      (futureSurvivability * weights.temporal +
       timelineStability * weights.governance +
       temporalRiskScore * weights.reliability +
       profitabilityScore * weights.profitability +
       geographicScore * weights.geographic +
       liveCapacityScore * 10 +
       throughputBonus * 5) / 115 // Adjusted denominator for new weight mix
    );

    return {
      eligible: true,
      node_id: node.id,
      display_name: node.company_name || node.name,
      score_total,
      industrial_metrics: {
        uptime_score: timelineStability,
        economic_efficiency: economicFactor,
        throughput: node.throughput || 0
      },
      temporal_breakdown: {
        timeline_stability_score: timelineStability,
        future_survivability_score: futureSurvivability,
        temporal_risk_score: temporalRiskScore,
        live_capacity_score: liveCapacityScore,
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
