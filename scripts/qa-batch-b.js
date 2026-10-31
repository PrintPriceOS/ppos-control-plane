/**
 * Phase 10.B.1 — Formal Validation Script
 * QA PASS for Scorer Quality, Predictive Determinism, and Contract-Awareness.
 */

const fs = require('fs');
const path = require('path');

const servicesPath = path.join(__dirname, '../src/api/services');

// Mock DB
const mockDb = {
    responses: {},
    setResponse: (queryPart, rows) => { mockDb.responses[queryPart] = rows; },
    clear: () => { mockDb.responses = {}; },
    query: async (sql) => {
        const sortedKeys = Object.keys(mockDb.responses).sort((a,b) => b.length - a.length);
        for (const part of sortedKeys) {
            if (sql.toLowerCase().includes(part.toLowerCase())) return { rows: mockDb.responses[part] };
        }
        return { rows: [] };
    }
};

function loadModule(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const module = { exports: {} };
    const requireMock = (name) => {
        if (name === './db') return { query: mockDb.query };
        return require(name);
    };
    const fn = new Function('module', 'exports', 'require', code);
    fn(module, module.exports, requireMock);
    return module.exports;
}

const tenantScorer = loadModule(path.join(servicesPath, 'tenantRiskScorer.js'));
const trendAnalyzer = loadModule(path.join(servicesPath, 'trendAnalyzer.js'));

async function validateTenantRisk() {
    console.log('--- TEST: TENANT RISK QUALITY ---');
    
    // 1. DETERMINISM
    mockDb.clear();
    mockDb.setResponse('jobs', [{ fails: 20, total: 100 }]); // 20% fail
    mockDb.setResponse('tenants', [{ service_tier: 'standard' }]);
    
    const run1 = await tenantScorer.calculateTenantRisk('T1');
    const run2 = await tenantScorer.calculateTenantRisk('T1');
    const isDeterministic = run1.riskScore === run2.riskScore;
    console.log(`[DETERMINISM] Run 1: ${run1.riskScore}, Run 2: ${run2.riskScore} -> ${isDeterministic ? 'PASS' : 'FAIL'}`);

    // 2. RANGE (0-100)
    mockDb.clear();
    mockDb.setResponse('jobs', [{ fails: 100, total: 100 }]); // 100% fail
    mockDb.setResponse('api_audit_log', Array(20).fill({ id: 1 })); // Heavy quota pressure
    mockDb.setResponse('tenants', [{ service_tier: 'strategic_managed' }]);
    const maxRisk = await tenantScorer.calculateTenantRisk('TMAX');
    console.log(`[RANGE] Max signals (Strategic): ${maxRisk.riskScore}/100 -> ${maxRisk.riskScore <= 100 ? 'PASS' : 'FAIL'}`);

    // 3. CONTRACT-AWARENESS (Comparison)
    mockDb.clear();
    mockDb.setResponse('jobs', [{ fails: 40, total: 100 }]); // 40% fail
    
    mockDb.setResponse('tenants', [{ service_tier: 'standard' }]);
    const standard = await tenantScorer.calculateTenantRisk('T-STD');
    
    mockDb.setResponse('tenants', [{ service_tier: 'strategic_managed' }]);
    const strategic = await tenantScorer.calculateTenantRisk('T-STRAT');
    
    const isAware = strategic.riskScore > standard.riskScore;
    console.log(`[CONTRACT-AWARE] Standard: ${standard.riskScore}, Strategic: ${strategic.riskScore} -> ${isAware ? 'PASS' : 'FAIL'}`);
}

async function validateTrendLogic() {
    console.log('\n--- TEST: TREND ANALYZER QUALITY ---');
    
    // 1. UP_FAST (Acceleration)
    mockDb.clear();
    mockDb.setResponse('jobs', [{ 
        recent_fails: 8, recent_total: 10,  // 80% recent
        baseline_fails: 1, baseline_total: 10 // 10% baseline
    }]);
    const trend = await trendAnalyzer.analyzeTrends('tenant', 'T1');
    console.log(`[ACCELERATION] 10% to 80% shift -> Trend: ${trend.trend} (Expected: UP_FAST)`);

    // 2. CONFIDENCE
    mockDb.clear();
    mockDb.setResponse('jobs', [{ 
        recent_fails: 1, recent_total: 1,  // Small sample
        baseline_fails: 0, baseline_total: 1 
    }]);
    const shakyTrend = await trendAnalyzer.analyzeTrends('tenant', 'TSHAKY');
    console.log(`[CONFIDENCE] Small sample (1 job) -> Confidence: ${shakyTrend.confidence.toFixed(2)} (Expected < 0.20)`);
}

async function runQA() {
    await validateTenantRisk();
    await validateTrendLogic();
}

runQA();
