/**
 * Hardened Connected HTTP Harness for Pricing Authorization & Notification Preferences
 * 
 * Strict Isolation Protocol:
 * 1. NODE_ENV set to 'test' BEFORE importing any routers/services to prevent background loops.
 * 2. Environment cleaned BEFORE requiring services (delete DATABASE_URL, MYSQL_URL).
 * 3. Explicit configuration of MYSQL_* strictly from TEST_MYSQL_*.
 * 4. Exact target parameters required: host 127.0.0.1, port 3306, database pposrcmdw0qdtest, CURRENT_USER() = ppos_rc_mdw0qd@127.0.0.1.
 * 5. Identity verified via direct connection AND service pool (mysqlClient) before writing.
 * 6. Ephemeral random 32-byte hex JWT_SECRET generated per execution.
 * 7. Fixtures include email (NOT NULL compliance) and baseline rates from rc-node-1791147233697 reference.
 * 8. Candidate rates calculated with applyKnobAdjustments(baselineRates, sanitizeAdjustments({ paperCostMultiplier: 1.05 })).
 * 9. Rejections tested with domain data snapshots verifying zero unintended domain changes.
 * 10. Explicit 403 guard checks for PUT /pricing/industrial and POST /pricing/route-rules with PRINTHOUSE_OPERATOR.
 * 11. HTTP 200 OK + accepted=true for /pricing/commercial-accept + SQL verification across revisions, acceptances, printer_nodes, and audit_logs.
 * 12. Settings testing: Creation & Update of preferences, HTTP/SQL reading, and legacy preference preservation.
 * 13. Cleanup exclusively by created IDs in exact FK order (acceptances -> revisions -> audit_logs -> preferences -> nodes -> tenants).
 * 14. Server and pools (mysqlClient and upstream db) closed in finally without process.exit().
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

// ── Step 0: Clean environment & set NODE_ENV BEFORE requiring any services/routers ──
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;

const host = process.env.TEST_MYSQL_HOST || '127.0.0.1';
const portStr = process.env.TEST_MYSQL_PORT || '3306';
const port = parseInt(portStr, 10);
const user = process.env.TEST_MYSQL_USER || 'ppos_rc_mdw0qd';
const password = process.env.TEST_MYSQL_PASSWORD || '';
const database = process.env.TEST_MYSQL_DATABASE || 'pposrcmdw0qdtest';

process.env.MYSQL_HOST = host;
process.env.MYSQL_PORT = String(port);
process.env.MYSQL_USER = user;
process.env.MYSQL_PASSWORD = password;
process.env.MYSQL_DATABASE = database;

// Ephemeral random JWT Secret generated per execution
const TEST_JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';

const jwt = require('jsonwebtoken');

async function runHttpConnectedHarness() {
    console.log('=== PPOS CONTROL PLANE: HARDENED CONNECTED HTTP HARNESS ===');
    console.log('Harness Classification: JWT_VERIFICATION_AND_ROUTE_AUTHORIZATION');

    // 1. Strict Isolation Enforcement
    if (host !== '127.0.0.1' || port !== 3306 || database !== 'pposrcmdw0qdtest') {
        console.log('\n----------------------------------------------------------------------');
        console.log('STATUS: BLOCKED / CONNECTED_ENV_REQUIRED');
        console.log(`Reason: Environment parameters do not match exact isolated server test target.`);
        console.log(`Configured Host: ${host}:${port} | Configured DB: ${database}`);
        console.log('Required Target: 127.0.0.1:3306 / pposrcmdw0qdtest');
        console.log('----------------------------------------------------------------------\n');
        process.exitCode = 2;
        return;
    }

    let rawConnection = null;
    let server = null;
    const results = {
        timestamp: new Date().toISOString(),
        classification: 'JWT_VERIFICATION_AND_ROUTE_AUTHORIZATION',
        destination: `${user}@${host}:${port}/${database}`,
        tests: [],
        cleanupSuccess: false,
        error: null
    };

    const createdFixtures = {
        acceptances: [],
        revisions: [],
        auditLogsTenants: [],
        preferencesTenants: [],
        printerNodes: [],
        tenants: []
    };

    // Require service singleton pool AFTER setting env vars and NODE_ENV
    const db = require('../src/api/services/mysqlClient');
    const commercialKnobService = require('../src/api/services/commercialKnobService');
    const adapter = require('../src/api/services/buildPriceCalibrationAdapter');

    try {
        // Direct Connection Verification
        try {
            rawConnection = await mysql.createConnection({ host, port, user, password, database });
        } catch (connErr) {
            console.log('\n----------------------------------------------------------------------');
            console.log('STATUS: BLOCKED / CONNECTED_ENV_REQUIRED');
            console.log(`Reason: Could not connect to MySQL test instance at ${host}:${port} (${connErr.message}).`);
            console.log('----------------------------------------------------------------------\n');
            results.error = `Connection failed: ${connErr.message}`;
            process.exitCode = 2;
            return;
        }

        const [dbRows] = await rawConnection.query('SELECT DATABASE() AS active_db, CURRENT_USER() AS authenticated_user, VERSION() AS version');
        const activeDb = dbRows[0]?.active_db;
        const currentUser = dbRows[0]?.authenticated_user || '';
        const version = dbRows[0]?.version || '';

        console.log(`[VERIFIED DIRECT CONNECTION] Active DB: "${activeDb}" | Current User: "${currentUser}" | MySQL Version: "${version}"`);

        if (activeDb !== 'pposrcmdw0qdtest' || currentUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
            throw new Error(`DIRECT_CONNECTION_IDENTITY_MISMATCH: DB "${activeDb}" or User "${currentUser}" does not match required pposrcmdw0qdtest / ppos_rc_mdw0qd@127.0.0.1`);
        }

        // Service Pool Identity Verification
        const poolRows = await db.query('SELECT DATABASE() AS active_db, CURRENT_USER() AS authenticated_user');
        const poolActiveDb = poolRows[0]?.active_db;
        const poolUser = poolRows[0]?.authenticated_user || '';
        console.log(`[VERIFIED SERVICE POOL IDENTITY] Active DB: "${poolActiveDb}" | User: "${poolUser}"`);

        if (poolActiveDb !== 'pposrcmdw0qdtest' || poolUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
            throw new Error(`SERVICE_POOL_IDENTITY_MISMATCH: Service pool database "${poolActiveDb}" or User "${poolUser}" does not match required pposrcmdw0qdtest / ppos_rc_mdw0qd@127.0.0.1`);
        }

        // 2. Fetch Reference Baseline Rates from Isolated Node rc-node-1791147233697
        let baselineRates = null;
        const [refNodeRows] = await rawConnection.query('SELECT rates_json FROM printer_nodes WHERE id = "rc-node-1791147233697"');
        if (refNodeRows.length > 0 && refNodeRows[0].rates_json) {
            const raw = refNodeRows[0].rates_json;
            baselineRates = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } else {
            baselineRates = {
                paper_price_interior_by_kilo: { coated_gloss_100: 1.20, coated_matt_100: 1.25 },
                paper_price_cover_by_kilo: { coated_gloss_250: 1.80, coated_matt_250: 1.85 },
                interior_black_colour_fixed: { s16: 12.0, s8: 8.0 },
                interior_black_colour_var: { s16: 2.5, s8: 1.8 }
            };
        }

        const baselineRatesChecksum = commercialKnobService.computeRatesChecksum(baselineRates);

        // Calculate Candidate Rates with paperCostMultiplier = 1.05
        const adjustments = { paperCostMultiplier: 1.05 };
        const sanitizedAdj = commercialKnobService.sanitizeAdjustments(adjustments);
        const candidateRates = commercialKnobService.applyKnobAdjustments(baselineRates, sanitizedAdj);
        const candidateRatesChecksum = commercialKnobService.computeRatesChecksum(candidateRates);

        if (baselineRatesChecksum === candidateRatesChecksum) {
            throw new Error('CHECKSUM_NOT_CHANGED: paperCostMultiplier 1.05 did not alter rates checksum');
        }

        // Verify Forward Price Change between Baseline and Candidate Rates
        const bookSpec = { copies: 500, interior_pages: 100 };
        const basePriceEval = adapter.evaluateForwardPrice(bookSpec, baselineRates);
        const candPriceEval = adapter.evaluateForwardPrice(bookSpec, candidateRates);
        const basePrice = basePriceEval.predictedManufacturingPrice;
        const candPrice = candPriceEval.predictedManufacturingPrice;

        if (basePrice === candPrice) {
            throw new Error(`PRICE_NOT_CHANGED: Forward price did not change between baseline (${basePrice}) and candidate (${candPrice})`);
        }

        console.log(`✔ Verified real forward manufacturing price change: Baseline ${basePrice} EUR -> Candidate ${candPrice} EUR`);

        // 3. Initialize Harness Fixtures (with email NOT NULL compliance)
        const timestamp = Date.now();
        const testTenantId = `tenant-http-test-${timestamp}`;
        const foreignTenantId = `tenant-http-foreign-${timestamp}`;
        const testNodeId = `node-http-test-${timestamp}`;

        await rawConnection.query(
            `INSERT INTO tenants (id, name, status, plan) VALUES (?, 'HTTP Test Tenant', 'ACTIVE', 'PRO')`,
            [testTenantId]
        );
        createdFixtures.tenants.push(testTenantId);
        createdFixtures.auditLogsTenants.push(testTenantId);
        createdFixtures.preferencesTenants.push(testTenantId);

        await rawConnection.query(
            `INSERT INTO tenants (id, name, status, plan) VALUES (?, 'Foreign Test Tenant', 'ACTIVE', 'PRO')`,
            [foreignTenantId]
        );
        createdFixtures.tenants.push(foreignTenantId);
        createdFixtures.auditLogsTenants.push(foreignTenantId);
        createdFixtures.preferencesTenants.push(foreignTenantId);

        await rawConnection.query(
            `INSERT INTO printer_nodes (id, tenant_id, name, email, status, rates_json) VALUES (?, ?, 'Primary Test Node', 'node-test@printhouse.com', 'active', ?)`,
            [testNodeId, testTenantId, JSON.stringify(baselineRates)]
        );
        createdFixtures.printerNodes.push(testNodeId);

        console.log('✔ Harness fixtures created with email NOT NULL compliance and real commercialKnobService candidate rates/checksums.');

        // Helper to issue ephemeral test JWT tokens
        function issueTestJwt(payload) {
            return jwt.sign({
                sub: payload.userId || 'test-user-1',
                email: payload.email || 'user@testprinthouse.com',
                role: payload.role || 'PRINTHOUSE_ADMIN',
                tenant_id: payload.tenantId || testTenantId,
                printhouse_id: payload.printhouseId || testNodeId,
                iss: 'https://auth.printprice.pro',
                aud: 'ppos:control',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (payload.expired ? -3600 : 3600)
            }, TEST_JWT_SECRET);
        }

        // Mount Express App
        const express = require('express');
        const app = express();
        app.use(express.json());

        const adminRouter = require('../src/api/routes/admin');
        const printhouseOnboardingRouter = require('../src/api/routes/printhouseOnboardingRoutes');

        app.use('/api/admin', adminRouter);
        app.use('/api/printhouse/onboarding', printhouseOnboardingRouter);

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const serverPort = server.address().port;
        const baseUrl = `http://127.0.0.1:${serverPort}`;

        console.log(`[HTTP HARNESS SERVER STARTED] Listening at ${baseUrl}`);

        async function makeRequest(method, urlPath, headers = {}, body = null) {
            const fullUrl = new URL(urlPath, baseUrl);
            return new Promise((resolve, reject) => {
                const req = http.request(fullUrl, {
                    method,
                    headers: { 'Content-Type': 'application/json', ...headers }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        let parsed = null;
                        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
                        if (res.statusCode >= 400) {
                            console.log(`  [HTTP DEBUG ${method} ${urlPath}] Status: ${res.statusCode} | Response:`, JSON.stringify(parsed));
                        }
                        resolve({ status: res.statusCode, data: parsed });
                    });
                });
                req.on('error', reject);
                if (body) req.write(JSON.stringify(body));
                req.end();
            });
        }

        // Domain Data Snapshot Helper (Preferences + Printer Node Rates + Revisions Count + Acceptances Count)
        async function getDomainDataSnapshot(tId, nId) {
            const [prefRows] = await rawConnection.query('SELECT * FROM tenant_notification_preferences WHERE tenant_id = ?', [tId]);
            const [nodeRows] = await rawConnection.query('SELECT rates_json FROM printer_nodes WHERE id = ?', [nId]);
            const [revCountRows] = await rawConnection.query('SELECT COUNT(*) as cnt FROM printhouse_pricing_revisions WHERE tenant_id = ?', [tId]);
            const [accCountRows] = await rawConnection.query('SELECT COUNT(*) as cnt FROM printhouse_pricing_calibration_acceptances WHERE tenant_id = ?', [tId]);

            return JSON.stringify({
                prefs: prefRows.length > 0 ? prefRows[0] : null,
                rates: nodeRows.length > 0 ? nodeRows[0].rates_json : null,
                revCount: revCountRows[0].cnt,
                accCount: accCountRows[0].cnt
            });
        }

        console.log('\n--- 1. Testing Rejections, Token Validation & Domain Data Integrity ---');

        const adminToken = issueTestJwt({ role: 'PRINTHOUSE_ADMIN', tenantId: testTenantId });
        const operatorToken = issueTestJwt({ role: 'PRINTHOUSE_OPERATOR', tenantId: testTenantId });
        const viewerToken = issueTestJwt({ role: 'VIEWER', tenantId: testTenantId });
        const foreignToken = issueTestJwt({ role: 'PRINTHOUSE_ADMIN', tenantId: foreignTenantId });
        const expiredToken = issueTestJwt({ role: 'PRINTHOUSE_ADMIN', tenantId: testTenantId, expired: true });

        // Missing Token (401)
        const snapBefore1 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resUnauth = await makeRequest('GET', `/api/admin/tenants/${testTenantId}/notification-preferences`);
        const snapAfter1 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passUnauth = resUnauth.status === 401 && snapBefore1 === snapAfter1;
        console.log(`GET notification-preferences (Missing token): Status ${resUnauth.status} | Domain Data Unchanged: ${snapBefore1 === snapAfter1}`);
        results.tests.push({ test: 'GET notification-preferences missing token 401 + domain data unchanged', status: resUnauth.status, pass: passUnauth, data: resUnauth.data });

        // Invalid Token (401)
        const snapBefore2 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resInvalid = await makeRequest('GET', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: 'Bearer invalid_malformed_token' });
        const snapAfter2 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passInvalid = resInvalid.status === 401 && snapBefore2 === snapAfter2;
        console.log(`GET notification-preferences (Invalid token): Status ${resInvalid.status} | Domain Data Unchanged: ${snapBefore2 === snapAfter2}`);
        results.tests.push({ test: 'GET notification-preferences invalid token 401 + domain data unchanged', status: resInvalid.status, pass: passInvalid, data: resInvalid.data });

        // Expired Token (401)
        const snapBefore3 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resExpired = await makeRequest('GET', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: `Bearer ${expiredToken}` });
        const snapAfter3 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passExpired = resExpired.status === 401 && snapBefore3 === snapAfter3;
        console.log(`GET notification-preferences (Expired token): Status ${resExpired.status} | Domain Data Unchanged: ${snapBefore3 === snapAfter3}`);
        results.tests.push({ test: 'GET notification-preferences expired token 401 + domain data unchanged', status: resExpired.status, pass: passExpired, data: resExpired.data });

        // Cross-Tenant GET (403)
        const snapBefore4 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resCrossGet = await makeRequest('GET', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: `Bearer ${foreignToken}` });
        const snapAfter4 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passCrossGet = resCrossGet.status === 403 && snapBefore4 === snapAfter4;
        console.log(`GET notification-preferences (Cross-tenant): Status ${resCrossGet.status} | Domain Data Unchanged: ${snapBefore4 === snapAfter4}`);
        results.tests.push({ test: 'GET notification-preferences cross-tenant 403 + domain data unchanged', status: resCrossGet.status, pass: passCrossGet, data: resCrossGet.data });

        // Cross-Tenant PUT (403)
        const snapBefore5 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resCrossPut = await makeRequest('PUT', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: `Bearer ${foreignToken}` }, { email_order_alerts: 0 });
        const snapAfter5 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passCrossPut = resCrossPut.status === 403 && snapBefore5 === snapAfter5;
        console.log(`PUT notification-preferences (Cross-tenant): Status ${resCrossPut.status} | Domain Data Unchanged: ${snapBefore5 === snapAfter5}`);
        results.tests.push({ test: 'PUT notification-preferences cross-tenant 403 + domain data unchanged', status: resCrossPut.status, pass: passCrossPut, data: resCrossPut.data });

        // Viewer Role PUT (403)
        const snapBefore6 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resViewerPut = await makeRequest('PUT', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: `Bearer ${viewerToken}` }, { email_order_alerts: 0 });
        const snapAfter6 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passViewerPut = resViewerPut.status === 403 && snapBefore6 === snapAfter6;
        console.log(`PUT notification-preferences (Viewer role): Status ${resViewerPut.status} | Domain Data Unchanged: ${snapBefore6 === snapAfter6}`);
        results.tests.push({ test: 'PUT notification-preferences viewer role 403 + domain data unchanged', status: resViewerPut.status, pass: passViewerPut, data: resViewerPut.data });

        // Unknown Field PUT (400)
        const snapBefore7 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resUnknownPut = await makeRequest('PUT', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: `Bearer ${adminToken}` }, { unknown_field: 'malicious_data' });
        const snapAfter7 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passUnknownPut = resUnknownPut.status === 400 && snapBefore7 === snapAfter7;
        console.log(`PUT notification-preferences (Unknown field): Status ${resUnknownPut.status} | Domain Data Unchanged: ${snapBefore7 === snapAfter7}`);
        results.tests.push({ test: 'PUT notification-preferences unknown field 400 + domain data unchanged', status: resUnknownPut.status, pass: passUnknownPut, data: resUnknownPut.data });

        // Invalid Type PUT (400)
        const snapBefore8 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resBadTypePut = await makeRequest('PUT', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: `Bearer ${adminToken}` }, { email_order_alerts: 'invalid_non_boolean' });
        const snapAfter8 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passBadTypePut = resBadTypePut.status === 400 && snapBefore8 === snapAfter8;
        console.log(`PUT notification-preferences (Invalid type): Status ${resBadTypePut.status} | Domain Data Unchanged: ${snapBefore8 === snapAfter8}`);
        results.tests.push({ test: 'PUT notification-preferences invalid type 400 + domain data unchanged', status: resBadTypePut.status, pass: passBadTypePut, data: resBadTypePut.data });

        console.log('\n--- 2. Testing Roles & Pricing Administrative Guards ---');

        // PUT /pricing/industrial with PRINTHOUSE_OPERATOR (403 Guard Test)
        const snapBefore9 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resPutPricingOp = await makeRequest('PUT', '/api/printhouse/onboarding/pricing/industrial', { Authorization: `Bearer ${operatorToken}` }, {
            nodeId: testNodeId,
            expected_baseline_checksum: 'a'.repeat(64),
            rates: baselineRates
        });
        const snapAfter9 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passPutPricingOpGuard = resPutPricingOp.status === 403 && resPutPricingOp.data?.error?.code === 'FORBIDDEN_INSUFFICIENT_PERMISSIONS' && snapBefore9 === snapAfter9;
        console.log(`PUT /pricing/industrial (PRINTHOUSE_OPERATOR restricted): Status ${resPutPricingOp.status} | Code: ${resPutPricingOp.data?.error?.code} | Domain Data Unchanged: ${snapBefore9 === snapAfter9}`);
        results.tests.push({ test: 'PUT /pricing/industrial PRINTHOUSE_OPERATOR 403 guard verified', status: resPutPricingOp.status, pass: passPutPricingOpGuard, data: resPutPricingOp.data });

        // POST /pricing/route-rules with PRINTHOUSE_OPERATOR (403 Guard Test)
        const snapBefore10 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const resRouteRulesOp = await makeRequest('POST', '/api/printhouse/onboarding/pricing/route-rules', { Authorization: `Bearer ${operatorToken}` }, {
            printhouseId: testNodeId,
            ruleType: 'BOUNDARY',
            minQuantity: 100,
            maxQuantity: 1000
        });
        const snapAfter10 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passRouteRulesOpGuard = resRouteRulesOp.status === 403 && resRouteRulesOp.data?.error?.code === 'FORBIDDEN' && snapBefore10 === snapAfter10;
        console.log(`POST /pricing/route-rules (PRINTHOUSE_OPERATOR restricted): Status ${resRouteRulesOp.status} | Code: ${resRouteRulesOp.data?.error?.code} | Domain Data Unchanged: ${snapBefore10 === snapAfter10}`);
        results.tests.push({ test: 'POST /pricing/route-rules PRINTHOUSE_OPERATOR 403 guard verified', status: resRouteRulesOp.status, pass: passRouteRulesOpGuard, data: resRouteRulesOp.data });

        console.log('\n--- 3. Testing Pre-Acceptance Negative Candidate Checksum Mismatch ---');

        const acceptPayload = {
            printhouseId: testNodeId,
            baselineRatesChecksum,
            adjustments,
            bookSpec: { copies: 500, interior_pages: 100 },
            candidateRatesChecksum
        };

        // Candidate Checksum Mismatch Test (BEFORE acceptance, while baseline is current) -> 422 CANDIDATE_CHECKSUM_MISMATCH
        const snapBefore11 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const badChecksumPayload = { ...acceptPayload, candidateRatesChecksum: 'b'.repeat(64) };
        const resBadChecksum = await makeRequest('POST', '/api/printhouse/onboarding/pricing/commercial-accept', { Authorization: `Bearer ${operatorToken}` }, badChecksumPayload);
        const snapAfter11 = await getDomainDataSnapshot(testTenantId, testNodeId);
        const passBadChecksum = resBadChecksum.status === 422 && resBadChecksum.data?.error === 'CANDIDATE_CHECKSUM_MISMATCH' && snapBefore11 === snapAfter11;
        console.log(`POST /pricing/commercial-accept (CANDIDATE_CHECKSUM_MISMATCH): Status ${resBadChecksum.status} | Error: ${resBadChecksum.data?.error} | Domain Data Unchanged: ${snapBefore11 === snapAfter11}`);
        results.tests.push({ test: 'POST /pricing/commercial-accept CANDIDATE_CHECKSUM_MISMATCH 422 + domain data unchanged', status: resBadChecksum.status, pass: passBadChecksum, data: resBadChecksum.data });

        console.log('\n--- 4. Testing Governed Commercial Calibration Acceptance (HTTP 200 OK + Detailed SQL Audit) ---');

        const resAccept = await makeRequest('POST', '/api/printhouse/onboarding/pricing/commercial-accept', { Authorization: `Bearer ${operatorToken}` }, acceptPayload);
        console.log(`POST /pricing/commercial-accept (PRINTHOUSE_OPERATOR): Status ${resAccept.status} | Data:`, resAccept.data);

        const passHttpAccept = resAccept.status === 200 && resAccept.data?.ok === true && resAccept.data?.data?.accepted === true;
        results.tests.push({ test: 'POST /pricing/commercial-accept HTTP 200 OK + accepted=true', status: resAccept.status, pass: passHttpAccept, data: resAccept.data });

        if (passHttpAccept) {
            const accData = resAccept.data.data;
            createdFixtures.acceptances.push(accData.acceptanceId);
            createdFixtures.revisions.push(accData.revisionId);

            // Query & Verify SQL persistence across printhouse_pricing_revisions, printhouse_pricing_calibration_acceptances, printer_nodes, and api_audit_logs
            const [revRows] = await rawConnection.query('SELECT * FROM printhouse_pricing_revisions WHERE id = ?', [accData.revisionId]);
            const [accRows] = await rawConnection.query('SELECT * FROM printhouse_pricing_calibration_acceptances WHERE id = ?', [accData.acceptanceId]);
            const [nodeRows] = await rawConnection.query('SELECT rates_json FROM printer_nodes WHERE id = ?', [testNodeId]);
            const [auditRows] = await rawConnection.query('SELECT * FROM api_audit_logs WHERE tenant_id = ? AND event_type = "COMMERCIAL_KNOB_CALIBRATION_ACCEPTED" ORDER BY created_at DESC LIMIT 1', [testTenantId]);

            const rev = revRows[0] || {};
            const acc = accRows[0] || {};
            const audit = auditRows[0] || {};
            const auditMeta = audit.metadata_json ? (typeof audit.metadata_json === 'string' ? JSON.parse(audit.metadata_json) : audit.metadata_json) : {};

            const passSqlRevisions = revRows.length === 1 &&
                rev.tenant_id === testTenantId &&
                rev.printer_node_id === testNodeId &&
                rev.source_type === 'MANUAL_EDIT' &&
                rev.source_calibration_session_id === null &&
                rev.source_calibration_run_id === null &&
                rev.rates_checksum === candidateRatesChecksum &&
                rev.baseline_rates_checksum === baselineRatesChecksum;

            const passSqlAcceptances = accRows.length === 1 &&
                acc.tenant_id === testTenantId &&
                acc.printer_node_id === testNodeId &&
                acc.calibration_session_id === null &&
                acc.calibration_run_id === null &&
                acc.pricing_revision_id === accData.revisionId &&
                acc.acceptance_mode === 'OPERATOR_ADJUSTED' &&
                acc.resulting_rates_checksum === candidateRatesChecksum &&
                acc.baseline_checksum === baselineRatesChecksum;

            const passSqlNodeRates = nodeRows.length === 1 &&
                commercialKnobService.computeRatesChecksum(typeof nodeRows[0].rates_json === 'string' ? JSON.parse(nodeRows[0].rates_json) : nodeRows[0].rates_json) === candidateRatesChecksum;

            const passSqlAudit = auditRows.length === 1 &&
                audit.status === 'SUCCESS' &&
                audit.event_type === 'COMMERCIAL_KNOB_CALIBRATION_ACCEPTED' &&
                auditMeta.acceptanceId === accData.acceptanceId &&
                auditMeta.revisionId === accData.revisionId &&
                auditMeta.printerNodeId === testNodeId;

            const passSqlAcceptance = passSqlRevisions && passSqlAcceptances && passSqlNodeRates && passSqlAudit;
            console.log(`✔ Coherent SQL verification across 4 tables (source_type MANUAL_EDIT, mode OPERATOR_ADJUSTED, session/run NULL, audit metadata IDs): ${passSqlAcceptance}`);
            results.tests.push({ test: 'SQL Coherent Verification across 4 tables after commercial acceptance', pass: passSqlAcceptance });
        } else {
            results.tests.push({ test: 'SQL Coherent Verification across 4 tables after commercial acceptance', pass: false });
        }

        console.log('\n--- 5. Testing Settings Preferences Creation, Update, HTTP & SQL Reading & Legacy Preservation ---');

        // 5a. Initial Creation for New Tenant (No pre-existing row in tenant_notification_preferences)
        const initialPayload = {
            webhook_enabled: 1,
            email_order_alerts: 1,
            email_qc_alerts: 0,
            email_sla_alerts: 1,
            email_recipients_json: ['ops-initial@printhouse-test.com'],
            webhook_endpoint: 'https://webhook.printhouse-test.com/initial'
        };

        const resPutCreate = await makeRequest('PUT', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: `Bearer ${adminToken}` }, initialPayload);
        const passPutCreate = resPutCreate.status === 200 && resPutCreate.data?.ok === true;
        console.log(`PUT notification-preferences (Creation on tenant_id PK): Status ${resPutCreate.status}`);
        results.tests.push({ test: 'PUT notification-preferences creation on new tenant_id PK', status: resPutCreate.status, pass: passPutCreate, data: resPutCreate.data });

        // SQL Verification of Initial Creation
        const [sqlCreateRows] = await rawConnection.query('SELECT * FROM tenant_notification_preferences WHERE tenant_id = ?', [testTenantId]);
        const passSqlCreate = sqlCreateRows.length === 1 &&
            sqlCreateRows[0].webhook_enabled === 1 &&
            sqlCreateRows[0].email_order_alerts === 1 &&
            sqlCreateRows[0].email_qc_alerts === 0 &&
            sqlCreateRows[0].email_sla_alerts === 1 &&
            sqlCreateRows[0].webhook_endpoint === 'https://webhook.printhouse-test.com/initial';
        console.log(`✔ SQL Persistence of initial creation verified: ${passSqlCreate}`);
        results.tests.push({ test: 'SQL Persistence of notification preferences initial creation', pass: passSqlCreate });

        // 5b. Update Preferences on Existing Tenant (Atomic Upsert on tenant_id PK)
        const updatePayload = {
            email_order_alerts: 0,
            email_qc_alerts: 1,
            email_sla_alerts: 1,
            webhook_endpoint: 'https://webhook.printhouse-test.com/updated'
        };

        const resPutUpdate = await makeRequest('PUT', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: `Bearer ${adminToken}` }, updatePayload);
        const passPutUpdate = resPutUpdate.status === 200 && resPutUpdate.data?.ok === true;
        console.log(`PUT notification-preferences (Update existing tenant): Status ${resPutUpdate.status}`);
        results.tests.push({ test: 'PUT notification-preferences update on existing tenant', status: resPutUpdate.status, pass: passPutUpdate, data: resPutUpdate.data });

        // SQL Verification of Update & Legacy Preservation (email_recipients_json and webhook_enabled preserved)
        const [sqlUpdateRows] = await rawConnection.query('SELECT * FROM tenant_notification_preferences WHERE tenant_id = ?', [testTenantId]);
        const passSqlUpdate = sqlUpdateRows.length === 1 &&
            sqlUpdateRows[0].email_order_alerts === 0 &&
            sqlUpdateRows[0].email_qc_alerts === 1 &&
            sqlUpdateRows[0].email_sla_alerts === 1 &&
            sqlUpdateRows[0].webhook_endpoint === 'https://webhook.printhouse-test.com/updated' &&
            sqlUpdateRows[0].webhook_enabled === 1; // Preserved legacy field!
        console.log(`✔ SQL Persistence of update & legacy preservation verified: ${passSqlUpdate}`);
        results.tests.push({ test: 'SQL Persistence of notification preferences update & legacy preservation', pass: passSqlUpdate });

        // 5c. HTTP GET Full Preference Reading
        const resGetValid = await makeRequest('GET', `/api/admin/tenants/${testTenantId}/notification-preferences`, { Authorization: `Bearer ${adminToken}` });
        const httpPrefs = resGetValid.data?.prefs || {};
        const parsedRecipients = typeof httpPrefs.email_recipients_json === 'string' ? JSON.parse(httpPrefs.email_recipients_json) : httpPrefs.email_recipients_json;

        const passFullReading = resGetValid.status === 200 &&
            httpPrefs.email_order_alerts === 0 &&
            httpPrefs.email_qc_alerts === 1 &&
            httpPrefs.email_sla_alerts === 1 &&
            httpPrefs.webhook_endpoint === 'https://webhook.printhouse-test.com/updated' &&
            httpPrefs.webhook_enabled === 1 &&
            Array.isArray(parsedRecipients) && parsedRecipients.includes('ops-initial@printhouse-test.com');

        console.log(`✔ HTTP GET full preference reading verified: ${passFullReading}`);
        results.tests.push({ test: 'HTTP GET full notification preference fields reading', status: resGetValid.status, pass: passFullReading, data: resGetValid.data });

        const allPassed = results.tests.every(t => t.pass);
        console.log('\n======================================================================');
        console.log(`STATUS: ${allPassed ? 'PASS' : 'FAIL'} / HTTP_CONNECTED_VERIFICATION_COMPLETE`);
        console.log(`Passed: ${results.tests.filter(t => t.pass).length} / ${results.tests.length} checks`);
        console.log('======================================================================\n');

        if (!allPassed) {
            process.exitCode = 1;
        }

    } catch (err) {
        console.error('❌ Connected HTTP Harness Failed:', err);
        results.error = err.message || String(err);
        process.exitCode = 1;
    } finally {
        if (server) {
            await new Promise((resolve) => server.close(resolve)).catch(() => {});
            console.log('✔ HTTP server closed.');
        }

        // Clean up created fixtures in strict FK order
        if (rawConnection) {
            console.log('\n--- Teardown: Cleaning Up Exact Harness Fixtures in FK Order ---');
            let cleanupFailed = false;

            // 1. Acceptances
            for (const accId of createdFixtures.acceptances) {
                try {
                    await rawConnection.query('DELETE FROM printhouse_pricing_calibration_acceptances WHERE id = ?', [accId]);
                    console.log(`  - Deleted acceptance: ${accId}`);
                } catch (cleanErr) {
                    console.error(`⚠️ Cleanup error acceptances ${accId}: ${cleanErr.message}`);
                    cleanupFailed = true;
                }
            }
            // 2. Revisions
            for (const revId of createdFixtures.revisions) {
                try {
                    await rawConnection.query('DELETE FROM printhouse_pricing_revisions WHERE id = ?', [revId]);
                    console.log(`  - Deleted revision: ${revId}`);
                } catch (cleanErr) {
                    console.error(`⚠️ Cleanup error revisions ${revId}: ${cleanErr.message}`);
                    cleanupFailed = true;
                }
            }
            // 3. Audit Logs by Tenant ID
            for (const tId of createdFixtures.auditLogsTenants) {
                try {
                    await rawConnection.query('DELETE FROM api_audit_logs WHERE tenant_id = ?', [tId]);
                    console.log(`  - Deleted audit logs for tenant: ${tId}`);
                } catch (cleanErr) {
                    console.error(`⚠️ Cleanup error audit_logs ${tId}: ${cleanErr.message}`);
                    cleanupFailed = true;
                }
            }
            // 4. Notification Preferences by Tenant ID
            for (const tId of createdFixtures.preferencesTenants) {
                try {
                    await rawConnection.query('DELETE FROM tenant_notification_preferences WHERE tenant_id = ?', [tId]);
                    console.log(`  - Deleted preferences for tenant: ${tId}`);
                } catch (cleanErr) {
                    console.error(`⚠️ Cleanup error tenant_notification_preferences ${tId}: ${cleanErr.message}`);
                    cleanupFailed = true;
                }
            }
            // 5. Printer Nodes
            for (const nodeId of createdFixtures.printerNodes) {
                try {
                    await rawConnection.query('DELETE FROM printer_nodes WHERE id = ?', [nodeId]);
                    console.log(`  - Deleted printer node: ${nodeId}`);
                } catch (cleanErr) {
                    console.error(`⚠️ Cleanup error printer_nodes ${nodeId}: ${cleanErr.message}`);
                    cleanupFailed = true;
                }
            }
            // 6. Tenants
            for (const tId of createdFixtures.tenants) {
                try {
                    await rawConnection.query('DELETE FROM tenants WHERE id = ?', [tId]);
                    console.log(`  - Deleted tenant: ${tId}`);
                } catch (cleanErr) {
                    console.error(`⚠️ Cleanup error tenants ${tId}: ${cleanErr.message}`);
                    cleanupFailed = true;
                }
            }

            if (cleanupFailed) {
                process.exitCode = 1;
                results.cleanupSuccess = false;
            } else {
                results.cleanupSuccess = true;
            }
        }

        if (rawConnection) {
            try { await rawConnection.end(); } catch (e) {}
        }
        if (db && db.closePool) {
            try { await db.closePool(); } catch (e) {}
            console.log('✔ mysqlClient pool closed.');
        }

        // Close second pool (upstream DatabaseService if instantiated)
        try {
            const upstreamDb = require('../src/api/upstream/src/services/db');
            if (upstreamDb && typeof upstreamDb.shutdown === 'function') {
                await upstreamDb.shutdown();
                console.log('✔ Upstream DatabaseService pool closed.');
            }
        } catch (e) {}

        // Close Redis client if cached without creating a new connection
        try {
            const redisPath = require.resolve('../src/api/adapters/redisConnection');
            const cached = require.cache[redisPath];
            if (cached) {
                await cached.exports.quit();
                console.log('Redis client closed.');
            }
        } catch (e) {
            console.error('Redis cleanup failed:', e.message);
            process.exitCode = 1;
        }

        // Save execution report
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        fs.writeFileSync(path.join(logsDir, 'http_harness_results.json'), JSON.stringify(results, null, 2), 'utf8');
        fs.writeFileSync(path.join(logsDir, 'http_harness_execution.log'), JSON.stringify(results, null, 2), 'utf8');
    }
}

runHttpConnectedHarness();
