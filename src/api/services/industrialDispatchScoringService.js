/**
 * src/api/services/industrialDispatchScoringService.js
 * 
 * Autonomous Industrial Dispatch Scoring Layer (Phase 25).
 * Ranks production nodes for jobs based on geospatial, capacity, and economic telemetry.
 * 
 * SIMULATION ONLY - NO PRODUCTION MUTATION.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('dispatch-scoring');

// Configurable Scoring Weights
const DEFAULT_WEIGHTS = {
  capacity_score: 25,
  geographic_score: 20,
  economic_score: 20,
  sla_score: 15,
  reliability_score: 10,
  governance_score: 5,
  sustainability_score: 5
};

class IndustrialDispatchScoringService {
  /**
   * Main entry point for scoring production candidates.
   */
  async scoreDispatchCandidates(jobInput, options = {}) {
    const { tenant_id } = jobInput;
    const weights = options.weights || DEFAULT_WEIGHTS;
    const result = {
      ok: true,
      mode: "SIMULATION_ONLY",
      generated_at: new Date().toISOString(),
      job_input: jobInput,
      candidates: [],
      rejected: []
    };

    try {
      // 1. Fetch all candidate nodes (scoping by tenant if not super admin, though here we fetch all for comparison)
      // In a real scenario, we might filter by tenant capabilities or access.
      const nodes = await db.query(`
        SELECT p.*, 
               pc.capacity_available, pc.capacity_total, pc.lead_time_days,
               pr.reliability_score as node_reliability
        FROM printer_nodes p
        LEFT JOIN printer_capacity pc ON p.id = pc.printer_id AND pc.date = CURDATE()
        LEFT JOIN printer_reliability_metrics pr ON p.id = pr.printer_id
        WHERE p.status != 'REJECTED'
      `);

      for (const node of nodes) {
        const evaluation = this._evaluateNode(node, jobInput, weights);
        if (evaluation.eligible) {
          result.candidates.push(evaluation);
        } else {
          result.rejected.push({
            node_id: node.id,
            display_name: node.name,
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
   * Internal node evaluation logic.
   */
  _evaluateNode(node, job, weights) {
    const reasons = [];
    const risks = [];
    let eligible = true;

    // 1. Hard Constraints (Eligibility)
    if (!node.id) { eligible = false; reasons.push("MISSING_NODE_ID"); }
    if (node.status === 'OFFLINE' || node.sync_status === 'OFFLINE') { 
      eligible = false; 
      reasons.push("NODE_OFFLINE"); 
    }
    
    // Printer count check (using printers column from Phase 24 hardening)
    const printers = node.printers || 0;
    if (printers === 0) {
      eligible = false;
      reasons.push("NO_AVAILABLE_HARDWARE");
    }

    // Capacity Threshold (e.g. 95%)
    const util = node.capacity_utilization_pct || 0;
    if (util >= 95) {
      eligible = false;
      reasons.push("CAPACITY_SATURATED");
    }

    // Governance Blocks
    const govStatus = (node.status || '').toUpperCase();
    if (['SUSPENDED', 'REJECTED', 'INACTIVE'].includes(govStatus)) {
      eligible = false;
      reasons.push(`GOVERNANCE_STATE_RESTRICTED: ${govStatus}`);
    }

    if (!eligible) {
      return { eligible: false, reasons };
    }

    // 2. Scoring Model (0-100 per component)
    const capacity_score = this._scoreCapacity(node);
    const geographic_score = this._scoreGeography(node, job);
    const economic_score = this._scoreEconomic(node, job);
    const sla_score = this._scoreSLA(node, job);
    const reliability_score = node.node_reliability || 80; // Fallback to 80
    const governance_score = this._scoreGovernance(node);
    const sustainability_score = geographic_score; // Distance-based placeholder

    // Weighted Total
    const score_total = Math.round(
      (capacity_score * weights.capacity_score +
       geographic_score * weights.geographic_score +
       economic_score * weights.economic_score +
       sla_score * weights.sla_score +
       reliability_score * weights.reliability_score +
       governance_score * weights.governance_score +
       sustainability_score * weights.sustainability_score) / 100
    );

    return {
      eligible: true,
      node_id: node.id,
      printhouse_id: node.id, // In this model they are often 1:1 or node is child of PH
      display_name: node.name,
      country: node.country,
      city: node.city,
      operational_region: node.region || 'UNKNOWN',
      routing_state: this._deriveRoutingState(node),
      score_total,
      score_breakdown: {
        capacity_score,
        geographic_score,
        economic_score,
        sla_score,
        reliability_score,
        governance_score,
        sustainability_score
      },
      reasons,
      risks
    };
  }

  _scoreCapacity(node) {
    const util = node.capacity_utilization_pct || 0;
    if (util < 60) return 100;
    if (util < 80) return 75;
    if (util < 90) return 40;
    return 10;
  }

  _scoreGeography(node, job) {
    const destCountry = (job.destination_country || '').toUpperCase();
    const destCity = (job.destination_city || '').toUpperCase();
    const nodeCountry = (node.country || '').toUpperCase();
    const nodeCity = (node.city || '').toUpperCase();

    if (!nodeCountry) return 25; // Unknown location fallback

    if (nodeCity === destCity && nodeCountry === destCountry) return 100;
    if (nodeCountry === destCountry) return 85;
    
    // Operational region check (Phase 24 metadata)
    // For simplicity, we compare region strings if they exist
    if (node.region && node.region === job.destination_region) return 70;

    return 50; // Same continent / general international fallback
  }

  _scoreEconomic(node, job) {
    // If we have rates_json, we could do complex pricing simulation.
    // For now, if present, score based on relative competitiveness or just presence.
    if (!node.rates_json) {
      return 50; // Neutral
    }
    return 75; // "Ready" economic profile
  }

  _scoreSLA(node, job) {
    const leadDays = node.production_lead_days || 5;
    const deliveryDays = parseInt(node.delivery_time) || 7;
    const totalDays = leadDays + deliveryDays;
    const required = job.required_delivery_days || 14;

    if (totalDays <= required) return 100;
    if (totalDays <= required + 2) return 60;
    return 20;
  }

  _scoreGovernance(node) {
    const status = (node.status || '').toUpperCase();
    if (status === 'ACTIVE' || status === 'OPERATIONAL') return 100;
    return 50;
  }

  _deriveRoutingState(node) {
    const util = node.capacity_utilization_pct || 0;
    if (util >= 90) return 'SATURATED';
    if (util >= 70) return 'DEGRADED';
    return 'OPTIMAL';
  }
}

module.exports = new IndustrialDispatchScoringService();
