/**
 * tests/security_jobs_queue_isolation_test.js
 * 
 * Tests multi-tenant and printhouse isolation for the Jobs and Preflight Queue domain.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, setQueryStub, teardown } = require('./security_test_helper');
const jobsRouter = require('../src/api/routes/jobsAdmin');

async function runTests() {
    console.log('Running Jobs & Queue isolation tests...');

    // Stub database responses for jobs
    setQueryStub((sql, params) => {
        if (sql.includes('SELECT') && sql.includes('jobs')) {
            const jobId = params[0];
            // Match own job
            if (jobId === FIXTURES.tenantA.jobId) {
                return [{ id: jobId, tenant_id: FIXTURES.tenantA.tenantId, printhouse_id: FIXTURES.tenantA.printhouses[0], status: 'COMPLETED' }];
            }
            // Match other printer job in same tenant
            if (jobId === 'job-a2') {
                return [{ id: 'job-a2', tenant_id: FIXTURES.tenantA.tenantId, printhouse_id: FIXTURES.tenantA.printhouses[1], status: 'COMPLETED' }];
            }
            // Match other tenant job
            if (jobId === FIXTURES.tenantB.jobId) {
                return [{ id: jobId, tenant_id: FIXTURES.tenantB.tenantId, printhouse_id: FIXTURES.tenantB.printhouses[0], status: 'COMPLETED' }];
            }
        }
        return [];
    });

    // 1. Own Job Allowed
    {
        const user = {
            id: 'user-ph-123',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: FIXTURES.tenantA.tenantId,
            printhouseId: FIXTURES.tenantA.printhouses[0]
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'GET',
            url: `/${FIXTURES.tenantA.jobId}`,
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(jobsRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.jobId, FIXTURES.tenantA.jobId);
        console.log('✓ Own Job access allowed');
    }

    // 2. Same Tenant Cross-Printhouse Denied (403)
    {
        const user = {
            id: 'user-ph-123',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: FIXTURES.tenantA.tenantId,
            printhouseId: FIXTURES.tenantA.printhouses[0]
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'GET',
            url: `/job-a2`,
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(jobsRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error.message, 'Access Denied: Requested Job belongs to another Printhouse.');
        console.log('✓ Same Tenant Cross-Printhouse Job access denied');
    }

    // 3. Cross-Tenant Denied (403)
    {
        const user = {
            id: 'user-ph-123',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: FIXTURES.tenantA.tenantId,
            printhouseId: FIXTURES.tenantA.printhouses[0]
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'GET',
            url: `/${FIXTURES.tenantB.jobId}`,
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(jobsRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error.message, 'Access Denied: Requested Job belongs to another secure organizational tenant.');
        console.log('✓ Cross-Tenant Job access denied');
    }

    // 4. Global Admin Allowed
    {
        const user = {
            id: 'admin-123',
            role: 'SUPER_ADMIN',
            isSuperAdmin: true
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'GET',
            url: `/${FIXTURES.tenantB.jobId}`,
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(jobsRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.jobId, FIXTURES.tenantB.jobId);
        console.log('✓ Global admin allowed access to any Job');
    }

    console.log('All Jobs & Queue isolation tests passed!');
    await teardown();
}

runTests().catch(err => {
    console.error('Jobs & Queue isolation test failed:', err);
    process.exit(1);
});
