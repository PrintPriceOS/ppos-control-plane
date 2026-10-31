/**
 * scripts/test-phase37-invoice-payment.js
 *
 * High-fidelity verification test suite for Phase 37.1:
 * Invoice / Payment Execution from READY_FOR_INVOICE.
 *
 * Validates:
 *  1. Blocked order returns INVOICE_BLOCKED
 *  2. READY_FOR_INVOICE order creates invoice (generates invoice_number)
 *  3. generateMarketplaceInvoice is idempotent (second call returns same invoice)
 *  4. requestMarketplacePaymentLink creates bank_transfer instructions
 *  5. requestMarketplacePaymentLink is idempotent (returns same payment)
 *  6. getMarketplaceInvoicePaymentStatus returns sanitized invoice + payment
 *  7. getMarketplaceInvoicePaymentStatus is read-only (no flag required)
 *  8. markMarketplacePaymentConfirmed updates status to PAYMENT_CONFIRMED
 *  9. markMarketplacePaymentConfirmed is idempotent for already-confirmed
 * 10. markMarketplacePaymentConfirmed rejects order with no invoice
 * 11. markMarketplacePaymentConfirmed rejects already non-pending payment
 * 12. Disabled flag blocks mutating endpoints
 * 13. SQL sanity: no !== in service query strings
 * 14. payment.instructions does NOT expose confirmedBy / internal fields in status
 */

'use strict';

require('dotenv').config();
const db = require('../src/api/services/mysqlClient');
const invoicePaymentService = require('../src/api/services/marketplaceInvoicePaymentService');

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
// In-memory mock DB (same pattern as Phase 36.7 test)
// ---------------------------------------------------------------------------

const memoryDb = {
    marketplace_orders: [],
    marketplace_order_files: [],
    marketplace_order_events: [],
    marketplace_order_preflight_bindings: []
};

