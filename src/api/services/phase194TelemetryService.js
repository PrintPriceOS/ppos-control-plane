/**
 * src/api/services/phase194TelemetryService.js
 *
 * Phase 194H — Structured Telemetry, Latency Metrics & Secret Redaction
 *
 * Responsibilities:
 * 1. Emits structured operational telemetry events across Phase 194 surfaces.
 * 2. Measures latency (durationMs) per operation.
 * 3. Enforces strict secret & document content redaction (no raw PDF buffer, no API keys, no passwords).
 * 4. Provides standardized event taxonomy.
 */

const logger = require('./logger').child('phase194-telemetry');

const TELEMETRY_EVENTS = Object.freeze({
  QUOTE_UPLOAD_STARTED: 'quote_upload_started',
  QUOTE_UPLOAD_COMPLETED: 'quote_upload_completed',
  QUOTE_EXTRACTION_COMPLETED: 'quote_extraction_completed',
  QUOTE_EXTRACTION_FAILED: 'quote_extraction_failed',
  QUOTE_LANGUAGE_DETECTED: 'quote_language_detected',
  QUOTE_INTERPRETATION_COMPLETED: 'quote_interpretation_completed',
  QUOTE_VALIDATION_COMPLETED: 'quote_validation_completed',
  QUOTE_REVIEW_COMPLETED: 'quote_review_completed',

  CALIBRATION_TARGETS_CREATED: 'calibration_targets_created',
  CALIBRATION_RUN_STARTED: 'calibration_run_started',
  CALIBRATION_RUN_COMPLETED: 'calibration_run_completed',
  CALIBRATION_RUN_FAILED: 'calibration_run_failed',

  CURVE_VALIDATION_COMPLETED: 'curve_validation_completed',
  CURVE_REQUIRES_REVIEW: 'curve_requires_review',
  CURVE_REJECTED: 'curve_rejected',

  CALIBRATION_ACCEPTANCE_STARTED: 'calibration_acceptance_started',
  CALIBRATION_ACCEPTANCE_BLOCKED: 'calibration_acceptance_blocked',
  CALIBRATION_ACCEPTANCE_COMPLETED: 'calibration_acceptance_completed',

  PRICING_REVISION_CREATED: 'pricing_revision_created',
  PRICING_REVISION_ACTIVATED: 'pricing_revision_activated',

  JEV_DECISION_REQUESTED: 'jev_decision_requested',
  JEV_DECISION_COMPLETED: 'jev_decision_completed',
  JEV_DECISION_FALLBACK: 'jev_decision_fallback',
  JEV_DECISION_FAILED: 'jev_decision_failed'
});

const SENSITIVE_KEYS = [
  'authorization',
  'api_key',
  'apikey',
  'secret',
  'pdf_buffer',
  'pdfbuffer',
  'raw_content',
  'password',
  'token'
];

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const clean = {};
  for (const [key, val] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk))) {
      clean[key] = '[REDACTED]';
    } else if (typeof val === 'string' && val.length > 2000) {
      // Truncate overly long text snippets to avoid log bloat
      clean[key] = `${val.substring(0, 100)}… [TRUNCATED ${val.length} BYTES]`;
    } else if (Buffer.isBuffer(val)) {
      clean[key] = `[BUFFER ${val.length} BYTES]`;
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

class Phase194TelemetryService {
  constructor() {
    this.EVENTS = TELEMETRY_EVENTS;
  }

  emitEvent(eventName, severity = 'INFO', metadata = {}) {
    const sanitized = sanitizeMetadata(metadata);
    const payload = {
      event: eventName,
      tenantId: metadata.tenantId || null,
      printerNodeId: metadata.printerNodeId || null,
      sessionId: metadata.sessionId || null,
      runId: metadata.runId || null,
      revisionId: metadata.revisionId || null,
      evidenceId: metadata.evidenceId || null,
      traceId: metadata.traceId || `trace-${Date.now()}`,
      durationMs: typeof metadata.durationMs === 'number' ? metadata.durationMs : undefined,
      metadata: sanitized,
      message: metadata.message || `Phase 194 Event: ${eventName}`
    };

    switch (severity.toUpperCase()) {
      case 'DEBUG':
        logger.debug(payload);
        break;
      case 'WARN':
        logger.warn(payload);
        break;
      case 'ERROR':
        logger.error(payload);
        break;
      case 'FATAL':
        logger.fatal(payload);
        break;
      case 'INFO':
      default:
        logger.info(payload);
        break;
    }
    return payload;
  }

  startTimer(operationName, initialContext = {}) {
    const startTime = Date.now();
    const traceId = initialContext.traceId || `trace-${Date.now()}`;

    return {
      finish: (successEvent, additionalMeta = {}) => {
        const durationMs = Date.now() - startTime;
        return this.emitEvent(successEvent || `${operationName}_completed`, 'INFO', {
          ...initialContext,
          ...additionalMeta,
          traceId,
          durationMs
        });
      },
      fail: (failureEvent, error, additionalMeta = {}) => {
        const durationMs = Date.now() - startTime;
        return this.emitEvent(failureEvent || `${operationName}_failed`, 'ERROR', {
          ...initialContext,
          ...additionalMeta,
          traceId,
          durationMs,
          errorCode: error?.code || 'UNKNOWN_ERROR',
          errorMessage: error?.message || String(error)
        });
      }
    };
  }
}

module.exports = new Phase194TelemetryService();
module.exports.TELEMETRY_EVENTS = TELEMETRY_EVENTS;
