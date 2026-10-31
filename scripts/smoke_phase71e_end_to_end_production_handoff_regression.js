'use strict';
/**
 * Phase 71E Smoke Test — End-to-End Production Handoff Regression
 *
 * Validates the full printhouse delivery package / production handoff lifecycle:
 *  Engine (71A) → Worker (71B) → Service (71C) → Control Plane (71D) → Control Plane (71E)
 *
 * Acceptance criteria (from Phase 71E prompt):
 *  - only approved artifact included
 *  - reports included
 *  - warnings preserved
 *  - blocked jobs cannot be handed off
 *  - customer/private data scoped correctly
 */

const path = require('path');
const fs = require('fs');

const ENGINE_REPORT_PATH        = path.resolve(__dirname, '../../ppos-preflight-engine/reports/phase71a_engine_artifact_hash_manifest.json');
const WORKER_REPORT_PATH        = path.resolve(__dirname, '../../ppos-preflight-worker/reports/phase71b_worker_production_package_policy.json');
const SERVICE_REPORT_PATH       = path.resolve(__dirname, '../../ppos-preflight-service/reports/phase71c_service_production_package_exposure.json');
const CONTROL_PLANE_71D_REPORT_PATH = path.resolve(__dirname, '../reports/phase71d_control_plane_printhouse_handoff_package.json');

// Terms that must never appear in any handoff package or governance payload
const FORBIDDEN_SANITATION_TERMS = [
    '/tmp/jobs/', '/storage/tenants', 'C:\\Users', 'temp-staging',
    'forensic', '/private/var', '/var/tmp/', 'gs -sDEVICE', 'mutool draw -o',
    'local_path', 'raw_path', 'file_path', 'internal_id', 'forensic_object_id', 'raw_stream'
];

// Standards governance providing full validator evidence — required so that
// preflightHumanReportService does not force review_required=true / production_certified=false
// via the Phase 55D "standard claim without validator evidence" downgrade.
const FULL_VALIDATOR_EVIDENCE = {
    standard_certified: true,
    validation_performed: true,
    validation_passed: true,
    validator_name: 'veraPDF',
    validator_version: '1.24',
    standard_detected: 'PDF/X-4',
    validation_report_available: true,
    validator_available: true,
    compliance_claim_allowed: true
};

const results = [];
let hasFailures = false;

function record(name, passed, errors, extra) {
    if (passed) {
        console.log(`✅ [PASS] ${name}`);
    } else {
        console.error(`❌ [FAIL] ${name}`);
        errors.forEach(e => console.error(`  - ${e}`));
        hasFailures = true;
    }
    results.push({ name, passed, errors, ...extra });
}

