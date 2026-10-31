/**
 * Phase 10 — Batch C: Guardrail & Circuit Breaker Validation
 */

const fs = require('fs');
const path = require('path');

const servicesPath = path.join(__dirname, '../src/api/services');

// Mock Dependencies
const mockDb = { query: async () => ({ rows: [] }) };
const mockAudit = {
    logs: [],
    logCircuitBreaker: async (s, r) => { mockAudit.logs.push({ type: 'CB', state: s, reason: r }); },
    logGuardrail: async (t, a, r) => { mockAudit.logs.push({ type: 'GR', tenant: t, action: a, rationale: r }); }
};

function loadModule(filePath, mocks = {}) {
    const code = fs.readFileSync(filePath, 'utf8');
    const module = { exports: {} };
    const requireMock = (name) => {
        if (name === './db') return mockDb;
        if (name === './auditService') return mockAudit;
        if (name === './circuitBreaker') return mocks.cb;
        if (name === './guardrailActions') return mocks.actions;
        return require(name);
    };
    const fn = new Function('module', 'exports', 'require', code);
    fn(module, module.exports, requireMock);
    return module.exports;
}

const mockActions = {
    throttleTenant: async () => ({}),
    delayRetries: async () => ({}),
    pauseQueue: async () => ({}),
    isolateTenant: async () => ({})
};

const cb = loadModule(path.join(servicesPath, 'circuitBreaker.js'), {});
const engine = loadModule(path.join(servicesPath, 'guardrailEngine.js'), { cb, actions: mockActions });

async function testCircuitBreaker() {
    console.log('--- TEST: CIRCUIT BREAKER STATES ---');
    
    // 1. Initial State
    let status = await cb.getStatus();
    console.log('Initial State:', status.state);
    
    // 2. Trip to OPEN (High Failure Rate)
    await cb.evaluate({ failureRate: 0.9, queueDepth: 0 });
    status = await cb.getStatus();
    console.log('Post-Failure State:', status.state);
    
    if (status.state === 'OPEN') {
        console.log('✅ PASS: Circuit Breaker tripped correctly.');
    } else {
        console.log('❌ FAIL: Circuit Breaker state mismatch.');
    }

    // 3. Reset
    await cb.manualReset();
    status = await cb.getStatus();
    console.log('Post-Reset State:', status.state);
}

async function testGuardrailLogic() {
    console.log('\n--- TEST: GUARDRAIL DECISION LOGIC ---');
    
    const payload = {
        tenantRisks: [{ tenantId: 'T1', riskScore: 85 }],
        trends: [{ entityId: 'T1', trend: 'UP_FAST' }]
    };

    const { decisions } = await engine.produceDecisions(payload);
    console.log('Decisions generated:', decisions.length);
    console.log('First Decision Type:', decisions[0]?.type);

    if (decisions[0]?.type === 'ISOLATE_TENANT') {
        console.log('✅ PASS: Correct guardrail produced for high-risk tenant.');
    } else {
        console.log('❌ FAIL: Guardrail logic deficiency.');
    }
}

async function runAll() {
    await testCircuitBreaker();
    await testGuardrailLogic();
}

runAll();
