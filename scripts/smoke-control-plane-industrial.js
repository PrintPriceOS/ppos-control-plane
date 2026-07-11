/**
 * scripts/smoke-control-plane-industrial.js
 * 
 * Smoke tests for industrial operation endpoints.
 * FAIL LOUD ONLY.
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.PPOS_CONTROL_URL || 'http://localhost:8080';
const TOKEN = process.env.PPOS_CONTROL_TOKEN;

if (!TOKEN) {
    console.error('[ERROR] PPOS_CONTROL_TOKEN is required. Aborting smoke test.');
    process.exit(1);
}

const client = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Authorization': `Bearer ${TOKEN}`
    },
    validateStatus: false
});

async function runTests() {
    console.log(`[SMOKE] Testing Industrial Endpoints at ${BASE_URL}...`);
    
    const endpoints = [
        { name: 'Metrics Overview', url: '/api/admin/metrics/overview' },
        { name: 'Audit Log', url: '/api/admin/audit' },
        { name: 'Artifact Registry', url: '/api/admin/artifacts' },
        { name: 'Worker Fleet', url: '/api/admin/workers/fleet' },
        { name: 'Operational Incidents', url: '/api/admin/production-monitoring/incidents' },
        { name: 'Industrial Telemetry', url: '/api/admin/telemetry/industrial' }
    ];

    let passed = 0;
    let failed = 0;

    for (const ep of endpoints) {
        try {
            const start = Date.now();
            const res = ep.method === 'post' 
                ? await client.post(ep.url, {})
                : await client.get(ep.url);
            
            const duration = Date.now() - start;

            if (res.status === 200 && res.data.ok !== false) {
                console.log(`[PASS] ${ep.name.padEnd(25)} | ${res.status} | ${duration}ms`);
                passed++;
            } else {
                console.error(`[FAIL] ${ep.name.padEnd(25)} | ${res.status} | ${JSON.stringify(res.data)}`);
                failed++;
            }
        } catch (err) {
            console.error(`[ERR ] ${ep.name.padEnd(25)} | ${err.message}`);
            failed++;
        }
    }

    console.log('\n----------------------------------------');
    console.log(`SUMMARY: ${passed} PASS, ${failed} FAIL`);
    console.log('----------------------------------------\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