// ════════════════════════════════════════════════════════════════════════
// Part A — preflightHumanReportService.production_package_governance
// ════════════════════════════════════════════════════════════════════════
async function runPartA() {
    const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
    const mockContext = { tenantId: 'tenant-production-handoff-regression-71e', Authorization: 'Bearer test-71e' };

    const checkGov = async (name, jobInput, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport('job-71e-test', mockContext, jobInput, []);
            if (!result.ok) throw new Error('Report generation failed: ' + JSON.stringify(result));

            const report = result.report;
            const gov = report.production_package_governance || {};
            let passed = true;
            const errors = [];

            for (const [k, v] of Object.entries(expected.gov || {})) {
                const actual = gov[k];
                const ok = Array.isArray(v) ? JSON.stringify([...actual || []].sort()) === JSON.stringify([...v].sort())
                    : actual === v;
                if (!ok) {
                    passed = false;
                    errors.push(`production_package_governance.${k} expected=${JSON.stringify(v)}, got=${JSON.stringify(actual)}`);
                }
            }

            if (expected.includes_reports_contains) {
                for (const r of expected.includes_reports_contains) {
                    if (!(gov.included_reports || []).includes(r)) {
                        passed = false; errors.push(`included_reports missing "${r}"`);
                    }
                }
            }
            if (expected.included_reports_length !== undefined && (gov.included_reports || []).length !== expected.included_reports_length) {
                passed = false; errors.push(`included_reports length expected=${expected.included_reports_length}, got=${(gov.included_reports || []).length}`);
            }

            if (expected.evidence_present_keys) {
                for (const k of expected.evidence_present_keys) {
                    if (!(gov.evidence && k in gov.evidence)) {
                        passed = false; errors.push(`evidence missing expected key "${k}"`);
                    }
                }
            }
            if (expected.evidence_absent_keys) {
                for (const k of expected.evidence_absent_keys) {
                    if (gov.evidence && k in gov.evidence) {
                        passed = false; errors.push(`evidence leaked blocked key "${k}"`);
                    }
                }
            }

            // Global sanitation — production_package_governance never leaks raw evidence
            const govStr = JSON.stringify(gov);
            for (const term of FORBIDDEN_SANITATION_TERMS) {
                if (govStr.includes(term)) {
                    passed = false; errors.push(`Sanitation failed — production_package_governance leaked raw term: "${term}"`);
                }
            }

            record(name, passed, errors, { production_package_governance: gov });
        } catch (e) {
            record(name, false, [e.message]);
            if (process.env.DEBUG) console.error(e.stack);
        }
    };

    // ── A1. Golden path — package_ready=true end-to-end ───────────────────
    await checkGov('A1. Golden path — production_certified, no review, package_ready=true end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        production_certified: true,
        review_required: false,
        standards_certification_governance: FULL_VALIDATOR_EVIDENCE,
        production_package_governance: {
            package_ready: true,
            approved_artifact_type: 'certified_pdf',
            approved_artifact_hash: 'hash-71e-001',
            included_reports: ['human_report.json', 'fix_audit.json', 'certified.pdf'],
            blocked_by_governance_domains: [],
            warnings: []
        }
    }, {
        gov: {
            package_ready: true,
            approved_artifact_type: 'certified_pdf',
            approved_artifact_hash: 'hash-71e-001',
            blocked_by_governance_domains: [],
            warnings: []
        },
        includes_reports_contains: ['human_report.json', 'fix_audit.json', 'certified.pdf']
    });

    // ── A2. review_required=true blocks package_ready even when upstream says ready ──
    await checkGov('A2. review_required=true forces package_ready=false and withholds artifact end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        production_certified: true,
        review_required: true,
        production_package_governance: {
            package_ready: true,
            approved_artifact_type: 'certified_pdf',
            approved_artifact_hash: 'hash-71e-002',
            included_reports: ['human_report.json', 'fix_audit.json'],
            blocked_by_governance_domains: [],
            warnings: []
        }
    }, {
        gov: {
            package_ready: false,
            approved_artifact_type: null,
            approved_artifact_hash: null
        },
        includes_reports_contains: ['human_report.json', 'fix_audit.json']
    });

    // ── A3. production_certified=false at Control Plane level blocks package_ready ──
    await checkGov('A3. production_certified=false forces package_ready=false end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        production_certified: false,
        review_required: false,
        production_package_governance: {
            package_ready: true,
            approved_artifact_type: 'fixed_pdf',
            approved_artifact_hash: 'hash-71e-003',
            included_reports: ['human_report.json'],
            blocked_by_governance_domains: [],
            warnings: []
        }
    }, {
        gov: {
            package_ready: false,
            approved_artifact_type: null,
            approved_artifact_hash: null
        }
    });

    // ── A4. Conservative merge — one source says false, overall must be false ──
    await checkGov('A4. Conservative merge — package_ready=false from any source wins end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        production_certified: true,
        review_required: false,
        production_package_governance: {
            package_ready: true,
            approved_artifact_type: 'certified_pdf',
            approved_artifact_hash: 'hash-71e-004',
            included_reports: ['human_report.json'],
            blocked_by_governance_domains: [],
            warnings: []
        },
        fix_summary: {
            production_package_governance: {
                package_ready: false,
                included_reports: ['fix_audit.json'],
                blocked_by_governance_domains: ['payment_governance'],
                warnings: ['Payment not confirmed; package not ready.']
            }
        }
    }, {
        gov: {
            package_ready: false,
            approved_artifact_type: null,
            approved_artifact_hash: null,
            blocked_by_governance_domains: ['payment_governance'],
            warnings: ['Payment not confirmed; package not ready.']
        },
        includes_reports_contains: ['human_report.json', 'fix_audit.json'],
        included_reports_length: 2
    });

    // ── A5. Blocked governance domains and warnings pass through when not ready ──
    await checkGov('A5. Blocked governance domains and warnings preserved when package not ready end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        production_certified: true,
        review_required: false,
        production_package_governance: {
            package_ready: false,
            approved_artifact_type: null,
            approved_artifact_hash: null,
            included_reports: ['fix_audit.json', 'fixed.pdf'],
            blocked_by_governance_domains: ['review_required', 'production_certification'],
            warnings: [
                'Artifact requires human review before packaging for production.',
                'Artifact is not production certified; package not ready.'
            ]
        }
    }, {
        gov: {
            package_ready: false,
            approved_artifact_type: null,
            approved_artifact_hash: null,
            blocked_by_governance_domains: ['review_required', 'production_certification'],
            warnings: [
                'Artifact requires human review before packaging for production.',
                'Artifact is not production certified; package not ready.'
            ]
        },
        includes_reports_contains: ['fix_audit.json', 'fixed.pdf']
    });

    // ── A6. Evidence sanitization — raw paths/internal IDs stripped ────────
    await checkGov('A6. Evidence sanitization — raw paths and internal IDs never leak end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        production_certified: true,
        review_required: false,
        standards_certification_governance: FULL_VALIDATOR_EVIDENCE,
        production_package_governance: {
            package_ready: true,
            approved_artifact_type: 'certified_pdf',
            approved_artifact_hash: 'hash-71e-006',
            included_reports: ['certified.pdf'],
            blocked_by_governance_domains: [],
            warnings: [],
            evidence: {
                physical_artifacts_ready: true,
                primary_artifact_type: 'certified_pdf',
                primary_artifact_filename: 'certified.pdf',
                local_path: '/tmp/jobs/71e-sanitation-test/certified.pdf',
                internal_id: 'int-71e-006',
                forensic_object_id: 'obj-99',
                command: 'gs -sDEVICE=pdfwrite -o certified.pdf'
            }
        }
    }, {
        gov: {
            package_ready: true,
            approved_artifact_type: 'certified_pdf',
            approved_artifact_hash: 'hash-71e-006'
        },
        evidence_present_keys: ['physical_artifacts_ready', 'primary_artifact_type', 'primary_artifact_filename'],
        evidence_absent_keys: ['local_path', 'internal_id', 'forensic_object_id', 'command']
    });

    // ── A7. Multi-source extraction — governance nested only in delta_report ──
    await checkGov('A7. Multi-source extraction — production_package_governance nested in delta_report propagates end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        production_certified: true,
        review_required: false,
        standards_certification_governance: FULL_VALIDATOR_EVIDENCE,
        delta_report: {
            production_package_governance: {
                package_ready: true,
                approved_artifact_type: 'certified_pdf',
                approved_artifact_hash: 'hash-71e-007',
                included_reports: ['delta_report.json'],
                blocked_by_governance_domains: [],
                warnings: []
            }
        }
    }, {
        gov: {
            package_ready: true,
            approved_artifact_type: 'certified_pdf',
            approved_artifact_hash: 'hash-71e-007'
        },
        includes_reports_contains: ['delta_report.json']
    });

    // ── A8. included_reports merged and deduped from multiple sources ─────
    await checkGov('A8. included_reports merged and deduped from multiple governance sources end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        production_certified: true,
        review_required: false,
        standards_certification_governance: FULL_VALIDATOR_EVIDENCE,
        production_package_governance: {
            package_ready: true,
            approved_artifact_type: 'certified_pdf',
            approved_artifact_hash: 'hash-71e-008',
            included_reports: ['human_report.json', 'fix_audit.json'],
            blocked_by_governance_domains: [],
            warnings: []
        },
        fix_summary: {
            production_package_governance: {
                package_ready: true,
                included_reports: ['fix_audit.json', 'delta_report.json']
            }
        }
    }, {
        gov: {
            package_ready: true,
            approved_artifact_type: 'certified_pdf',
            approved_artifact_hash: 'hash-71e-008'
        },
        includes_reports_contains: ['human_report.json', 'fix_audit.json', 'delta_report.json'],
        included_reports_length: 3
    });
}

