/**
 * scripts/smoke_phase78a_commercial_plan_schema_entitlements.js
 * 
 * Smoke test for Phase 78A — Commercial Plan Schema & Entitlements.
 */
'use strict';

const db = require('../src/api/services/mysqlClient');
const service = require('../src/api/services/commercialPlanService');

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
    plans: [],
    entitlements: [],
    audit: [],
    tenants: [],
    reset() {
        this.plans = [];
        this.entitlements = [];
        this.audit = [];
        this.tenants = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params) => {
        const sqlUpper = sql.trim().toUpperCase();

        if (sqlUpper.startsWith('SELECT * FROM COMMERCIAL_PLANS WHERE PLAN_CODE = ?')) {
            const code = params[0];
            return mockDb.plans.filter(p => p.plan_code === code);
        }

        if (sqlUpper.startsWith('SELECT * FROM COMMERCIAL_PLANS')) {
            return mockDb.plans;
        }

        if (sqlUpper.startsWith('SELECT * FROM TENANT_COMMERCIAL_ENTITLEMENTS WHERE TENANT_ID = ?')) {
            const tenantId = params[0];
            return mockDb.entitlements.filter(e => e.tenant_id === tenantId);
        }

        if (sqlUpper.startsWith('SELECT * FROM TENANTS WHERE ID = ?')) {
            const tenantId = params[0];
            return mockDb.tenants.filter(t => t.id === tenantId);
        }

        if (sqlUpper.startsWith('INSERT INTO COMMERCIAL_PLANS')) {
            // Very basic parser for inserts
            const plan_code = params[0];
            const plan_name = params[1];
            const status = params[2];
            const billing_mode = params[3];
            const base_currency = params[4];
            const monthly_base_price_cents = params[5];
            const included_jobs_monthly = params[6];
            const included_preflight_jobs_monthly = params[7];
            const included_autofix_jobs_monthly = params[8];
            const included_storage_gb = params[9];
            const included_bandwidth_gb = params[10];
            const max_file_size_mb = params[11];
            const max_job_file_size_mb = params[12];
            const max_monthly_orders = params[13];
            const max_daily_jobs = params[14];
            const max_concurrent_jobs = params[15];
            const max_team_users = params[16];
            const max_printhouses = params[17];
            const allow_large_uploads = params[18];
            const allow_api_access = params[19];
            const allow_white_label = params[20];
            const allow_priority_queue = params[21];
            const allow_machine_assignment = params[22];
            const allow_audit_bundle_export = params[23];
            const allow_partner_onboarding = params[24];
            const allow_commercial_handoff = params[25];
            const overage_policy_json = params[26] ? JSON.parse(params[26]) : null;
            const feature_flags_json = params[27] ? JSON.parse(params[27]) : null;
            const metadata_json = params[28] ? JSON.parse(params[28]) : null;

            const existingIdx = mockDb.plans.findIndex(p => p.plan_code === plan_code);
            const planRow = {
                plan_code, plan_name, status, billing_mode, base_currency, monthly_base_price_cents,
                included_jobs_monthly, included_preflight_jobs_monthly, included_autofix_jobs_monthly,
                included_storage_gb, included_bandwidth_gb, max_file_size_mb, max_job_file_size_mb,
                max_monthly_orders, max_daily_jobs, max_concurrent_jobs, max_team_users, max_printhouses,
                allow_large_uploads, allow_api_access, allow_white_label, allow_priority_queue,
                allow_machine_assignment, allow_audit_bundle_export, allow_partner_onboarding, allow_commercial_handoff,
                overage_policy_json, feature_flags_json, metadata_json
            };

            if (existingIdx !== -1) {
                mockDb.plans[existingIdx] = planRow;
            } else {
                mockDb.plans.push(planRow);
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('INSERT INTO TENANT_COMMERCIAL_ENTITLEMENTS')) {
            const tenant_id = params[0];
            const plan_code = params[1];
            const plan_id = params[2];
            const entitlement_status = params[3];
            const billing_status = params[4];
            const current_period_start = params[5];
            const current_period_end = params[6];
            const usage_enforcement_enabled = params[7];
            const overage_enabled = params[8];
            const hard_limit_enforcement = params[9];
            const soft_limit_warnings = params[10];

            const existingIdx = mockDb.entitlements.findIndex(e => e.tenant_id === tenant_id);
            const entRow = {
                tenant_id, plan_code, plan_id, entitlement_status, billing_status,
                current_period_start, current_period_end, usage_enforcement_enabled,
                overage_enabled, hard_limit_enforcement, soft_limit_warnings
            };

            if (existingIdx !== -1) {
                mockDb.entitlements[existingIdx] = { ...mockDb.entitlements[existingIdx], ...entRow };
            } else {
                mockDb.entitlements.push(entRow);
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('UPDATE TENANT_COMMERCIAL_ENTITLEMENTS SET CUSTOM_LIMIT_JSON =') || 
            sqlUpper.startsWith('UPDATE TENANT_COMMERCIAL_ENTITLEMENTS SET CUSTOM_LIMITS_JSON =')) {
            const val = params[0];
            const tenantId = params[1];
            const row = mockDb.entitlements.find(e => e.tenant_id === tenantId);
            if (row) {
                row.custom_limits_json = val;
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('UPDATE TENANT_COMMERCIAL_ENTITLEMENTS SET BILLING_STATUS = ?')) {
            const status = params[0];
            const tenantId = params[1];
            const row = mockDb.entitlements.find(e => e.tenant_id === tenantId);
            if (row) {
                row.billing_status = status;
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('UPDATE TENANT_COMMERCIAL_ENTITLEMENTS SET ENTITLEMENT_SNAPSHOT_JSON = ?')) {
            const snapshot = params[0];
            const tenantId = params[1];
            const row = mockDb.entitlements.find(e => e.tenant_id === tenantId);
            if (row) {
                row.entitlement_snapshot_json = snapshot;
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('INSERT INTO TENANT_PLAN_AUDIT')) {
            mockDb.audit.push(params);
            return { insertId: 1 };
        }

        return [];
    };
}

async function runTests() {
    console.log('Starting Phase 78A Smoke Tests...');
    enableMockDb();

    // Setup: Default Plans
    const plansSetup = [
        { plan_code: 'FREE', plan_name: 'Free Starter', max_file_size_mb: 25, included_preflight_jobs_monthly: 5, allow_large_uploads: 0, allow_commercial_handoff: 0 },
        { plan_code: 'PRO', plan_name: 'Professional', max_file_size_mb: 150, included_preflight_jobs_monthly: 50, allow_large_uploads: 0, allow_commercial_handoff: 0 },
        { plan_code: 'PILOT', plan_name: 'Partner Pilot', max_file_size_mb: 2048, max_monthly_orders: 50, max_daily_jobs: 25, included_storage_gb: 50, allow_partner_onboarding: 1, allow_commercial_handoff: 1 },
        { plan_code: 'SYSTEM', plan_name: 'System Infrastructure', max_file_size_mb: 5120, allow_large_uploads: 1, allow_commercial_handoff: 1 }
    ];

    for (const p of plansSetup) {
        await service.createOrUpdateCommercialPlan(p);
    }

    // Scenario 1: Default plans exist
    const planList = await service.listCommercialPlans();
    assert(planList.length >= 4, 'Scenario 1: Default plans exist', `Found ${planList.length} plans`);

    // Scenario 2: Assign PILOT plan to tenant
    const tenantId = 'tenant_pilot_01';
    await service.assignPlanToTenant({ tenantId, planCode: 'PILOT', actor: { userId: 'admin_1', role: 'SUPER_ADMIN' } });
    const ent = await service.getTenantEntitlement({ tenantId });
    assert(ent && ent.plan_code === 'PILOT', 'Scenario 2: Assign PILOT plan to tenant', `Assigned: ${ent?.plan_code}`);

    // Scenario 3: Evaluate entitlement
    const evalRes = await service.evaluateTenantEntitlement({ tenantId });
    assert(evalRes.plan_code === 'PILOT' && evalRes.limits.max_daily_jobs === 25, 'Scenario 3: Evaluate entitlement', `Daily jobs limit: ${evalRes.limits.max_daily_jobs}`);

    // Scenario 4: Missing entitlement fails closed
    const fakeTenant = 'tenant_fake_99';
    const fakeEval = await service.evaluateTenantEntitlement({ tenantId: fakeTenant });
    assert(fakeEval.plan_code === 'NONE' && fakeEval.blocking_reasons.includes('MISSING_ENTITLEMENT'), 'Scenario 4: Missing entitlement fails closed', `Plan: ${fakeEval.plan_code}`);

    // Scenario 5: SYSTEM tenant bypasses billing but not governance
    mockDb.tenants.push({ id: 'system_tenant_01', plan_code: 'SYSTEM' });
    const systemEval = await service.evaluateTenantEntitlement({ tenantId: 'system_tenant_01' });
    assert(systemEval.plan_code === 'SYSTEM' && systemEval.limits.max_file_size_mb === 5120, 'Scenario 5: SYSTEM tenant bypasses billing', `Limits MB: ${systemEval.limits.max_file_size_mb}`);

    // Scenario 6: Billing status BLOCKED blocks billable usage
    await service.updateTenantBillingStatus({ tenantId, billingStatus: 'BLOCKED', actor: { userId: 'admin_1', role: 'SUPER_ADMIN' } });
    const blockedEval = await service.evaluateTenantEntitlement({ tenantId });
    assert(blockedEval.blocking_reasons.includes('BILLING_BLOCKED'), 'Scenario 6: Billing status BLOCKED blocks usage', `Blocking: ${blockedEval.blocking_reasons.join(', ')}`);

    // Reset billing status to ACTIVE for further testing
    await service.updateTenantBillingStatus({ tenantId, billingStatus: 'ACTIVE', actor: { userId: 'admin_1', role: 'SUPER_ADMIN' } });

    // Scenario 7: commercial_live_enabled default false
    assert(evalRes.commercial_live_enabled === false, 'Scenario 7: commercial_live_enabled default false', `Live status: ${evalRes.commercial_live_enabled}`);

    // Scenario 8: Plan assignment audited
    assert(mockDb.audit.length >= 2, 'Scenario 8: Plan assignment audited', `Audit entries: ${mockDb.audit.length}`);

    // Scenario 9: Custom limits override plan limits
    await db.query('UPDATE tenant_commercial_entitlements SET custom_limits_json = ? WHERE tenant_id = ?', [
        JSON.stringify({ max_file_size_mb: 9999 }), tenantId
    ]);
    const overriddenEval = await service.evaluateTenantEntitlement({ tenantId });
    assert(overriddenEval.limits.max_file_size_mb === 9999, 'Scenario 9: Custom limits override plan limits', `Overridden MB: ${overriddenEval.limits.max_file_size_mb}`);

    // Scenario 10: Large upload allowed only by eligible plans
    const freeEval = await service.evaluateTenantEntitlement({ tenantId: 'free_tenant_no_ent' }); // will fail closed, allow_large_uploads=false
    assert(freeEval.features.allow_large_uploads === false && systemEval.features.allow_large_uploads === true, 'Scenario 10: Large upload allowed only by eligible plans');

    // Scenario 11: Commercial handoff allowed only by eligible plans
    const pilotEval = await service.evaluateTenantEntitlement({ tenantId }); // PILOT has commercial handoff true
    assert(pilotEval.features.allow_commercial_handoff === true && freeEval.features.allow_commercial_handoff === false, 'Scenario 11: Commercial handoff allowed by eligible plans');

    // Scenario 12: No plan implies production readiness
    assert(!pilotEval.commercial_live_enabled, 'Scenario 12: No plan implies production readiness');

    console.log(`\nPhase 78A Test Results: PASS: ${PASS}, FAIL: ${FAIL}`);
    if (FAIL > 0) {
        process.exit(1);
    }
}

runTests().catch(e => {
    console.error('Smoke tests crashed:', e);
    process.exit(1);
});
