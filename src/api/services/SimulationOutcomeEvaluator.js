/**
 * src/api/services/SimulationOutcomeEvaluator.js
 * 
 * Simulation Outcome Evaluator (Phase 33).
 * Evaluates simulation results and generates autonomous recommendations.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('simulation-evaluator');

class SimulationOutcomeEvaluator {
  /**
   * Evaluates the outcome of a simulation run.
   */
  async evaluateOutcome(simulationId, outcomeData) {
    try {
      const evaluation = {
        survivability_delta: outcomeData.survivability_delta || 0,
        economic_impact_pct: outcomeData.economic_impact_pct || 0,
        governance_delta: outcomeData.governance_delta || 0,
        evaluation_data: outcomeData
      };

      await db.query(`
        INSERT INTO simulation_outcome_evaluations (simulation_id, survivability_delta, economic_impact_pct, governance_delta, evaluation_data)
        VALUES (?, ?, ?, ?, ?)
      `, [simulationId, evaluation.survivability_delta, evaluation.economic_impact_pct, evaluation.governance_delta, JSON.stringify(evaluation.evaluation_data)]);

      const recommendation = this._generateRecommendation(evaluation);
      
      await db.query(`
        INSERT INTO autonomous_simulation_recommendations (simulation_id, action, reason, confidence_score)
        VALUES (?, ?, ?, ?)
      `, [simulationId, recommendation.action, recommendation.reason, recommendation.confidence]);

      return { evaluation, recommendation };
    } catch (err) {
      logger.error({ event: 'evaluation_failed', simulation_id: simulationId, error: err.message });
      throw err;
    }
  }

  _generateRecommendation(evalData) {
    if (evalData.survivability_delta < -0.1) return { action: 'REJECT', reason: 'High survivability risk', confidence: 0.95 };
    if (evalData.economic_impact_pct < -0.2) return { action: 'REROUTE', reason: 'Excessive economic loss', confidence: 0.88 };
    if (evalData.governance_delta < -0.05) return { action: 'HOLD', reason: 'Governance violation detected', confidence: 0.92 };
    
    return { action: 'EXECUTE', reason: 'Stable simulation outcome', confidence: 0.98 };
  }
}

module.exports = new SimulationOutcomeEvaluator();
