/**
 * Optimization Engine for PrintPrice OS
 * Phase 11 & 12 — Autonomous Optimization Layer + Adaptive Learning
 */

// In local workspace, relative path to preflight backend
// In local workspace, relative path to preflight backend; in production, use mocks
let getScore, evaluateLifecycle, runtimeDependencyState;
try {
    const adjuster = require('../../../../ppos-preflight-service/src/services/confidenceAdjuster');
    const lifecycle = require('../../../../ppos-preflight-service/src/services/strategyLifecycleManager');
    getScore = adjuster.getScore;
    evaluateLifecycle = lifecycle.evaluateLifecycle;
    runtimeDependencyState = { source: 'LIVE', degraded: false };
} catch (e) {
    console.warn('[DEGRADED-MODE] Failed to load preflight strategy services:', e.message);
    const mocks = require('./sharedMocks');
    mocks.markUsed();
    getScore = mocks.confidenceAdjuster.getScore;
    evaluateLifecycle = mocks.strategyLifecycleManager.evaluateLifecycle;
    runtimeDependencyState = { source: 'MOCKED', degraded: true, reason: e.message };
}

/**
 * Generates optimization candidates based on current intelligence context.
 */
function generateCandidates(payload) {
    const { anomalies = [], insights = [], tenantRisks = [], trends = [], contractContext = {} } = payload;
    const candidates = [];

    // Rule 1: High Latency -> Concurrency Tune Candidate
    const latencyAnomalies = anomalies.filter(a => a.type === 'LATENCY_SPIKE');
    for (const anomaly of latencyAnomalies) {
        candidates.push({
            id: `opt_cand_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'CONCURRENCY_TUNE',
            targetType: anomaly.targetType || 'deployment',
            targetId: anomaly.targetId,
            rationale: {
                basedOn: ['anomaly', 'trend'],
                summary: `Latency spike detected (${anomaly.severity}). Recommending concurrency reduction to stabilize.`,
                evidence: { anomalyId: anomaly.id, currentValue: anomaly.value }
            },
            proposedChange: { action: 'DECREASE_CONCURRENCY', step: 0.2 },
            expectedBenefit: {
                metric: 'latency',
                expectedDelta: '-15%'
            },
            riskLevel: 'LOW',
            safe: true,
            reversible: true,
            mode: 'shadow' // Default to shadow
        });
    }

    // Rule 2: Constant high load + stable success -> Cost Optimization Candidate
    const highLoadInsights = insights.filter(i => i.type === 'SUSTAINED_HIGH_LOAD' && i.successRate > 99);
    for (const insight of highLoadInsights) {
        candidates.push({
            id: `opt_cand_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'COST_OPTIMIZATION',
            targetType: 'routing',
            targetId: insight.targetId,
            rationale: {
                basedOn: ['insight'],
                summary: 'High sustained load with excellent success rate. Recommending shifting 10% traffic to lower-tier compute path.',
                evidence: {
                    successRate: insight.successRate,
                    load: insight.load
                }
            },
            proposedChange: { action: 'SHIFT_TRAFFIC', percentage: 10, destination: 'tier2_pool' },
            expectedBenefit: {
                metric: 'cost',
                expectedDelta: '-5%'
            },
            riskLevel: 'MEDIUM',
            safe: true,
            reversible: true,
            mode: 'shadow'
        });
    }

    // Rule 3: High failure rate with specific tenant -> Routing Shift
    const tenantRiskTargets = tenantRisks.filter(r => r.riskScore > 75);
    for (const risk of tenantRiskTargets) {
        candidates.push({
            id: `opt_cand_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'ROUTING_SHIFT',
            targetType: 'tenant',
            targetId: risk.tenantId,
            rationale: {
                basedOn: ['risk', 'historical_outcome'],
                summary: `Tenant ${risk.tenantId} shows high risk (${risk.riskScore}). Recommend soft isolation routing shift.`,
                evidence: {
                    riskScore: risk.riskScore
                }
            },
            proposedChange: { action: 'ROUTE_TO_ISOLATED_QUEUE', targetQueue: 'isolated_1' },
            expectedBenefit: {
                metric: 'failure_rate',
                expectedDelta: '-30%'
            },
            riskLevel: 'MEDIUM',
            safe: true,
            reversible: true,
            mode: 'shadow'
        });
    }

    // Rule 4: High queue depth + Upward trend -> Queue Rebalance
    const queueTrends = trends.filter(t => t.entityType === 'queue' && t.trend === 'UP_FAST');
    for (const q of queueTrends) {
         candidates.push({
            id: `opt_cand_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'QUEUE_REBALANCE',
            targetType: 'queue',
            targetId: q.entityId,
            rationale: {
                basedOn: ['trend'],
                summary: `Fast upward trend in queue ${q.entityId}. Recommend soft rebalance.`,
                evidence: {
                    trend: q.trend
                }
            },
            proposedChange: { action: 'SHIFT_WORKERS', addWorkers: 2 },
            expectedBenefit: {
                metric: 'throughput',
                expectedDelta: '+25%'
            },
            riskLevel: 'LOW',
            safe: true,
            reversible: true,
            mode: 'shadow'
        });
    }

    // Enforce contract context & confidence learning rules
    const finalCandidates = [];
    
    candidates.forEach(c => {
        const contract = contractContext[c.targetId];
        if (contract) {
            if (contract.supportModel === 'dedicated' && (c.type === 'QUEUE_REBALANCE' || c.type === 'ROUTING_SHIFT')) {
                c.blockedByContract = true;
                c.rationale.summary += ' [BLOCKED_BY_CONTRACT: Dedicated tier cannot be queue rebalanced or shifted]';
            }
            if (contract.tenantIsolation === 'logical_strict' && c.riskLevel === 'HIGH') {
                c.blockedByContract = true;
                c.rationale.summary += ' [BLOCKED_BY_CONTRACT: High risk optimizations disallowed for strict logical isolation]';
            }
        }
        
        // Phase 12 - Adaptive Learning Suppression
        const currentConfidence = getScore(c.type);
        if (currentConfidence < 0.3) {
            console.log(`[OPTIMIZATION-ENGINE] Suppressing candidate ${c.id} (${c.type}) due to extremely low confidence: ${currentConfidence.toFixed(2)}`);
            // We omit entirely from the array 
        } else {
            // Phase 13 - Controlled Autonomy Expansion
            const lifecycle = evaluateLifecycle(c.type, contractContext[c.targetId] || {}, c.targetType, c.targetId);
            c.mode = lifecycle.currentState || 'SHADOW';

            // Append the known confidence so the UI can rank it
            c.systemConfidence = currentConfidence;
            finalCandidates.push(c);
        }
    });

    return { candidates: finalCandidates };
}

module.exports = {
    generateCandidates
};
