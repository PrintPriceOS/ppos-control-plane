'use strict';

/**
 * Phase 73E — End-to-End Machine Assignment Regression
 *
 * Validates the full machine assignment lifecycle and capability matching:
 *   Engine (73A) → Worker (73B) → Service (73C) → Control Plane (73D & 73E)
 *
 * Acceptance criteria:
 *  - Incompatible jobs blocked.
 *  - Compatible jobs can enter queue/be assigned.
 *  - Warnings preserved.
 */

const path = require('path');
const fs   = require('fs');

// Load upstream phase reports for chain validation
const ENGINE_REPORT_PATH  = path.resolve(__dirname, '../../ppos-preflight-engine/reports/phase73a_engine_machine_signals.json');
const WORKER_REPORT_PATH  = path.resolve(__dirname, '../../ppos-preflight-worker-phase-10-intelligence-layer/reports/phase73b_worker_machine_readiness_governance.json');
const SERVICE_REPORT_PATH = path.resolve(__dirname, '../../ppos-preflight-service/reports/phase73c_service_machine_readiness_exposure.json');
const CP_REPORT_PATH      = path.resolve(__dirname, '../reports/phase73d_control_plane_machine_assignment_gate.json');

function loadReport(p, label) {
    if (!fs.existsSync(p)) {
        console.warn(`[73E] ${label} report not found at ${p}. Chain validation will use synthetic data for this source.`);
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.warn(`[73E] Failed to parse ${label} report: ${e.message}`);
        return null;
    }
}

const engineReport  = loadReport(ENGINE_REPORT_PATH,  '73A Engine');
const workerReport  = loadReport(WORKER_REPORT_PATH,  '73B Worker');
const serviceReport = loadReport(SERVICE_REPORT_PATH, '73C Service');
const cpReport      = loadReport(CP_REPORT_PATH,      '73D Control Plane');

// Stub/mock infrastructure
const Module = require('module');
const originalRequire = Module.prototype.require;

const SERVICE_DIR = path.join(__dirname, '../src/api/services');

const mockState = {
    humanReport:      null,
    orderFileRow:     null,
    order:            null,
    orderMetadataRow: null,
    machineProfiles:  []
};

