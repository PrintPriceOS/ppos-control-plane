/**
 * scripts/test-phase36-customer-action.js
 *
 * High-fidelity verification test suite for Phase 36.7:
 * Customer Notification + Reupload UI Handoff.
 *
 * Validates:
 *   1. Create action for CUSTOMER_ACTION_REQUIRED
 *   2. Create action for STILL_BLOCKED
 *   3. Do NOT create when invoiceReady === true
 *   4. Idempotency returns existing action
 *   5. force=true creates/rotates action
 *   6. Token hash validation
 *   7. Expired token rejection
 *   8. mark-notified updates notifiedAt/status
 *   9. mark-viewed updates viewedAt/status
 *  10. SQL sanity: no !== in queries
 */

require('dotenv').config();
const crypto = require('crypto');
const db = require('../src/api/services/mysqlClient');
const customerActionService = require('../src/api/services/marketplaceCustomerActionService');

// We also need the orderService for event logging
const orderService = require('../src/api/services/marketplaceOrderService');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, label) {
    if (condition) {
        passed++;
        results.push({ label, status: 'PASS' });
        console.log(`  ✅ PASS: ${label}`);
    } else {
        failed++;
        results.push({ label, status: 'FAIL' });
        console.log(`  ❌ FAIL: ${label}`);
    }
}

// ---------------------------------------------------------------------------
// In-memory mock DB
// ---------------------------------------------------------------------------

const memoryDb = {
    marketplace_orders: [],
    marketplace_order_files: [],
    marketplace_order_events: [],
    marketplace_order_preflight_bindings: []
};