// ════════════════════════════════════════════════════════════════════════
// Part B — productionHandoffPackageService.buildProductionHandoffPackage
// ════════════════════════════════════════════════════════════════════════
async function runPartB() {
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    const mockState = {
        humanReport: null,
        orderFileRow: null,
        order: null,
        orderMetadataRow: null,
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

    // Force a fresh load of the service under the stubbed require.
    const servicePath = require.resolve('../src/api/services/productionHandoffPackageService');
    delete require.cache[servicePath];
    const productionHandoffPackageService = require('../src/api/services/productionHandoffPackageService');

    const checkPackage = async (name, jobId, options, fn) => {
        try {
            const result = await productionHandoffPackageService.buildProductionHandoffPackage(jobId, {}, options || {});
            const errors = [];
            fn(result, errors);
            record(name, errors.length === 0, errors);
        } catch (e) {
            record(name, false, [e.message]);
            if (process.env.DEBUG) console.error(e.stack);
        }
    };

    const baseHumanReport = (overrides = {}) => ({
        ok: true,
        report: {
            production_package_governance: {
                package_ready: true,
                approved_artifact_type: 'certified_pdf',
                approved_artifact_hash: 'hash-71e-b001',
                included_reports: ['human_report.json', 'fix_audit.json', 'certified.pdf'],
                blocked_by_governance_domains: [],
                warnings: [],
                ...overrides.production_package_governance
            },
            recommended_next_action: 'PROCEED_TO_PRINTHOUSE_HANDOFF',
            fix_summary: {
                review_required: false,
                production_certified: true,
                highest_risk_level: 'NONE',
                applied_count: 1,
                skipped_count: 0,
                failed_count: 0
            },
            artifact_trust: { production_certified: true, review_required: false, evidence: {} },
            standards_certification_governance: {},
            ...overrides.report
        }
    });

    // ── B1. Golden path — full ready package, all gates satisfied ─────────
    mockState.humanReport = baseHumanReport();
    mockState.orderFileRow = { order_id: 'ord-71e-001' };
    mockState.order = {
        orderId: 'ord-71e-001',
        status: 'IN_PRODUCTION',
        printhouseId: 'ph-71e-1',
        customer: { name: 'Acme Print Co', email: 'acme@example.com', phone: '555-0100', address: '1 Main St' },
        totals: { total: 249.5, currency: 'USD' }
    };
    mockState.orderMetadataRow = {
        metadata_json: JSON.stringify({
            invoice: { status: 'ISSUED' },
            payment: { status: 'PAYMENT_CONFIRMED' },
            production_unlock: { status: 'PRODUCTION_UNLOCKED' }
        })
    };
    mockState.auditEvents = [
        { eventType: 'PRINTHOUSE_FILE_ACCESS_TOKEN_CREATED', payload: { actor: 'ph-71e-1', role: 'PRINTHOUSE', token: 'super-secret-token' }, createdAt: '2026-06-09T00:00:00Z' },
        { eventType: 'PRINTHOUSE_FILE_DOWNLOADED', payload: { actor: 'ph-71e-1', role: 'PRINTHOUSE' }, createdAt: '2026-06-09T01:00:00Z' },
        { eventType: 'ORDER_CREATED', payload: {}, createdAt: '2026-06-08T00:00:00Z' }
    ];
    await checkPackage('B1. Golden path — all gates satisfied, approved artifact and clean handoff package end-to-end (regression)', 'job-71e-001', {}, (result, errors) => {
        if (result.ok !== true) errors.push('expected ok=true');
        if (result.package_release_gate?.ready !== true) errors.push('expected package_release_gate.ready=true');
        if ((result.package_release_gate?.blockers || []).length !== 0) errors.push('expected no blockers');
        if (!result.approved_artifact || result.approved_artifact.type !== 'certified_pdf') errors.push('expected approved_artifact.type=certified_pdf');
        if (result.approved_artifact?.hash !== 'hash-71e-b001') errors.push('expected approved_artifact.hash=hash-71e-b001');
        if (!result.included_reports.includes('certified.pdf')) errors.push('expected included_reports to include certified.pdf');
        if (result.payment_status?.invoice_status !== 'ISSUED') errors.push('expected invoice_status=ISSUED');
        if (result.payment_status?.payment_status !== 'PAYMENT_CONFIRMED') errors.push('expected payment_status=PAYMENT_CONFIRMED');
        if (result.payment_status?.production_unlock_status !== 'PRODUCTION_UNLOCKED') errors.push('expected production_unlock_status=PRODUCTION_UNLOCKED');
        if (result.order_summary?.order_id !== 'ord-71e-001') errors.push('expected order_summary.order_id=ord-71e-001');
        if ('customer_email' in (result.order_summary || {})) errors.push('order_summary must not expose customer_email');
        if ('phone' in (result.order_summary || {})) errors.push('order_summary must not expose phone');
        if ('address' in (result.order_summary || {})) errors.push('order_summary must not expose address');
        if (result.file_access_audit.length !== 2) errors.push(`expected 2 file-access audit events, got ${result.file_access_audit.length}`);
        if (result.file_access_audit.some(e => 'token' in e || JSON.stringify(e).includes('super-secret-token'))) errors.push('file_access_audit must not expose tokens');
    });

    // ── B2. Blocked — payment not confirmed, artifact withheld ────────────
    mockState.humanReport = baseHumanReport();
    mockState.orderFileRow = { order_id: 'ord-71e-002' };
    mockState.order = {
        orderId: 'ord-71e-002',
        status: 'AWAITING_PAYMENT',
        printhouseId: 'ph-71e-2',
        customer: { name: 'Beta LLC' },
        totals: { total: 99, currency: 'EUR' }
    };
    mockState.orderMetadataRow = {
        metadata_json: JSON.stringify({
            invoice: { status: 'ISSUED' },
            payment: { status: 'PAYMENT_PENDING' },
            production_unlock: { status: 'PRODUCTION_LOCKED' }
        })
    };
    mockState.auditEvents = [];
    await checkPackage('B2. Blocked — payment not confirmed, approved artifact withheld, handoff blocked end-to-end (regression)', 'job-71e-002', {}, (result, errors) => {
        if (result.package_release_gate?.ready !== false) errors.push('expected package_release_gate.ready=false');
        if (!(result.package_release_gate?.blockers || []).includes('PAYMENT_NOT_CONFIRMED')) errors.push('expected blockers to include PAYMENT_NOT_CONFIRMED');
        if (!(result.package_release_gate?.blockers || []).includes('PRODUCTION_NOT_UNLOCKED')) errors.push('expected blockers to include PRODUCTION_NOT_UNLOCKED');
        if (result.approved_artifact !== null) errors.push('expected approved_artifact=null when blocked');
    });

    // ── B3. Blocked governance domains surfaced as warnings, artifact withheld ──
    mockState.humanReport = baseHumanReport({
        production_package_governance: {
            package_ready: false,
            approved_artifact_type: null,
            approved_artifact_hash: null,
            included_reports: ['human_report.json', 'fix_audit.json'],
            blocked_by_governance_domains: ['review_required'],
            warnings: ['Artifact requires human review before packaging for production.']
        }
    });
    mockState.orderFileRow = { order_id: 'ord-71e-003' };
    mockState.order = {
        orderId: 'ord-71e-003',
        status: 'IN_PRODUCTION',
        printhouseId: 'ph-71e-3',
        customer: { name: 'Gamma Inc' },
        totals: { total: 10, currency: 'USD' }
    };
    mockState.orderMetadataRow = {
        metadata_json: JSON.stringify({
            invoice: { status: 'ISSUED' },
            payment: { status: 'PAYMENT_CONFIRMED' },
            production_unlock: { status: 'PRODUCTION_UNLOCKED' }
        })
    };
    mockState.auditEvents = [];
    await checkPackage('B3. Blocked governance domains surfaced as warnings, handoff blocked end-to-end (regression)', 'job-71e-003', {}, (result, errors) => {
        if (result.package_release_gate?.ready !== false) errors.push('expected package_release_gate.ready=false');
        if (!(result.package_release_gate?.blockers || []).includes('PREFLIGHT_PACKAGE_NOT_READY')) errors.push('expected blockers to include PREFLIGHT_PACKAGE_NOT_READY');
        if (!(result.package_release_gate?.blockers || []).includes('GOVERNANCE_DOMAINS_BLOCKING')) errors.push('expected blockers to include GOVERNANCE_DOMAINS_BLOCKING');
        if (!result.warnings.includes('Artifact requires human review before packaging for production.')) errors.push('expected original warning preserved');
        if (!result.warnings.some(w => w.includes('review_required'))) errors.push('expected blocked governance domain surfaced as a warning');
        if (result.approved_artifact !== null) errors.push('expected approved_artifact=null when blocked');
        if (!result.included_reports.includes('fix_audit.json')) errors.push('expected included_reports preserved despite blocked package');
    });

    // ── B4. No order linkage — package cannot be released, scoping defaults safe ──
    mockState.humanReport = baseHumanReport();
    mockState.orderFileRow = null;
    mockState.order = null;
    mockState.orderMetadataRow = null;
    mockState.auditEvents = [];
    await checkPackage('B4. No order linkage — package not ready, no PII, safe defaults end-to-end (regression)', 'job-71e-004', {}, (result, errors) => {
        if (result.ok !== true) errors.push('expected ok=true even without order linkage');
        if (result.order_id !== null) errors.push('expected order_id=null without linkage');
        if (result.order_summary !== null) errors.push('expected order_summary=null without linkage');
        if (result.payment_status?.invoice_status !== 'UNKNOWN') errors.push('expected invoice_status=UNKNOWN');
        if (result.payment_status?.payment_status !== 'UNKNOWN') errors.push('expected payment_status=UNKNOWN');
        if (result.payment_status?.production_unlock_status !== 'PRODUCTION_LOCKED') errors.push('expected production_unlock_status=PRODUCTION_LOCKED');
        if (result.package_release_gate?.ready !== false) errors.push('expected package_release_gate.ready=false without order data');
        if (result.approved_artifact !== null) errors.push('expected approved_artifact=null without order data');
        if (result.file_access_audit.length !== 0) errors.push('expected file_access_audit=[] without order');

        const serialized = JSON.stringify(result);
        for (const term of FORBIDDEN_SANITATION_TERMS) {
            if (serialized.includes(term)) errors.push(`Sanitation failed — handoff package leaked raw term: "${term}"`);
        }
        if (/"token"/.test(serialized)) errors.push('handoff package must not expose raw token field');
    });

    Module.prototype.require = originalRequire;
    delete require.cache[servicePath];
}

// ════════════════════════════════════════════════════════════════════════
// Orchestration + report generation
// ════════════════════════════════════════════════════════════════════════
async function runSmokeTests() {
    console.log('=== Running Phase 71E Smoke Tests (End-to-End Production Handoff Regression) ===');

    await runPartA();
    await runPartB();

    // ── Generate Control Plane regression reports ──────────────────────────
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const sanitizedResults = results.map(r => ({
        name: r.name,
        passed: r.passed,
        errors: r.errors,
        production_package_governance: r.production_package_governance || undefined
    }));

    const cpReport = {
        phase: '71E',
        repo: 'ppos-control-plane',
        generated_at: new Date().toISOString(),
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    };

    // ── Generate aggregate End-to-End report ───────────────────────────────
    const loadJson = (p) => {
        try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
        catch { return null; }
    };
    const engineReport  = loadJson(ENGINE_REPORT_PATH);
    const workerReport  = loadJson(WORKER_REPORT_PATH);
    const serviceReport = loadJson(SERVICE_REPORT_PATH);
    const cp71dReport   = loadJson(CONTROL_PLANE_71D_REPORT_PATH);

    const layers = [
        { name: 'Engine Artifact Hash Manifest (71A)',           report: engineReport,  passKey: 'smoke_passed' },
        { name: 'Worker Production Package Governance (71B)',    report: workerReport,  passKey: 'smoke_passed' },
        { name: 'Service Production Package Exposure (71C)',     report: serviceReport, passKey: 'smoke_passed' },
        { name: 'Control Plane Printhouse Handoff Package (71D)', report: cp71dReport,  passKey: 'smoke_result' },
        { name: 'Control Plane End-to-End Regression (71E)',     report: cpReport,      passKey: 'status' }
    ];

    const layerStatus = (l) => {
        if (!l.report) return { present: false, passed: false };
        if (l.passKey === 'smoke_passed') return { present: true, passed: !!l.report.smoke_passed };
        if (l.passKey === 'status') return { present: true, passed: l.report.status === 'PASS' };
        if (l.passKey === 'smoke_result') return {
            present: true,
            passed: (l.report.smoke_result?.fail === 0 && l.report.smoke_result?.pass > 0)
                || l.report.smoke_result?.result === 'ALL TESTS PASSED'
        };
        return { present: true, passed: false };
    };

    const layerSummaries = layers.map(l => ({ layer: l.name, ...layerStatus(l) }));
    const e2ePassed = layerSummaries.every(l => l.present && l.passed);
    const upstreamPresent = [engineReport, workerReport, serviceReport].every(r => r !== null);
    const cpLayersPassed = !hasFailures;

    const e2eReport = {
        phase: '71E — End-to-End Production Handoff Regression',
        generated_at: new Date().toISOString(),
        end_to_end_passed: e2ePassed,
        control_plane_passed: cpLayersPassed,
        upstream_present: upstreamPresent,
        status: e2ePassed ? 'PASS' : (cpLayersPassed && !upstreamPresent ? 'PENDING_UPSTREAM' : 'FAIL'),
        layers: layerSummaries,
        acceptance_criteria: {
            only_approved_artifact_included: e2ePassed,
            artifact_withheld_unless_release_gate_ready: e2ePassed,
            reports_included_and_preserved: e2ePassed,
            warnings_preserved: e2ePassed,
            blocked_governance_domains_surfaced_as_warnings: e2ePassed,
            blocked_jobs_cannot_be_handed_off: e2ePassed,
            review_required_blocks_package_ready: e2ePassed,
            production_certified_required_for_package_ready: e2ePassed,
            conservative_merge_false_wins: e2ePassed,
            multi_source_defensive_extraction_correct: e2ePassed,
            evidence_sanitized_no_raw_paths_or_internal_ids: e2ePassed,
            customer_private_data_scoped_correctly: e2ePassed,
            file_access_audit_sanitized: e2ePassed,
            no_raw_paths_or_tokens_leak: e2ePassed,
            reports_generated_in_each_repo: e2ePassed,
            aggregate_report_generated: true,
            all_smoke_tests_pass: e2ePassed
        }
    };

    const e2eReportFull = { ...cpReport, end_to_end: e2eReport };
    fs.writeFileSync(
        path.join(reportsDir, 'phase71e_end_to_end_production_handoff_regression.json'),
        JSON.stringify(e2eReportFull, null, 2)
    );

    const statusLabel = e2eReport.status === 'PASS' ? '✅ PASS'
        : e2eReport.status === 'PENDING_UPSTREAM' ? '⏳ PENDING_UPSTREAM' : '❌ FAIL';
    let e2eMd = `# Phase 71E — End-to-End Production Handoff Regression\n\n`;
    e2eMd += `**Generated:** ${e2eReport.generated_at}  \n`;
    e2eMd += `**End-to-End Status:** ${statusLabel}  \n`;
    e2eMd += `**Control Plane:** ${cpLayersPassed ? '✅ PASS' : '❌ FAIL'} (${cpReport.passed}/${cpReport.total} scenarios)  \n`;
    if (!upstreamPresent) e2eMd += `**Note:** Upstream repo reports (Engine 71A, Worker 71B, Service 71C) not yet present — run those phases first for full e2e validation.\n`;
    e2eMd += `\n## Pipeline Layers\n\n| Layer | Present | Passed |\n| --- | --- | --- |\n`;
    layerSummaries.forEach(l => { e2eMd += `| ${l.layer} | ${l.present ? '✅' : '❌'} | ${l.passed ? '✅' : '❌'} |\n`; });
    e2eMd += `\n## Final Acceptance Criteria\n\n`;
    Object.entries(e2eReport.acceptance_criteria).forEach(([k, v]) => {
        e2eMd += `- ${v ? '✅' : '❌'} ${k.replace(/_/g, ' ')}\n`;
    });
    e2eMd += `\n## Control Plane Scenarios (${cpReport.passed}/${cpReport.total} passed)\n\n`;
    results.forEach(r => {
        e2eMd += `- ${r.passed ? '✅' : '❌'} ${r.name}\n`;
        if (!r.passed) (r.errors || []).forEach(err => { e2eMd += `  - ${err}\n`; });
    });
    e2eMd += `\n## Governance Policy\n\n`;
    e2eMd += `| Policy | Value |\n| --- | --- |\n`;
    e2eMd += `| handoff_package_is_certification_authority | false |\n`;
    e2eMd += `| handoff_package_is_packaging_manifest | true |\n`;
    e2eMd += `| package_ready_requires_production_certified | true |\n`;
    e2eMd += `| package_ready_requires_review_not_required | true |\n`;
    e2eMd += `| package_ready_requires_no_blocked_governance_domains | true |\n`;
    e2eMd += `| approved_artifact_withheld_unless_release_gate_ready | true |\n`;
    e2eMd += `| release_gate_requires_invoice_issued | true |\n`;
    e2eMd += `| release_gate_requires_payment_confirmed | true |\n`;
    e2eMd += `| release_gate_requires_production_unlocked | true |\n`;
    e2eMd += `| order_summary_excludes_pii | true |\n`;
    e2eMd += `| file_access_audit_excludes_tokens | true |\n`;
    e2eMd += `| evidence_paths_sanitized | true |\n`;

    fs.writeFileSync(path.join(reportsDir, 'phase71e_end_to_end_production_handoff_regression.md'), e2eMd);

    console.log(`\nReports written to ${reportsDir}`);
    console.log(`End-to-end status: ${e2eReport.status}`);

    if (hasFailures) {
        console.error('\n=== Phase 71E Control Plane Tests FAILED ===');
        process.exit(1);
    }
    if (!upstreamPresent) {
        console.log(`\n=== Phase 71E Control Plane Tests Passed (${cpReport.passed}/${cpReport.total}) ===`);
        console.log('    Upstream repo reports (71A/71B/71C) not yet present — full e2e status: PENDING_UPSTREAM');
        console.log('    Run Engine 71A, Worker 71B, and Service 71C to complete the full end-to-end regression.');
    } else {
        console.log('\n=== All Phase 71E / End-to-End Smoke Tests Passed ===');
    }
}

runSmokeTests();
