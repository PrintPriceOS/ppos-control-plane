'use strict';

/**
 * Phase 71D — Control Plane Printhouse Handoff Package
 * Smoke test: validates productionHandoffPackageService release-gate logic,
 * sanitization helpers, and full handoff package assembly.
 */

const path = require('path');

// ---------------------------------------------------------------------------
// Minimal stubs so we can require the service without live dependencies
// ---------------------------------------------------------------------------
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mutable mock state, configured per-test before calling buildProductionHandoffPackage
const mockState = {
    humanReport: null,      // { ok, report } or { ok: false, error }
    orderFileRow: null,     // { order_id } | null
    order: null,            // order object | null
    orderMetadataRow: null, // { metadata_json } | null
    auditEvents: []
};

const STUB_MODULES = {
    './preflightHumanReportService': {
        getHumanReport: async () => mockState.humanReport
    },
    './marketplaceOrderService': {
        getOrder: async () => mockState.order,
        listAuditEvents: async () => ({ ok: true, events: mockState.auditEvents })
    },
    './mysqlClient': {
        query: async (sql) => {
            if (sql.includes('marketplace_order_files')) {
                return mockState.orderFileRow ? [mockState.orderFileRow] : [];
            }
            if (sql.includes('marketplace_orders')) {
                return mockState.orderMetadataRow ? [mockState.orderMetadataRow] : [];
            }
            return [];
        }
    }
};

Module.prototype.require = function (id) {
    const stub = STUB_MODULES[id];
    if (stub) return stub;
    return originalRequire.apply(this, arguments);
};