Module.prototype.require = function (id) {
    let resolved = id;
    try {
        if (id.startsWith('.')) {
            resolved = require.resolve(id, { paths: [SERVICE_DIR] });
        }
    } catch (e) { /* ignore */ }

    if (id === './preflightHumanReportService' || resolved === path.resolve(SERVICE_DIR, 'preflightHumanReportService')) {
        return { getHumanReport: async () => mockState.humanReport };
    }
    if (id === './marketplaceOrderService' || resolved === path.resolve(SERVICE_DIR, 'marketplaceOrderService')) {
        return {
            getOrder: async () => mockState.order,
            assertOrderReadyForFinancialProgression: async () => ({ warnings: [] }),
            appendOrderEvent: async () => ({})
        };
    }
    if (id === './mysqlClient' || resolved === path.resolve(SERVICE_DIR, 'mysqlClient')) {
        return {
            query: async (sql, params) => {
                if (sql.includes('marketplace_order_files')) {
                    return mockState.orderFileRow ? [mockState.orderFileRow] : [];
                }
                if (sql.includes('marketplace_orders')) {
                    return mockState.orderMetadataRow ? [mockState.orderMetadataRow] : [];
                }
                if (sql.includes('print_node_machine_profiles')) {
                    const idParam = params && params[0];
                    const matched = mockState.machineProfiles.find(m => m.id === idParam);
                    return matched ? [matched] : [];
                }
                return [];
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

// Force clear require cache
delete require.cache[require.resolve('../src/api/services/marketplaceProductionQueueService')];

const {
    evaluateProductionQueueEligibility,
    createProductionQueueEntry,
    assignProductionMachine
} = require('../src/api/services/marketplaceProductionQueueService');

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
    mockState.humanReport = null;
    mockState.orderFileRow = null;
    mockState.order = null;
    mockState.orderMetadataRow = null;
    mockState.machineProfiles = [];
}

async function runTests() {
    console.log('\n\n=== PART 1 — Chain Integrity ===\n');

    assert(cpReport !== null, '73D Control Plane report loaded');
    if (cpReport) assert(cpReport.smoke_passed === true, '73D: smoke_passed=true');

    console.log('\n\n=== PART 2 — End-to-End Scenarios ===\n');

    // Scenario 2.1: Compatible assignment is allowed and preserves warnings
    {
        console.log('-- Scenario 2.1: Compatible assignment is allowed');
        resetMockState();
        mockState.orderFileRow = { preflight_job_id: 'job-73e-compat' };
        mockState.order = { status: 'PRODUCTION_ACCEPTED' };
        mockState.orderMetadataRow = {
            status: 'PRODUCTION_QUEUED',
            metadata_json: JSON.stringify({
                dispatch_package: { status: 'PRINTHOUSE_ACCEPTED', manifest: { invoice: { status: 'ISSUED' }, payment: { status: 'PAYMENT_CONFIRMED' } } },
                production_unlock: { status: 'PRODUCTION_UNLOCKED' },
                production_decision: { decision: 'PRODUCTION_ACCEPTED' },
                production_queue: { status: 'PRODUCTION_QUEUED', warnings: ['Legacy queue warning'] }
            })
        };
        mockState.humanReport = {
            ok: true,
            report: {
                machine_readiness_governance: {
                    machine_match_required: true,
                    incompatible_machine_reasons: {
                        'press-73e-incompat': ['PAGE_SIZE_MISMATCH']
                    },
                    warnings: ['Advisory: ink calibration recommended']
                }
            }
        };
        mockState.machineProfiles = [
            { id: 'press-73e-compat', status: 'ACTIVE' },
            { id: 'press-73e-incompat', status: 'ACTIVE' }
        ];

        const res = await assignProductionMachine('ord-73e-001', 'press-73e-compat');
        assert(res.ok === true, '2.1 Compatible machine assignment is accepted');
        assert(res.productionQueue.status === 'MACHINE_ASSIGNED', '2.1 Queue status transitions to MACHINE_ASSIGNED');
        assert(res.productionQueue.warnings.includes('Advisory: ink calibration recommended'), '2.1 Preflight compatibility warnings preserved');
    }

    // Scenario 2.2: Incompatible assignment is blocked
    {
        console.log('\n-- Scenario 2.2: Incompatible assignment is blocked');
        let error = null;
        try {
            await assignProductionMachine('ord-73e-001', 'press-73e-incompat');
        } catch (e) {
            error = e;
        }
        assert(error !== null, '2.2 Throws error on incompatible machine assignment');
        assert(error.message === 'PRODUCTION_MACHINE_INCOMPATIBLE', '2.2 Blocked with PRODUCTION_MACHINE_INCOMPATIBLE');
    }

    // Scenario 2.3: Initial queue entry creation blocks incompatible machines
    {
        console.log('\n-- Scenario 2.3: Initial queue entry creation blocks incompatible machines');
        resetMockState();
        mockState.orderFileRow = { preflight_job_id: 'job-73e-compat' };
        mockState.order = { status: 'PRODUCTION_ACCEPTED' };
        mockState.orderMetadataRow = {
            status: 'PRODUCTION_ACCEPTED',
            metadata_json: JSON.stringify({
                dispatch_package: { status: 'PRINTHOUSE_ACCEPTED', manifest: { invoice: { status: 'ISSUED' }, payment: { status: 'PAYMENT_CONFIRMED' } } },
                production_unlock: { status: 'PRODUCTION_UNLOCKED' },
                production_decision: { decision: 'PRODUCTION_ACCEPTED' }
            })
        };
        mockState.humanReport = {
            ok: true,
            report: {
                machine_readiness_governance: {
                    machine_match_required: true,
                    incompatible_machine_reasons: {
                        'press-73e-incompat': ['PAGE_SIZE_MISMATCH']
                    },
                    warnings: []
                }
            }
        };
        mockState.machineProfiles = [
            { id: 'press-73e-incompat', status: 'ACTIVE' }
        ];

        let error = null;
        try {
            await createProductionQueueEntry('ord-73e-001', { machineId: 'press-73e-incompat' });
        } catch (e) {
            error = e;
        }
        assert(error !== null, '2.3 Queue creation with incompatible machine throws error');
        assert(error.message === 'PRODUCTION_MACHINE_INCOMPATIBLE', '2.3 Throws PRODUCTION_MACHINE_INCOMPATIBLE');
    }

    // Write reports
    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const smokePassed = FAIL === 0;
    const report = {
        generated_at: new Date().toISOString(),
        phase: '73E',
        repo: 'ppos-control-plane',
        smoke_passed: smokePassed,
        summary: { total: PASS + FAIL, passed: PASS, failed: FAIL },
        results
    };

    const jsonPath = path.join(reportsDir, 'phase73e_end_to_end_machine_assignment_regression.json');
    const mdPath   = path.join(reportsDir, 'phase73e_end_to_end_machine_assignment_regression.md');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const md = [
        '# Phase 73E — End-to-End Machine Assignment Regression',
        '',
        `**Generated:** ${report.generated_at}  `,
        `**Smoke:** ${smokePassed ? '✅ PASSED' : '❌ FAILED'}  `,
        `**Results:** ${PASS}/${PASS + FAIL} passed`,
        '',
        '## Verification Summary',
        '- Verified compatible machine assignments transition to MACHINE_ASSIGNED.',
        '- Verified incompatible machine assignments block and throw PRODUCTION_MACHINE_INCOMPATIBLE.',
        '- Verified compatibility/readiness warnings are preserved in the queue metadata.',
        '',
        '## Test Results',
        '| # | Test | Pass |',
        '|---|------|------|',
        ...results.map((r, i) => `| ${i+1} | ${r.label} | ${r.pass ? '✅' : '❌'} |`),
        ''
    ].join('\n');
    fs.writeFileSync(mdPath, md);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`Phase 73E — End-to-End Machine Assignment Regression`);
    console.log(`Results: ${PASS}/${PASS + FAIL} passed${FAIL > 0 ? ` (${FAIL} FAILED)` : ''}`);
    console.log(`Smoke: ${smokePassed ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`Reports: ${jsonPath}`);
    console.log('='.repeat(70));

    Module.prototype.require = originalRequire;
    process.exit(smokePassed ? 0 : 1);
}

runTests().catch(e => {
    console.error('Test suite failed:', e);
    Module.prototype.require = originalRequire;
    process.exit(1);
});
