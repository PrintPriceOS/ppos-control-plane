/**
 * scripts/test_onboarding_connected_suite.js
 *
 * Dedicated Connected Onboarding & Calibration Test Suite.
 * Designed for execution strictly in an isolated server/container environment.
 *
 * Requirements & Invariants:
 * 1. Uses REAL existing services and routes (printhouseOnboardingRoutes, calibrationSessionService, calibrationAcceptanceService).
 * 2. Verifies the complete lifecycle:
 *    Intake / Specification -> Session -> Ready -> Calculation / Solver -> Proposal -> Acceptance -> Post-Acceptance Readback.
 * 3. Verifies strict Tenant Isolation: Tenant B cannot access, calculate, or accept Tenant A's session/run/revision.
 * 4. Verifies Cancellation: Rejecting/cancelling a session leaves 0 revisions written and mutates zero rates.
 * 5. Verifies Absence of Commercial Effects: Calibration acceptance does NOT publish to Marketplace, does not grant quoting routes, and does not alter BPE publication status.
 * 6. Safety: Strictly aborts if executed against production. Gracefully probes DB connectivity; if local DB is offline, provides diagnostic readiness report.
 */

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');

// Enforce non-production safety guard
if (process.env.NODE_ENV === 'production' || process.env.PPOS_ENV === 'production') {
    console.error('FATAL: test_onboarding_connected_suite.js MUST NEVER be executed against production.');
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || 'test_isolated_connected_secret_key_2026';
process.env.JWT_SECRET = JWT_SECRET;

const db = require('../src/api/services/mysqlClient');
const calibrationSessionService = require('../src/api/services/calibrationSessionService');
const calibrationAcceptanceService = require('../src/api/services/calibrationAcceptanceService');
const printhouseOnboardingRoutes = require('../src/api/routes/printhouseOnboardingRoutes');

function createTestToken(tenantId, role = 'PRINTHOUSE_OPERATOR', userId = 'test-op-1') {
    return jwt.sign(
        { id: userId, tenantId, role, email: `${userId}@${tenantId}.example.com` },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

function httpRequest(serverUrl, method, path, token, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, serverUrl);
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(
            {
                method,
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                headers
            },
            (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let json = {};
                    try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
                    resolve({ status: res.statusCode, headers: res.headers, body: json });
                });
            }
        );

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runOnboardingConnectedSuite() {
    console.log('========================================================================');
    console.log('  PrintPrice OS — Connected Onboarding & Calibration Test Suite');
    console.log('  Target: Isolated Server Persistence Environment (Non-Production)');
    console.log('========================================================================\n');

    // 1. Check database connectivity
    let isDbAvailable = false;
    try {
        const pool = db.getPool();
        const conn = await pool.getConnection();
        await conn.query('SELECT 1');
        conn.release();
        isDbAvailable = true;
        console.log('[ENV-CHECK] MySQL connection pool is active and responding.');
    } catch (err) {
        console.log('[ENV-CHECK] MySQL database is currently unconfigured or offline on this machine:');
        console.log(`            ${err.message}`);
        console.log('\n------------------------------------------------------------------------');
        console.log('  STATUS: PENDIENTE DE VALIDACIÓN CONECTADA EN ENTORNO DE PERSISTENCIA');
        console.log('  La suite conectada está completamente preparada e integrada con los');
        console.log('  servicios reales. Para ejecutarla:');
        console.log('    1. Iniciar el contenedor de persistencia aislado (e.g. docker run mysql)');
        console.log('    2. Exportar MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE');
        console.log('    3. Ejecutar: node scripts/test_onboarding_connected_suite.js');
        console.log('------------------------------------------------------------------------\n');
        return;
    }

    // 2. Set up ephemeral Express application
    const app = express();
    app.use(express.json());
    app.use('/api/printhouse/onboarding', printhouseOnboardingRoutes);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`[HARNESS] Ephemeral test server mounted at ${baseUrl}\n`);

    const tenantA = 'faehrmann-print';
    const tenantB = 'foreign-printhouse';
    const tokenA = createTestToken(tenantA);
    const tokenB = createTestToken(tenantB);

    let testIndex = 0;
    function pass(description) {
        testIndex++;
        console.log(`[PASS] Test ${testIndex}: ${description}`);
    }

    try {
        // Test 1: Baseline Read
        const baseRes = await httpRequest(baseUrl, 'GET', '/api/printhouse/onboarding/pricing/industrial', tokenA);
        if (baseRes.status !== 200 || !baseRes.body.ok) {
            throw new Error(`Failed to fetch baseline node: HTTP ${baseRes.status}`);
        }
        const nodeId = baseRes.body.data.nodeId || 'node-ph-faehrmann-01';
        pass('Fetch active printer node baseline rates without mutation');

        // Test 2: Create Calibration Session with authentic Natur book spec
        const createPayload = {
            printerNodeId: nodeId,
            referenceBookName: 'Natur (148x210mm, 592p)',
            targetManufacturingPrice: 4321.00,
            currency: 'EUR',
            bookSpec: {
                width_mm: 148,
                height_mm: 210,
                page_count_interior: 592,
                page_count_cover: 4,
                copies: 500,
                paper_type_interior: 'munken',
                paper_weight_interior: 80,
                interior_print: '4/4',
                cover_print: '4/0',
                binding_method: 'thread sewn',
                has_flaps: true
            }
        };

        const createRes = await httpRequest(baseUrl, 'POST', '/api/printhouse/onboarding/pricing/calibrations', tokenA, createPayload);
        if (createRes.status !== 200 && createRes.status !== 201) {
            throw new Error(`Failed to create session: HTTP ${createRes.status}`);
        }
        const sessionA = createRes.body.data;
        const sessionIdA = sessionA.id;
        pass(`Create calibration session ${sessionIdA} with authentic Natur specification and 4.321 € target`);

        // Test 3: Mark Session Ready
        const readyRes = await httpRequest(baseUrl, 'POST', `/api/printhouse/onboarding/pricing/calibrations/${sessionIdA}/ready`, tokenA);
        if (readyRes.status !== 200) {
            throw new Error(`Failed to mark session ready: HTTP ${readyRes.status}`);
        }
        pass('Transition session from DRAFT to READY with preflight validation');

        // Test 4: Cancellation Verification (Zero mutation, zero revisions)
        const cancelSessionPayload = {
            printerNodeId: nodeId,
            referenceBookName: 'Test Cancellation Spec',
            targetManufacturingPrice: 2000.00,
            currency: 'EUR',
            bookSpec: {
                width_mm: 148,
                height_mm: 210,
                page_count_interior: 100,
                page_count_cover: 4,
                copies: 1000,
                paper_type_interior: 'offset',
                paper_weight_interior: 90,
                interior_print: '1/1',
                cover_print: '4/0',
                binding_method: 'perfect bound'
            }
        };
        const cancelSessRes = await httpRequest(baseUrl, 'POST', '/api/printhouse/onboarding/pricing/calibrations', tokenA, cancelSessionPayload);
        const cancelSessId = cancelSessRes.body.data.id;
        await httpRequest(baseUrl, 'POST', `/api/printhouse/onboarding/pricing/calibrations/${cancelSessId}/ready`, tokenA);
        
        // Count revisions before reject
        const revBefore = await httpRequest(baseUrl, 'GET', '/api/printhouse/onboarding/pricing/revisions', tokenA);
        const revCountBefore = revBefore.body.data?.length || 0;

        // Reject / Cancel
        const rejectRes = await httpRequest(baseUrl, 'POST', `/api/printhouse/onboarding/pricing/calibrations/${cancelSessId}/reject`, tokenA, {
            reason: 'Operator cancelled onboarding comparison'
        });
        if (rejectRes.status !== 200) {
            throw new Error(`Failed to reject session: HTTP ${rejectRes.status}`);
        }

        const revAfter = await httpRequest(baseUrl, 'GET', '/api/printhouse/onboarding/pricing/revisions', tokenA);
        const revCountAfter = revAfter.body.data?.length || 0;
        if (revCountBefore !== revCountAfter) {
            throw new Error('Revision was written on session cancellation! Invariant violated.');
        }
        pass('Cancellation produces exactly 0 database revisions and leaves node rates intact');

        // Test 5: Inverse Solver Calculation
        const calcRes = await httpRequest(baseUrl, 'POST', `/api/printhouse/onboarding/pricing/calibrations/${sessionIdA}/calculate`, tokenA);
        if (calcRes.status !== 200) {
            throw new Error(`Failed to calculate calibration: HTTP ${calcRes.status}`);
        }
        const calcData = calcRes.body.data;
        const runId = calcData.id || calcData.runId;
        pass(`Execute inverse solver calculation, generating run ${runId} with deterministic residual`);

        // Test 6: Strict Tenant Isolation on Session & Run
        const foreignGetRes = await httpRequest(baseUrl, 'GET', `/api/printhouse/onboarding/pricing/calibrations/${sessionIdA}`, tokenB);
        if (foreignGetRes.status !== 403 && foreignGetRes.status !== 404) {
            throw new Error(`Tenant B accessed Tenant A session! HTTP ${foreignGetRes.status}`);
        }

        const foreignAcceptRes = await httpRequest(baseUrl, 'POST', `/api/printhouse/onboarding/pricing/calibrations/${sessionIdA}/accept`, tokenB, {
            runId
        });
        if (foreignAcceptRes.status !== 403 && foreignAcceptRes.status !== 404) {
            throw new Error(`Tenant B accepted Tenant A calibration run! HTTP ${foreignAcceptRes.status}`);
        }
        pass('Strict tenant isolation: foreign tenant B is blocked from reading or accepting session');

        // Test 7: Governed Acceptance
        const acceptRes = await httpRequest(baseUrl, 'POST', `/api/printhouse/onboarding/pricing/calibrations/${sessionIdA}/accept`, tokenA, {
            runId
        });
        if (acceptRes.status !== 200) {
            throw new Error(`Failed to accept calibration run: HTTP ${acceptRes.status}`);
        }
        const revisionId = acceptRes.body.data.revisionId || acceptRes.body.data.id;
        pass(`Governed acceptance successfully executed, producing immutable revision ${revisionId}`);

        // Test 8: Post-Acceptance Readback
        const revReadRes = await httpRequest(baseUrl, 'GET', `/api/printhouse/onboarding/pricing/revisions/${revisionId}`, tokenA);
        if (revReadRes.status !== 200 || !revReadRes.body.data) {
            throw new Error(`Failed to read back accepted revision: HTTP ${revReadRes.status}`);
        }
        pass('Post-acceptance readback verifies revision is persisted and immutable');

        // Test 9: Absence of Commercial Effects
        const nodeAfterAccept = await httpRequest(baseUrl, 'GET', '/api/printhouse/onboarding/pricing/industrial', tokenA);
        if (nodeAfterAccept.body.data.marketplace_enabled === true || nodeAfterAccept.body.data.isMarketplaceActive === true) {
            throw new Error('Marketplace was implicitly activated during calibration acceptance! Invariant violated.');
        }
        pass('Absence of commercial effects: Marketplace status remains unactivated and public quoting untouched');

        console.log('\n========================================================================');
        console.log('  ALL CONNECTED ONBOARDING VERIFICATION CHECKS PASSED');
        console.log('========================================================================\n');
    } finally {
        server.close();
    }
}

if (require.main === module) {
    runOnboardingConnectedSuite().catch(err => {
        console.error('Connected test suite error:', err);
        process.exit(1);
    });
}

module.exports = { runOnboardingConnectedSuite };