const productionHandoffPackageService = require(
    path.join(__dirname, '../src/api/services/productionHandoffPackageService')
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let PASS = 0;
let FAIL = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  PASS  ${label}`);
        PASS++;
    } else {
        console.error(`  FAIL  ${label}`);
        FAIL++;
    }
}

function assertAbsent(obj, key, label) {
    assert(!(key in obj), label);
}

function assertPresent(obj, key, label) {
    assert(key in obj && obj[key] !== undefined, label);
}

const {
    buildProductionHandoffPackage,
    evaluatePackageReleaseGate,
    buildOrderSummary,
    sanitizeFileAccessAuditEvents,
    buildValidationReportSummary
} = productionHandoffPackageService;

function resetMockState() {
    mockState.humanReport = null;
    mockState.orderFileRow = null;
    mockState.order = null;
    mockState.orderMetadataRow = null;
    mockState.auditEvents = [];
}

// ---------------------------------------------------------------------------
// Test 1: evaluatePackageReleaseGate — all gates satisfied
// ---------------------------------------------------------------------------
console.log('\n=== Test 1: evaluatePackageReleaseGate — all gates satisfied ===');

{
    const result = evaluatePackageReleaseGate({
        productionPackageGovernance: { package_ready: true, blocked_by_governance_domains: [] },
        invoice: { status: 'ISSUED' },
        payment: { status: 'PAYMENT_CONFIRMED' },
        productionUnlock: { status: 'PRODUCTION_UNLOCKED' }
    });

    assert(result.ready === true, 'ready=true when all gates satisfied');
    assert(result.blockers.length === 0, 'no blockers when all gates satisfied');
}

// ---------------------------------------------------------------------------
// Test 2: evaluatePackageReleaseGate — preflight package not ready
// ---------------------------------------------------------------------------
console.log('\n=== Test 2: evaluatePackageReleaseGate — preflight package not ready ===');

{
    const result = evaluatePackageReleaseGate({
        productionPackageGovernance: { package_ready: false },
        invoice: { status: 'ISSUED' },
        payment: { status: 'PAYMENT_CONFIRMED' },
        productionUnlock: { status: 'PRODUCTION_UNLOCKED' }
    });

    assert(result.ready === false, 'ready=false when preflight package not ready');
    assert(result.blockers.includes('PREFLIGHT_PACKAGE_NOT_READY'), 'blockers includes PREFLIGHT_PACKAGE_NOT_READY');
}

// ---------------------------------------------------------------------------
// Test 3: evaluatePackageReleaseGate — blocked by governance domains
// ---------------------------------------------------------------------------
console.log('\n=== Test 3: evaluatePackageReleaseGate — blocked by governance domains ===');

{
    const result = evaluatePackageReleaseGate({
        productionPackageGovernance: { package_ready: true, blocked_by_governance_domains: ['payment_governance'] },
        invoice: { status: 'ISSUED' },
        payment: { status: 'PAYMENT_CONFIRMED' },
        productionUnlock: { status: 'PRODUCTION_UNLOCKED' }
    });

    assert(result.ready === false, 'ready=false when governance domains block');
    assert(result.blockers.includes('GOVERNANCE_DOMAINS_BLOCKING'), 'blockers includes GOVERNANCE_DOMAINS_BLOCKING');
}

// ---------------------------------------------------------------------------
// Test 4: evaluatePackageReleaseGate — invoice not issued
// ---------------------------------------------------------------------------
console.log('\n=== Test 4: evaluatePackageReleaseGate — invoice not issued ===');

{
    const result = evaluatePackageReleaseGate({
        productionPackageGovernance: { package_ready: true, blocked_by_governance_domains: [] },
        invoice: { status: 'DRAFT' },
        payment: { status: 'PAYMENT_CONFIRMED' },
        productionUnlock: { status: 'PRODUCTION_UNLOCKED' }
    });

    assert(result.ready === false, 'ready=false when invoice not issued');
    assert(result.blockers.includes('INVOICE_NOT_ISSUED'), 'blockers includes INVOICE_NOT_ISSUED');
}

// ---------------------------------------------------------------------------
// Test 5: evaluatePackageReleaseGate — payment not confirmed
// ---------------------------------------------------------------------------
console.log('\n=== Test 5: evaluatePackageReleaseGate — payment not confirmed ===');

{
    const result = evaluatePackageReleaseGate({
        productionPackageGovernance: { package_ready: true, blocked_by_governance_domains: [] },
        invoice: { status: 'ISSUED' },
        payment: { status: 'PAYMENT_PENDING' },
        productionUnlock: { status: 'PRODUCTION_UNLOCKED' }
    });

    assert(result.ready === false, 'ready=false when payment not confirmed');
    assert(result.blockers.includes('PAYMENT_NOT_CONFIRMED'), 'blockers includes PAYMENT_NOT_CONFIRMED');
}

// ---------------------------------------------------------------------------
// Test 6: evaluatePackageReleaseGate — production not unlocked
// ---------------------------------------------------------------------------
console.log('\n=== Test 6: evaluatePackageReleaseGate — production not unlocked ===');

{
    const result = evaluatePackageReleaseGate({
        productionPackageGovernance: { package_ready: true, blocked_by_governance_domains: [] },
        invoice: { status: 'ISSUED' },
        payment: { status: 'PAYMENT_CONFIRMED' },
        productionUnlock: { status: 'PRODUCTION_LOCKED' }
    });

    assert(result.ready === false, 'ready=false when production not unlocked');
    assert(result.blockers.includes('PRODUCTION_NOT_UNLOCKED'), 'blockers includes PRODUCTION_NOT_UNLOCKED');
}

// ---------------------------------------------------------------------------
// Test 7: evaluatePackageReleaseGate — missing order data blocks all 3 order gates
// ---------------------------------------------------------------------------
console.log('\n=== Test 7: evaluatePackageReleaseGate — missing order data ===');

{
    const result = evaluatePackageReleaseGate({
        productionPackageGovernance: { package_ready: true, blocked_by_governance_domains: [] },
        invoice: null,
        payment: null,
        productionUnlock: null
    });

    assert(result.ready === false, 'ready=false when order data missing');
    assert(result.blockers.includes('INVOICE_NOT_ISSUED'), 'blockers includes INVOICE_NOT_ISSUED');
    assert(result.blockers.includes('PAYMENT_NOT_CONFIRMED'), 'blockers includes PAYMENT_NOT_CONFIRMED');
    assert(result.blockers.includes('PRODUCTION_NOT_UNLOCKED'), 'blockers includes PRODUCTION_NOT_UNLOCKED');
    assert(result.blockers.length === 3, 'exactly 3 blockers when order data missing but preflight package ready');
}

// ---------------------------------------------------------------------------
// Test 8: buildOrderSummary — null order
// ---------------------------------------------------------------------------
console.log('\n=== Test 8: buildOrderSummary — null order ===');

{
    assert(buildOrderSummary(null) === null, 'returns null for null order');
}

// ---------------------------------------------------------------------------
// Test 9: buildOrderSummary — excludes PII
// ---------------------------------------------------------------------------
console.log('\n=== Test 9: buildOrderSummary — excludes PII ===');

{
    const order = {
        orderId: 'ord-123',
        status: 'IN_PRODUCTION',
        printhouseId: 'ph-1',
        customer: { name: 'Acme Corp', email: 'acme@example.com', phone: '555-1234', address: '123 Main St' },
        totals: { total: 199.99, currency: 'USD' }
    };

    const summary = buildOrderSummary(order);

    assert(summary.order_id === 'ord-123', 'order_id preserved');
    assert(summary.status === 'IN_PRODUCTION', 'status preserved');
    assert(summary.printhouse_id === 'ph-1', 'printhouse_id preserved');
    assert(summary.customer_name === 'Acme Corp', 'customer_name preserved');
    assert(summary.total === 199.99, 'total preserved');
    assert(summary.currency === 'USD', 'currency preserved');
    assertAbsent(summary, 'customer_email', 'customer_email not exposed');
    assertAbsent(summary, 'email', 'email not exposed');
    assertAbsent(summary, 'phone', 'phone not exposed');
    assertAbsent(summary, 'address', 'address not exposed');
}

// ---------------------------------------------------------------------------
// Test 10: sanitizeFileAccessAuditEvents — filters and maps relevant events
// ---------------------------------------------------------------------------
console.log('\n=== Test 10: sanitizeFileAccessAuditEvents — filters and maps ===');

{
    const events = [
        { eventType: 'PRINTHOUSE_FILE_ACCESS_TOKEN_CREATED', payload: { actor: 'printhouse-1', role: 'PRINTHOUSE', token: 'secret-token' }, createdAt: '2026-01-01T00:00:00Z' },
        { eventType: 'ORDER_CREATED', payload: {}, createdAt: '2026-01-01T00:00:00Z' },
        { eventType: 'PRINTHOUSE_FILE_DOWNLOADED', payload: { actor: 'printhouse-1' }, createdAt: '2026-01-02T00:00:00Z' }
    ];

    const sanitized = sanitizeFileAccessAuditEvents(events);

    assert(sanitized.length === 2, 'only file-access-relevant events kept');
    assert(sanitized[0].event_type === 'PRINTHOUSE_FILE_ACCESS_TOKEN_CREATED', 'first event_type preserved');
    assert(sanitized[0].role === 'PRINTHOUSE', 'role preserved');
    assertAbsent(sanitized[0], 'token', 'token not exposed');
    assertAbsent(sanitized[0], 'payload', 'raw payload not exposed');
}

// ---------------------------------------------------------------------------
// Test 11: sanitizeFileAccessAuditEvents — non-array input
// ---------------------------------------------------------------------------
console.log('\n=== Test 11: sanitizeFileAccessAuditEvents — non-array input ===');

{
    assert(sanitizeFileAccessAuditEvents(null).length === 0, 'returns [] for null');
    assert(sanitizeFileAccessAuditEvents(undefined).length === 0, 'returns [] for undefined');
}

// ---------------------------------------------------------------------------
// Test 12: buildValidationReportSummary — empty governance returns null
// ---------------------------------------------------------------------------
console.log('\n=== Test 12: buildValidationReportSummary — empty governance ===');

{
    assert(buildValidationReportSummary({}) === null, 'returns null when standards_certification_governance absent');
    assert(buildValidationReportSummary({ standards_certification_governance: {} }) === null, 'returns null when standards_certification_governance is empty object');
}

// ---------------------------------------------------------------------------
// Test 13: buildValidationReportSummary — populated governance
// ---------------------------------------------------------------------------
console.log('\n=== Test 13: buildValidationReportSummary — populated governance ===');

{
    const report = {
        standard_claimed: 'PDF/X-4',
        standards_certification_governance: {
            standard_certified: false,
            validation_performed: true,
            validation_passed: true,
            validator_name: 'veraPDF',
            validator_version: '1.24',
            validation_report_hash: 'vhash-123'
        }
    };

    const summary = buildValidationReportSummary(report);

    assert(summary.standard_claimed === 'PDF/X-4', 'standard_claimed preserved');
    assert(summary.validation_performed === true, 'validation_performed preserved');
    assert(summary.validation_passed === true, 'validation_passed preserved');
    assert(summary.standard_certified === false, 'standard_certified preserved');
    assert(summary.validator_name === 'veraPDF', 'validator_name preserved');
    assert(summary.validation_report_hash === 'vhash-123', 'validation_report_hash preserved');
}

// ---------------------------------------------------------------------------
// Test 14: buildProductionHandoffPackage — human report unavailable
// ---------------------------------------------------------------------------
console.log('\n=== Test 14: buildProductionHandoffPackage — human report unavailable ===');

(async () => {

{
    resetMockState();
    mockState.humanReport = { ok: false, error: 'JOB_NOT_FOUND' };

    const result = await buildProductionHandoffPackage('job-missing', {});

    assert(result.ok === false, 'ok=false when human report unavailable');
    assert(result.error === 'JOB_NOT_FOUND', 'error propagated');
}

// -----------------------------------------------------------------------
// Test 15: buildProductionHandoffPackage — full ready package
// -----------------------------------------------------------------------
console.log('\n=== Test 15: buildProductionHandoffPackage — full ready package ===');

{
    resetMockState();
    mockState.humanReport = {
        ok: true,
        report: {
            production_package_governance: {
                package_ready: true,
                approved_artifact_type: 'certified_pdf',
                approved_artifact_hash: 'hash-123',
                included_reports: ['human_report.json', 'fix_audit.json'],
                blocked_by_governance_domains: [],
                warnings: ['Some informational warning']
            },
            recommended_next_action: 'PROCEED_TO_PRODUCTION',
            fix_summary: {
                review_required: false,
                production_certified: true,
                highest_risk_level: 'NONE',
                applied_count: 2,
                skipped_count: 0,
                failed_count: 0
            },
            artifact_trust: { production_certified: true, review_required: false, evidence: {} },
            standards_certification_governance: {}
        }
    };
    mockState.orderFileRow = { order_id: 'ord-1' };
    mockState.order = {
        orderId: 'ord-1',
        status: 'IN_PRODUCTION',
        printhouseId: 'ph-1',
        customer: { name: 'Acme Corp', email: 'acme@example.com' },
        totals: { total: 100, currency: 'USD' }
    };
    mockState.orderMetadataRow = {
        metadata_json: JSON.stringify({
            invoice: { status: 'ISSUED' },
            payment: { status: 'PAYMENT_CONFIRMED' },
            production_unlock: { status: 'PRODUCTION_UNLOCKED' }
        })
    };
    mockState.auditEvents = [
        { eventType: 'PRINTHOUSE_FILE_ACCESS_TOKEN_CREATED', payload: { actor: 'ph-1', role: 'PRINTHOUSE' }, createdAt: '2026-01-01T00:00:00Z' }
    ];

    const result = await buildProductionHandoffPackage('job-1', {});

    assert(result.ok === true, 'ok=true');
    assert(result.order_id === 'ord-1', 'order_id resolved via marketplace_order_files');
    assert(result.package_release_gate.ready === true, 'package_release_gate.ready=true');
    assert(result.package_release_gate.blockers.length === 0, 'no blockers');
    assert(result.approved_artifact !== null, 'approved_artifact present when gate ready');
    assert(result.approved_artifact.type === 'certified_pdf', 'approved_artifact.type preserved');
    assert(result.approved_artifact.hash === 'hash-123', 'approved_artifact.hash preserved');
    assert(result.included_reports.length === 2, 'included_reports preserved');
    assert(result.human_report_summary.recommended_next_action === 'PROCEED_TO_PRODUCTION', 'human_report_summary.recommended_next_action preserved');
    assert(result.human_report_summary.review_required === false, 'human_report_summary.review_required preserved');
    assert(result.fix_audit_summary.applied_count === 2, 'fix_audit_summary.applied_count preserved');
    assert(result.payment_status.invoice_status === 'ISSUED', 'payment_status.invoice_status=ISSUED');
    assert(result.payment_status.payment_status === 'PAYMENT_CONFIRMED', 'payment_status.payment_status=PAYMENT_CONFIRMED');
    assert(result.payment_status.production_unlock_status === 'PRODUCTION_UNLOCKED', 'payment_status.production_unlock_status=PRODUCTION_UNLOCKED');
    assert(result.order_summary.order_id === 'ord-1', 'order_summary.order_id preserved');
    assertAbsent(result.order_summary, 'customer_email', 'order_summary excludes customer_email');
    assert(result.file_access_audit.length === 1, 'file_access_audit includes sanitized event');
    assert(result.warnings.includes('Some informational warning'), 'warnings preserved');
}

// -----------------------------------------------------------------------
// Test 16: buildProductionHandoffPackage — package not ready, artifact withheld
// -----------------------------------------------------------------------
console.log('\n=== Test 16: buildProductionHandoffPackage — package not ready ===');

{
    mockState.humanReport.report.production_package_governance.package_ready = false;

    const result = await buildProductionHandoffPackage('job-1', {});

    assert(result.package_release_gate.ready === false, 'package_release_gate.ready=false');
    assert(result.package_release_gate.blockers.includes('PREFLIGHT_PACKAGE_NOT_READY'), 'blockers includes PREFLIGHT_PACKAGE_NOT_READY');
    assert(result.approved_artifact === null, 'approved_artifact withheld when gate not ready');
}

// -----------------------------------------------------------------------
// Test 17: buildProductionHandoffPackage — warnings and blocked domains preserved
// -----------------------------------------------------------------------
console.log('\n=== Test 17: buildProductionHandoffPackage — warnings/blocked domains preserved ===');

{
    mockState.humanReport.report.production_package_governance = {
        package_ready: false,
        approved_artifact_type: 'fixed_pdf',
        approved_artifact_hash: 'hash-456',
        included_reports: ['human_report.json'],
        blocked_by_governance_domains: ['payment_governance'],
        warnings: ['Manual review required']
    };

    const result = await buildProductionHandoffPackage('job-1', {});

    assert(result.warnings.includes('Manual review required'), 'original warning preserved');
    assert(result.warnings.some(w => w.includes('payment_governance')), 'blocked governance domain surfaced as warning');
    assert(result.approved_artifact === null, 'approved_artifact withheld');
    assert(result.included_reports.length === 1, 'included_reports preserved despite blocked package');
}

// -----------------------------------------------------------------------
// Test 18: buildProductionHandoffPackage — no order linkage
// -----------------------------------------------------------------------
console.log('\n=== Test 18: buildProductionHandoffPackage — no order linkage ===');

{
    resetMockState();
    mockState.humanReport = {
        ok: true,
        report: {
            production_package_governance: {
                package_ready: true,
                approved_artifact_type: 'certified_pdf',
                approved_artifact_hash: 'hash-789',
                included_reports: [],
                blocked_by_governance_domains: [],
                warnings: []
            },
            fix_summary: { review_required: false, production_certified: true, highest_risk_level: 'NONE', applied_count: 0, skipped_count: 0, failed_count: 0 },
            artifact_trust: {},
            standards_certification_governance: {}
        }
    };
    // No marketplace_order_files row, no order, no metadata

    const result = await buildProductionHandoffPackage('job-2', {});

    assert(result.ok === true, 'ok=true even without order linkage');
    assert(result.order_id === null, 'order_id null when no linkage found');
    assert(result.order_summary === null, 'order_summary null when no order found');
    assert(result.payment_status.invoice_status === 'UNKNOWN', 'invoice_status defaults to UNKNOWN');
    assert(result.payment_status.payment_status === 'UNKNOWN', 'payment_status defaults to UNKNOWN');
    assert(result.payment_status.production_unlock_status === 'PRODUCTION_LOCKED', 'production_unlock_status defaults to PRODUCTION_LOCKED');
    assert(result.package_release_gate.ready === false, 'release gate blocked without invoice/payment/unlock');
    assert(result.approved_artifact === null, 'approved_artifact withheld without order data');
    assert(result.file_access_audit.length === 0, 'file_access_audit empty without order');
}

// -----------------------------------------------------------------------
// Test 19: buildProductionHandoffPackage — explicit orderId option skips lookup
// -----------------------------------------------------------------------
console.log('\n=== Test 19: buildProductionHandoffPackage — explicit orderId option ===');

{
    resetMockState();
    mockState.humanReport = {
        ok: true,
        report: {
            production_package_governance: {
                package_ready: true,
                approved_artifact_type: 'certified_pdf',
                approved_artifact_hash: 'hash-999',
                included_reports: ['human_report.json'],
                blocked_by_governance_domains: [],
                warnings: []
            },
            fix_summary: { review_required: false, production_certified: true, highest_risk_level: 'NONE', applied_count: 1, skipped_count: 0, failed_count: 0 },
            artifact_trust: {},
            standards_certification_governance: {}
        }
    };
    // orderFileRow intentionally left null — orderId supplied via options
    mockState.order = {
        orderId: 'ord-99',
        status: 'PENDING',
        printhouseId: 'ph-2',
        customer: { name: 'Beta LLC' },
        totals: { total: 50, currency: 'EUR' }
    };
    mockState.orderMetadataRow = {
        metadata_json: JSON.stringify({
            invoice: { status: 'ISSUED' },
            payment: { status: 'PAYMENT_CONFIRMED' },
            production_unlock: { status: 'PRODUCTION_UNLOCKED' }
        })
    };

    const result = await buildProductionHandoffPackage('job-3', {}, { orderId: 'ord-99' });

    assert(result.order_id === 'ord-99', 'order_id taken from options.orderId');
    assert(result.order_summary.order_id === 'ord-99', 'order_summary resolved using provided orderId');
    assert(result.package_release_gate.ready === true, 'package release gate ready with provided orderId');
    assert(result.approved_artifact !== null, 'approved_artifact exposed when ready');
}

// -----------------------------------------------------------------------
// Test 20: buildProductionHandoffPackage — validation report summary included
// -----------------------------------------------------------------------
console.log('\n=== Test 20: buildProductionHandoffPackage — validation report summary ===');

{
    mockState.humanReport.report.standards_certification_governance = {
        standard_certified: false,
        validation_performed: true,
        validation_passed: true,
        validator_name: 'veraPDF',
        validator_version: '1.24',
        validation_report_hash: 'vhash-456'
    };
    mockState.humanReport.report.standard_claimed = 'PDF/X-4';

    const result = await buildProductionHandoffPackage('job-3', {}, { orderId: 'ord-99' });

    assert(result.validation_report_summary !== null, 'validation_report_summary present when standards governance available');
    assert(result.validation_report_summary.standard_claimed === 'PDF/X-4', 'standard_claimed preserved in package');
    assert(result.validation_report_summary.validation_passed === true, 'validation_passed preserved in package');
}

// -----------------------------------------------------------------------
// Test 21: buildProductionHandoffPackage — no raw paths or tokens leaked
// -----------------------------------------------------------------------
console.log('\n=== Test 21: buildProductionHandoffPackage — no raw paths or tokens leaked ===');

{
    const serialized = JSON.stringify(await buildProductionHandoffPackage('job-3', {}, { orderId: 'ord-99' }));

    assert(!/local_path|raw_path|file_path|internal_id|forensic_object_id|raw_stream/.test(serialized), 'no blocked evidence keys present in serialized package');
    assert(!/"token"/.test(serialized), 'no raw token field present in serialized package');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
Module.prototype.require = originalRequire;

console.log(`\n${'='.repeat(60)}`);
console.log(`Phase 71D Smoke: ${PASS} PASS / ${FAIL} FAIL`);
if (FAIL === 0) {
    console.log('ALL TESTS PASSED');
    process.exit(0);
} else {
    console.error('SOME TESTS FAILED');
    process.exit(1);
}

})();
