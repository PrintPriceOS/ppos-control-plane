/**
 * scripts/smoke_phase77d_pilot_usage_governance.js
 * 
 * Smoke test for Phase 77D — Pilot Plan Limits / Usage Governance.
 */
'use strict';

const db = require('../src/api/services/mysqlClient');
const service = require('../src/api/services/pilotUsageGovernanceService');
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
    tenant_pilot_readiness: [],
    marketplace_orders_count: 0,
    jobs_count: 0,
    current_storage_bytes: 0,
    overrides_count: 0,
    audit: [],
    reset() {
        this.tenant_pilot_readiness = [];
        this.marketplace_orders_count = 0;
        this.jobs_count = 0;
        this.current_storage_bytes = 0;
        this.overrides_count = 0;
        this.audit = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params) => {
        const sqlUpper = sql.trim().toUpperCase();

        if (sqlUpper.startsWith('SELECT MAX_PILOT_ORDERS')) {
            return mockDb.tenant_pilot_readiness;
        }

        if (sqlUpper.includes('MARKETPLACE_ORDERS') && sqlUpper.includes('UNION ALL')) {
            return [{ count: mockDb.marketplace_orders_count }];
        }

        if (sqlUpper.includes('JOBS') && sqlUpper.includes('UNION ALL') && sqlUpper.includes('PREFLIGHT_JOB_REGISTRY')) {
            return [{ count: mockDb.jobs_count }];
        }

        if (sqlUpper.startsWith('SELECT CURRENT_STORAGE_BYTES FROM PREFLIGHT_TENANT_QUOTAS')) {
            return [{ current_storage_bytes: mockDb.current_storage_bytes }];
        }

        if (sqlUpper.includes('SELECT COUNT(*) AS COUNT FROM PRINTHOUSE_CAPABILITY_AUDIT')) {
            return [{ count: mockDb.overrides_count }];
        }

        if (sqlUpper.startsWith('INSERT INTO PREFLIGHT_TENANT_QUOTAS')) {
            mockDb.jobs_count++;
            return { affectedRows: 1 };
        }

        return [];
    };

    auditLogger.log = async (event) => {
        mockDb.audit.push(event);
    };
}

async function run() {
    console.log('=== PRINTPRICE OS: PHASE 77D PILOT USAGE GOVERNANCE SMOKE TESTS ===\n');
    enableMockDb();
    mockDb.reset();

    const tenantId = 'phase76-pilot-tenant';

    // S1: Default pilot limits applied
    console.log('Scenario 1 — Default limits evaluation');
    let limits = await service.getPilotLimits({ tenantId });
    assert(limits.max_pilot_orders === 50, 'S1: Max orders defaults to 50');
    assert(limits.max_pilot_jobs_per_day === 25, 'S1: Max daily jobs defaults to 25');

    // S2: Tenant override applied
    console.log('\nScenario 2 — Tenant overrides');
    mockDb.tenant_pilot_readiness.push({
        max_pilot_orders: 10,
        max_pilot_jobs_per_day: 5,
        max_pilot_file_size_mb: 500,
        max_pilot_storage_gb: 2
    });
    limits = await service.getPilotLimits({ tenantId });
    assert(limits.max_pilot_orders === 10, 'S2: Overridden orders limits applied');
    assert(limits.max_pilot_jobs_per_day === 5, 'S2: Overridden daily jobs limits applied');

    // S3: File size within max allowed
    console.log('\nScenario 3 — File size within limits');
    let fileRes = await service.evaluatePilotFileSizeLimit({ tenantId, fileSizeBytes: 100 * 1024 * 1024 });
    assert(fileRes.allowed === true, 'S3: 100MB allowed under 500MB max');

    // S4: File size above max blocked
    console.log('\nScenario 4 — File size above limits');
    fileRes = await service.evaluatePilotFileSizeLimit({ tenantId, fileSizeBytes: 600 * 1024 * 1024 });
    assert(fileRes.allowed === false, 'S4: 600MB blocked');

    // S5: Daily jobs within limit allowed
    console.log('\nScenario 5 — Jobs within daily limit');
    mockDb.jobs_count = 3;
    let jobRes = await service.evaluatePilotJobLimit({ tenantId });
    assert(jobRes.allowed === true, 'S5: 3 daily jobs allowed');

    // S6: Daily jobs above limit blocked
    console.log('\nScenario 6 — Jobs above daily limit');
    mockDb.jobs_count = 6;
    jobRes = await service.evaluatePilotJobLimit({ tenantId });
    assert(jobRes.allowed === false, 'S6: 6 daily jobs blocked');

    // S7: Storage above limit blocked
    console.log('\nScenario 7 — Storage above limits');
    mockDb.current_storage_bytes = 3 * 1024 * 1024 * 1024; // 3GB
    let storageRes = await service.evaluatePilotStorageLimit({ tenantId });
    assert(storageRes.allowed === false, 'S7: 3GB storage blocked under 2GB limit');

    // S8: Override count above limit blocked
    console.log('\nScenario 8 — Override limit check');
    mockDb.overrides_count = 12;
    let overrideRes = await service.evaluatePilotOverrideLimit({ tenantId });
    assert(overrideRes.allowed === false, 'S8: 12 daily overrides blocked under 10 limit');

    // S9: Usage counter increments
    console.log('\nScenario 9 — Counter increments');
    const beforeCount = mockDb.jobs_count;
    await service.incrementPilotUsageCounter({ type: 'PREFLIGHT_RUN', tenantId });
    assert(mockDb.jobs_count === beforeCount + 1, 'S9: Jobs count incremented');

    // S10: Daily reset works
    console.log('\nScenario 10 — Daily reset lifecycle');
    const resetRes = await service.resetPilotDailyUsageIfNeeded(tenantId);
    assert(resetRes.ok === true, 'S10: Daily reset lifecycle returned ok');

    // S11: Pilot limits do not become unlimited
    console.log('\nScenario 11 — Pilot limits validity');
    assert(limits.max_pilot_orders !== null && limits.max_pilot_orders !== undefined, 'S11: Limits exist');

    // S12: Audit events emitted
    console.log('\nScenario 12 — Audit logs');
    assert(mockDb.audit.length > 0, 'S12: Audit logs generated for limit exceedances');
    assert(mockDb.audit[0].type === 'TENANT_PILOT_LIMIT_EXCEEDED', 'S12: Log type is TENANT_PILOT_LIMIT_EXCEEDED');

    console.log(`\n================================================`);
    console.log(`Phase 77D smoke test Completed.`);
    console.log(`Passed: ${PASS} | Failed: ${FAIL}`);
    console.log('================================================');

    if (FAIL > 0) process.exit(1);
    process.exit(0);
}

run();
