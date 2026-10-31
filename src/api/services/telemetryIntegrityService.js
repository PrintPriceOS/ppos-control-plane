/**
 * src/api/services/telemetryIntegrityService.js
 *
 * Phase 23 — Telemetry Hardening
 * Standardizes, verifies, and aggregates telemetry signals across all services.
 */

const REQUIRED_FIELDS = ['timestamp', 'severity', 'service', 'scope', 'event', 'traceId'];
const SEVERITY_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];

class TelemetryIntegrityService {

    /**
     * Verify a telemetry event conforms to the standard shape.
     * Returns { valid: boolean, missing: string[], warnings: string[] }
     */
    verifyTelemetryShape(event = {}) {
        const missing = REQUIRED_FIELDS.filter(f => event[f] === undefined || event[f] === null);
        const warnings = [];

        if (event.severity && !SEVERITY_LEVELS.includes(event.severity)) {
            warnings.push(`Unknown severity level: ${event.severity}`);
        }
        if (event.timestamp && isNaN(Date.parse(event.timestamp))) {
            warnings.push(`Invalid timestamp format: ${event.timestamp}`);
        }
        if (event.error === null) {
            warnings.push('error field is explicitly null — use undefined or omit if no error');
        }

        return { valid: missing.length === 0, missing, warnings };
    }

    /**
     * Build a standards-compliant telemetry event.
     */
    buildEvent({ service, scope, event, severity = 'INFO', traceId, metadata = {} } = {}) {
        return {
            timestamp: new Date().toISOString(),
            severity,
            service: service || 'unknown',
            scope: scope || 'general',
            event: event || 'UNSPECIFIED',
            traceId: traceId || this._generateTraceId(),
            metadata,
        };
    }

    /**
     * Aggregate health signals from an array of service results.
     * Each signal: { service, ok, latencyMs?, error? }
     */
    aggregateHealthSignals(signals = []) {
        const total = signals.length;
        const passed = signals.filter(s => s.ok).length;
        const failed = signals.filter(s => !s.ok);
        const score = total === 0 ? 100 : Math.round((passed / total) * 100);
        const avgLatency = signals
            .filter(s => s.latencyMs != null)
            .reduce((sum, s, _, arr) => sum + s.latencyMs / arr.length, 0);

        return {
            score,
            total,
            passed,
            failed: failed.length,
            failedServices: failed.map(s => s.service),
            avgLatencyMs: Math.round(avgLatency),
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Detect telemetry drift: events emitted without the standard shape.
     * Accepts an array of raw events and returns drift report.
     */
    detectTelemetryDrift(events = []) {
        const drifted = [];
        for (const ev of events) {
            const { valid, missing, warnings } = this.verifyTelemetryShape(ev);
            if (!valid || warnings.length > 0) {
                drifted.push({ event: ev, missing, warnings });
            }
        }
        return {
            total: events.length,
            driftedCount: drifted.length,
            driftRate: events.length ? ((drifted.length / events.length) * 100).toFixed(1) : '0.0',
            drifted,
        };
    }

    /**
     * Validate trace integrity across a chain of events.
     * All events in a chain must share the same traceId.
     */
    validateTraceIntegrity(events = []) {
        if (events.length === 0) return { valid: true, issues: [] };
        const traceIds = [...new Set(events.map(e => e.traceId).filter(Boolean))];
        const issues = [];

        if (traceIds.length > 1) {
            issues.push(`Trace fragmentation detected: found ${traceIds.length} distinct traceIds — expected 1`);
        }
        const missing = events.filter(e => !e.traceId);
        if (missing.length > 0) {
            issues.push(`${missing.length} event(s) missing traceId`);
        }

        return { valid: issues.length === 0, issues, traceIds };
    }

    _generateTraceId() {
        return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

module.exports = new TelemetryIntegrityService();