function installMockEngine() {
    db.query = async (sql, params = []) => {
        // SQL sanity check: reject JS-style !==
        if (sql.includes('!==')) {
            throw new Error('INVALID_SQL_OPERATOR: Use <> or != in SQL, not !==');
        }

        const cleanSql = sql.replace(/\s+/g, ' ').trim();

        // ---- SELECT ----
        if (cleanSql.toUpperCase().startsWith('SELECT')) {
            // marketplace_orders by order_id
            if (cleanSql.includes('FROM marketplace_orders WHERE order_id = ?')) {
                return memoryDb.marketplace_orders.filter(o => o.order_id === params[0]);
            }

            // marketplace_order_files by order_id — with optional status filter
            if (cleanSql.includes('FROM marketplace_order_files WHERE order_id = ?')) {
                let rows = memoryDb.marketplace_order_files.filter(f => f.order_id === params[0]);
                // Handle status <> 'SUPERSEDED' filter
                if (cleanSql.includes("status <> 'SUPERSEDED'") || cleanSql.includes("status != 'SUPERSEDED'")) {
                    rows = rows.filter(f => f.status !== 'SUPERSEDED');
                }
                // Handle role filter
                if (cleanSql.includes('AND role = ?')) {
                    rows = rows.filter(f => f.role === params[1]);
                }
                return rows;
            }

            // marketplace_order_files by file_id and order_id
            if (cleanSql.includes('FROM marketplace_order_files WHERE file_id = ?')) {
                return memoryDb.marketplace_order_files.filter(f => f.file_id === params[0] && f.order_id === params[1]);
            }

            // marketplace_order_events by order_id
            if (cleanSql.includes('FROM marketplace_order_events WHERE order_id = ?')) {
                return memoryDb.marketplace_order_events
                    .filter(e => e.order_id === params[0])
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }

            // marketplace_order_preflight_bindings
            if (cleanSql.includes('FROM marketplace_order_preflight_bindings WHERE order_id = ?')) {
                return memoryDb.marketplace_order_preflight_bindings.filter(b => b.order_id === params[0]);
            }
            if (cleanSql.includes('FROM marketplace_order_preflight_bindings WHERE preflight_job_id = ?')) {
                return memoryDb.marketplace_order_preflight_bindings.filter(b => b.preflight_job_id === params[0]);
            }

            if (cleanSql.includes('SELECT 1')) {
                return [{ 1: 1 }];
            }
        }

        // ---- UPDATE ----
        if (cleanSql.toUpperCase().startsWith('UPDATE')) {
            if (cleanSql.includes('UPDATE marketplace_orders')) {
                const orderId = params[params.length - 1];
                const order = memoryDb.marketplace_orders.find(o => o.order_id === orderId);
                if (order) {
                    // metadata_json update
                    if (cleanSql.includes('metadata_json = ?') && cleanSql.includes('updated_at')) {
                        // metadata_json is always the first param for metadata-only updates
                        if (cleanSql.includes('readiness_json = ?') && cleanSql.includes('status = ?')) {
                            // computeReadiness: readiness_json = ?, status = ?, WHERE order_id = ?
                            order.readiness_json = params[0];
                            order.status = params[1];
                        } else {
                            // customer action service: metadata_json = ?, WHERE order_id = ?
                            order.metadata_json = params[0];
                        }
                    } else if (cleanSql.includes('readiness_json = ?') && cleanSql.includes('status = ?')) {
                        order.readiness_json = params[0];
                        order.status = params[1];
                    }
                }
                return { affectedRows: order ? 1 : 0 };
            }

            if (cleanSql.includes('UPDATE marketplace_order_files')) {
                // Find the file to update
                const fileId = params[params.length - 1];
                const file = memoryDb.marketplace_order_files.find(f => f.file_id === fileId);
                if (file) {
                    if (cleanSql.includes('preflight_job_id = ?')) {
                        file.preflight_job_id = params[0];
                        file.preflight_status = params[1];
                        file.preflight_outcome_category = params[2];
                        file.findings_count = params[3];
                        file.status = params[4];
                    } else if (cleanSql.includes("status = 'SUPERSEDED'")) {
                        file.status = 'SUPERSEDED';
                    } else if (cleanSql.includes("status = 'UPLOADED'")) {
                        file.status = 'UPLOADED';
                    }
                }
                return { affectedRows: file ? 1 : 0 };
            }
        }

        // ---- INSERT ----
        if (cleanSql.toUpperCase().startsWith('INSERT INTO')) {
            if (cleanSql.includes('marketplace_order_events')) {
                const row = {
                    event_id: params[0],
                    order_id: params[1],
                    file_id: params[2],
                    type: params[3],
                    actor_type: params[4],
                    actor_id: params[5],
                    payload_json: params[6],
                    created_at: new Date()
                };
                memoryDb.marketplace_order_events.push(row);
                return { insertId: memoryDb.marketplace_order_events.length };
            }

            if (cleanSql.includes('marketplace_order_preflight_bindings')) {
                const row = {
                    order_id: params[0],
                    file_id: params[1],
                    preflight_job_id: params[2],
                    role: params[3],
                    status: params[4],
                    outcome_category: params[5],
                    analysis_integrity_json: params[6],
                    analyzer_coverage_json: params[7],
                    artifact_refs_json: params[8],
                    findings_count: params[9],
                    created_at: new Date(),
                    updated_at: new Date()
                };
                memoryDb.marketplace_order_preflight_bindings.push(row);
                return { insertId: memoryDb.marketplace_order_preflight_bindings.length };
            }

            if (cleanSql.includes('marketplace_order_files')) {
                const row = {
                    file_id: params[0],
                    order_id: params[1],
                    role: params[2],
                    version: params[3],
                    original_name: params[4] || 'file.pdf',
                    mime_type: params[5] || 'application/pdf',
                    size_bytes: params[6] || 0,
                    checksum_sha256: params[7] || null,
                    storage_path: params[8] || null,
                    status: 'UPLOADED',
                    uploaded_at: new Date(),
                    created_at: new Date(),
                    updated_at: new Date()
                };
                memoryDb.marketplace_order_files.push(row);
                return { insertId: memoryDb.marketplace_order_files.length };
            }
        }

        return [];
    };
}

function clearMemoryDb() {
    memoryDb.marketplace_orders = [];
    memoryDb.marketplace_order_files = [];
    memoryDb.marketplace_order_events = [];
    memoryDb.marketplace_order_preflight_bindings = [];
}

/**
 * Seed an order with the given remediation/invoice_gate metadata.
 */
