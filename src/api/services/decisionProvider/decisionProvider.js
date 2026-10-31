/**
 * src/api/services/decisionProvider/decisionProvider.js
 *
 * Phase 194F — Multilingual Pricing Assistant & Jev Decision Provider Orchestrator
 *
 * Canon:
 * "Jev may advise. Deterministic governance decides."
 *
 * Enforces:
 * - Deterministic veto rules (arithmetic inconsistencies, invalid unit prices ALWAYS trigger REQUIRES_REVIEW).
 * - Provider fallback chain: JEV -> LLM -> DETERMINISTIC -> REQUIRES_REVIEW.
 * - Normalized audit metadata.
 */

const JevDecisionProvider = require('./jevDecisionProvider');
const DeterministicDecisionProvider = require('./deterministicDecisionProvider');
const LLMDecisionProvider = require('./llmDecisionProvider');
const logger = require('../logger').child('decision-provider');

const FORBIDDEN_TASKS = new Set([
  'ARITHMETIC_VALIDATION',
  'COMPUTED_UNIT_PRICE',
  'MANUFACTURING_PRICE_CALCULATION',
  'SOLVER_OBJECTIVE',
  'RESIDUALS_VERIFICATION',
  'TOLERANCE_CHECK',
  'CHECKSUM_VERIFICATION',
  'REVISION_ACTIVATION',
  'GOVERNED_ACCEPTANCE',
  'TENANT_OWNERSHIP',
  'PERMISSIONS_CHECK',
  'DATABASE_INTEGRITY'
]);

class DecisionProviderOrchestrator {
  constructor() {
    this.jev = new JevDecisionProvider();
    this.deterministic = new DeterministicDecisionProvider();
    this.llm = new LLMDecisionProvider();
  }

  /**
   * Evaluates probabilistic decisions with strict deterministic gate composition.
   */
  async evaluateDecision({ task, state = {}, choices = [], context = {}, thresholds = {} }) {
    if (FORBIDDEN_TASKS.has(task)) {
      throw new Error(`DETERMINISTIC_VETO: Task '${task}' must strictly remain deterministic.`);
    }

    // Deterministic Gate Check: Deterministic arithmetic status always overrides probabilistic advice!
    const deterministicInconsistency = state.validationStatus && state.validationStatus !== 'CONSISTENT';

    let result = null;
    let fallbackUsed = false;
    let fallbackReason = null;

    // 1. Try Jev Provider if enabled
    if (this.jev.isAvailable()) {
      try {
        result = await this.jev.evaluateDecision({ task, state, choices, context, thresholds });
      } catch (err) {
        fallbackUsed = true;
        fallbackReason = `JEV_FAILURE (${err.code || err.message})`;
        logger.warn(`Jev decision provider failed, executing fallback chain: ${err.message}`);
      }
    } else {
      fallbackUsed = true;
      fallbackReason = 'JEV_DISABLED';
    }

    // 2. Fallback to Deterministic or LLM if Jev did not return usable decision
    if (!result) {
      if (this.llm.isAvailable()) {
        try {
          result = await this.llm.evaluateDecision({ task, choices, context });
          result.auditMetadata.fallbackUsed = true;
          result.auditMetadata.fallbackReason = fallbackReason;
        } catch (llmErr) {
          logger.warn(`LLM decision provider fallback failed: ${llmErr.message}`);
        }
      }

      if (!result) {
        result = await this.deterministic.evaluateDecision({ task, state, choices, context });
        result.auditMetadata.fallbackUsed = true;
        result.auditMetadata.fallbackReason = fallbackReason;
      }
    }

    // 3. Enforce Deterministic Veto Rules on final decision
    if (deterministicInconsistency) {
      // Deterministic arithmetic failure forces REQUIRES_REVIEW regardless of provider confidence!
      result.requiresReview = true;
      if (task === 'EVIDENCE_ELIGIBILITY_ASSIST') {
        result.decision = 'REQUIRES_REVIEW';
      }
      result.vetoApplied = true;
      result.vetoReason = `Deterministic status '${state.validationStatus}' overrides ${result.provider} decision.`;
    }

    return result;
  }
}

module.exports = new DecisionProviderOrchestrator();
