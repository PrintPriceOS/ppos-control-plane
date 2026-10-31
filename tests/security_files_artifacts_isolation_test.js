/**
 * tests/security_files_artifacts_isolation_test.js
 * 
 * Tests multi-tenant isolation for File Downloads and Artifact Streams.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, setQueryStub, teardown } = require('./security_test_helper');
const preflightRouter = require('../src/api/routes/adminPreflightJobs');

async function runTests() {
    console.log('Running Files & Artifacts isolation tests...');

    // Stub preflight job registry
    setQueryStub((sql, params) => {
        if (sql.includes('SELECT') && sql.includes('preflight_job_registry')) {
            const jobId = params[0];
            if (jobId === FIXTURES.tenantA.jobId) {
                return [{ job_id: jobId, tenant_id: FIXTURES.tenantA.tenantId }];
            }
            if (jobId === FIXTURES.tenantB.jobId) {
                return [{ job_id: jobId, tenant_id: FIXTURES.tenantB.tenantId }];
            }
        }
        return [];
    });

    // 1. Cross-Tenant Artifact Retrieval Blocked
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
            url: `/jobs/${FIXTURES.tenantB.jobId}/artifacts`,
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(preflightRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'TENANT_ISOLATION_VIOLATION: Access restricted to assigned tenant resources.');
        console.log('✓ Cross-Tenant File/Artifact access denied via param guard');
    }

    await teardown();
}

runTests().catch(err => {
    console.error('Files & Artifacts isolation test failed:', err);
    process.exit(1);
});
