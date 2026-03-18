/**
 * Phase 10 — Batch B: Intelligence Logic Validation
 * Validates: Detectors, Insights, Scopes, Risks, Trends, Recommendations.
 */

const fs = require('fs');
const path = require('path');

const servicesPath = path.join(__dirname, '../src/api/services');

// Mock Database Helper
const mockDb = {
    responses: {},
    setResponse: (queryPart, rows) => {
        mockDb.responses[queryPart] = rows;
    },
    clear: () => {
        mockDb.responses = {};
    },
    query: async (sql, params = []) => {
        const sortedKeys = Object.keys(mockDb.responses).sort((a, b) => b.length - a.length);
        for (const part of sortedKeys) {
            if (sql.toLowerCase().includes(part.toLowerCase())) return { rows: mockDb.responses[part] };
        }
        return { rows: [] };
    }
};

const dbHelper = { query: mockDb.query };

function createModule(code, dbMock) {
    const module = { exports: {} };
    const requireMock = (name) => {
        if (name === './db') return dbMock;
        return require(name);
    };
    const fn = new Function('module', 'exports', 'require', code);
    fn(module, module.exports, requireMock);
    return module.exports;
}

// Read services
const detectorCode = fs.readFileSync(path.join(servicesPath, 'anomalyDetectors.js'), 'utf8');
const insightCode = fs.readFileSync(path.join(servicesPath, 'insightBuilder.js'), 'utf8');
const recomCode = fs.readFileSync(path.join(servicesPath, 'recommendationBuilder.js'), 'utf8');
const tenantScorerCode = fs.readFileSync(path.join(servicesPath, 'tenantRiskScorer.js'), 'utf8');
const trendCode = fs.readFileSync(path.join(servicesPath, 'trendAnalyzer.js'), 'utf8');

const detectors = createModule(detectorCode, dbHelper);
const insights = createModule(insightCode, dbHelper);
const recom = createModule(recomCode, dbHelper);
const tenantScorer = createModule(tenantScorerCode, dbHelper);
const trends = createModule(trendCode, dbHelper);

async function testScenario1() {
    console.log('\nSCENARIO 1: FAILURE_CLUSTER DETECTION');
    mockDb.clear();
    mockDb.setResponse('jobs', [{ tenant_id: 'tenant_test_1', deployment_id: 'dep_1', count: 5 }]);
    
    const anoms = await detectors.detectAll();
    console.log('Detected Anomalies:', anoms.length);
    if (anoms[0] && anoms[0].type === 'FAILURE_CLUSTER' && anoms[0].evidence.metrics.clusters === 5) {
        console.log('✅ PASS: Failure cluster detected correctly.');
    } else {
        console.log('❌ FAIL: Incorrect anomaly detection.');
    }
}

async function testScenario2() {
    console.log('\nSCENARIO 2: CONTRACT-AWARE SEVERITY');
    mockDb.clear();
    mockDb.setResponse('jobs', [{ tenant_id: 'tenant_standard', deployment_id: 'dep_1', count: 10 }]);
    mockDb.setResponse('tenants', [{ service_tier: 'standard' }]);
    
    const anoms = await detectors.detectAll();
    const inst = await insights.buildInsights(anoms);
    console.log('Scenario Standard (10 fails) - Severity:', inst[0]?.severity);
    
    mockDb.setResponse('tenants', [{ service_tier: 'strategic_managed' }]);
    const inst2 = await insights.buildInsights(anoms);
    console.log('Scenario Strategic (10 fails) - Severity:', inst2[0]?.severity);
    
    if (inst[0]?.severity === 'MEDIUM' && inst2[0]?.severity === 'HIGH') {
        console.log('✅ PASS: Severity is contract-aware.');
    } else {
        console.log('❌ FAIL: Severity logic issue.');
    }
}

async function testScenario3() {
    console.log('\nSCENARIO 3: CONTEXT-AWARE RECOMMENDATIONS');
    mockDb.clear();
    mockDb.setResponse('tenants', [{ service_tier: 'strategic_managed' }]);
    
    const tempAnoms = [{ entityType: 'tenant', entityId: 'tenant_test', type: 'FAILURE_CLUSTER', tenant_id: 'tenant_test' }];
    const inst = await insights.buildInsights(tempAnoms);
    const recs = await recom.buildRecommendations(inst, { 
        tenantRisks: [{ tenantId: 'tenant_test', riskScore: 85 }],
        trends: [{ entityId: 'tenant_test', entityType: 'tenant', trend: 'UP_FAST' }]
    });

    console.log('Priority:', recs[0]?.priority);
    console.log('Trend in Rationale:', recs[0]?.rationale?.trend);

    if (recs[0]?.priority === 'HIGH' && recs[0]?.rationale?.trend === 'UP_FAST') {
        console.log('✅ PASS: Recommendations factor in risk/trend data.');
    } else {
        console.log('❌ FAIL: Recommendations missing context.');
    }
}

async function testScenario4() {
    console.log('\nSCENARIO 4: RISK SCORING CONTRACT-AWARENESS');
    mockDb.clear();
    // 50% fails in last 100 jobs
    mockDb.setResponse('jobs', [{ fails: 50, total: 100 }]);
    mockDb.setResponse('tenants', [{ service_tier: 'standard' }]);
    
    const riskStandard = await tenantScorer.calculateTenantRisk('tenant_1');
    console.log('Standard Risk:', riskStandard.riskScore);

    mockDb.setResponse('tenants', [{ service_tier: 'strategic_managed' }]);
    const riskStrategic = await tenantScorer.calculateTenantRisk('tenant_1');
    console.log('Strategic Risk:', riskStrategic.riskScore);

    if (riskStrategic.riskScore > riskStandard.riskScore) {
        console.log('✅ PASS: Risk score evaluates contract correctly.');
    } else {
        console.log('❌ FAIL: Risk scoring level issue.');
    }
}

async function runAll() {
    try {
        console.log('--- STARTING BATCH B LOGIC VALIDATION ---\n');
        await testScenario1();
        await testScenario2();
        await testScenario3();
        await testScenario4();
        console.log('\n--- VALIDATION COMPLETE ---');
    } catch (e) {
        console.error('Validation crashed:', e);
    }
}

runAll();
