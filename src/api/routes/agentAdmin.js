/**
 * Agent Administration Routes
 * Phase 14 — Multi-Agent Coordination
 */
const express = require('express');
const router = express.Router();

let orchestrator = null, policy = null;
try {
    orchestrator = require('../upstream/src/agents/orchestrator');
    policy = require('../upstream/src/agents/agentPolicy');
} catch (e) {
    console.error('[CORE-ROUTING] Agent services unavailable:', e.message);
}

router.get('/status', (req, res) => {
    try {
        if (!orchestrator || !policy) {
            return res.json({ ok: true, agents: [], degraded: true });
        }
        const statuses = (orchestrator.agents || []).map(a => ({
            agentType: a.agentType,
            capabilities: a.capabilities,
            policy: policy.getAgentPolicy(a.agentType)
        }));

        res.json({ ok: true, agents: statuses });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/decisions', (req, res) => {
    // Return sample audit traces for the orchestrator
    res.json({ ok: true, decisions: orchestrator ? (orchestrator.decisionLog || []) : [], degraded: !orchestrator });
});

module.exports = router;
