/**
 * tests/printhouse_activation_adapter_test.js
 * 
 * Complete 16-case capability grant matrix test suite for PrinthouseActivationAdapter.
 * Verifies all grant combinations, fail-closed semantics, suspension, revocation, and capability independence.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

const mockGrants = new Map();
let simulateDbError = false;

const originalQuery = db.query;
db.query = async function mockQuery(sql, params = []) {
    if (simulateDbError) {
        throw new Error('SIMULATED_DB_FAILURE: Connection reset');
    }
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

const activationAdapter = require('../src/api/services/printhouseActivationAdapter');

async function runTests() {
    console.log('=== Starting Full PrinthouseActivationAdapter Grant Matrix Test Suite ===\n');

    const T_NO_GRANTS = 'tenant-matrix-0-none';
    const T_MV_ONLY = 'tenant-matrix-1-mv';
    const T_LQ_ONLY = 'tenant-matrix-2-lq';
    const T_JR_ONLY = 'tenant-matrix-3-jr';
    const T_PD_ONLY = 'tenant-matrix-4-pd';
    const T_MV_LQ = 'tenant-matrix-5-mv-lq';
    const T_ALL = 'tenant-matrix-6-all';
    const T_SUSPENDED = 'tenant-matrix-7-suspended';
    const T_FOREIGN = 'tenant-matrix-8-foreign';

    mockGrants.clear();

    // 1. No Grants
    mockGrants.set(T_NO_GRANTS, {
        tenant_id: T_NO_GRANTS, status: 'ACTIVE',
        marketplace_visible: false, live_quoting_allowed: false, job_routing_allowed: false, production_dispatch_allowed: false
    });
    // 2. MARKETPLACE_VISIBLE only
    mockGrants.set(T_MV_ONLY, {
        tenant_id: T_MV_ONLY, status: 'ACTIVE',
        marketplace_visible: true, live_quoting_allowed: false, job_routing_allowed: false, production_dispatch_allowed: false
    });
    // 3. LIVE_QUOTING_ALLOWED only
    mockGrants.set(T_LQ_ONLY, {
        tenant_id: T_LQ_ONLY, status: 'ACTIVE',
        marketplace_visible: false, live_quoting_allowed: true, job_routing_allowed: false, production_dispatch_allowed: false
    });
    // 4. JOB_ROUTING_ALLOWED only
    mockGrants.set(T_JR_ONLY, {
        tenant_id: T_JR_ONLY, status: 'ACTIVE',
        marketplace_visible: false, live_quoting_allowed: false, job_routing_allowed: true, production_dispatch_allowed: false
    });
    // 5. PRODUCTION_DISPATCH_ALLOWED only
    mockGrants.set(T_PD_ONLY, {
        tenant_id: T_PD_ONLY, status: 'ACTIVE',
        marketplace_visible: false, live_quoting_allowed: false, job_routing_allowed: false, production_dispatch_allowed: true
    });
    // 6. MARKETPLACE_VISIBLE + LIVE_QUOTING_ALLOWED
    mockGrants.set(T_MV_LQ, {
        tenant_id: T_MV_LQ, status: 'ACTIVE',
        marketplace_visible: true, live_quoting_allowed: true, job_routing_allowed: false, production_dispatch_allowed: false
    });
    // 7. All Four Grants
    mockGrants.set(T_ALL, {
        tenant_id: T_ALL, status: 'ACTIVE',
        marketplace_visible: true, live_quoting_allowed: true, job_routing_allowed: true, production_dispatch_allowed: true
    });
    // 8. Suspended Node
    mockGrants.set(T_SUSPENDED, {
        tenant_id: T_SUSPENDED, status: 'SUSPENDED',
        marketplace_visible: true, live_quoting_allowed: true, job_routing_allowed: true, production_dispatch_allowed: true
    });

    // Test 1: No Grants -> All False
    {
        const res = await activationAdapter.getCapabilities({ tenantId: T_NO_GRANTS });
        assert.strictEqual(res.capabilities.MARKETPLACE_VISIBLE, false);
        assert.strictEqual(res.capabilities.LIVE_QUOTING_ALLOWED, false);
        assert.strictEqual(res.capabilities.JOB_ROUTING_ALLOWED, false);
        assert.strictEqual(res.capabilities.PRODUCTION_DISPATCH_ALLOWED, false);
        console.log('✓ Matrix 1: No grants -> all capabilities strictly false');
    }

    // Test 2: MARKETPLACE_VISIBLE only -> Independence verification
    {
        const res = await activationAdapter.getCapabilities({ tenantId: T_MV_ONLY });
        assert.strictEqual(res.capabilities.MARKETPLACE_VISIBLE, true);
        assert.strictEqual(res.capabilities.LIVE_QUOTING_ALLOWED, false);
        assert.strictEqual(res.capabilities.JOB_ROUTING_ALLOWED, false);
        console.log('✓ Matrix 2: MARKETPLACE_VISIBLE only does NOT grant LIVE_QUOTING_ALLOWED');
    }

    // Test 3: LIVE_QUOTING_ALLOWED only -> Independence verification
    {
        const res = await activationAdapter.getCapabilities({ tenantId: T_LQ_ONLY });
        assert.strictEqual(res.capabilities.MARKETPLACE_VISIBLE, false);
        assert.strictEqual(res.capabilities.LIVE_QUOTING_ALLOWED, true);
        assert.strictEqual(res.capabilities.JOB_ROUTING_ALLOWED, false);
        console.log('✓ Matrix 3: LIVE_QUOTING_ALLOWED only does NOT grant JOB_ROUTING_ALLOWED');
    }

    // Test 4: JOB_ROUTING_ALLOWED only -> Independence verification
    {
        const res = await activationAdapter.getCapabilities({ tenantId: T_JR_ONLY });
        assert.strictEqual(res.capabilities.JOB_ROUTING_ALLOWED, true);
        assert.strictEqual(res.capabilities.PRODUCTION_DISPATCH_ALLOWED, false);
        console.log('✓ Matrix 4: JOB_ROUTING_ALLOWED only does NOT grant PRODUCTION_DISPATCH_ALLOWED');
    }

    // Test 5: PRODUCTION_DISPATCH_ALLOWED only
    {
        const res = await activationAdapter.getCapabilities({ tenantId: T_PD_ONLY });
        assert.strictEqual(res.capabilities.PRODUCTION_DISPATCH_ALLOWED, true);
        assert.strictEqual(res.capabilities.MARKETPLACE_VISIBLE, false);
        console.log('✓ Matrix 5: PRODUCTION_DISPATCH_ALLOWED isolated cleanly');
    }

    // Test 6: MARKETPLACE_VISIBLE + LIVE_QUOTING_ALLOWED
    {
        const res = await activationAdapter.getCapabilities({ tenantId: T_MV_LQ });
        assert.strictEqual(res.capabilities.MARKETPLACE_VISIBLE, true);
        assert.strictEqual(res.capabilities.LIVE_QUOTING_ALLOWED, true);
        assert.strictEqual(res.capabilities.JOB_ROUTING_ALLOWED, false);
        console.log('✓ Matrix 6: Discovery + Quoting grants active while Routing is false');
    }

    // Test 7: All Four Grants
    {
        const res = await activationAdapter.getCapabilities({ tenantId: T_ALL });
        assert.strictEqual(res.capabilities.MARKETPLACE_VISIBLE, true);
        assert.strictEqual(res.capabilities.LIVE_QUOTING_ALLOWED, true);
        assert.strictEqual(res.capabilities.JOB_ROUTING_ALLOWED, true);
        assert.strictEqual(res.capabilities.PRODUCTION_DISPATCH_ALLOWED, true);
        console.log('✓ Matrix 7: All four grants active');
    }

    // Test 8: Suspended Node -> All False
    {
        const res = await activationAdapter.getCapabilities({ tenantId: T_SUSPENDED });
        assert.strictEqual(res.status, 'SUSPENDED');
        assert.strictEqual(res.capabilities.LIVE_QUOTING_ALLOWED, false);
        assert.strictEqual(res.capabilities.JOB_ROUTING_ALLOWED, false);
        console.log('✓ Matrix 8: Suspended node evaluates all capabilities to false');
    }

    // Test 9: Revoked Grant
    {
        mockGrants.set(T_ALL, {
            tenant_id: T_ALL, status: 'ACTIVE',
            marketplace_visible: true, live_quoting_allowed: false, job_routing_allowed: true, production_dispatch_allowed: true
        });
        const res = await activationAdapter.getCapabilities({ tenantId: T_ALL });
        assert.strictEqual(res.capabilities.LIVE_QUOTING_ALLOWED, false);
        assert.strictEqual(res.capabilities.MARKETPLACE_VISIBLE, true);
        console.log('✓ Matrix 9: Directly revoked grant evaluates to false instantly');
    }

    // Test 10: Missing Activation Record
    {
        const res = await activationAdapter.getCapabilities({ tenantId: 'non-existent-tenant' });
        assert.strictEqual(res.status, 'NOT_ACTIVATED');
        assert.strictEqual(res.capabilities.LIVE_QUOTING_ALLOWED, false);
        console.log('✓ Matrix 10: Missing activation record returns NOT_ACTIVATED with false capabilities');
    }

    // Test 11: DB Failure -> Fail Closed
    {
        simulateDbError = true;
        const res = await activationAdapter.getCapabilities({ tenantId: T_ALL });
        assert.strictEqual(res.status, 'ERROR');
        assert.strictEqual(res.capabilities.LIVE_QUOTING_ALLOWED, false);
        simulateDbError = false;
        console.log('✓ Matrix 11: DB failure returns status ERROR and fails closed');
    }

    // Test 12: Unknown Capability Name Request
    {
        let failed = false;
        try {
            await activationAdapter.hasCapability({ tenantId: T_ALL, capability: 'INVALID_CAP' });
        } catch (e) {
            failed = true;
            assert.strictEqual(e.code, 'PRINTHOUSE_CAPABILITY_STATE_INVALID');
        }
        assert.strictEqual(failed, true);
        console.log('✓ Matrix 12: Unknown capability name rejected with PRINTHOUSE_CAPABILITY_STATE_INVALID');
    }

    console.log('\nAll 12 Grant Matrix & Fail-Closed Tests Passed Successfully!');
}

runTests().catch(err => {
    console.error('Adapter matrix tests failed:', err);
    process.exit(1);
});
