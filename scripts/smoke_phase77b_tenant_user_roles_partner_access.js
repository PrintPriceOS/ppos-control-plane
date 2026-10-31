/**
 * scripts/smoke_phase77b_tenant_user_roles_partner_access.js
 * 
 * Smoke test for Phase 77B — Tenant User Roles / Partner Access Control.
 */
'use strict';

const db = require('../src/api/services/mysqlClient');
const service = require('../src/api/services/tenantPilotAccessService');
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
    audit: [],
    reset() {
        this.audit = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params) => {
        return [];
    };
    auditLogger.log = async (event) => {
        mockDb.audit.push(event);
    };
}

async function run() {
    console.log('=== PRINTPRICE OS: PHASE 77B TENANT USER ROLES SMOKE TESTS ===\n');
    enableMockDb();
    mockDb.reset();

    const tenantA = 'tenant-a';
    const tenantB = 'tenant-b';
    const printhouseA = 'print-a';
    const printhouseB = 'print-b';

    const systemAdmin = { userId: 'sys_admin', role: 'SYSTEM_ADMIN', tenantId: 'system', printhouseId: null };
    const controlPlaneAdmin = { userId: 'cp_admin', role: 'CONTROL_PLANE_ADMIN', tenantId: 'system', printhouseId: null };
    const tenantAdminA = { userId: 't_admin_a', role: 'TENANT_ADMIN', tenantId: tenantA, printhouseId: null };
    const printhouseAdminA = { userId: 'ph_admin_a', role: 'PRINTHOUSE_ADMIN', tenantId: tenantA, printhouseId: printhouseA };
    const printhouseOperatorA = { userId: 'ph_op_a', role: 'PRINTHOUSE_OPERATOR', tenantId: tenantA, printhouseId: printhouseA };
    const printhouseViewerA = { userId: 'ph_view_a', role: 'PRINTHOUSE_VIEWER', tenantId: tenantA, printhouseId: printhouseA };
    const customerSupport = { userId: 'support_1', role: 'CUSTOMER_SUPPORT', tenantId: tenantA, printhouseId: null };
    const customerUser = { userId: 'customer_1', role: 'CUSTOMER_USER', tenantId: tenantA, printhouseId: null };

    // S1: SYSTEM_ADMIN can manage all
    console.log('Scenario 1 — SYSTEM_ADMIN permissions');
    assert(service.canManagePilotReadiness(systemAdmin, tenantA) === true, 'S1: Can manage pilot readiness');
    assert(service.canManagePrinthouseCapabilities(systemAdmin, printhouseA) === true, 'S1: Can manage printhouse capabilities');

    // S2: TENANT_ADMIN limited to own tenant
    console.log('\nScenario 2 — TENANT_ADMIN permissions');
    assert(service.assertTenantScope(tenantAdminA, tenantA) === true, 'S2: Scope matches own tenant');
    try {
        service.assertTenantScope(tenantAdminA, tenantB);
        assert(false, 'S2: Should have blocked other tenant access');
    } catch (e) {
        assert(e.message === 'UNAUTHORIZED_TENANT_ACCESS', 'S2: Blocks cross-tenant scope');
    }

    // S3: PRINTHOUSE_ADMIN can manage own printhouse only
    console.log('\nScenario 3 — PRINTHOUSE_ADMIN permissions');
    assert(service.canManagePrinthouseCapabilities(printhouseAdminA, printhouseA) === true, 'S3: Can manage own printhouse');
    assert(service.canManagePrinthouseCapabilities(printhouseAdminA, printhouseB) === false, 'S3: Cannot manage other printhouse');

    // S4: PRINTHOUSE_OPERATOR cannot manage printhouse capabilities
    console.log('\nScenario 4 — PRINTHOUSE_OPERATOR permissions');
    assert(service.canManagePrinthouseCapabilities(printhouseOperatorA, printhouseA) === false, 'S4: Cannot manage capabilities');

    // S5: PRINTHOUSE_OPERATOR can override machine warnings
    console.log('\nScenario 5 — Warning overrides');
    assert(service.canApproveMachineWarningOverride(printhouseOperatorA, 'order_1') === true, 'S5: Can approve machine warnings');

    // S6: PRINTHOUSE_OPERATOR cannot approve unsafe fixes unless explicitly permitted
    console.log('\nScenario 6 — Unsafe fix approval');
    assert(service.canApproveUnsafeFix(printhouseOperatorA, 'job_1') === false, 'S6: Cannot approve unsafe fix');
    const operatorWithUnsafePermission = { ...printhouseOperatorA, allow_unsafe_fix: true };
    assert(service.canApproveUnsafeFix(operatorWithUnsafePermission, 'job_1') === true, 'S6: Allowed if explicitly permitted');

    // S7: PRINTHOUSE_VIEWER cannot override or manage
    console.log('\nScenario 7 — PRINTHOUSE_VIEWER permissions');
    assert(service.canApproveMachineWarningOverride(printhouseViewerA, 'order_1') === false, 'S7: Cannot override machine warnings');
    assert(service.canManagePrinthouseCapabilities(printhouseViewerA, printhouseA) === false, 'S7: Cannot manage capabilities');

    // S8 & S9: CUSTOMER_SUPPORT & CUSTOMER_USER payload sanitation
    console.log('\nScenario 8 & 9 — Payload sanitation for customer support/users');
    const payload = {
        id: 'file_1',
        filename: 'interior.pdf',
        machine_snapshot_json: { max_tac: 300 },
        internal_notes: 'Highly critical pages detected',
        cost_details: { base: 100 },
        preflight_raw_details: { xref_rebuilt: true }
    };
    const sanitizedSupport = service.sanitizePayloadForRole(payload, customerSupport);
    assert(sanitizedSupport.filename === 'interior.pdf', 'S8: Retains safe details');
    assert(sanitizedSupport.machine_snapshot_json === undefined, 'S8: Stripped machine_snapshot');
    assert(sanitizedSupport.internal_notes === undefined, 'S8: Stripped internal_notes');

    const sanitizedUser = service.sanitizePayloadForRole(payload, customerUser);
    assert(sanitizedUser.cost_details === undefined, 'S9: Stripped cost_details');
    assert(sanitizedUser.preflight_raw_details === undefined, 'S9: Stripped preflight_raw_details');

    // S10: Cross-tenant access blocked
    console.log('\nScenario 10 — Cross-tenant scope assertion');
    try {
        service.assertTenantScope(customerUser, tenantB);
        assert(false, 'S10: Should have failed cross-tenant check');
    } catch (e) {
        assert(e.message === 'UNAUTHORIZED_TENANT_ACCESS', 'S10: Blocks cross-tenant scope');
    }

    // S11: Operator cannot enable LIVE
    console.log('\nScenario 11 — Live production gating');
    assert(service.canEnableLiveProduction(printhouseOperatorA, tenantA) === false, 'S11: Operator cannot enable LIVE');
    assert(service.canEnableLiveProduction(systemAdmin, tenantA) === true, 'S11: System Admin can enable LIVE');

    // S12: Control Plane admin can manage pilot access
    console.log('\nScenario 12 — Control Plane Admin pilot access');
    assert(service.canManagePilotReadiness(controlPlaneAdmin, tenantA) === true, 'S12: CP Admin can manage pilot');

    // S13: Role payload sanitation works (Operator gets raw data)
    console.log('\nScenario 13 — Operator gets raw details');
    const sanitizedOperator = service.sanitizePayloadForRole(payload, printhouseOperatorA);
    assert(sanitizedOperator.internal_notes !== undefined, 'S13: Operator retains internal notes');

    // S14: Audit event created on denied critical action
    console.log('\nScenario 14 — Audit logs on denied actions');
    await service.logDeniedAction(printhouseOperatorA, 'ENABLE_LIVE_PRODUCTION', 'Operator cannot bypass production gates');
    assert(mockDb.audit.length === 1, 'S14: Audit logged');
    assert(mockDb.audit[0].type === 'AUTH_DENIED', 'S14: Log is AUTH_DENIED');
    assert(mockDb.audit[0].metadata.actionCode === 'ENABLE_LIVE_PRODUCTION', 'S14: Correct action code logged');

    console.log(`\n================================================`);
    console.log(`Phase 77B smoke test Completed.`);
    console.log(`Passed: ${PASS} | Failed: ${FAIL}`);
    console.log('================================================');

    if (FAIL > 0) process.exit(1);
    process.exit(0);
}

run();
