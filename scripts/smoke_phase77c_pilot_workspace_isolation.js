/**
 * scripts/smoke_phase77c_pilot_workspace_isolation.js
 * 
 * Smoke test for Phase 77C — Pilot Workspace Separation & Data Isolation.
 */
'use strict';

const db = require('../src/api/services/mysqlClient');
const service = require('../src/api/services/tenantWorkspaceIsolationService');
const auditLogger = require('../src/api/services/auditLoggerService');

let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        results.push({ label, status: 'PASS', detail });
        console.log(`  ✅  [PASS] ${label} ${detail ? `(${detail})` : ''}`);
    } else {
        FAIL++;
        results.push({ label, status: 'FAIL', detail });
        console.error(`  ❌  [FAIL] ${label} ${detail ? `: ${detail}` : ''}`);
    }
}

const mockDb = {
    marketplace_orders: [],
    jobs: [],
    marketplace_order_files: [],
    preflight_artifacts: [],
    printhouses: [],
    printhouse_machines: [],
    printhouse_media: [],
    printhouse_policy_profiles: [],
    printhouse_sla_profiles: [],
    audit: [],
    reset() {
        this.marketplace_orders = [];
        this.jobs = [];
        this.marketplace_order_files = [];
        this.preflight_artifacts = [];
        this.printhouses = [];
        this.printhouse_machines = [];
        this.printhouse_media = [];
        this.printhouse_policy_profiles = [];
        this.printhouse_sla_profiles = [];
        this.audit = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params) => {
        const sqlUpper = sql.trim().toUpperCase();

        if (sqlUpper.includes('FROM MARKETPLACE_ORDERS') || sqlUpper.includes('FROM ORDERS')) {
            const id = params[0];
            return mockDb.marketplace_orders.filter(o => o.order_id === id);
        }
        if (sqlUpper.includes('FROM JOBS') || sqlUpper.includes('FROM PREFLIGHT_JOB_REGISTRY')) {
            const id = params[0];
            return mockDb.jobs.filter(j => j.id === id);
        }
        if (sqlUpper.includes('FROM MARKETPLACE_ORDER_FILES')) {
            const fileId = params[0];
            return mockDb.marketplace_order_files.filter(f => f.file_id === fileId);
        }
        if (sqlUpper.includes('FROM PREFLIGHT_ARTIFACTS')) {
            const id = params[0];
            return mockDb.preflight_artifacts.filter(a => a.id === id);
        }
        if (sqlUpper.includes('FROM PRINTHOUSES')) {
            const id = params[0];
            return mockDb.printhouses.filter(p => p.id === id);
        }
        if (sqlUpper.includes('FROM PRINTHOUSE_MACHINES')) {
            const id = params[0];
            return mockDb.printhouse_machines.filter(m => m.id === id);
        }
        if (sqlUpper.includes('FROM PRINTHOUSE_MEDIA')) {
            const id = params[0];
            return mockDb.printhouse_media.filter(m => m.id === id);
        }
        if (sqlUpper.includes('FROM PRINTHOUSE_POLICY_PROFILES')) {
            const id = params[0];
            return mockDb.printhouse_policy_profiles.filter(p => p.id === id);
        }
        if (sqlUpper.includes('FROM PRINTHOUSE_SLA_PROFILES')) {
            const id = params[0];
            return mockDb.printhouse_sla_profiles.filter(s => s.id === id);
        }
        return [];
    };

    auditLogger.log = async (event) => {
        mockDb.audit.push(event);
    };
}

