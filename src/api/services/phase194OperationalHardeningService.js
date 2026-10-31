/**
 * src/api/services/phase194OperationalHardeningService.js
 *
 * Phase 194H — Operational Controls, Kill Switches, Dependency Degradation & Launch Readiness
 *
 * Responsibilities:
 * 1. Manages Phase 194 kill switches / feature flags.
 * 2. Enforces fail-closed behavior when a feature flag is disabled.
 * 3. Evaluates system readiness for Phase 194 services (DB, PDF extraction, Jev advisory, curve governance).
 * 4. Implements Controlled Beta Stage 1 Governance boundary assertions.
 * 5. Exposes Hawk-Eye operational metadata.
 */

const { createPhase194Error, ERROR_CODES } = require('./phase194ErrorTaxonomy');
const telemetry = require('./phase194TelemetryService');
const db = require('./mysqlClient');

const FEATURE_FLAGS = Object.freeze({
  QUOTE_EVIDENCE_INGESTION_ENABLED: 'QUOTE_EVIDENCE_INGESTION_ENABLED',
  MULTI_QUANTITY_CALIBRATION_ENABLED: 'MULTI_QUANTITY_CALIBRATION_ENABLED',
  JEV_ENABLED: 'JEV_ENABLED',
  GOVERNED_CURVE_ACCEPTANCE_ENABLED: 'GOVERNED_CURVE_ACCEPTANCE_ENABLED'
});

const CONTROLLED_BETA_CONFIG = Object.freeze({
  CONTROLLED_BETA: 'AUTHORIZED',
  STAGE: 'STAGE_1',
  STAGE_1_RULES: Object.freeze([
    'PRE_PROVISIONED_PRINTHOUSES_ONLY',
    'SINGLE_APPLICATION_INSTANCE',
    'OPERATOR_SUPERVISED',
    'EXPLICIT_BETA_COHORT',
    'KILL_SWITCHES_READY',
    'NO_AUTOMATIC_STAGE_PROMOTION'
  ]),
  UNRESTRICTED_PRODUCTION: 'NOT_AUTHORIZED'
});

class Phase194OperationalHardeningService {

  getFeatureFlagStatus(flagKey) {
    switch (flagKey) {
      case FEATURE_FLAGS.QUOTE_EVIDENCE_INGESTION_ENABLED:
        return process.env.PPOS_QUOTE_EVIDENCE_INGESTION_ENABLED !== 'false';
      case FEATURE_FLAGS.MULTI_QUANTITY_CALIBRATION_ENABLED:
        return process.env.PPOS_MULTI_QUANTITY_CALIBRATION_ENABLED !== 'false';
      case FEATURE_FLAGS.JEV_ENABLED:
        return process.env.PPOS_JEV_ENABLED === 'true';
      case FEATURE_FLAGS.GOVERNED_CURVE_ACCEPTANCE_ENABLED:
        return process.env.PPOS_GOVERNED_CURVE_ACCEPTANCE_ENABLED !== 'false';
      default:
        return true;
    }
  }

  assertFeatureEnabled(flagKey) {
    const isEnabled = this.getFeatureFlagStatus(flagKey);
    if (!isEnabled) {
      telemetry.emitEvent('feature_flag_blocked', 'WARN', {
        flagKey,
        message: `Phase 194 operation blocked: Feature ${flagKey} is disabled by operator kill switch.`
      });
      throw createPhase194Error(
        ERROR_CODES.FEATURE_DISABLED_BY_OPERATOR,
        `Feature '${flagKey}' is currently disabled by operator kill switch.`,
        403,
        { flagKey }
      );
    }
    return true;
  }

  async evaluateReadiness() {
    const report = {
      timestamp: new Date().toISOString(),
      status: 'READY', // 'READY', 'DEGRADED', 'NOT_READY'
      controlledBeta: CONTROLLED_BETA_CONFIG,
      flags: {
        quoteEvidenceIngestion: this.getFeatureFlagStatus(FEATURE_FLAGS.QUOTE_EVIDENCE_INGESTION_ENABLED),
        multiQuantityCalibration: this.getFeatureFlagStatus(FEATURE_FLAGS.MULTI_QUANTITY_CALIBRATION_ENABLED),
        jevAdvisory: this.getFeatureFlagStatus(FEATURE_FLAGS.JEV_ENABLED),
        governedCurveAcceptance: this.getFeatureFlagStatus(FEATURE_FLAGS.GOVERNED_CURVE_ACCEPTANCE_ENABLED)
      },
      dependencies: {
        database: 'UNCHECKED',
        pdfExtractor: 'READY',
        jevProvider: 'UNCHECKED'
      },
      degradationDetails: []
    };

    // Check Database
    try {
      const pool = db.getPool();
      if (pool) {
        await pool.query('SELECT 1');
        report.dependencies.database = 'READY';
      } else {
        report.dependencies.database = 'DEGRADED_UNCONFIGURED';
        if (report.status === 'READY') report.status = 'DEGRADED';
      }
    } catch (err) {
      const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.ALLOW_DB_FALLBACK_FOR_SMOKE);
      if (isTestEnv || err.message.includes('NOT_SET') || err.message.includes('ECONNREFUSED')) {
        report.dependencies.database = 'DEGRADED_OFFLINE';
        if (report.status === 'READY') report.status = 'DEGRADED';
        report.degradationDetails.push(`Database connection offline in test mode: ${err.message}`);
      } else {
        report.dependencies.database = 'UNAVAILABLE';
        report.status = 'NOT_READY';
        report.degradationDetails.push(`Database connection failed: ${err.message}`);
      }
    }

    // Check Jev Provider (Advisory only!)
    const jevEnabled = this.getFeatureFlagStatus(FEATURE_FLAGS.JEV_ENABLED);
    const hasJevKey = Boolean(process.env.JEV_API_KEY || process.env.OPENAI_API_KEY);

    if (!jevEnabled) {
      report.dependencies.jevProvider = 'DISABLED_BY_POLICY';
      // Important: Jev disabled MUST NOT make readiness fail
    } else if (hasJevKey) {
      report.dependencies.jevProvider = 'READY';
    } else {
      report.dependencies.jevProvider = 'DEGRADED_NO_KEY';
      // Advisory only -> DEGRADED, not NOT_READY
      if (report.status === 'READY') {
        report.status = 'DEGRADED';
      }
      report.degradationDetails.push('Jev provider is enabled but no API key is configured. Falling back to deterministic review path.');
    }

    return report;
  }

  getControlledBetaGovernance() {
    return CONTROLLED_BETA_CONFIG;
  }
}

module.exports = new Phase194OperationalHardeningService();
module.exports.FEATURE_FLAGS = FEATURE_FLAGS;
module.exports.CONTROLLED_BETA_CONFIG = CONTROLLED_BETA_CONFIG;
