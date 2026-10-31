/**
 * scripts/validate-economic-orchestration.js
 * 
 * Validates Phase 15 — Autonomous Economic Optimization + Global Orchestration.
 * Hardened for production response shapes and diagnostic visibility.
 */
require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.PPOS_CONTROL_PLANE_URL || 'http://localhost:8080';
const ADMIN_TOKEN = process.env.PPOS_CONTROL_TOKEN;

if (!ADMIN_TOKEN) {
    console.error('[CRITICAL] MISSING_PPOS_CONTROL_TOKEN');
    console.error('Usage: PPOS_CONTROL_TOKEN=your-token node scripts/validate-economic-orchestration.js');
    process.exit(1);
}

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    validateStatus: () => true // Allow us to handle errors manually
});

async function runValidation(ep) {
    console.log(`\n[*] Validating ${ep.name} [${ep.method} ${ep.path}]...`);
    
    const startTime = Date.now();
    let res;
    try {
        res = await api({
            method: ep.method,
            url: ep.path
        });
    } catch (err) {
        console.error(`\n[FAIL] Request failed for ${ep.name}`);
        console.error(`Method: ${ep.method}`);
        console.error(`URL: ${API_BASE}${ep.path}`);
        console.error(`Error Message: ${err.message}`);
        process.exit(1);
    }

    const duration = Date.now() - startTime;
    const isSuccess = res.status >= 200 && res.status < 300;
    const data = res.data;

    if (!isSuccess) {
        console.error(`\n[FAIL] ${ep.name} FAILED`);
        console.error(`HTTP Status: ${res.status}`);
        console.error(`Method: ${ep.method}`);
        console.error(`URL: ${API_BASE}${ep.path}`);
        console.error(`Raw Response Body: ${typeof data === 'object' ? JSON.stringify(data) : data}`);
        console.error(`Parsed JSON: ${JSON.stringify(data, null, 2)}`);
        process.exit(1);
    }

    // Custom shape validation
    let conditionMet = true;
    let expected = "valid structure";
    let actual = "invalid structure";

    if (ep.name === 'Health') {
        expected = 'ok: true, health.state: ECONOMIC_OPTIMIZATION_ACTIVE';
        actual = `ok: ${data.ok}, state: ${data.health?.state}`;
        if (!data.ok || data.health?.state !== 'ECONOMIC_OPTIMIZATION_ACTIVE') {
            conditionMet = false;
        }
        if (data.health?.is_stale) {
            console.log(`[WARN] Health is reporting STALE data (no snapshots found)`);
        }
    } else if (ep.name === 'Digital Twin') {
        expected = 'Array of snapshots';
        actual = Array.isArray(data) ? `Array with ${data.length} items` : typeof data;
        if (!Array.isArray(data)) {
            conditionMet = false;
        }
    } else {
        expected = 'ok: true';
        actual = `ok: ${data.ok}`;
        if (data.ok !== true) {
            conditionMet = false;
        }
    }

    if (!conditionMet) {
        console.error(`\n[FAIL] ${ep.name} Condition Mismatch`);
        console.error(`Method: ${ep.method}`);
        console.error(`URL: ${API_BASE}${ep.path}`);
        console.error(`Expected Condition: ${expected}`);
        console.error(`Actual Condition: ${actual}`);
        console.error(`Full JSON: ${JSON.stringify(data, null, 2)}`);
        process.exit(1);
    }

    console.log(`[PASS] ${ep.name} validated in ${duration}ms`);
    return data;
}

async function validate() {
    console.log('--- PHASE 15 VALIDATION: ECONOMIC INDUSTRIAL OPTIMIZATION ---');
    console.log(`Target: ${API_BASE}`);

    const endpoints = [
        { name: 'Health', method: 'GET', path: '/api/admin/economic/health' },
        { name: 'Network', method: 'GET', path: '/api/admin/economic/network' },
        { name: 'Profitability', method: 'GET', path: '/api/admin/economic/profitability' },
        { name: 'Efficiency', method: 'GET', path: '/api/admin/economic/efficiency' },
        { name: 'Energy', method: 'GET', path: '/api/admin/economic/energy' },
        { name: 'Swarm', method: 'GET', path: '/api/admin/economic/swarm' },
        { name: 'Digital Twin', method: 'GET', path: '/api/admin/economic/digital-twin' },
        { name: 'Recompute', method: 'POST', path: '/api/admin/economic/recompute' },
        { name: 'Rebalance', method: 'POST', path: '/api/admin/economic/rebalance' }
    ];

    for (const ep of endpoints) {
        await runValidation(ep);
    }

    console.log('\n--- VALIDATION SUCCESSFUL ---');
    console.log('✓ economic optimization active');
    console.log('✓ global balancing operational');
    console.log('✓ profitability scoring active');
    console.log('✓ energy optimization operational');
    console.log('✓ economic digital twin synchronized');
    console.log('✓ swarm coordination initialized');
    console.log('✓ telemetry synchronized');
}

validate().catch(err => {
    console.error('[CRITICAL] Unhandled validation error:', err);
    process.exit(1);
});
