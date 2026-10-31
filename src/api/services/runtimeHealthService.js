/**
 * src/api/services/runtimeHealthService.js
 * 
 * Phase 192F Runtime Health & Observability Service.
 * Tracks runtime metrics and evaluates domain-level operational health.
 * 
 * Principles:
 *   HEALTHY != CAPABILITY_ENABLED (Health measures operational integrity; capability measures governance)
 *   END_TO_END_TRACEABILITY (Correlates requests via traceId/orderId across domains)
 */
const killSwitchService = require('./runtimeKillSwitchService');

const domainMetrics = {
    discovery: { requests: 0, denials: 0, failures: 0, lastSuccess: null, lastFailure: null },
    quoting: { requests: 0, denials: 0, failures: 0, totalDurationMs: 0, lastSuccess: null, lastFailure: null },
    routing: { requests: 0, denials: 0, failures: 0, totalDurationMs: 0, lastSuccess: null, lastFailure: null },
    dispatch: { requests: 0, denials: 0, failures: 0, retries: 0, totalDurationMs: 0, lastSuccess: null, lastFailure: null },
    telemetry: { events: 0, rejections: 0, replays: 0, outOfOrder: 0, lastSuccess: null, lastFailure: null }
};

class RuntimeHealthService {

    recordMetric(domain, type, data = {}) {
        if (!domainMetrics[domain]) return;
        const dom = domainMetrics[domain];

        if (type === 'request' || type === 'event') dom[type === 'event' ? 'events' : 'requests']++;
        if (type === 'denial') dom.denials++;
        if (type === 'failure') dom.failures++;
        if (type === 'retry') dom.retries = (dom.retries || 0) + 1;
        if (type === 'replay') dom.replays = (dom.replays || 0) + 1;
        if (type === 'outOfOrder') dom.outOfOrder = (dom.outOfOrder || 0) + 1;
        if (data.durationMs) dom.totalDurationMs = (dom.totalDurationMs || 0) + data.durationMs;

        if (type === 'success') dom.lastSuccess = new Date().toISOString();
        if (type === 'failure') dom.lastFailure = new Date().toISOString();
    }

    /**
     * Evaluates domain health status.
     * Statuses: HEALTHY, DEGRADED, UNHEALTHY, PAUSED
     */
    async getRuntimeHealth() {
        const activeSwitches = await killSwitchService.getActiveKillSwitches();
        const globalKill = activeSwitches.some(ks => ks.scope === 'GLOBAL' && ks.capability === 'ALL');

        const domains = {};
        for (const domKey of Object.keys(domainMetrics)) {
            const metrics = domainMetrics[domKey];
            const capNameMap = {
                discovery: 'MARKETPLACE_VISIBLE',
                quoting: 'LIVE_QUOTING_ALLOWED',
                routing: 'JOB_ROUTING_ALLOWED',
                dispatch: 'PRODUCTION_DISPATCH_ALLOWED',
                telemetry: 'PRODUCTION_DISPATCH_ALLOWED'
            };

            const targetCap = capNameMap[domKey];
            const domKill = activeSwitches.some(ks => ks.scope === 'GLOBAL' && (ks.capability === 'ALL' || ks.capability === targetCap));

            let status = 'HEALTHY';
            if (globalKill || domKill) {
                status = 'PAUSED';
            } else if (metrics.failures > 5) {
                status = 'UNHEALTHY';
            } else if (metrics.failures > 0) {
                status = 'DEGRADED';
            }

            domains[domKey] = {
                status,
                capabilityEnabled: !domKill,
                metrics: { ...metrics }
            };
        }

        return {
            overallStatus: globalKill ? 'PAUSED' : 'HEALTHY',
            activeKillSwitchesCount: activeSwitches.length,
            domains,
            evaluatedAt: new Date().toISOString()
        };
    }
}

module.exports = new RuntimeHealthService();
