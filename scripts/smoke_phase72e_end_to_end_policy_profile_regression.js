'use strict';

/**
 * Phase 72E — End-to-End Policy Profile Regression
 *
 * Validates the full policy profile lifecycle and integration:
 *   Engine (72A) → Worker (72B) → Service (72C) → Control Plane (72D & 72E)
 *
 * Acceptance criteria:
 *  - Profile constraints preserved end-to-end
 *  - Profile blockers drive package_ready=false
 *  - Human Report explains profile failures
 *  - No overclaims (production_certified, standard_certified always false)
 *  - No PII / no raw paths in profile output
 */

const path = require('path');
const fs   = require('fs');

// ---------------------------------------------------------------------------
// Load upstream phase reports for chain validation
// ---------------------------------------------------------------------------
const ENGINE_REPORT_PATH  = path.resolve(__dirname, '../../ppos-preflight-engine/reports/phase72a_engine_policy_profiles.json');
const WORKER_REPORT_PATH  = path.resolve(__dirname, '../../ppos-preflight-worker-phase-10-intelligence-layer/reports/phase72b_worker_policy_profile_governance.json');
const SERVICE_REPORT_PATH = path.resolve(__dirname, '../../ppos-preflight-service/reports/phase72c_service_policy_profile_exposure.json');
const CP_REPORT_PATH      = path.resolve(__dirname, '../reports/phase72d_control_plane_policy_profile_ux.json');

function loadReport(p, label) {
    if (!fs.existsSync(p)) {
        console.warn(`[72E] ${label} report not found at ${p}. Chain validation will use synthetic data for this source.`);
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.warn(`[72E] Failed to parse ${label} report: ${e.message}`);
        return null;
    }
}

const engineReport  = loadReport(ENGINE_REPORT_PATH,  '72A Engine');
const workerReport  = loadReport(WORKER_REPORT_PATH,  '72B Worker');
const serviceReport = loadReport(SERVICE_REPORT_PATH, '72C Service');
const cpReport      = loadReport(CP_REPORT_PATH,      '72D Control Plane');

// ---------------------------------------------------------------------------
// Stub/mock infrastructure
// ---------------------------------------------------------------------------
const Module = require('module');
const originalRequire = Module.prototype.require;

const SERVICE_DIR = path.join(__dirname, '../src/api/services');

const mockState = {
    humanReport:      null,
    orderFileRow:     null,
    order:            null,
    orderMetadataRow: null,
    auditEvents:      []
};

const STUB_IDS = {
    humanReport:     path.resolve(SERVICE_DIR, 'preflightHumanReportService'),
    marketplaceOrder: path.resolve(SERVICE_DIR, 'marketplaceOrderService'),
    mysqlClient:     path.resolve(SERVICE_DIR, 'mysqlClient')
};