function seedOrder(orderId, opts = {}) {
    const metadata = {};

    if (opts.remediation) {
        metadata.remediation = opts.remediation;
    }
    if (opts.invoice_gate) {
        metadata.invoice_gate = opts.invoice_gate;
    }
    if (opts.customer_action) {
        metadata.customer_action = opts.customer_action;
    }

    const order = {
        order_id: orderId,
        pricing_session_id: 'sess_test',
        session_id: 'sess_test',
        selected_offer_id: 'offer_test',
        customer_id: 'cust_test',
        tenant_id: 'tenant_test',
        printhouse_id: 'ph_test',
        status: opts.status || 'PREFLIGHT_BLOCKED',
        currency: 'EUR',
        estimated_price: 100,
        book_spec_json: JSON.stringify({ pages: 200, format: 'A5' }),
        selected_offer_json: JSON.stringify({ offerId: 'offer_test', totalPrice: 100 }),
        customer_json: JSON.stringify({ name: 'Test Customer', email: 'test@example.com' }),
        readiness_json: JSON.stringify({ ready: false, blockers: ['PREFLIGHT_BLOCKED'] }),
        metadata_json: JSON.stringify(metadata),
        created_at: new Date(),
        updated_at: new Date()
    };

    memoryDb.marketplace_orders.push(order);

    // Seed files
    if (opts.seedFiles !== false) {
        memoryDb.marketplace_order_files.push({
            file_id: 'fil_interior_test',
            order_id: orderId,
            role: 'INTERIOR_PDF',
            version: 1,
            original_name: 'interior.pdf',
            mime_type: 'application/pdf',
            size_bytes: 5000,
            status: 'ACCEPTED_WITH_WARNINGS',
            preflight_job_id: 'job_int_test',
            preflight_status: 'DEGRADED',
            preflight_outcome_category: 'DEGRADED_ANALYSIS',
            findings_count: 6,
            created_at: new Date(),
            updated_at: new Date()
        });
        memoryDb.marketplace_order_files.push({
            file_id: 'fil_cover_test',
            order_id: orderId,
            role: 'COVER_PDF',
            version: 1,
            original_name: 'cover.pdf',
            mime_type: 'application/pdf',
            size_bytes: 3000,
            status: 'ACCEPTED_WITH_WARNINGS',
            preflight_job_id: 'job_cov_test',
            preflight_status: 'DEGRADED',
            preflight_outcome_category: 'DEGRADED_ANALYSIS',
            findings_count: 6,
            created_at: new Date(),
            updated_at: new Date()
        });
    }

    return order;
}

// ---------------------------------------------------------------------------
// Test Cases
// ---------------------------------------------------------------------------

