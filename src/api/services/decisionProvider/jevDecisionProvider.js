/**
 * src/api/services/decisionProvider/jevDecisionProvider.js
 *
 * Phase 194F — Jev Probabilistic Decision Provider Adapter
 *
 * Canon:
 * "Jev may advise. Deterministic governance decides."
 *
 * Features:
 * - Feature flagged via JEV_ENABLED (default false).
 * - Implements POST /v1/systemone integration.
 * - Strict task allowlist (QUOTE_FIELD_CLASSIFICATION, OFFER_GROUP_CLASSIFICATION,
 *   AMBIGUITY_ROUTING, TERMINOLOGY_DISAMBIGUATION, EVIDENCE_ELIGIBILITY_ASSIST).
 * - Enforces minimum prompt/context payload (minimization & privacy).
 * - Configurable timeout & error classification (JEV_TIMEOUT, JEV_UNAVAILABLE, JEV_AUTH_ERROR).
 * - Returns normalized decision contract.
 */

const ALLOWED_JEV_TASKS = new Set([
  'QUOTE_FIELD_CLASSIFICATION',
  'OFFER_GROUP_CLASSIFICATION',
  'AMBIGUITY_ROUTING',
  'TERMINOLOGY_DISAMBIGUATION',
  'EVIDENCE_ELIGIBILITY_ASSIST'
]);

const FORBIDDEN_JEV_TASKS = new Set([
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

class JevDecisionProvider {
  constructor(config = {}) {
    this.enabled = config.enabled ?? (process.env.JEV_ENABLED === 'true');
    this.baseUrl = config.baseUrl || process.env.JEV_API_BASE_URL || 'https://api.typesafe.ai';
    this.apiKey = config.apiKey || process.env.JEV_API_KEY || '';
    this.minConfidence = config.minConfidence ?? (parseFloat(process.env.JEV_MIN_CONFIDENCE) || 0.85);
    this.timeoutMs = config.timeoutMs || parseInt(process.env.JEV_TIMEOUT_MS || '3000', 10);
  }

  isAvailable() {
    return Boolean(this.enabled && this.apiKey);
  }

  /**
   * Minimizes context payload sent to Jev to prevent leaking tenant secrets or full quote documents.
   */
  minimizeContext(context = {}, state = {}) {
    return {
      snippet: (context.snippet || '').substring(0, 500),
      documentLanguage: context.documentLanguage || 'de',
      fieldHint: context.fieldHint || null,
      offerSummary: context.offerSummary || null,
      knownKeys: state ? Object.keys(state).slice(0, 10) : []
    };
  }

  /**
   * Main evaluation entrypoint
   */
  async evaluateDecision({ task, state, choices = [], context = {}, thresholds = {} }) {
    if (FORBIDDEN_JEV_TASKS.has(task)) {
      throw new Error(`JEV_FORBIDDEN_TASK: Task '${task}' is strictly deterministic and cannot be delegated to Jev.`);
    }

    if (!ALLOWED_JEV_TASKS.has(task)) {
      throw new Error(`JEV_UNSUPPORTED_TASK: Task '${task}' is not allowed for Jev provider.`);
    }

    if (!this.isAvailable()) {
      const err = new Error('Jev provider disabled or unconfigured');
      err.code = 'JEV_DISABLED';
      throw err;
    }

    const minConfidence = thresholds.minConfidence ?? this.minConfidence;
    const minimizedContext = this.minimizeContext(context, state);
    const requestedAt = new Date().toISOString();

    const payload = {
      task,
      choices,
      context: minimizedContext,
      minConfidence
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Correlation-ID': context.correlationId || `jev-${Date.now()}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        const err = new Error('Jev API Authentication Error');
        err.code = 'JEV_AUTH_ERROR';
        throw err;
      }

      if (response.status === 429) {
        const err = new Error('Jev API Rate Limited');
        err.code = 'JEV_RATE_LIMITED';
        throw err;
      }

      if (!response.ok) {
        const err = new Error(`Jev API Error: HTTP ${response.status}`);
        err.code = 'JEV_UNAVAILABLE';
        throw err;
      }

      const body = await response.json();
      const completedAt = new Date().toISOString();

      if (!body || typeof body.decision === 'undefined') {
        const err = new Error('Jev returned invalid response schema');
        err.code = 'JEV_INVALID_RESPONSE';
        throw err;
      }

      const confidence = typeof body.confidence === 'number' ? body.confidence : 0.5;
      const requiresReview = confidence < minConfidence;

      return {
        provider: 'JEV',
        task,
        decision: body.decision,
        confidence,
        rawProviderMetadata: {
          model: body.model || 'systemone-v1',
          promptTokens: body.usage?.prompt_tokens,
          completionTokens: body.usage?.completion_tokens
        },
        requiresReview,
        auditMetadata: {
          provider: 'JEV',
          providerModel: body.model || 'systemone-v1',
          task,
          decision: body.decision,
          confidence,
          requestedAt,
          completedAt,
          fallbackUsed: false
        }
      };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        const timeoutErr = new Error('Jev API request timed out');
        timeoutErr.code = 'JEV_TIMEOUT';
        throw timeoutErr;
      }

      if (!err.code) {
        err.code = 'JEV_UNAVAILABLE';
      }
      throw err;
    }
  }
}

module.exports = JevDecisionProvider;
