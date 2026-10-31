'use strict';
/**
 * Phase 74D Smoke Test — Control Plane Audit Export UX & Backend
 *
 * Validates:
 *  1. preflightAuditBundleService compiles and signs the audit manifest.
 *  2. Tamper-detection signature (manifest_hash) matches.
 *  3. Dynamic sanitization strips local paths, shell commands, and PII.
 *  4. Event retrieval mapped cleanly.
 */

const preflightAuditBundleService = require('../src/api/services/preflightAuditBundleService');
const db = require('../src/api/services/mysqlClient');
const crypto = require('crypto');

let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail) {
    const pass = !!condition;
    if (pass) { console.log(`  ✅  ${label}`); PASS++; }
    else       { console.error(`  ❌  ${label}${detail ? ': ' + detail : ''}`); FAIL++; }
    results.push({ label, pass, detail: detail || null });
}

async function runSmokeTests() {
    console.log('=== Running Phase 74D Smoke Tests (Control Plane Audit Export) ===');

    const mockContext = { tenantId: 'tenant-audit-export-test', Authorization: 'Bearer test-74d' };
    const orderId = 'ord_test_74d';
    const jobId = 'job_test_74d';

    // Seed database mocks
    const originalQuery = db.query;
    db.query = async (sql, params) => {
        const sqlUpper = sql.toUpperCase();
        if (sqlUpper.includes('FROM MARKETPLACE_ORDER_EVENTS')) {
            return [
                {
                    event_id: 'evt_1',
                    order_id: orderId,
                    file_id: 'fil_1',
                    type: 'ORDER_CREATED',
                    actor_type: 'CUSTOMER',
                    actor_id: 'cust_123',
                    payload_json: JSON.stringify({
                        message: 'Order created',
                        customer_email: 'john.doe@example.com',
                        customer_phone: '555-0199',
                        customer_address: '123 Print St'
                    }),
                    created_at: new Date('2026-06-10T12:00:00.000Z')
                },
                {
                    event_id: 'evt_2',
                    order_id: orderId,
                    file_id: 'fil_1',
                    type: 'PREFLIGHT_BOUND',
                    actor_type: 'SYSTEM',
                    actor_id: 'system',
                    payload_json: JSON.stringify({
                        message: 'Preflight bound',
                        raw_command: 'qpdf --check input.pdf',
                        local_path: 'C:\\Users\\KIKE\\Downloads\\input.pdf'
                    }),
                    created_at: new Date('2026-06-10T12:05:00.000Z')
                }
            ];
        }
        if (sqlUpper.includes('FROM PREFLIGHT_JOB_REGISTRY')) {
            return [
                {
                    canonical_payload_json: JSON.stringify({
                        job: {
                            id: jobId,
                            status: 'COMPLETED',
                            artifacts: [
                                {
                                    filename: 'certified.pdf',
                                    type: 'certified_pdf',
                                    checksum_sha256: 'abc123hash',
                                    size_bytes: 1048576,
                                    customer_visible: true
                                },
                                {
                                    filename: 'internal_log.txt',
                                    type: 'private_log',
                                    checksum_sha256: 'xyz987hash',
                                    size_bytes: 4096,
                                    customer_visible: false
                                }
                            ]
                        }
                    })
                }
            ];
        }
        return [];
    };

    try {
        // Test 1: Operator View (No dynamic sanitization on developer logs/hashes, but compiles cleanly)
        const operatorResult = await preflightAuditBundleService.compileAuditBundle(orderId, jobId, mockContext, { audience: 'operator' });
        assert(operatorResult.ok === true, 'Operator compilation status');
        assert(operatorResult.manifest !== undefined, 'Operator manifest exists');
        assert(operatorResult.manifest.order_id === orderId, 'Operator orderId matches');
        assert(operatorResult.manifest.manifest_hash !== undefined, 'Operator manifest has signature');
        assert(operatorResult.manifest.artifacts.length === 2, 'Operator view includes all artifacts');

        // Test 2: Customer View (Strict sanitization filters out PII, paths, commands, and private artifacts)
        const customerResult = await preflightAuditBundleService.compileAuditBundle(orderId, jobId, mockContext, { audience: 'customer' });
        assert(customerResult.ok === true, 'Customer compilation status');
        const manifest = customerResult.manifest;
        assert(manifest !== undefined, 'Customer manifest exists');

        // Verify private artifacts are filtered out
        assert(manifest.artifacts.length === 1, 'Customer view filters private artifacts');
        assert(manifest.artifacts[0].name === 'certified.pdf', 'Certified PDF is present');

        // Verify PII is redacted
        const evt1 = manifest.lifecycle_timeline.find(e => e.event_id === 'evt_1');
        assert(evt1.payload.customer_email === '[REDACTED]', 'Customer email is redacted');
        assert(evt1.payload.customer_phone === '[REDACTED]', 'Customer phone is redacted');
        assert(evt1.payload.customer_address === '[REDACTED]', 'Customer address is redacted');

        // Verify paths and commands are redacted
        const evt2 = manifest.lifecycle_timeline.find(e => e.event_id === 'evt_2');
        assert(evt2.payload.raw_command === '[REDACTED]', 'Raw command is redacted');
        assert(evt2.payload.local_path === '[REDACTED]', 'Local path key is redacted');

        // Verify hash integrity checks out
        const customerCanonical = JSON.stringify({
            order_id: manifest.order_id,
            job_id: manifest.job_id,
            preflight_outcome: manifest.preflight_outcome,
            artifacts: manifest.artifacts.map(a => ({ name: a.name, hash: a.hash })),
            audit_bundle_governance: manifest.audit_bundle_governance
        });
        const expectedHash = crypto.createHash('sha256').update(customerCanonical).digest('hex');
        assert(manifest.manifest_hash === expectedHash, 'Customer manifest hash verification');

    } catch (err) {
        console.error('Smoke test execution failed:', err);
        FAIL++;
    } finally {
        // Restore query
        db.query = originalQuery;
    }

    console.log(`\n=== Smoke Tests Completed: Passed: ${PASS}, Failed: ${FAIL} ===`);
    if (FAIL > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runSmokeTests();
