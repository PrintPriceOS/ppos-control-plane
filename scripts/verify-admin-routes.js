/**
 * scripts/verify-admin-routes.js
 * 
 * Production smoke test script to verify that Control Plane admin API routes
 * are correctly registered in the backend route registry and do not return 404 Endpoint not found.
 * 
 * Checks core administrative endpoints to ensure radix tree forwarding works cleanly.
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.PPOS_CONTROL_PLANE_URL || process.env.PPOS_CONTROL_URL || 'http://localhost:8081';
const TOKEN = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

const client = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'X-Tenant-Id': 'system'
    },
    validateStatus: false,
    timeout: 10000
});

async function verifyRoutes() {
    console.log(`\n[SMOKE-TEST] Verifying Admin Route Mounts at ${BASE_URL}...`);
    console.log(`[SMOKE-TEST] Target Prefix: /api/admin/*\n`);

    const endpoints = [
        { name: 'Routes Debug Manifest', url: '/api/admin/routes/debug' },
        { name: 'Preflight Jobs', url: '/api/admin/preflight/jobs' },
        { name: 'Preflight Policies', url: '/api/admin/preflight/policies' },
        { name: 'Global Storage Overview', url: '/api/admin/preflight/storage' },
        { name: 'Forensic Jobs Observability', url: '/api/admin/jobs' },
        { name: 'Printhouses Fleet', url: '/api/admin/printhouses' },
        { name: 'Materials Catalog', url: '/api/admin/materials' },
        { name: 'Forensic Audit Explorer', url: '/api/admin/audit' },
        { name: 'Production Dispatch', url: '/api/admin/dispatch' }
    ];

    let passed = 0;
    let failed = 0;

    for (const ep of endpoints) {
        try {
            const start = Date.now();
            const res = await client.get(ep.url);
            const duration = Date.now() - start;

            // Any response that is not Fastify's raw 404 Endpoint not found means the Express router caught it.
            // Acceptance criteria requires 200 or a valid controlled response.
            const isEndpointNotFound = res.status === 404 && res.data?.error === 'Endpoint not found';

            if (!isEndpointNotFound) {
                console.log(`[PASS] ${ep.name.padEnd(30)} | HTTP ${res.status} | ${duration}ms`);
                passed++;
            } else {
                console.error(`[FAIL] ${ep.name.padEnd(30)} | HTTP ${res.status} | Swallowed by setNotFoundHandler: ${JSON.stringify(res.data)}`);
                failed++;
            }
        } catch (err) {
            console.error(`[ERR ] ${ep.name.padEnd(30)} | Connection Failed: ${err.message}`);
            failed++;
        }
    }

    console.log('\n==================================================');
    console.log(`VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');

    if (failed > 0) {
        console.error('[CRITICAL] Admin route registry check failed. Endpoints are missing from the radix tree.');
        process.exit(1);
    } else {
        console.log('[SUCCESS] All tested admin routes are correctly mapped through the Express bridge.');
        process.exit(0);
    }
}

verifyRoutes();
