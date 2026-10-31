/**
 * tests/printer_sync_capability_remediation_test.js
 * 
 * Targeted test suite for Phase 192E: Remediated printerSyncService.js.
 * Proves that printerSyncService separates device authentication from authoritative job status mutations.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

const mockGrants = new Map();

const originalQuery = db.query;
db.query = async function mockQuery(sql, params = []) {
    try {
        return await originalQuery.call(db, sql, params);
    } catch (err) {
        if (err.code !== 'DB_UNCONFIGURED' && !err.message.includes('UNCONFIGURED')) {
            throw err;
        }

        const sqlTrim = sql.trim().toUpperCase();

        if (sqlTrim.includes('PRINTHOUSE_ACTIVATION_GRANTS')) {
            const rows = Array.from(mockGrants.values());
            return rows.filter(r => r.tenant_id === params[0]);
        }

        return [];
    }
};

const printerSyncService = require('../src/api/services/printerSyncService');

const T_DISPATCHABLE_SYNC = 't-sync-disp-1';
const T_NODISPATCH_SYNC = 't-sync-nodisp-2';

async function runTests() {
    console.log('=== Starting printerSyncService.js Capability Remediation Test ===\n');

    mockGrants.clear();

    mockGrants.set(T_DISPATCHABLE_SYNC, {
        tenant_id: T_DISPATCHABLE_SYNC, status: 'ACTIVE', production_dispatch_allowed: 1
    });

    mockGrants.set(T_NODISPATCH_SYNC, {
        tenant_id: T_NODISPATCH_SYNC, status: 'ACTIVE', production_dispatch_allowed: 0
    });

    // 1. Update job status with PRODUCTION_DISPATCH_ALLOWED = 1 (Success)
    const updateOk = await printerSyncService.updateJobStatus(
        { tenant_id: T_DISPATCHABLE_SYNC }, 'pjob-101', 'IN_PRODUCTION'
    );
    assert.strictEqual(updateOk.success, true);
    console.log('✓ Authorized node with PRODUCTION_DISPATCH_ALLOWED=1 successfully updated job status');

    // 2. Update job status with PRODUCTION_DISPATCH_ALLOWED = 0 (Forbidden)
    let noGrantFailed = false;
    try {
        await printerSyncService.updateJobStatus(
            { tenant_id: T_NODISPATCH_SYNC }, 'pjob-102', 'IN_PRODUCTION'
        );
    } catch (e) {
        noGrantFailed = true;
        assert.strictEqual(e.code, 'PRINTHOUSE_CAPABILITY_NOT_GRANTED');
    }
    assert.strictEqual(noGrantFailed, true);
    console.log('✓ Node missing PRODUCTION_DISPATCH_ALLOWED=1 rejected with PRINTHOUSE_CAPABILITY_NOT_GRANTED');

    // 3. Update foreign unassigned job (Forbidden)
    let foreignFailed = false;
    try {
        await printerSyncService.updateJobStatus(
            { tenant_id: T_DISPATCHABLE_SYNC }, 'pjob-foreign-999', 'IN_PRODUCTION'
        );
    } catch (e) {
        foreignFailed = true;
        assert.strictEqual(e.code, 'TELEMETRY_JOB_NOT_ASSIGNED');
    }
    assert.strictEqual(foreignFailed, true);
    console.log('✓ Unassigned/foreign job ID rejected with TELEMETRY_JOB_NOT_ASSIGNED');

    console.log('\nprinterSyncService Capability Remediation Test Passed Successfully!');
}

runTests().catch(err => {
    console.error('printerSync remediation test failed:', err);
    process.exit(1);
});
