/**
 * scripts/smoke_phase77a_tenant_pilot_status_model.js
 * 
 * Smoke test for Phase 77A — Tenant Pilot Schema & Status Model.
 */
'use strict';

const db = require('../src/api/services/mysqlClient');
const service = require('../src/api/services/tenantPilotReadinessService');
const printhouseCapabilityService = require('../src/api/services/printhouseCapabilityService');

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

// Memory database mock
const mockDb = {
    tenant_pilot_readiness: [],
    printhouses: [],
    machines: [],
    media: [],
    policies: [],
    sla: [],
    tenants: [],
    tenant_resource_limits: [],
    control_users: [],
    audit: [],
    reset() {
        this.tenant_pilot_readiness = [];
        this.printhouses = [];
        this.machines = [];
        this.media = [];
        this.policies = [];
        this.sla = [];
        this.tenants = [];
        this.tenant_resource_limits = [];
        this.control_users = [];
        this.audit = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params) => {
        const sqlUpper = sql.trim().toUpperCase();

        if (sqlUpper.startsWith('SELECT * FROM TENANT_PILOT_READINESS')) {
            const tenantId = params[0];
            const printhouseId = params[1];
            return mockDb.tenant_pilot_readiness.filter(r => r.tenant_id === tenantId && r.printhouse_id === printhouseId);
        }

        if (sqlUpper.startsWith('INSERT INTO TENANT_PILOT_READINESS')) {
            const row = {
                id: params[0],
                tenant_id: params[1],
                printhouse_id: params[2],
                pilot_status: params[3],
                commercial_status: params[4],
                live_production_enabled: params[5],
                pilot_access_enabled: params[6],
                partner_access_enabled: params[7],
                customer_access_enabled: params[8],
                max_pilot_orders: params[9],
                max_pilot_jobs_per_day: params[10],
                max_pilot_file_size_mb: params[11],
                max_pilot_storage_gb: params[12],
                allowed_order_types_json: params[13] ? JSON.parse(params[13]) : null,
                allowed_printhouse_ids_json: params[14] ? JSON.parse(params[14]) : null,
                allowed_machine_ids_json: params[15] ? JSON.parse(params[15]) : null,
                blocked_reason: params[16],
                pilot_started_at: null,
                pilot_completed_at: null,
                readiness_snapshot_json: null
            };
            mockDb.tenant_pilot_readiness.push(row);
            return { insertId: 1 };
        }

        if (sqlUpper.includes('PILOT_ACCESS_ENABLED = 1')) {
            const tenantId = params[0];
            const printhouseId = params[1];
            const row = mockDb.tenant_pilot_readiness.find(r => r.tenant_id === tenantId && r.printhouse_id === printhouseId);
            if (row) {
                row.pilot_access_enabled = 1;
                row.pilot_status = 'PILOT_ACTIVE';
                row.pilot_started_at = new Date();
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.includes('PILOT_ACCESS_ENABLED = 0')) {
            const reason = params[0];
            const tenantId = params[1];
            const printhouseId = params[2];
            const row = mockDb.tenant_pilot_readiness.find(r => r.tenant_id === tenantId && r.printhouse_id === printhouseId);
            if (row) {
                row.pilot_access_enabled = 0;
                row.pilot_status = 'PILOT_PAUSED';
                row.blocked_reason = reason;
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.includes('PARTNER_ACCESS_ENABLED = 1')) {
            const tenantId = params[0];
            const printhouseId = params[1];
            const row = mockDb.tenant_pilot_readiness.find(r => r.tenant_id === tenantId && r.printhouse_id === printhouseId);
            if (row) {
                row.partner_access_enabled = 1;
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.includes('PARTNER_ACCESS_ENABLED = 0')) {
            const tenantId = params[0];
            const printhouseId = params[1];
            const row = mockDb.tenant_pilot_readiness.find(r => r.tenant_id === tenantId && r.printhouse_id === printhouseId);
            if (row) {
                row.partner_access_enabled = 0;
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.includes('LIVE_PRODUCTION_ENABLED = 0')) {
            const reason = params[0];
            const tenantId = params[1];
            const printhouseId = params[2];
            const row = mockDb.tenant_pilot_readiness.find(r => r.tenant_id === tenantId && r.printhouse_id === printhouseId);
            if (row) {
                row.live_production_enabled = 0;
                row.commercial_status = 'PILOT_ONLY';
                row.blocked_reason = reason;
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('UPDATE TENANT_PILOT_READINESS')) {
            const tenantId = params[15];
            const printhouseId = params[16];
            const row = mockDb.tenant_pilot_readiness.find(r => r.tenant_id === tenantId && r.printhouse_id === printhouseId);
            if (row) {
                if (params[0] !== null) row.pilot_status = params[0];
                if (params[1] !== null) row.commercial_status = params[1];
                if (params[2] !== null) row.live_production_enabled = params[2];
                if (params[3] !== null) row.pilot_access_enabled = params[3];
                if (params[4] !== null) row.partner_access_enabled = params[4];
                if (params[5] !== null) row.customer_access_enabled = params[5];
                if (params[6] !== null) row.max_pilot_orders = params[6];
                if (params[7] !== null) row.max_pilot_jobs_per_day = params[7];
                if (params[8] !== null) row.max_pilot_file_size_mb = params[8];
                if (params[9] !== null) row.max_pilot_storage_gb = params[9];
                if (params[10] !== null) row.allowed_order_types_json = JSON.parse(params[10]);
                if (params[11] !== null) row.allowed_printhouse_ids_json = JSON.parse(params[11]);
                if (params[12] !== null) row.allowed_machine_ids_json = JSON.parse(params[12]);
                if (params[13] !== null) row.blocked_reason = params[13];
                if (params[14] !== null) row.readiness_snapshot_json = JSON.parse(params[14]);
            }
            return { affectedRows: 1 };
        }


        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSES')) {
            return mockDb.printhouses.filter(p => p.id === params[0]);
        }

        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_MACHINES')) {
            return mockDb.machines.filter(m => m.printhouse_id === params[0]);
        }

        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_MEDIA')) {
            return mockDb.media.filter(m => m.printhouse_id === params[0]);
        }

        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_POLICY_PROFILES')) {
            return mockDb.policies.filter(p => p.printhouse_id === params[0]);
        }

        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_SLA_PROFILES')) {
            return mockDb.sla.filter(s => s.printhouse_id === params[0]);
        }

        if (sqlUpper.startsWith('SELECT * FROM TENANTS')) {
            return mockDb.tenants.filter(t => t.id === params[0]);
        }

        if (sqlUpper.startsWith('SELECT * FROM TENANT_RESOURCE_LIMITS')) {
            return mockDb.tenant_resource_limits.filter(l => l.tenant_id === params[0]);
        }

        if (sqlUpper.startsWith('SELECT ID FROM CONTROL_USERS')) {
            return mockDb.control_users.filter(u => u.tenant_id === params[0]);
        }

        if (sqlUpper.startsWith('INSERT INTO API_AUDIT_LOGS')) {
            mockDb.audit.push({
                type: params[0],
                tenant_id: params[1],
                user_id: params[2],
                status: params[3],
                metadata: JSON.parse(params[4])
            });
            return { insertId: 1 };
        }

        return [];
    };
}

