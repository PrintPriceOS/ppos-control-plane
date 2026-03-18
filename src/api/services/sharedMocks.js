/**
 * Shared Mocks for PrintPrice OS Control Plane
 * Provides HONEST fallback services when monorepo dependencies are missing in production.
 * These mocks are marked as 'DEGRADED' to avoid false positives in governance or optimization.
 */

const DEGRADED_STATE = {
    source: 'MOCKED',
    degraded: true,
    available: false,
    reason: 'Monorepo dependency (ppos-preflight-service) not found in isolated production deployment.'
};

const sharedMocks = {
    wasUsed: false,
    markUsed: function() { this.wasUsed = true; },
    
    // confidenceAdjuster
    confidenceAdjuster: {
        getScore: (strategy) => 0, // Conservative: Zero confidence if service is missing
        getSystemConfidence: () => 0,
        adjust: (strategy, outcome) => ({ ...DEGRADED_STATE, adjusted: false }),
        ...DEGRADED_STATE
    },

    // strategyLifecycleManager
    strategyLifecycleManager: {
        evaluateLifecycle: (strategy) => ({ currentState: 'UNAVAILABLE', transition: null, ...DEGRADED_STATE }),
        getLifecycleState: (strategy) => 'UNAVAILABLE',
        demoteToSuppressed: () => {},
        ...DEGRADED_STATE
    },

    // autonomyPolicy
    autonomyPolicy: {
        config: {
            global_kill_switch: true, // Fail-safe: Enable kill switch if policy is missing? Or safe default.
            default_mode: 'ADVISORY',
            max_risk_score: 0,
            ...DEGRADED_STATE
        }
    },

    // autonomyEligibility
    autonomyEligibility: {
        determineEligibility: (strategy) => ({ eligible: false, reason: 'SERVICE_UNAVAILABLE', metrics: {}, ...DEGRADED_STATE })
    },

    // instanceRegistry
    instanceRegistry: {
        getAll: () => [], // No instances visible in degraded isolation
        get: (id) => ({ id, status: 'UNKNOWN', ...DEGRADED_STATE }),
        ...DEGRADED_STATE
    },

    // signalIngestor
    signalIngestor: {
        getLatestSignals: () => [],
        ...DEGRADED_STATE
    },

    // auditLogger (federation)
    auditLogger: {
        getFederationLogs: () => [{ 
            timestamp: new Date().toISOString(), 
            event: 'SYSTEM_DEGRADED', 
            action: 'BOOT_IN_ISOLATION', 
            details: 'Control Plane started without ppos-preflight-service monorepo link.',
            ...DEGRADED_STATE 
        }],
        ...DEGRADED_STATE
    },

    // globalPolicyRegistry / rolloutEngine / postureAggregator
    globalPolicyRegistry: { getAll: () => [], ...DEGRADED_STATE },
    policyRolloutEngine: { getRollouts: () => [], ...DEGRADED_STATE },
    globalPostureAggregator: { buildNetworkSnapshot: () => ({ status: 'DEGRADED', nodes: 0, ...DEGRADED_STATE }), ...DEGRADED_STATE },
    
    // learningEngine / adaptiveFeedback / optimizationMemory / ranker / loop
    learningEngine: { getKnowledgeState: () => ({ version: 'NONE', ...DEGRADED_STATE }), ...DEGRADED_STATE },
    adaptiveFeedback: { getLoopStatus: () => 'UNAVAILABLE', ...DEGRADED_STATE },
    optimizationMemory: { dumpMemory: () => [], ...DEGRADED_STATE },
    strategyRanker: { rankStrategies: () => ({ bestStrategies: [], ...DEGRADED_STATE }), ...DEGRADED_STATE },
    learningLoop: { ingestEvaluatorOutcome: () => {}, ...DEGRADED_STATE },

    // agentRegistry / orchestrator
    agentRegistry: { getAllAgents: () => [], ...DEGRADED_STATE },
    agentOrchestrator: { getActiveTasks: () => [], agents: [], decisionLog: [], ...DEGRADED_STATE }
};

module.exports = sharedMocks;