function installMockEngine() {
    db.query = async (sql, params = []) => {
        if (sql.includes('!==')) {
            throw new Error('INVALID_SQL_OPERATOR: Use <> or != in SQL, not !==');
        }

        const cleanSql = sql.replace(/\s+/g, ' ').trim();

        // ---- SELECT ----
        if (cleanSql.toUpperCase().startsWith('SELECT')) {
            if (cleanSql.includes('FROM marketplace_orders WHERE order_id = ?')) {
                return memoryDb.marketplace_orders.filter(o => o.order_id === params[0]);
            }
            if (cleanSql.includes('FROM marketplace_order_files WHERE order_id = ?')) {
                let rows = memoryDb.marketplace_order_files.filter(f => f.order_id === params[0]);
                if (cleanSql.includes("status <> 'SUPERSEDED'") || cleanSql.includes("status <> \\'SUPERSEDED\\'")) {
                    rows = rows.filter(f => f.status !== 'SUPERSEDED');
                }
                if (cleanSql.includes('AND role = ?')) {
                    rows = rows.filter(f => f.role === params[1]);
                }
                return rows;
            }
            if (cleanSql.includes('FROM marketplace_order_events WHERE order_id = ?')) {
                return memoryDb.marketplace_order_events
                    .filter(e => e.order_id === params[0])
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
            if (cleanSql.includes('FROM marketplace_order_preflight_bindings WHERE order_id = ?')) {
                return memoryDb.marketplace_order_preflight_bindings.filter(b => b.order_id === params[0]);
            }
            if (cleanSql.includes('SELECT 1')) return [{ 1: 1 }];
        }

        // ---- UPDATE ----
        if (cleanSql.toUpperCase().startsWith('UPDATE')) {
            if (cleanSql.includes('UPDATE marketplace_orders')) {
                const orderId = params[params.length - 1];
                const order = memoryDb.marketplace_orders.find(o => o.order_id === orderId);
                if (order) {
                    // metadata_json + status + updated_at (mark-confirmed, invoiced)
                    if (cleanSql.includes('metadata_json = ?') && cleanSql.includes('status = ?') && cleanSql.includes('updated_at')) {
                        order.metadata_json = params[0];
                        order.status = params[1];
                    // metadata_json + readiness_json + status (invoice gate)
                    } else if (cleanSql.includes('readiness_json = ?') && cleanSql.includes('status = ?')) {
                        order.readiness_json = params[0];
                        order.status = params[1];
                    // metadata_json only (persistMetadata)
                    } else if (cleanSql.includes('metadata_json = ?') && cleanSql.includes('updated_at')) {
                        order.metadata_json = params[0];
                    // full metadata+readiness+status (invoice gate 3-param)
                    } else if (cleanSql.includes('metadata_json = ?') && cleanSql.includes('readiness_json = ?') && cleanSql.includes('status = ?')) {
                        order.metadata_json = params[0];
                        order.readiness_json = params[1];
                        order.status = params[2];
                    }
                }
                return { affectedRows: order ? 1 : 0 };
            }
            if (cleanSql.includes('UPDATE marketplace_order_files')) {
                const fileId = params[params.length - 1];
                const file = memoryDb.marketplace_order_files.find(f => f.file_id === fileId);
                if (file && cleanSql.includes('preflight_job_id = ?')) {
                    file.preflight_job_id = params[0];
                    file.preflight_status = params[1];
                    file.preflight_outcome_category = params[2];
                    file.findings_count = params[3];
                    file.status = params[4];
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
 * Seed an order with certifiable files for READY_FOR_INVOICE state.
 */
function seedReadyOrder(orderId, overrides = {}) {
    const order = {
        order_id: orderId,
        pricing_session_id: 'sess_test',
        session_id: 'sess_test',
        selected_offer_id: 'offer_test',
        customer_id: 'cust_test',
        tenant_id: 'tenant_test',
        printhouse_id: 'ph_test',
        status: overrides.status || 'READY_TO_INVOICE',
        currency: 'EUR',
        estimated_price: overrides.estimated_price !== undefined ? overrides.estimated_price : 125.50,
        book_spec_json: JSON.stringify({ pages: 200, format: 'A5' }),
        selected_offer_json: JSON.stringify({ offerId: 'offer_test', totalPrice: 125.50, currency: 'EUR' }),
        customer_json: JSON.stringify({ name: 'Test Customer', email: 'test@example.com' }),
        readiness_json: JSON.stringify({ ready: true, blockers: [], invoiceReady: true }),
        metadata_json: JSON.stringify(overrides.metadata || {
            invoice_gate: {
                phase: '36.5',
                decision: 'READY_FOR_INVOICE',
                invoiceReady: true,
                blockers: [],
                warnings: [],
                recommendedAction: 'GENERATE_INVOICE',
                evaluatedAt: new Date().toISOString(),
                evaluatedBy: 'test'
            }
        }),
        created_at: new Date(),
        updated_at: new Date()
    };

    memoryDb.marketplace_orders.push(order);

    if (overrides.seedFiles !== false) {
        memoryDb.marketplace_order_files.push({
            file_id: 'fil_interior_' + orderId,
            order_id: orderId,
            role: 'INTERIOR_PDF',
            version: 1,
            original_name: 'interior.pdf',
            mime_type: 'application/pdf',
            size_bytes: 5000,
            status: 'ACCEPTED',
            preflight_job_id: 'job_int_' + orderId,
            preflight_status: 'COMPLETED',
            preflight_outcome_category: 'PASS',
            findings_count: 0,
            created_at: new Date(),
            updated_at: new Date()
        });
        memoryDb.marketplace_order_files.push({
            file_id: 'fil_cover_' + orderId,
            order_id: orderId,
            role: 'COVER_PDF',
            version: 1,
            original_name: 'cover.pdf',
            mime_type: 'application/pdf',
            size_bytes: 3000,
            status: 'ACCEPTED',
            preflight_job_id: 'job_cov_' + orderId,
            preflight_status: 'COMPLETED',
            preflight_outcome_category: 'PASS',
            findings_count: 0,
            created_at: new Date(),
            updated_at: new Date()
        });
    }

    return order;
}

/**
 * Seed a PREFLIGHT_BLOCKED order (should not be invoiceable).
 */
function seedBlockedOrder(orderId) {
    const order = {
        order_id: orderId,
        status: 'PREFLIGHT_BLOCKED',
        currency: 'EUR',
        estimated_price: 100,
        selected_offer_json: JSON.stringify({ totalPrice: 100, currency: 'EUR' }),
        customer_json: JSON.stringify({}),
        readiness_json: JSON.stringify({ ready: false, blockers: ['PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF'] }),
        metadata_json: JSON.stringify({
            invoice_gate: {
                phase: '36.5',
                decision: 'PREFLIGHT_BLOCKED',
                invoiceReady: false,
                blockers: ['PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF', 'PREFLIGHT_NON_CERTIFIABLE_COVER_PDF'],
                recommendedAction: 'FILE_REUPLOAD_REQUIRED',
                evaluatedAt: new Date().toISOString()
            }
        }),
        book_spec_json: JSON.stringify({}),
        created_at: new Date(),
        updated_at: new Date()
    };
    memoryDb.marketplace_orders.push(order);

    // Files with degraded/non-certifiable status
    memoryDb.marketplace_order_files.push({
        file_id: 'fil_int_blocked_' + orderId,
        order_id: orderId,
        role: 'INTERIOR_PDF',
        version: 1,
        original_name: 'interior.pdf',
        status: 'ACCEPTED_WITH_WARNINGS',
        preflight_job_id: 'job_int_bl',
        preflight_status: 'DEGRADED',
        preflight_outcome_category: 'DEGRADED_ANALYSIS',
        findings_count: 6,
        created_at: new Date(),
        updated_at: new Date()
    });
    memoryDb.marketplace_order_files.push({
        file_id: 'fil_cov_blocked_' + orderId,
        order_id: orderId,
        role: 'COVER_PDF',
        version: 1,
        original_name: 'cover.pdf',
        status: 'ACCEPTED_WITH_WARNINGS',
        preflight_job_id: 'job_cov_bl',
        preflight_status: 'DEGRADED',
        preflight_outcome_category: 'DEGRADED_ANALYSIS',
        findings_count: 3,
        created_at: new Date(),
        updated_at: new Date()
    });

    return order;
}

// ---------------------------------------------------------------------------
// Test Runner
// ---------------------------------------------------------------------------

async function runTests() {
    console.log('\n=============================================================');
    console.log('📋 PHASE 37.1 INVOICE / PAYMENT VERIFICATION TESTS 📋');
    console.log('=============================================================\n');

    installMockEngine();

    // Enable flag for most tests
    process.env.PPOS_ENABLE_PHASE37_PAYMENT = 'true';

    // -----------------------------------------------------------------
    // TEST 1: Blocked order returns INVOICE_BLOCKED
    // -----------------------------------------------------------------
    console.log('\n--- TEST 1: Blocked order returns INVOICE_BLOCKED ---');
    clearMemoryDb();
    seedBlockedOrder('ord_t01');

    const r1 = await invoicePaymentService.generateMarketplaceInvoice('ord_t01');
    assert(r1.ok === false, 'T1: ok is false for blocked order');
    assert(r1.error === 'INVOICE_BLOCKED', 'T1: error is INVOICE_BLOCKED');
    assert(Array.isArray(r1.blockers) && r1.blockers.length > 0, 'T1: blockers array is non-empty');
    assert(r1.decision === 'PREFLIGHT_BLOCKED', 'T1: decision is PREFLIGHT_BLOCKED');

    const events1 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_t01' && e.type === 'INVOICE_GENERATED');
    assert(events1.length === 0, 'T1: no INVOICE_GENERATED event for blocked order');

    // -----------------------------------------------------------------
    // TEST 2: READY_FOR_INVOICE order creates invoice
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: READY_FOR_INVOICE order generates invoice ---');
    clearMemoryDb();
    seedReadyOrder('ord_t02');

    const r2 = await invoicePaymentService.generateMarketplaceInvoice('ord_t02', { issuedBy: 'admin_test' });
    assert(r2.ok === true, 'T2: ok is true');
    assert(r2.invoice != null, 'T2: invoice is present');
    assert(typeof r2.invoice.invoice_number === 'string', 'T2: invoice_number is a string');
    assert(r2.invoice.invoice_number.startsWith('PPOS-INV-'), 'T2: invoice_number starts with PPOS-INV-');
    assert(r2.invoice.status === 'ISSUED', 'T2: invoice.status is ISSUED');
    assert(r2.invoice.amount === 125.50, 'T2: invoice.amount matches estimated_price');
    assert(r2.invoice.currency === 'EUR', 'T2: invoice.currency is EUR');
    assert(r2.invoice.source === 'CONTROL_PLANE', 'T2: invoice.source is CONTROL_PLANE');
    assert(r2.invoice.phase === '37.1', 'T2: invoice.phase is 37.1');

    // Verify persisted
    const order2 = memoryDb.marketplace_orders.find(o => o.order_id === 'ord_t02');
    const meta2 = JSON.parse(order2.metadata_json);
    assert(meta2.invoice != null, 'T2: invoice persisted in metadata_json');
    assert(meta2.invoice.invoice_number === r2.invoice.invoice_number, 'T2: persisted invoice_number matches');
    assert(order2.status === 'INVOICED', 'T2: order status is INVOICED');

    // Verify audit event
    const events2 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_t02' && e.type === 'INVOICE_GENERATED');
    assert(events2.length === 1, 'T2: INVOICE_GENERATED event logged');

    // -----------------------------------------------------------------
    // TEST 3: generateMarketplaceInvoice is idempotent
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: generateMarketplaceInvoice is idempotent ---');
    // Re-use ord_t02 which now has an invoice

    const r3 = await invoicePaymentService.generateMarketplaceInvoice('ord_t02', { issuedBy: 'admin_test' });
    assert(r3.ok === true, 'T3: ok is true on second call');
    assert(r3.idempotent === true, 'T3: idempotent flag is true');
    assert(r3.invoice.invoice_number === r2.invoice.invoice_number, 'T3: same invoice_number returned');

    // Verify only 1 INVOICE_GENERATED event total
    const events3 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_t02' && e.type === 'INVOICE_GENERATED');
    assert(events3.length === 1, 'T3: still only 1 INVOICE_GENERATED event (idempotent)');

    // -----------------------------------------------------------------
    // TEST 4: bank_transfer payment instructions created
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: bank_transfer payment instructions created ---');
    clearMemoryDb();
    seedReadyOrder('ord_t04');

    const r4 = await invoicePaymentService.requestMarketplacePaymentLink('ord_t04', { requestedBy: 'admin_test' });
    assert(r4.ok === true, 'T4: ok is true');
    assert(r4.invoice != null, 'T4: invoice is present');
    assert(r4.payment != null, 'T4: payment is present');
    assert(r4.payment.provider === 'bank_transfer', 'T4: provider is bank_transfer');
    assert(r4.payment.status === 'PAYMENT_PENDING', 'T4: status is PAYMENT_PENDING');
    assert(typeof r4.payment.reference === 'string', 'T4: reference is a string');
    assert(r4.payment.reference.startsWith('PPOS-PAY-'), 'T4: reference starts with PPOS-PAY-');
    assert(r4.payment.instructions != null, 'T4: instructions present');
    assert(r4.payment.instructions.reference === r4.payment.reference, 'T4: instructions.reference matches payment.reference');

    // Verify persisted
    const order4 = memoryDb.marketplace_orders.find(o => o.order_id === 'ord_t04');
    const meta4 = JSON.parse(order4.metadata_json);
    assert(meta4.payment != null, 'T4: payment persisted in metadata_json');
    assert(meta4.payment.reference === r4.payment.reference, 'T4: persisted reference matches');

    // Verify audit event
    const events4 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_t04' && e.type === 'PAYMENT_INSTRUCTIONS_CREATED');
    assert(events4.length === 1, 'T4: PAYMENT_INSTRUCTIONS_CREATED event logged');

    // -----------------------------------------------------------------
    // TEST 5: requestMarketplacePaymentLink is idempotent
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: requestMarketplacePaymentLink is idempotent ---');
    // Re-use ord_t04 which now has payment

    const r5 = await invoicePaymentService.requestMarketplacePaymentLink('ord_t04');
    assert(r5.ok === true, 'T5: ok is true on second call');
    assert(r5.idempotent === true, 'T5: idempotent flag is true');
    assert(r5.payment.reference === r4.payment.reference, 'T5: same reference returned');

    const events5 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_t04' && e.type === 'PAYMENT_INSTRUCTIONS_CREATED');
    assert(events5.length === 1, 'T5: still only 1 PAYMENT_INSTRUCTIONS_CREATED event');

    // -----------------------------------------------------------------
    // TEST 6: getMarketplaceInvoicePaymentStatus returns sanitized data
    // -----------------------------------------------------------------
    console.log('\n--- TEST 6: getMarketplaceInvoicePaymentStatus returns sanitized state ---');
    clearMemoryDb();
    seedReadyOrder('ord_t06');

    await invoicePaymentService.requestMarketplacePaymentLink('ord_t06');

    const r6 = await invoicePaymentService.getMarketplaceInvoicePaymentStatus('ord_t06');
    assert(r6.ok === true, 'T6: ok is true');
    assert(r6.orderId === 'ord_t06', 'T6: orderId matches');
    assert(r6.invoice != null, 'T6: invoice present');
    assert(r6.payment != null, 'T6: payment present');
    assert(r6.payment.provider === 'bank_transfer', 'T6: payment.provider is bank_transfer');
    assert(r6.payment.status === 'PAYMENT_PENDING', 'T6: payment.status is PAYMENT_PENDING');
    assert(r6.invoiceReady === true, 'T6: invoiceReady is true');
    assert(Array.isArray(r6.blockers), 'T6: blockers is array');

    // Verify no internal fields leaked
    assert(!('requestedBy' in r6.payment), 'T6: requestedBy NOT exposed in payment status');
    assert('issuedBy' in (r6.invoice || {}), 'T6: invoice.issuedBy IS present (expected audit data)');

    // -----------------------------------------------------------------
    // TEST 7: getMarketplaceInvoicePaymentStatus does NOT require flag
    // -----------------------------------------------------------------
    console.log('\n--- TEST 7: Status read does not require PPOS_ENABLE_PHASE37_PAYMENT ---');
    const savedFlag = process.env.PPOS_ENABLE_PHASE37_PAYMENT;
    delete process.env.PPOS_ENABLE_PHASE37_PAYMENT;

    let r7Error = null;
    try {
        await invoicePaymentService.getMarketplaceInvoicePaymentStatus('ord_t06');
    } catch (err) {
        r7Error = err;
    }
    assert(r7Error === null, 'T7: no error when flag absent for read-only status');

    process.env.PPOS_ENABLE_PHASE37_PAYMENT = savedFlag;

    // -----------------------------------------------------------------
    // TEST 8: markMarketplacePaymentConfirmed updates to PAYMENT_CONFIRMED
    // -----------------------------------------------------------------
    console.log('\n--- TEST 8: markMarketplacePaymentConfirmed transitions to PAYMENT_CONFIRMED ---');
    clearMemoryDb();
    seedReadyOrder('ord_t08');
    await invoicePaymentService.requestMarketplacePaymentLink('ord_t08');

    const r8 = await invoicePaymentService.markMarketplacePaymentConfirmed('ord_t08', {
        providerReference: 'BANK-CONF-123456',
        confirmedBy: 'admin_ops'
    });
    assert(r8.ok === true, 'T8: ok is true');
    assert(r8.payment.status === 'PAYMENT_CONFIRMED', 'T8: payment.status is PAYMENT_CONFIRMED');
    assert(r8.payment.paidAt != null, 'T8: paidAt is set');
    assert(r8.payment.providerReference === 'BANK-CONF-123456', 'T8: providerReference matches');

    const order8 = memoryDb.marketplace_orders.find(o => o.order_id === 'ord_t08');
    const meta8 = JSON.parse(order8.metadata_json);
    assert(meta8.payment.status === 'PAYMENT_CONFIRMED', 'T8: persisted status is PAYMENT_CONFIRMED');
    assert(order8.status === 'PAYMENT_CONFIRMED', 'T8: order status is PAYMENT_CONFIRMED');

    const events8 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_t08' && e.type === 'PAYMENT_CONFIRMED');
    assert(events8.length === 1, 'T8: PAYMENT_CONFIRMED event logged');

    // -----------------------------------------------------------------
    // TEST 9: markMarketplacePaymentConfirmed is idempotent
    // -----------------------------------------------------------------
    console.log('\n--- TEST 9: markMarketplacePaymentConfirmed is idempotent ---');

    const r9 = await invoicePaymentService.markMarketplacePaymentConfirmed('ord_t08', {});
    assert(r9.ok === true, 'T9: ok is true on second confirm call');
    assert(r9.idempotent === true, 'T9: idempotent flag is true');

    const events9 = memoryDb.marketplace_order_events.filter(e => e.order_id === 'ord_t08' && e.type === 'PAYMENT_CONFIRMED');
    assert(events9.length === 1, 'T9: still only 1 PAYMENT_CONFIRMED event');

    // -----------------------------------------------------------------
    // TEST 10: markMarketplacePaymentConfirmed rejects order with no invoice
    // -----------------------------------------------------------------
    console.log('\n--- TEST 10: Confirm without invoice returns NO_INVOICE ---');
    clearMemoryDb();
    seedReadyOrder('ord_t10', { metadata: {} });  // no invoice in metadata

    const r10 = await invoicePaymentService.markMarketplacePaymentConfirmed('ord_t10', {});
    assert(r10.ok === false, 'T10: ok is false when no invoice');
    assert(r10.error === 'NO_INVOICE', 'T10: error is NO_INVOICE');

    // -----------------------------------------------------------------
    // TEST 11: markMarketplacePaymentConfirmed rejects non-pending payment
    // -----------------------------------------------------------------
    console.log('\n--- TEST 11: Confirm with non-PAYMENT_PENDING status returns error ---');
    clearMemoryDb();
    seedReadyOrder('ord_t11', {
        metadata: {
            invoice_gate: { invoiceReady: true, blockers: [], decision: 'READY_FOR_INVOICE' },
            invoice: { invoice_number: 'PPOS-INV-20260101-AABBCC', status: 'ISSUED', amount: 100, currency: 'EUR', source: 'CONTROL_PLANE', phase: '37.1' },
            payment: { provider: 'bank_transfer', status: 'CANCELLED', amount: 100, currency: 'EUR', reference: 'PPOS-PAY-DEAD' }
        }
    });

    const r11 = await invoicePaymentService.markMarketplacePaymentConfirmed('ord_t11', {});
    assert(r11.ok === false, 'T11: ok is false for non-pending payment');
    assert(r11.error === 'INVALID_PAYMENT_STATUS', 'T11: error is INVALID_PAYMENT_STATUS');

    // -----------------------------------------------------------------
    // TEST 12: Disabled flag blocks mutating endpoints
    // -----------------------------------------------------------------
    console.log('\n--- TEST 12: Disabled flag blocks mutating operations ---');
    clearMemoryDb();
    seedReadyOrder('ord_t12');
    delete process.env.PPOS_ENABLE_PHASE37_PAYMENT;

    let err12a = null;
    try { await invoicePaymentService.generateMarketplaceInvoice('ord_t12'); } catch (e) { err12a = e; }
    assert(err12a && (err12a.message === 'PHASE37_PAYMENT_DISABLED' || err12a.code === 'PHASE37_PAYMENT_DISABLED'), 'T12a: generateInvoice blocked when flag absent');

    let err12b = null;
    try { await invoicePaymentService.requestMarketplacePaymentLink('ord_t12'); } catch (e) { err12b = e; }
    assert(err12b && (err12b.message === 'PHASE37_PAYMENT_DISABLED' || err12b.code === 'PHASE37_PAYMENT_DISABLED'), 'T12b: requestPaymentLink blocked when flag absent');

    let err12c = null;
    try { await invoicePaymentService.markMarketplacePaymentConfirmed('ord_t12', {}); } catch (e) { err12c = e; }
    assert(err12c && (err12c.message === 'PHASE37_PAYMENT_DISABLED' || err12c.code === 'PHASE37_PAYMENT_DISABLED'), 'T12c: markPaymentConfirmed blocked when flag absent');

    process.env.PPOS_ENABLE_PHASE37_PAYMENT = 'true';

    // -----------------------------------------------------------------
    // TEST 13: SQL sanity — no !== in service query strings
    // -----------------------------------------------------------------
    console.log('\n--- TEST 13: SQL sanity check ---');
    const fs = require('fs');
    const path = require('path');
    const serviceSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'api', 'services', 'marketplaceInvoicePaymentService.js'),
        'utf-8'
    );
    const sqlStringMatches = serviceSource.match(/['"``].*?!==.*?['"``]/g) || [];
    assert(sqlStringMatches.length === 0, 'T13: No !== operators in SQL query strings');

    // -----------------------------------------------------------------
    // TEST 14: Status response does not leak requestedBy / confirmedBy
    // -----------------------------------------------------------------
    console.log('\n--- TEST 14: Status response sanitizes internal fields ---');
    clearMemoryDb();
    seedReadyOrder('ord_t14');
    await invoicePaymentService.requestMarketplacePaymentLink('ord_t14', { requestedBy: 'internal_admin_secret' });
    await invoicePaymentService.markMarketplacePaymentConfirmed('ord_t14', { confirmedBy: 'ops_internal' });

    const r14 = await invoicePaymentService.getMarketplaceInvoicePaymentStatus('ord_t14');
    assert(r14.payment.status === 'PAYMENT_CONFIRMED', 'T14: confirmed payment status returned');
    assert(!('requestedBy' in r14.payment), 'T14: requestedBy not in payment status response');
    assert(!('confirmedBy' in r14.payment), 'T14: confirmedBy not in payment status response');

    // -----------------------------------------------------------------
    // SUMMARY
    // -----------------------------------------------------------------
    console.log('\n=============================================================');
    console.log(`📋 PHASE 37.1 RESULTS: ${passed} PASSED, ${failed} FAILED`);
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
