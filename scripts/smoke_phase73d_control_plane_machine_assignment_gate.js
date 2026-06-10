'use strict';

/**
 * Phase 73D Smoke Test — Control Plane Machine Assignment Gate
 *
 * Validates:
 *  1. marketplaceProductionQueueService machine compatibility matching
 *  2. Blocking assignment if preflight/machine mismatch exists
 *  3. MachineCompatibilityPanel React component file structure
 */

const path = require('path');
const fs   = require('fs');

const Module = require('module');
const originalRequire = Module.prototype.require;

const SERVICE_DIR = path.join(__dirname, '../src/api/services');

// Mock state
const mockState = {
    humanReport: null,
    orderFileRow: null,
    order: null,
    orderMetadataRow: null,
    machineProfiles: []
};

// Hook require to inject mocks
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

// Force cache eviction
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
    if (pass) { console.log(`  ✅  ${label}`); PASS++; }
    else       { console.error(`  ❌  ${label}${detail ? ': ' + detail : ''}`); FAIL++; }
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
    console.log('\n=== PART 1 — Eligibility Check with Capability Matching ===\n');

    // 1.1 Compatible Machine
    {
        resetMockState();
        mockState.orderFileRow = { preflight_job_id: 'job-73d-comp' };
        mockState.order = { status: 'PRODUCTION_ACCEPTED' };
        mockState.orderMetadataRow = {
            status: 'PRODUCTION_ACCEPTED',
            metadata_json: JSON.stringify({
                dispatch_package: { status: 'PRINTHOUSE_ACCEPTED', manifest: { invoice: { status: 'ISSUED' }, payment: { status: 'PAYMENT_CONFIRMED' } } },
                production_unlock: { status: 'PRODUCTION_UNLOCKED' },
                production_decision: { decision: 'PRODUCTION_ACCEPTED' },
                production_queue: { status: 'PRODUCTION_QUEUED' }
            })
        };
        mockState.humanReport = {
            ok: true,
            report: {
                machine_readiness_governance: {
                    machine_match_required: true,
                    incompatible_machine_reasons: {
                        'press-incompat': ['MACHINE_PAGE_COUNT_EXCEEDED']
                    },
                    warnings: ['Advisory: color calibration recommended']
                }
            }
        };
        mockState.machineProfiles = [
            { id: 'press-compat', status: 'ACTIVE' },
            { id: 'press-incompat', status: 'ACTIVE' }
        ];

        const res = await evaluateProductionQueueEligibility('ord-1', { machineId: 'press-compat' });
        assert(res.eligible === true, '1.1 Eligible on compatible machine');
        assert(res.blockers.length === 0, '1.1 No blockers on compatible machine');
        assert(res.warnings.includes('Advisory: color calibration recommended'), '1.1 Preflight warnings preserved');
    }

    // 1.2 Incompatible Machine
    {
        const res = await evaluateProductionQueueEligibility('ord-1', { machineId: 'press-incompat' });
        assert(res.eligible === false, '1.2 Ineligible on incompatible machine');
        assert(res.blockers.includes('PRODUCTION_MACHINE_INCOMPATIBLE'), '1.2 Blocked by PRODUCTION_MACHINE_INCOMPATIBLE');
        assert(res.warnings.includes('MACHINE_PAGE_COUNT_EXCEEDED'), '1.2 Incompatibility reason propagated as warning');
    }

    console.log('\n=== PART 2 — Assignment Gating ===\n');

    // 2.1 Block Incompatible Assignment
    {
        mockState.orderMetadataRow.status = 'PRODUCTION_QUEUED';
        let error = null;
        try {
            await assignProductionMachine('ord-1', 'press-incompat');
        } catch (e) {
            error = e;
        }
        assert(error !== null, '2.1 Throws on incompatible machine assignment');
        assert(error.message === 'PRODUCTION_MACHINE_INCOMPATIBLE', '2.1 Throw message is PRODUCTION_MACHINE_INCOMPATIBLE');
    }

    // 2.2 Allow Compatible Assignment
    {
        mockState.orderMetadataRow.status = 'PRODUCTION_QUEUED';
        const res = await assignProductionMachine('ord-1', 'press-compat');
        assert(res.ok === true, '2.2 Succeeds on compatible machine assignment');
        assert(res.productionQueue.status === 'MACHINE_ASSIGNED', '2.2 Queue status is MACHINE_ASSIGNED');
    }

    console.log('\n=== PART 3 — React Panel Checks ===\n');

    // 3.1 Verify MachineCompatibilityPanel existence and exports
    const panelPath = path.resolve(__dirname, '../src/ui/components/MachineCompatibilityPanel.tsx');
    assert(fs.existsSync(panelPath), '3.1 MachineCompatibilityPanel.tsx file exists');
    if (fs.existsSync(panelPath)) {
        const content = fs.readFileSync(panelPath, 'utf8');
        assert(content.includes('export function MachineCompatibilityPanel'), '3.1 Exports MachineCompatibilityPanel function');
        assert(content.includes('data-testid="compatibility-badge"'), '3.1 Includes compatibility-badge test ID');
    }

    // Write reports
    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const smokePassed = FAIL === 0;
    const report = {
        generated_at: new Date().toISOString(),
        phase: '73D',
        repo: 'ppos-control-plane',
        smoke_passed: smokePassed,
        summary: { total: PASS + FAIL, passed: PASS, failed: FAIL },
        results
    };

    fs.writeFileSync(path.join(reportsDir, 'phase73d_control_plane_machine_assignment_gate.json'), JSON.stringify(report, null, 2));

    console.log(`\nResults: ${PASS}/${PASS + FAIL} passed`);
    Module.prototype.require = originalRequire;
    process.exit(smokePassed ? 0 : 1);
}

runTests().catch(e => {
    console.error('Test suite failed:', e);
    Module.prototype.require = originalRequire;
    process.exit(1);
});
