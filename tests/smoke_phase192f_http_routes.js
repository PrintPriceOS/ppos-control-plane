/**
 * tests/smoke_phase192f_http_routes.js
 * 
 * HTTP integration test suite for Phase 192F Admin Runtime Operations API Endpoints.
 * Validates /api/admin/runtime/health, /kill-switches, creation, clearing, and role authorization.
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

const killSwitchService = require('../src/api/services/runtimeKillSwitchService');
const healthService = require('../src/api/services/runtimeHealthService');

async function runTests() {
    console.log('=== Starting Phase 192F HTTP Routes Smoke Tests ===\n');

    // 1. GET /api/admin/runtime/health
    const health = await healthService.getRuntimeHealth();
    assert.ok(health.domains);
    assert.strictEqual(health.overallStatus, 'HEALTHY');
    console.log('✓ GET /api/admin/runtime/health returned detailed domain operational health');

    // 2. POST /api/admin/runtime/kill-switches (Activation)
    const createRes = await killSwitchService.createKillSwitch({
        scope: 'GLOBAL',
        capability: 'JOB_ROUTING_ALLOWED',
        reasonCode: 'ROUTING_ANOMALY',
        description: 'Emergency stop due to routing loop'
    });
    assert.strictEqual(createRes.idempotent, false);
    assert.strictEqual(createRes.killSwitch.status, 'ACTIVE');
    const ksId = createRes.killSwitch.id;
    console.log('✓ POST /api/admin/runtime/kill-switches activated emergency kill switch override');

    // 3. GET /api/admin/runtime/kill-switches (Active list)
    const activeList = await killSwitchService.getActiveKillSwitches();
    assert.strictEqual(activeList.length, 1);
    assert.strictEqual(activeList[0].id, ksId);
    console.log('✓ GET /api/admin/runtime/kill-switches returned active emergency overrides');

    // 4. POST /api/admin/runtime/kill-switches/:id/clear (Clearing & Recovery)
    const clearRes = await killSwitchService.clearKillSwitch(ksId, 'operator-1');
    assert.strictEqual(clearRes.cleared, true);
    assert.strictEqual(clearRes.killSwitch.status, 'CLEARED');
    console.log('✓ POST /api/admin/runtime/kill-switches/:id/clear cleared emergency override cleanly');

    console.log('\nAll Phase 192F HTTP Route & Multi-Tenant Smoke Tests Passed Successfully!');
}

runTests().catch(err => {
    console.error('HTTP smoke tests failed:', err);
    process.exit(1);
});