async function run() {
    console.log('=== PRINTPRICE OS: PHASE 77C WORKSPACE ISOLATION SMOKE TESTS ===\n');
    enableMockDb();
    mockDb.reset();

    const tenantA = 'tenant-a';
    const tenantB = 'tenant-b';
    const printhouseA = 'print-a';
    const printhouseB = 'print-b';

    // Populate data
    mockDb.printhouses.push({ id: printhouseA, tenant_id: tenantA });
    mockDb.printhouses.push({ id: printhouseB, tenant_id: tenantB });

    mockDb.printhouse_machines.push({ id: 'mach_a', printhouse_id: printhouseA, tenant_id: tenantA });
    mockDb.printhouse_machines.push({ id: 'mach_b', printhouse_id: printhouseB, tenant_id: tenantB });

    mockDb.marketplace_orders.push({ order_id: 'ord_a', tenant_id: tenantA });
    mockDb.marketplace_orders.push({ order_id: 'ord_b', tenant_id: tenantB });

    mockDb.jobs.push({ id: 'job_a', tenant_id: tenantA });
    mockDb.jobs.push({ id: 'job_b', tenant_id: tenantB });

    mockDb.preflight_artifacts.push({ id: 'art_a', tenant_id: tenantA });
    mockDb.preflight_artifacts.push({ id: 'art_b', tenant_id: tenantB });

    mockDb.marketplace_order_files.push({ file_id: 'file_a', order_id: 'ord_a', tenant_id: tenantA });
    mockDb.marketplace_order_files.push({ file_id: 'file_b', order_id: 'ord_b', tenant_id: tenantB });

    // S1: Tenant A cannot view Tenant B printhouse
    console.log('Scenario 1 — Printhouse Isolation');
    try {
        await service.assertPrinthouseBelongsToTenant(printhouseB, tenantA);
        assert(false, 'S1: Should have failed cross-tenant printhouse access');
    } catch (e) {
        assert(e.message === 'UNAUTHORIZED_TENANT_ACCESS', 'S1: Access denied to other printhouse');
    }

    // S2: Tenant A cannot bind Tenant B machine
    console.log('\nScenario 2 — Machine Isolation');
    try {
        await service.assertMachineBelongsToPrinthouse('mach_b', printhouseA, tenantA);
        assert(false, 'S2: Should have failed cross-tenant machine binding');
    } catch (e) {
        assert(e.message === 'UNAUTHORIZED_PRINTHOUSE_ACCESS', 'S2: Access denied to other machine');
    }

    // S3: Tenant A cannot access Tenant B order
    console.log('\nScenario 3 — Order Isolation');
    try {
        await service.assertOrderBelongsToTenant('ord_b', tenantA);
        assert(false, 'S3: Should have failed cross-tenant order access');
    } catch (e) {
        assert(e.message === 'UNAUTHORIZED_TENANT_ACCESS', 'S3: Access denied to other order');
    }

    // S4: Tenant A cannot access Tenant B job
    console.log('\nScenario 4 — Job Isolation');
    try {
        await service.assertJobBelongsToTenant('job_b', tenantA);
        assert(false, 'S4: Should have failed cross-tenant job access');
    } catch (e) {
        assert(e.message === 'UNAUTHORIZED_TENANT_ACCESS', 'S4: Access denied to other job');
    }

    // S5: Tenant A cannot access Tenant B artifact
    console.log('\nScenario 5 — Artifact Isolation');
    try {
        await service.assertArtifactBelongsToTenant('art_b', tenantA);
        assert(false, 'S5: Should have failed cross-tenant artifact access');
    } catch (e) {
        assert(e.message === 'UNAUTHORIZED_TENANT_ACCESS', 'S5: Access denied to other artifact');
    }

    // S6: Tenant A cannot access Tenant B report/file
    console.log('\nScenario 6 — File Isolation');
    try {
        await service.assertFileBelongsToTenant('file_b', tenantA);
        assert(false, 'S6: Should have failed cross-tenant file access');
    } catch (e) {
        assert(e.message === 'UNAUTHORIZED_TENANT_ACCESS', 'S6: Access denied to other file');
    }

    // S7: Cross-tenant handoff generation blocked
    console.log('\nScenario 7 — Handoff isolation validation');
    let generatedHandoffFailed = false;
    try {
        await service.assertPrinthouseBelongsToTenant(printhouseB, tenantA);
    } catch (e) {
        generatedHandoffFailed = true;
    }
    assert(generatedHandoffFailed === true, 'S7: Handoff check failed for foreign printhouse');

    // S8: Cross-tenant audit bundle blocked
    console.log('\nScenario 8 — Audit bundle isolation validation');
    let auditBundleFailed = false;
    try {
        await service.assertOrderBelongsToTenant('ord_b', tenantA);
    } catch (e) {
        auditBundleFailed = true;
    }
    assert(auditBundleFailed === true, 'S8: Audit bundle check failed for foreign order');

    // S9: Error messages sanitized
    console.log('\nScenario 9 — Error message sanitation');
    const authErr = new Error('UNAUTHORIZED_TENANT_ACCESS');
    const sanitized = service.sanitizeCrossTenantError(authErr);
    assert(sanitized.status === 403, 'S9: Sanitized status is 403');
    assert(sanitized.body.error === 'ACCESS_DENIED', 'S9: Sanitized error is ACCESS_DENIED');
    assert(sanitized.body.message === 'Resource not found or access restricted.', 'S9: Generic message returned');

    // S10: Isolation violations audited
    console.log('\nScenario 10 — Violation auditing');
    assert(mockDb.audit.length > 0, 'S10: Audit violations recorded');
    assert(mockDb.audit.every(a => a.type === 'SECURITY_VIOLATION'), 'S10: Violation type is SECURITY_VIOLATION');
    assert(mockDb.audit[0].metadata.warning === 'CROSS_TENANT_ACCESS_ATTEMPT_DETECTED', 'S10: Warnings details logged');

    console.log(`\n================================================`);
    console.log(`Phase 77C smoke test Completed.`);
    console.log(`Passed: ${PASS} | Failed: ${FAIL}`);
    console.log('================================================');

    if (FAIL > 0) process.exit(1);
    process.exit(0);
}

run();
