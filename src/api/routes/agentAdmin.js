/**
 * Agent Administration Routes
 * Phase 14 — Multi-Agent Coordination
 */
const express = require('express');
const router = express.Router();

let orchestrator, policy;
try {
    orchestrator = require('../../../../../ppos-preflight-service/src/agents/orchestrator');
    policy = require('../../../../../ppos-preflight-service/src/agents/agentPolicy');
} catch (e) {
    console.warn('[DEGRADED-MODE] Agent Admin routes using sharedMocks:', e.message);
    const mocks = require('../services/sharedMocks');
    mocks.markUsed();
    orchestrator = { agents: [], decisionLog: [], ...mocks.agentOrchestrator };
    policy = { getAgentPolicy: () => ({ mode: 'ADVISORY', source: 'MOCKED' }) };
}

router.get('/status', (req, res) => {
    try {
        const statuses = orchestrator.agents.map(a => ({
            agentType: a.agentType,
            capabilities: a.capabilities,
            policy: policy.getAgentPolicy(a.agentType)
        }));
        // We'll mock the status for now since agents are registered at runtime
        const mockStatuses = [
            { agentType: 'OptimizationAgent', policy: policy.getAgentPolicy('OptimizationAgent') },
            { agentType: 'GuardrailAgent', policy: policy.getAgentPolicy('GuardrailAgent') },
            { agentType: 'RiskAgent', policy: policy.getAgentPolicy('RiskAgent') },
            { agentType: 'RoutingAgent', policy: policy.getAgentPolicy('RoutingAgent') },
            { agentType: 'LearningAgent', policy: policy.getAgentPolicy('LearningAgent') }
        ];

        res.json({ ok: true, agents: orchestrator.agents.length > 0 ? statuses : mockStatuses });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/decisions', (req, res) => {
    // Return sample audit traces for the orchestrator
    res.json({ ok: true, decisions: orchestrator.decisionLog || [] });
});

module.exports = router;
