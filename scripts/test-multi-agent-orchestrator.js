/**
 * Phase 14 Validation Script
 * Multi-Agent Coordination & Policy-Bounded Orchestration
 */

const orchestrator = require('../../ppos-preflight-service/src/agents/orchestrator');

const OptimizationAgent = require('../../ppos-preflight-service/src/agents/OptimizationAgent');
const GuardrailAgent = require('../../ppos-preflight-service/src/agents/GuardrailAgent');
const RiskAgent = require('../../ppos-preflight-service/src/agents/RiskAgent');
const RoutingAgent = require('../../ppos-preflight-service/src/agents/RoutingAgent');
const LearningAgent = require('../../ppos-preflight-service/src/agents/LearningAgent');

async function runValidation() {
    console.log('=== PHASE 14 MULTi-AGENT ORCHESTRATION VALIDATION ===\n');
    let issues = [];

    console.log('[1] Registering Specialized Agents...');
    orchestrator.registerAgent(OptimizationAgent);
    orchestrator.registerAgent(GuardrailAgent);
    orchestrator.registerAgent(RiskAgent);
    orchestrator.registerAgent(RoutingAgent);
    orchestrator.registerAgent(LearningAgent);

    console.log(`  ✅ Registered ${orchestrator.agents.length} agents into memory bus.\n`);

    console.log('[2] Crafting Complex Multi-Signal Environment Context...');
    const payload = {
        anomalies: [{ id: 'a1', type: 'LATENCY_SPIKE', targetId: 'dep_1', severity: 'HIGH', value: 3000 }],
        tenantRisks: [{ tenantId: 't1', riskScore: 95 }],
        trends: [],
        contractContext: {}
    };

    console.log('[3] Triggering Arbitration Cycle...');
    // In this cycle:
    // 1. OptimizationAgent will propose a CONCURRENCY_TUNE step of 0.2
    // 2. RiskAgent will propose a MITIGATE_RISK action 
    // Wait, let's force a conflict dynamically. We will intentionally hack the rule in the payload 
    // to bypass the engine generation limits and see if the guardrail catches it.
    // Instead of hacking the payload, let's just let the engine generate normal proposals.
    // The Guardrail agent allows step <= 0.5. So 0.2 will be ALLOWED.
    const { decisions: benignDecisions } = await orchestrator.runCycle(payload);
    
    // Verify benign cycle
    const benignTune = benignDecisions.find(d => d.proposal && d.proposal.action === 'CONCURRENCY_TUNE');
    if (benignTune && benignTune.status === 'APPROVED') {
        console.log('  ✅ Benign Optimization passed without Guardrail conflict.');
    } else {
        issues.push('Benign Optimization was unexpectedly blocked or missing.');
    }

    const benignRisk = benignDecisions.find(d => d.proposal && d.proposal.action === 'MITIGATE_RISK');
    if (benignRisk && benignRisk.status === 'APPROVED') {
        console.log('  ✅ Async Risk Mitigation proposal successfully passed alongside Optimization.');
    } else {
        issues.push('Risk Agent proposal was dropped incorrectly.');
    }

    console.log('\n[4] Simulating Strict Policy Violation Conflict...');
    // We hack the agent instance specifically to propose a dangerous action directly
    // bypassing the normal engine, to test the Orchestrator's Conflict Resolver vs Guardrails
    const maliciousProposalPayload = {
        id: 'hack_1',
        agentType: 'OptimizationAgent',
        action: 'CONCURRENCY_TUNE',
        targetId: 'dep_2',
        payload: { proposedChange: { step: 0.8 } } // Over 0.5 safety threshold
    };

    // We feed it directly to the evaluation pipeline bypassing generation
    console.log('  -> OptimizationAgent proposes dangerous CONCURRENCY_TUNE step 0.8');
    const evaluations = [];
    for (const evaluator of orchestrator.agents) {
        if (evaluator.agentType !== 'OptimizationAgent') {
            const ev = await evaluator.evaluate(maliciousProposalPayload);
            ev.agentType = evaluator.agentType;
            evaluations.push(ev);
            console.log(`  -> ${evaluator.agentType} evaluates as: ${ev.action}`);
        }
    }

    const conflictResolver = require('../../ppos-preflight-service/src/agents/conflictResolver');
    const resolution = conflictResolver.resolveConflicts([maliciousProposalPayload], evaluations);

    if (resolution.resolution === 'BLOCKED' && resolution.winningAgent === 'GuardrailAgent') {
        console.log('  ✅ CONFLICT RESOLVED: GuardrailAgent successfully overpowered OptimizationAgent.');
        console.log(`     Reason Logged: ${resolution.reason}`);
    } else {
        issues.push(`Conflict Resolver failed hierarchy arbitration. Expected BLOCKED by GuardrailAgent, got ${resolution.resolution} by ${resolution.winningAgent}`);
    }

    console.log('\n=== VALIDATION SUMMARY ===');
    console.log(`Issues Found: ${issues.length}`);
    issues.forEach(i => console.log('  ❌ Error:', i));

    if (issues.length === 0) {
        console.log('\nFINAL DECISION: GO');
    } else {
        console.log('\nFINAL DECISION: NO-GO');
        process.exit(1);
    }
}

runValidation().catch(console.error);