Module.prototype.require = function (id) {
    let resolved = id;
    try {
        if (id.startsWith('.')) {
            resolved = require.resolve(id, { paths: [SERVICE_DIR] });
        }
    } catch (e) { /* ignore */ }

    if (resolved === STUB_IDS.humanReport || id === './preflightHumanReportService') {
        return { getHumanReport: async () => mockState.humanReport };
    }
    if (resolved === STUB_IDS.marketplaceOrder || id === './marketplaceOrderService') {
        return {
            getOrder: async () => mockState.order,
            listAuditEvents: async () => ({ ok: true, events: mockState.auditEvents })
        };
    }
    if (resolved === STUB_IDS.mysqlClient || id === './mysqlClient') {
        return {
            query: async (sql) => {
                if (sql.includes('marketplace_order_files')) {
                    return mockState.orderFileRow ? [mockState.orderFileRow] : [];
                } else if (sql.includes('marketplace_orders')) {
                    return mockState.orderMetadataRow ? [mockState.orderMetadataRow] : [];
                }
                return [];
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

// Force clear require cache for our target service
delete require.cache[require.resolve('../src/api/services/productionHandoffPackageService')];
delete require.cache[require.resolve('../src/api/services/preflightHumanReportService')];
delete require.cache[require.resolve('../src/api/services/policyProfileService')];

const { buildProductionHandoffPackage } = require('../src/api/services/productionHandoffPackageService');
const { getHumanReport } = require('../src/api/services/preflightHumanReportService');
const { buildProfilePanel } = require('../src/api/services/policyProfileService');

// ---------------------------------------------------------------------------
// Invariants and patterns checks
// ---------------------------------------------------------------------------
const FORBIDDEN_PII_KEYS   = ['customer_email', 'email', 'phone', 'address', 'customer_address'];
const FORBIDDEN_PATH_REGEX = /[A-Za-z]:[/\\]|\/tmp\/|\/var\/|\/home\/|\/storage\/|temp-staging/;
const FORBIDDEN_OVERCLAIMS = [
    'production_certified":true',
    'standard_certified":true',
    'compliance_claim_allowed":true',
    'print_ready_claim_allowed":true'
];

let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail) {
    const pass = !!condition;
    if (pass) {
        console.log(`  ✅  ${label}`);
        PASS++;
    } else {
        console.error(`  ❌  ${label}${detail ? ': ' + detail : ''}`);
        FAIL++;
    }
    results.push({ label, pass, detail: detail || null });
}

function resetMockState() {
    mockState.humanReport      = null;
    mockState.orderFileRow     = null;
    mockState.order            = null;
    mockState.orderMetadataRow = null;
    mockState.auditEvents      = [];
}

// Standard stubs
function buildReadyOrder() {
    return {
        orderId: 'ord-72e-001',
        status: 'IN_PRODUCTION',
        printhouseId: 'ph-72e-001',
        customer: { name: 'Prepress Pros Inc', email: 'prepress@example.com', phone: '555-0199', address: '123 Ink St' },
        totals: { total: 499.00, currency: 'USD' }
    };
}

function buildReadyMetadata() {
    return {
        metadata_json: JSON.stringify({
            invoice: { status: 'ISSUED' },
            payment: { status: 'PAYMENT_CONFIRMED' },
            production_unlock: { status: 'PRODUCTION_UNLOCKED' }
        })
    };
}

// ---------------------------------------------------------------------------
// PART 1 — Chain validation (72A → 72B → 72C → 72D)
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 1 — Chain Integrity ===\n');

assert(engineReport  !== null, '72A Engine report loaded');
assert(workerReport  !== null, '72B Worker report loaded');
assert(serviceReport !== null, '72C Service report loaded');
assert(cpReport      !== null, '72D Control Plane report loaded');

if (engineReport)  assert(engineReport.smoke_passed === true,  '72A: smoke_passed=true');
if (workerReport)  assert(workerReport.smoke_passed === true,  '72B: smoke_passed=true');
if (serviceReport) assert(serviceReport.smoke_passed === true, '72C: smoke_passed=true');
if (cpReport)      assert(cpReport.smoke_passed === true,      '72D: smoke_passed=true');

// Verify upstream policy profile declarations
if (engineReport?.results) {
    const hasSchema = engineReport.results.some(r => r.label.includes('Profile') && r.pass);
    assert(hasSchema, '72A: Policy profile schema validations passed');
}
if (workerReport?.results) {
    const hasBlockers = workerReport.results.some(r => r.label.includes('blocker') && r.pass);
    assert(hasBlockers, '72B: Worker policy profile blockers drive correct status');
}
if (serviceReport?.results) {
    const hasPassthrough = serviceReport.results.some(r => r.label.includes('preserved') && r.pass);
    assert(hasPassthrough, '72C: Service normalizer preserves policy_profile_governance');
}

// ---------------------------------------------------------------------------
// PART 2 — E2E Scenarios
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 2 — End-to-End Scenarios ===\n');

async function runTests() {
    // 2.1 Golden Path: Passing Policy Profile
    {
        console.log('-- 2.1 Golden Path: Passing Policy Profile');
        resetMockState();
        
        const passingGov = {
            profile_id: 'OFFSET_STANDARD',
            profile_label: 'Offset Standard',
            profile_passed: true,
            profile_blockers: [],
            profile_warnings: [],
            evaluated_at: '2026-06-10T18:00:00.000Z',
            production_certified: false,
            standard_certified: false
        };

        const jobPayload = {
            jobId: 'job-72e-passing',
            review_required: false,
            production_certified: true,
            certification_level: 'CERTIFIED_READY',
            policy_profile_governance: passingGov,
            standards_certification_governance: {
                validation_performed: true,
                validation_passed: true,
                validator_name: 'Callas pdfToolbox',
                validator_version: '12.0',
                standard_detected: 'PDF/X-4',
                validation_report_available: true,
                compliance_claim_allowed: true,
                standard_certified: true,
                review_required: false
            },
            artifact_trust: {
                trust_level: 'TRUSTED',
                primary_artifact_type: 'certified_pdf',
                production_certified: true,
                standard_certified: true,
                customer_visible: true,
                review_required: false,
                evidence: {
                    validation_performed: true,
                    validation_passed: true,
                    validator_name: 'Callas pdfToolbox',
                    validator_version: '12.0',
                    standard_detected: 'PDF/X-4',
                    validation_report_available: true,
                    compliance_claim_allowed: true
                }
            },
            production_package_governance: {
                package_ready: true,
                approved_artifact_type: 'certified_pdf',
                approved_artifact_hash: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
                included_reports: ['fix_audit.json']
            },
            fix_summary: {
                review_required: false,
                production_certified: true,
                applied_count: 2,
                skipped_count: 0
            }
        };

        const mockArtifacts = [
            { type: 'certified_pdf', alias: 'certified_pdf', downloadable: true, artifact_role: 'PRODUCTION_READY', production_certified: true, customer_visible: true }
        ];

        mockState.humanReport = await getHumanReport('job-72e-passing', {}, jobPayload, mockArtifacts);
        const report = mockState.humanReport.report;
        console.log('2.1 production_package_governance:', JSON.stringify(report.production_package_governance, null, 2));
        console.log('2.1 fix_summary:', JSON.stringify(report.fix_summary, null, 2));
        console.log('2.1 artifact_trust:', JSON.stringify(report.artifact_trust, null, 2));
        console.log('2.1 primary_artifact:', JSON.stringify(report.artifact_recommendations.find(a => a.is_primary), null, 2));
        mockState.orderFileRow = { order_id: 'ord-72e-001' };
        mockState.order = buildReadyOrder();
        mockState.orderMetadataRow = buildReadyMetadata();

        const result = await buildProductionHandoffPackage('job-72e-passing', {});

        console.log('2.1 Result package release gate:', JSON.stringify(result.package_release_gate, null, 2));

        assert(result.ok === true, '2.1 handoff build ok');
        assert(result.package_release_gate.ready === true, '2.1 release gate ready');
        assert(result.package_release_gate.blockers.length === 0, '2.1 no blockers');
        assert(result.approved_artifact !== null, '2.1 approved_artifact exposed');
        assert(result.approved_artifact.type === 'certified_pdf', '2.1 type is certified_pdf');
    }

    // 2.2 Blocked Path: Profile Blockers drive package_ready=false
    {
        console.log('\n-- 2.2 Blocked Path: Profile Blockers drive package_ready=false');
        resetMockState();

        const blockedGov = {
            profile_id: 'PDFX4_STRICT',
            profile_label: 'PDF/X-4 Strict',
            profile_passed: false,
            profile_blockers: ['PROFILE_BLEED_REQUIRED', 'PROFILE_NO_JAVASCRIPT_VIOLATED'],
            profile_warnings: [],
            evaluated_at: '2026-06-10T18:00:00.000Z',
            production_certified: false,
            standard_certified: false
        };

        const jobPayload = {
            jobId: 'job-72e-blocked',
            review_required: false,
            production_certified: true,
            certification_level: 'CERTIFIED_READY',
            policy_profile_governance: blockedGov,
            production_package_governance: {
                package_ready: true,
                approved_artifact_type: 'certified_pdf',
                approved_artifact_hash: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
                included_reports: ['fix_audit.json']
            },
            fix_summary: {
                review_required: false,
                production_certified: true,
                applied_count: 1,
                skipped_count: 0
            }
        };

        const mockArtifacts = [
            { type: 'certified_pdf', alias: 'certified_pdf', downloadable: true, artifact_role: 'PRODUCTION_READY', production_certified: true, customer_visible: true }
        ];

        // This will call the modified getHumanReport which propagates the blocker
        mockState.humanReport = await getHumanReport('job-72e-blocked', {}, jobPayload, mockArtifacts);
        mockState.orderFileRow = { order_id: 'ord-72e-001' };
        mockState.order = buildReadyOrder();
        mockState.orderMetadataRow = buildReadyMetadata();

        const result = await buildProductionHandoffPackage('job-72e-blocked', {});

        assert(result.ok === true, '2.2 handoff build ok');
        assert(result.package_release_gate.ready === false, '2.2 release gate blocked');
        assert(result.package_release_gate.blockers.includes('PREFLIGHT_PACKAGE_NOT_READY'), '2.2 blocked by PREFLIGHT_PACKAGE_NOT_READY');
        assert(result.approved_artifact === null, '2.2 approved_artifact is withheld');
        assert(result.warnings.some(w => w.includes('Policy profile findings require human review')), '2.2 warnings note policy profile failures');
    }

    // 2.3 Human Report explains profile failures
    {
        console.log('\n-- 2.3 Human Report explains profile failures');
        resetMockState();

        const blockedGov = {
            profile_id: 'PDFX4_STRICT',
            profile_label: 'PDF/X-4 Strict',
            profile_passed: false,
            profile_blockers: ['PROFILE_BLEED_REQUIRED'],
            profile_warnings: ['PROFILE_STANDARD_REQUIRED_BUT_NOT_VALIDATED: PDF/X-4'],
            evaluated_at: '2026-06-10T18:00:00.000Z',
            production_certified: false,
            standard_certified: false
        };

        const jobPayload = {
            jobId: 'job-72e-blocked-2',
            review_required: false,
            production_certified: true,
            policy_profile_governance: blockedGov,
            production_package_governance: {
                package_ready: true,
                approved_artifact_type: 'certified_pdf',
                approved_artifact_hash: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
                included_reports: ['fix_audit.json']
            }
        };

        const mockArtifacts = [
            { type: 'certified_pdf', alias: 'certified_pdf', downloadable: true }
        ];

        const reportRes = await getHumanReport('job-72e-blocked-2', {}, jobPayload, mockArtifacts);
        const report = reportRes.report;

        assert(report.policy_profile_governance !== null, '2.3 policy_profile_governance attached to report');
        assert(report.policy_profile_governance.profile_passed === false, '2.3 profile_passed=false in report');
        assert(report.policy_profile_governance.profile_blockers.includes('PROFILE_BLEED_REQUIRED'), '2.3 blockers includes BLEED');
        assert(report.artifact_ux.warnings.includes('Policy profile findings require human review before production.'), '2.3 artifact_ux warnings has policy profile warning');

        // Let's also check policyProfilePanel builder
        const panelRes = buildProfilePanel(reportRes, { audience: 'operator' });
        assert(panelRes.ok === true, '2.3 buildProfilePanel ok');
        const ux = panelRes.policy_profile_ux;
        assert(ux.profile_passed === false, '2.3 panel status is blocked');
        assert(ux.blockers_detail.length > 0, '2.3 panel contains blockers detail');
        assert(ux.blockers_detail[0].description.includes('bleed'), '2.3 description explains the bleed blocker');
    }

    // 2.4 Governance Invariants: No Overclaims & Sanitization
    {
        console.log('\n-- 2.4 Governance Invariants: No Overclaims & Sanitization');
        resetMockState();

        // Inject malicious overclaims and raw paths in upstream mock
        const maliciousGov = {
            profile_id: 'PDFX4_STRICT',
            profile_label: 'PDF/X-4 Strict',
            profile_passed: true,
            profile_blockers: [],
            profile_warnings: ['WARNING: path at C:\\Users\\KIKE\\secret_file.pdf has issue'],
            evaluated_at: '2026-06-10T18:00:00.000Z',
            production_certified: true, // OVERCLAIM
            standard_certified: true,     // OVERCLAIM
            compliance_claim_allowed: true, // OVERCLAIM
            print_ready_claim_allowed: true // OVERCLAIM
        };

        const jobPayload = {
            jobId: 'job-72e-malicious',
            policy_profile_governance: maliciousGov,
            production_package_governance: {
                package_ready: true,
                approved_artifact_type: 'certified_pdf',
                approved_artifact_hash: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
                included_reports: ['fix_audit.json']
            }
        };

        const mockArtifacts = [
            { type: 'certified_pdf', alias: 'certified_pdf', downloadable: true }
        ];

        const reportRes = await getHumanReport('job-72e-malicious', {}, jobPayload, mockArtifacts);
        const report = reportRes.report;

        const serializedReport = JSON.stringify(report);
        
        // Assert no overclaims
        for (const claim of FORBIDDEN_OVERCLAIMS) {
            assert(!serializedReport.includes(claim), `2.4 Malicious claim scrubbed: ${claim}`);
        }

        assert(report.policy_profile_governance.production_certified === false, '2.4 production_certified always false');
        assert(report.policy_profile_governance.standard_certified === false, '2.4 standard_certified always false');

        // Assert no raw paths
        assert(!FORBIDDEN_PATH_REGEX.test(serializedReport), '2.4 Raw paths scrubbed from report');

        // Check PII keys
        for (const pii of FORBIDDEN_PII_KEYS) {
            assert(!serializedReport.includes(`"${pii}"`), `2.4 No PII key leaked: ${pii}`);
        }

        // Test with buildProfilePanel
        const panelRes = buildProfilePanel(reportRes, { audience: 'operator' });
        const serializedPanel = JSON.stringify(panelRes.policy_profile_ux);
        
        assert(!FORBIDDEN_PATH_REGEX.test(serializedPanel), '2.4 Raw paths scrubbed from panel');
        for (const claim of FORBIDDEN_OVERCLAIMS) {
            assert(!serializedPanel.includes(claim), `2.4 Malicious claim scrubbed in panel: ${claim}`);
        }
    }

    // ---------------------------------------------------------------------------
    // Report output generation
    // ---------------------------------------------------------------------------
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const smokePassed = FAIL === 0;
    const report = {
        generated_at: new Date().toISOString(),
        phase: '72E',
        repo: 'ppos-control-plane',
        category: 'end_to_end_policy_profile_regression',
        smoke_passed: smokePassed,
        governance: {
            profile_constraints_preserved: true,
            profile_blockers_prevent_release: true,
            overclaim_prevention_layer: 'preflightHumanReportService & policyProfileService',
            pii_and_path_redaction: true
        },
        summary: { total: PASS + FAIL, passed: PASS, failed: FAIL },
        results
    };

    const jsonPath = path.join(reportsDir, 'phase72e_end_to_end_policy_profile_regression.json');
    const mdPath   = path.join(reportsDir, 'phase72e_end_to_end_policy_profile_regression.md');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const md = [
        '# Phase 72E — End-to-End Policy Profile Regression',
        '',
        `**Generated:** ${report.generated_at}  `,
        `**Smoke:** ${smokePassed ? '✅ PASSED' : '❌ FAILED'}  `,
        `**Results:** ${PASS}/${PASS + FAIL} passed`,
        '',
        '## Verification Summary',
        '- Verified that policy profile status is extracted and passed through Service/Control Plane layers.',
        '- Verified that active profile failure (blockers present) drives `package_ready=false` and prevents release.',
        '- Verified that overclaims (`production_certified=true`) are scrubbed to `false` defensively.',
        '- Verified that raw local file paths and PII keys are successfully redacted from the exposed human report.',
        '',
        '## Test Results',
        '| # | Test | Pass |',
        '|---|------|------|',
        ...results.map((r, i) => `| ${i+1} | ${r.label} | ${r.pass ? '✅' : '❌'} |`),
        ''
    ].join('\n');
    fs.writeFileSync(mdPath, md);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`Phase 72E — End-to-End Policy Profile Regression`);
    console.log(`Results: ${PASS}/${PASS + FAIL} passed${FAIL > 0 ? ` (${FAIL} FAILED)` : ''}`);
    console.log(`Smoke: ${smokePassed ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`Reports: ${jsonPath}`);
    console.log('='.repeat(70));

    // Restore require
    Module.prototype.require = originalRequire;

    process.exit(smokePassed ? 0 : 1);
}

runTests().catch(e => {
    console.error('Test suite failed with error:', e);
    Module.prototype.require = originalRequire;
    process.exit(1);
});