async function runTests() {
    console.log('\n=============================================================');
    console.log('📋 PHASE 36.7 CUSTOMER ACTION VERIFICATION TESTS 📋');
    console.log('=============================================================\n');

    installMockEngine();

    // -----------------------------------------------------------------
    // TEST 1: Create action for CUSTOMER_ACTION_REQUIRED
    // -----------------------------------------------------------------
    console.log('\n--- TEST 1: Create action for CUSTOMER_ACTION_REQUIRED ---');
    clearMemoryDb();
    seedOrder('ord_test_001', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF', 'COVER_PDF'],
            blockers: ['PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF', 'PREFLIGHT_NON_CERTIFIABLE_COVER_PDF'],
            message: 'Files need correction.'
        },
        invoice_gate: {
            invoiceReady: false,
            decision: 'PREFLIGHT_BLOCKED'
        }
    });

    const result1 = await customerActionService.createCustomerAction('ord_test_001', {
        message: 'Please reupload corrected files.'
    }, { operatorId: 'admin_test' });

    assert(result1.ok === true, 'T1: result.ok is true');
    assert(result1.actionRequired === true, 'T1: actionRequired is true');
    assert(result1.type === 'FILE_REUPLOAD_REQUIRED', 'T1: type is FILE_REUPLOAD_REQUIRED');
    assert(result1.status === 'PENDING_NOTIFICATION', 'T1: status is PENDING_NOTIFICATION');
    assert(result1.token && result1.token.startsWith('cat_'), 'T1: token starts with cat_');
    assert(result1.tokenPreview && result1.tokenPreview.length === 12, 'T1: tokenPreview is 12 chars');
    assert(Array.isArray(result1.requiredFiles) && result1.requiredFiles.length === 2, 'T1: requiredFiles has 2 entries');
    assert(Array.isArray(result1.blockers) && result1.blockers.length === 2, 'T1: blockers has 2 entries');
    assert(result1.expiresAt != null, 'T1: expiresAt is set');
    assert(result1.message === 'Please reupload corrected files.', 'T1: message matches payload');

    // Verify metadata was persisted
    const orderAfterCreate = memoryDb.marketplace_orders.find(o => o.order_id === 'ord_test_001');
    const metaAfterCreate = JSON.parse(orderAfterCreate.metadata_json);
    assert(metaAfterCreate.customer_action != null, 'T1: customer_action persisted in metadata_json');
    assert(metaAfterCreate.customer_action.phase === '36.7', 'T1: phase is 36.7');
    assert(metaAfterCreate.customer_action.tokenHash != null, 'T1: tokenHash is stored');
    assert(metaAfterCreate.customer_action.tokenPreview != null, 'T1: tokenPreview is stored');

    // Verify audit event
    const events1 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_test_001' && e.type === 'CUSTOMER_ACTION_CREATED');
    assert(events1.length === 1, 'T1: CUSTOMER_ACTION_CREATED event logged');

    // Save token for later tests
    const savedToken1 = result1.token;

    // -----------------------------------------------------------------
    // TEST 2: Create action for STILL_BLOCKED
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: Create action for STILL_BLOCKED ---');
    clearMemoryDb();
    seedOrder('ord_test_002', {
        remediation: {
            status: 'STILL_BLOCKED',
            requiredFiles: ['INTERIOR_PDF'],
            blockers: ['PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF']
        },
        invoice_gate: {
            invoiceReady: false,
            decision: 'PREFLIGHT_BLOCKED'
        }
    });

    const result2 = await customerActionService.createCustomerAction('ord_test_002', {}, { operatorId: 'admin_test' });
    assert(result2.ok === true, 'T2: result.ok is true for STILL_BLOCKED');
    assert(result2.actionRequired === true, 'T2: actionRequired is true');
    assert(result2.token && result2.token.startsWith('cat_'), 'T2: token generated');
    assert(result2.requiredFiles.length === 1, 'T2: requiredFiles has 1 entry (INTERIOR_PDF)');

    // -----------------------------------------------------------------
    // TEST 3: Do NOT create when invoiceReady === true
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: Do NOT create when invoiceReady === true ---');
    clearMemoryDb();
    seedOrder('ord_test_003', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF']
        },
        invoice_gate: {
            invoiceReady: true,
            decision: 'READY_FOR_INVOICE'
        }
    });

    const result3 = await customerActionService.createCustomerAction('ord_test_003', {}, { operatorId: 'admin_test' });
    assert(result3.ok === true, 'T3: result.ok is true');
    assert(result3.actionRequired === false, 'T3: actionRequired is false');
    assert(result3.reason === 'ACTION_NOT_REQUIRED', 'T3: reason is ACTION_NOT_REQUIRED');
    assert(!result3.token, 'T3: no token generated');

    // -----------------------------------------------------------------
    // TEST 4: Idempotency — returns existing action without new token
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: Idempotency returns existing action ---');
    clearMemoryDb();
    seedOrder('ord_test_004', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF', 'COVER_PDF'],
            blockers: ['PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF', 'PREFLIGHT_NON_CERTIFIABLE_COVER_PDF']
        },
        invoice_gate: { invoiceReady: false }
    });

    // First create
    const create4a = await customerActionService.createCustomerAction('ord_test_004', {}, { operatorId: 'admin_test' });
    assert(create4a.ok === true && create4a.token, 'T4a: first create returns token');

    // Second create (idempotent)
    const create4b = await customerActionService.createCustomerAction('ord_test_004', {}, { operatorId: 'admin_test' });
    assert(create4b.ok === true, 'T4b: idempotent create returns ok');
    assert(create4b.alreadyExists === true, 'T4b: alreadyExists is true');
    assert(!create4b.token, 'T4b: no new token on idempotent call');
    assert(create4b.tokenPreview === create4a.tokenPreview, 'T4b: tokenPreview matches original');

    // Verify only 1 CUSTOMER_ACTION_CREATED event
    const events4 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_test_004' && e.type === 'CUSTOMER_ACTION_CREATED');
    assert(events4.length === 1, 'T4: only 1 CUSTOMER_ACTION_CREATED event (idempotent)');

    // -----------------------------------------------------------------
    // TEST 5: force=true creates/rotates action
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: force=true creates/rotates action ---');
    clearMemoryDb();
    seedOrder('ord_test_005', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF', 'COVER_PDF'],
            blockers: ['PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF']
        },
        invoice_gate: { invoiceReady: false }
    });

    const create5a = await customerActionService.createCustomerAction('ord_test_005', {}, { operatorId: 'admin_test' });
    const oldToken5 = create5a.token;
    const oldPreview5 = create5a.tokenPreview;

    // Force create
    const create5b = await customerActionService.createCustomerAction('ord_test_005', { force: true }, { operatorId: 'admin_test' });
    assert(create5b.ok === true, 'T5: forced create returns ok');
    assert(create5b.token && create5b.token !== oldToken5, 'T5: new token differs from old');
    assert(create5b.tokenPreview !== oldPreview5, 'T5: tokenPreview changed');
    assert(!create5b.alreadyExists, 'T5: alreadyExists is not set on force');

    // -----------------------------------------------------------------
    // TEST 6: Token hash validation (validateCustomerToken)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 6: Token hash validation ---');
    clearMemoryDb();
    seedOrder('ord_test_006', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF', 'COVER_PDF'],
            blockers: ['PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF']
        },
        invoice_gate: { invoiceReady: false }
    });

    const create6 = await customerActionService.createCustomerAction('ord_test_006', {}, { operatorId: 'admin_test' });
    const validToken = create6.token;

    // Valid token
    const validate6a = await customerActionService.validateCustomerToken('ord_test_006', validToken);
    assert(validate6a.ok === true, 'T6a: valid token passes validation');
    assert(validate6a.action.type === 'FILE_REUPLOAD_REQUIRED', 'T6a: action.type correct');
    assert(Array.isArray(validate6a.currentFiles), 'T6a: currentFiles returned');
    assert(validate6a.currentFiles.length === 2, 'T6a: currentFiles has 2 active files');

    // Invalid token
    const validate6b = await customerActionService.validateCustomerToken('ord_test_006', 'cat_fakeinvalidtoken');
    assert(validate6b.ok === false, 'T6b: invalid token fails');
    assert(validate6b.error === 'INVALID_TOKEN', 'T6b: error is INVALID_TOKEN');

    // No action order
    clearMemoryDb();
    seedOrder('ord_test_006b', { remediation: {}, invoice_gate: {} });
    const validate6c = await customerActionService.validateCustomerToken('ord_test_006b', 'cat_anything');
    assert(validate6c.ok === false, 'T6c: no customer action returns error');
    assert(validate6c.error === 'NO_CUSTOMER_ACTION', 'T6c: error is NO_CUSTOMER_ACTION');

    // -----------------------------------------------------------------
    // TEST 7: Expired token rejection
    // -----------------------------------------------------------------
    console.log('\n--- TEST 7: Expired token rejection ---');
    clearMemoryDb();
    seedOrder('ord_test_007', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF'],
            blockers: []
        },
        invoice_gate: { invoiceReady: false }
    });

    const create7 = await customerActionService.createCustomerAction('ord_test_007', {}, { operatorId: 'admin_test' });
    const validToken7 = create7.token;

    // Manually expire the token in metadata
    const order7 = memoryDb.marketplace_orders.find(o => o.order_id === 'ord_test_007');
    const meta7 = JSON.parse(order7.metadata_json);
    meta7.customer_action.expiresAt = new Date(Date.now() - 1000).toISOString(); // expired 1 second ago
    order7.metadata_json = JSON.stringify(meta7);

    const validate7 = await customerActionService.validateCustomerToken('ord_test_007', validToken7);
    assert(validate7.ok === false, 'T7: expired token fails validation');
    assert(validate7.error === 'TOKEN_EXPIRED', 'T7: error is TOKEN_EXPIRED');

    // Also verify markCustomerActionViewed rejects expired token
    const view7 = await customerActionService.markCustomerActionViewed('ord_test_007', validToken7);
    assert(view7.ok === false, 'T7b: markViewed rejects expired token');
    assert(view7.error === 'TOKEN_EXPIRED', 'T7b: error is TOKEN_EXPIRED');

    // -----------------------------------------------------------------
    // TEST 8: mark-notified updates notifiedAt/status
    // -----------------------------------------------------------------
    console.log('\n--- TEST 8: mark-notified updates notifiedAt/status ---');
    clearMemoryDb();
    seedOrder('ord_test_008', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF'],
            blockers: []
        },
        invoice_gate: { invoiceReady: false }
    });

    await customerActionService.createCustomerAction('ord_test_008', {}, { operatorId: 'admin_test' });

    const notify8 = await customerActionService.markCustomerActionNotified('ord_test_008', { operatorId: 'admin_notifier' });
    assert(notify8.ok === true, 'T8: mark-notified returns ok');
    assert(notify8.status === 'NOTIFIED', 'T8: status is NOTIFIED');
    assert(notify8.notifiedAt != null, 'T8: notifiedAt is set');

    // Verify persisted
    const order8 = memoryDb.marketplace_orders.find(o => o.order_id === 'ord_test_008');
    const meta8 = JSON.parse(order8.metadata_json);
    assert(meta8.customer_action.status === 'NOTIFIED', 'T8: persisted status is NOTIFIED');
    assert(meta8.customer_action.notifiedAt != null, 'T8: persisted notifiedAt is set');
    assert(meta8.customer_action.notifiedBy === 'admin_notifier', 'T8: notifiedBy is admin_notifier');

    // Verify audit event
    const events8 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_test_008' && e.type === 'CUSTOMER_ACTION_NOTIFIED');
    assert(events8.length === 1, 'T8: CUSTOMER_ACTION_NOTIFIED event logged');

    // mark-notified on order without action
    clearMemoryDb();
    seedOrder('ord_test_008b', { remediation: {} });
    const notify8b = await customerActionService.markCustomerActionNotified('ord_test_008b');
    assert(notify8b.ok === false, 'T8b: mark-notified on no-action returns error');
    assert(notify8b.error === 'NO_CUSTOMER_ACTION', 'T8b: error is NO_CUSTOMER_ACTION');

    // -----------------------------------------------------------------
    // TEST 9: mark-viewed updates viewedAt/status
    // -----------------------------------------------------------------
    console.log('\n--- TEST 9: mark-viewed updates viewedAt/status ---');
    clearMemoryDb();
    seedOrder('ord_test_009', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF', 'COVER_PDF'],
            blockers: ['PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF']
        },
        invoice_gate: { invoiceReady: false }
    });

    const create9 = await customerActionService.createCustomerAction('ord_test_009', {}, { operatorId: 'admin_test' });
    const token9 = create9.token;

    const view9 = await customerActionService.markCustomerActionViewed('ord_test_009', token9);
    assert(view9.ok === true, 'T9: mark-viewed returns ok');
    assert(view9.status === 'VIEWED', 'T9: status is VIEWED');
    assert(view9.viewedAt != null, 'T9: viewedAt is set');
    assert(view9.customerAction.type === 'FILE_REUPLOAD_REQUIRED', 'T9: customerAction.type correct');

    // Verify persisted
    const order9 = memoryDb.marketplace_orders.find(o => o.order_id === 'ord_test_009');
    const meta9 = JSON.parse(order9.metadata_json);
    assert(meta9.customer_action.status === 'VIEWED', 'T9: persisted status is VIEWED');
    assert(meta9.customer_action.viewedAt != null, 'T9: persisted viewedAt is set');

    // Verify audit event
    const events9 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_test_009' && e.type === 'CUSTOMER_ACTION_VIEWED');
    assert(events9.length === 1, 'T9: CUSTOMER_ACTION_VIEWED event logged');

    // Invalid token on mark-viewed
    const view9b = await customerActionService.markCustomerActionViewed('ord_test_009', 'cat_wrongtoken');
    assert(view9b.ok === false, 'T9b: invalid token on mark-viewed fails');
    assert(view9b.error === 'INVALID_TOKEN', 'T9b: error is INVALID_TOKEN');

    // -----------------------------------------------------------------
    // TEST 10: getCustomerAction (admin view)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 10: getCustomerAction admin view ---');
    clearMemoryDb();
    seedOrder('ord_test_010', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF'],
            blockers: ['PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF']
        },
        invoice_gate: { invoiceReady: false }
    });

    // No action yet
    const get10a = await customerActionService.getCustomerAction('ord_test_010');
    assert(get10a.ok === true, 'T10a: get with no action returns ok');
    assert(get10a.actionRequired === false, 'T10a: actionRequired is false');
    assert(get10a.customerAction === null, 'T10a: customerAction is null');

    // Create action then get
    await customerActionService.createCustomerAction('ord_test_010', {
        message: 'Reupload needed.'
    }, { operatorId: 'admin_test' });

    const get10b = await customerActionService.getCustomerAction('ord_test_010');
    assert(get10b.ok === true, 'T10b: get with action returns ok');
    assert(get10b.actionRequired === true, 'T10b: actionRequired is true');
    assert(get10b.customerAction.type === 'FILE_REUPLOAD_REQUIRED', 'T10b: type correct');
    assert(get10b.customerAction.status === 'PENDING_NOTIFICATION', 'T10b: status correct');
    assert(!get10b.customerAction.tokenHash, 'T10b: tokenHash NOT exposed in admin view');
    assert(get10b.customerAction.tokenPreview != null, 'T10b: tokenPreview IS shown');

    // -----------------------------------------------------------------
    // TEST 11: Remediation status NOT actionable
    // -----------------------------------------------------------------
    console.log('\n--- TEST 11: Remediation status not actionable ---');
    clearMemoryDb();
    seedOrder('ord_test_011', {
        remediation: {
            status: 'REUPLOAD_RECEIVED'
        },
        invoice_gate: { invoiceReady: false }
    });

    const result11 = await customerActionService.createCustomerAction('ord_test_011', {}, { operatorId: 'admin_test' });
    assert(result11.ok === false, 'T11: non-actionable status returns ok=false');
    assert(result11.error === 'REMEDIATION_STATUS_NOT_ACTIONABLE', 'T11: error is REMEDIATION_STATUS_NOT_ACTIONABLE');

    // force=true overrides
    const result11b = await customerActionService.createCustomerAction('ord_test_011', { force: true }, { operatorId: 'admin_test' });
    assert(result11b.ok === true, 'T11b: force=true overrides status check');
    assert(result11b.token != null, 'T11b: token generated with force');

    // -----------------------------------------------------------------
    // TEST 12: generateCustomerReuploadToken (token rotation)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 12: Token rotation ---');
    clearMemoryDb();
    seedOrder('ord_test_012', {
        remediation: {
            status: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: ['INTERIOR_PDF'],
            blockers: []
        },
        invoice_gate: { invoiceReady: false }
    });

    const create12 = await customerActionService.createCustomerAction('ord_test_012', {}, { operatorId: 'admin_test' });
    const oldToken12 = create12.token;

    const rotate12 = await customerActionService.generateCustomerReuploadToken('ord_test_012', { operatorId: 'admin_test' });
    assert(rotate12.ok === true, 'T12: token rotation returns ok');
    assert(rotate12.token && rotate12.token !== oldToken12, 'T12: new token differs from old');
    assert(rotate12.tokenPreview != null, 'T12: new tokenPreview present');

    // Old token should now be invalid
    const validateOld = await customerActionService.validateCustomerToken('ord_test_012', oldToken12);
    assert(validateOld.ok === false, 'T12: old token is now invalid');
    assert(validateOld.error === 'INVALID_TOKEN', 'T12: old token error is INVALID_TOKEN');

    // New token should be valid
    const validateNew = await customerActionService.validateCustomerToken('ord_test_012', rotate12.token);
    assert(validateNew.ok === true, 'T12: new token is valid');

    // Verify rotation audit event
    const events12 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_test_012' && e.type === 'CUSTOMER_ACTION_TOKEN_ROTATED');
    assert(events12.length === 1, 'T12: CUSTOMER_ACTION_TOKEN_ROTATED event logged');

    // -----------------------------------------------------------------
    // TEST 13: SQL sanity — no !== in service queries
    // -----------------------------------------------------------------
    console.log('\n--- TEST 13: SQL sanity check ---');
    const fs = require('fs');
    const serviceSource = fs.readFileSync(
        require('path').join(__dirname, '..', 'src', 'api', 'services', 'marketplaceCustomerActionService.js'),
        'utf-8'
    );
    // Find SQL strings containing !==
    const sqlStringMatches = serviceSource.match(/['"`].*?!==.*?['"`]/g) || [];
    assert(sqlStringMatches.length === 0, 'T13: No !== operators in SQL query strings');

    // Also verify the service uses <> in the validateCustomerToken query
    const hasStandardSuperFilter = serviceSource.includes("status <> 'SUPERSEDED'")
        || serviceSource.includes("status != 'SUPERSEDED'")
        || serviceSource.includes("status <> \\'SUPERSEDED\\'")
        || serviceSource.includes('status <> \'SUPERSEDED\'')
        || serviceSource.includes("status <> \\\\");  // escaped variant fallback
    assert(hasStandardSuperFilter || serviceSource.includes('status <>'),
        'T13: Service uses <> or != for SUPERSEDED filter');

    // -----------------------------------------------------------------
    // SUMMARY
    // -----------------------------------------------------------------
    console.log('\n=============================================================');
    console.log(`📋 PHASE 36.7 RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('=============================================================');

    if (failed > 0) {
        console.log('\n❌ FAILED TESTS:');
        results.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`   - ${r.label}`);
        });
    }

    console.log('\n');
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
});
