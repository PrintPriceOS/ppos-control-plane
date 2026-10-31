/**
 * Guardrail Engine for PrintPrice OS
 * Phase 10 — Batch C (Autonomous Guardrails)
 */

const circuitBreaker = require('./circuitBreaker');
const { throttleTenant, delayRetries, pauseQueue, isolateTenant } = require('./guardrailActions');

/**
 * Evaluates current intelligence package and produces guardrail decisions.
 */
async function produceDecisions(payload) {
    const { anomalies = [], tenantRisks = [], trends = [] } = payload;
    const decisions = [];

    // 1. Check Circuit Breaker State
    const cb_status = await circuitBreaker.getStatus();
    if (cb_status.state === 'OPEN') {
        decisions.push({
            id: `gr_cb_${Date.now()}`,
            type: 'QUEUE_PAUSE',
            targetType: 'system',
            targetId: 'GLOBAL_QUEUE',
            severity: 'CRITICAL',
            rationale: { reason: 'System Circuit Breaker OPEN', faultCount: cb_status.faultCount },
            safe: true,
            reversible: true
        });
    }

    // 2. Evaluate Tenant-Level Risks
    for (const risk of tenantRisks) {
        const tenantTrend = trends.find(t => t.entityId === risk.tenantId);
        
        // High Risk + Accelerating -> ISOLATE
        if (risk.riskScore > 80 && tenantTrend?.trend === 'UP_FAST') {
            decisions.push({
                id: `gr_isolate_${Date.now()}_${risk.tenantId}`,
                type: 'ISOLATE_TENANT',
                targetType: 'tenant',
                targetId: risk.tenantId,
                severity: 'HIGH',
                rationale: { riskScore: risk.riskScore, trend: tenantTrend.trend },
                safe: true,
                reversible: true
            });
        }

        // Medium Risk + Any UP Trend -> THROTTLE
        if (risk.riskScore > 50 && (tenantTrend?.trend === 'UP' || tenantTrend?.trend === 'UP_FAST')) {
            decisions.push({
                id: `gr_throttle_${Date.now()}_${risk.tenantId}`,
                type: 'THROTTLE',
                targetType: 'tenant',
                targetId: risk.tenantId,
                severity: 'MEDIUM',
                rationale: { riskScore: risk.riskScore, trend: tenantTrend.trend },
                safe: true,
                reversible: true
            });
        }
    }

    return {
        timestamp: new Date().toISOString(),
        decisions
    };
}

module.exports = {
    produceDecisions
};