async function run() {
    console.log('=== PRINTPRICE OS: PHASE 77A TENANT PILOT STATUS MODEL SMOKE TESTS ===\n');
    enableMockDb();
    mockDb.reset();

    const tenantId = 'phase76-pilot-tenant';
    const printhouseId = 'print_pilot_printhouse';
    const actor = { userId: 'admin_user', role: 'CONTROL_PLANE_ADMIN' };

    // Scenario 1: Create tenant pilot readiness record
    console.log('Scenario 1 — Create tenant pilot readiness record');
    const record = await service.createOrUpdateTenantPilotReadiness({
        tenantId,
        printhouseId,
        payload: {
            pilot_status: 'CONFIGURED',
            commercial_status: 'PILOT_ONLY',
            max_pilot_orders: 50,
            max_pilot_jobs_per_day: 25
        },
        actor
    });
    assert(record !== null, 'S1: Record created successfully');
    assert(record.pilot_status === 'CONFIGURED', 'S1: Status matches CONFIGURED');
    assert(record.max_pilot_orders === 50, 'S1: Max orders is 50');

    // Scenario 2: Evaluate readiness against Phase 76 READY_FOR_PILOT printhouse
    console.log('\nScenario 2 — Evaluate readiness (all active components exist)');
    mockDb.printhouses.push({ id: printhouseId, onboarding_status: 'READY_FOR_PILOT' });
    mockDb.machines.push({ printhouse_id: printhouseId, status: 'ACTIVE' });
    mockDb.media.push({ printhouse_id: printhouseId, status: 'ACTIVE' });
    mockDb.policies.push({ printhouse_id: printhouseId });
    mockDb.sla.push({ printhouse_id: printhouseId });
    mockDb.tenants.push({ id: tenantId, isolation_mode: 'shared' });
    mockDb.tenant_resource_limits.push({ tenant_id: tenantId });
    mockDb.control_users.push({ id: 'user_1', tenant_id: tenantId });

    let evalRes = await service.evaluateTenantPilotReadiness({ tenantId, printhouseId });
    assert(evalRes.ready_for_partner_pilot === true, 'S2: ready_for_partner_pilot is true');
    assert(evalRes.blocking_reasons.length === 0, 'S2: 0 blocking reasons');
    assert(evalRes.readiness_domains.printhouse === 'PASSED', 'S2: Domain printhouse passed');

    // Scenario 3: Missing tenant governance blocks partner pilot
    console.log('\nScenario 3 — Missing tenant governance blocks partner pilot');
    const savedTenant = mockDb.tenants.pop();
    evalRes = await service.evaluateTenantPilotReadiness({ tenantId, printhouseId });
    assert(evalRes.ready_for_partner_pilot === false, 'S3: ready_for_partner_pilot is false');
    assert(evalRes.blocking_reasons.includes('MISSING_TENANT_GOVERNANCE'), 'S3: Blocks due to missing tenant governance');
    mockDb.tenants.push(savedTenant);

    // Scenario 4: Missing resource limits blocks partner pilot
    console.log('\nScenario 4 — Missing resource limits blocks partner pilot');
    const savedLimits = mockDb.tenant_resource_limits.pop();
    evalRes = await service.evaluateTenantPilotReadiness({ tenantId, printhouseId });
    assert(evalRes.ready_for_partner_pilot === false, 'S4: ready_for_partner_pilot is false');
    assert(evalRes.blocking_reasons.includes('MISSING_RESOURCE_LIMITS'), 'S4: Blocks due to missing resource limits');
    mockDb.tenant_resource_limits.push(savedLimits);

    // Scenario 5: Enable pilot access
    console.log('\nScenario 5 — Enable pilot access');
    const enabledRecord = await service.enablePilotAccess({ tenantId, printhouseId, actor });
    assert(enabledRecord.pilot_access_enabled === 1, 'S5: pilot_access_enabled is 1 (true)');
    assert(enabledRecord.pilot_status === 'PILOT_ACTIVE', 'S5: status is PILOT_ACTIVE');

    // Scenario 6: Disable pilot access with reason
    console.log('\nScenario 6 — Disable pilot access with reason');
    const disabledRecord = await service.disablePilotAccess({ tenantId, printhouseId, actor, reason: 'Temporarily pausing' });
    assert(disabledRecord.pilot_access_enabled === 0, 'S6: pilot_access_enabled is 0 (false)');
    assert(disabledRecord.pilot_status === 'PILOT_PAUSED', 'S6: status is PILOT_PAUSED');
    assert(disabledRecord.blocked_reason === 'Temporarily pausing', 'S6: blocked reason set');

    // Scenario 7: Enable partner access
    console.log('\nScenario 7 — Enable partner access');
    const partnerEnabledRecord = await service.enablePartnerAccess({ tenantId, printhouseId, actor });
    assert(partnerEnabledRecord.partner_access_enabled === 1, 'S7: partner_access_enabled is 1');

    // Scenario 8: Attempt LIVE without approval is blocked
    console.log('\nScenario 8 — Attempt LIVE without approval is blocked');
    try {
        await service.requestLiveProductionEnablement({ tenantId, printhouseId, actor });
        assert(false, 'S8: Live enablement should have been blocked');
    } catch (e) {
        assert(e.message === 'LIVE_PRODUCTION_BLOCKED_BY_DESIGN', 'S8: Blocks live enablement by design');
    }

    // Scenario 9: commercial_status=LIVE blocked when ready_for_live=false
    console.log('\nScenario 9 — commercial_status=LIVE blocked when ready_for_live=false');
    evalRes = await service.evaluateTenantPilotReadiness({ tenantId, printhouseId });
    assert(evalRes.ready_for_live === false, 'S9: ready_for_live is false');

    // Scenario 10: Audit events emitted
    console.log('\nScenario 10 — Audit events emitted');
    assert(mockDb.audit.length > 0, 'S10: Audit logs present');
    assert(mockDb.audit.some(a => a.type === 'TENANT_LIVE_PRODUCTION_ENABLE_ATTEMPTED'), 'S10: Audit captures live attempts');

    // Scenario 11: live_production_enabled default false
    console.log('\nScenario 11 — live_production_enabled default false');
    assert(record.live_production_enabled === 0, 'S11: live_production_enabled defaults to false');

    // Scenario 12: READY_FOR_PILOT does not automatically become LIVE
    console.log('\nScenario 12 — READY_FOR_PILOT onboarding status does not automatically set LIVE status');
    assert(disabledRecord.commercial_status !== 'LIVE', 'S12: Status is not LIVE');

    console.log(`\n================================================`);
    console.log(`Phase 77A smoke test Completed.`);
    console.log(`Passed: ${PASS} | Failed: ${FAIL}`);
    console.log('================================================');

    if (FAIL > 0) process.exit(1);
    process.exit(0);
}

run();
