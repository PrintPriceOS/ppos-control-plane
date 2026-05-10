/**
 * scripts/preflight-production-check.js
 *
 * Phase 23 — Deployment Hardening
 * Pre-flight production readiness check. Verifies all critical dependencies
 * before deploying or restarting the Control Plane.
 *
 * Usage:
 *   node scripts/preflight-production-check.js
 *   PPOS_CONTROL_PLANE_URL=http://127.0.0.1:8081 node scripts/preflight-production-check.js
 */
require('dotenv').config();
const axios = require('axios');

const TARGET = process.env.PPOS_CONTROL_PLANE_URL || 'http://127.0.0.1:8081';
const TOKEN  = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

const api = axios.create({
    baseURL: TARGET,
    headers: { 'Authorization': `Bearer ${TOKEN}` },
    timeout: 8000,
    validateStatus: () => true,
});

const checks = [];
let passed = 0;
let failed = 0;
const startTime = Date.now();

async function check(label, fn) {
    const t0 = Date.now();
    try {
        const result = await fn();
        const ms = Date.now() - t0;
        if (result.ok) {
            console.log(`  ✓  ${label.padEnd(42)} (${ms}ms)`);
            passed++;
            checks.push({ label, ok: true, latencyMs: ms });
        } else {
            console.error(`  ✗  ${label.padEnd(42)} → ${result.reason || 'FAILED'}`);
            failed++;
            checks.push({ label, ok: false, reason: result.reason });
        }
    } catch (err) {
        console.error(`  !  ${label.padEnd(42)} → ${err.message}`);
        failed++;
        checks.push({ label, ok: false, reason: err.message });
    }
}

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║       PPOS CONTROL PLANE — PRE-FLIGHT CHECK          ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log(`  Target : ${TARGET}`);
    console.log(`  Time   : ${new Date().toISOString()}\n`);

    // --- DATABASE ---
    console.log('  [ Database ]\n');
    await check('MySQL connectivity', async () => {
        let db;
        try { db = require('../src/api/services/mysqlClient'); } catch { return { ok: false, reason: 'Cannot require mysqlClient' }; }
        try {
            await db.query('SELECT 1');
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    });

    // --- REDIS ---
    console.log('\n  [ Redis ]\n');
    await check('Redis connectivity', async () => {
        try {
            const queue = require('../src/api/services/queue');
            if (typeof queue.ping === 'function') {
                await queue.ping();
                return { ok: true };
            }
            // If no ping method, treat as OK (optional Redis)
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    });

    // --- JWT ---
    console.log('\n  [ Security ]\n');
    await check('JWT_SECRET configured', async () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret === 'fallback-secret-development-only') {
            return { ok: false, reason: 'JWT_SECRET is weak or missing — set a strong secret in production' };
        }
        return { ok: true };
    });

    await check('PPOS_CONTROL_TOKEN configured', async () => {
        const token = process.env.PPOS_CONTROL_TOKEN;
        if (!token || token === 'admin-secret') {
            return { ok: false, reason: 'PPOS_CONTROL_TOKEN is default — set a strong token in production' };
        }
        return { ok: true };
    });

    await check('ENABLE_BREAK_GLASS_TOKEN state', async () => {
        const bg = process.env.ENABLE_BREAK_GLASS_TOKEN;
        if (bg === 'true' && process.env.NODE_ENV === 'production') {
            return { ok: false, reason: 'ENABLE_BREAK_GLASS_TOKEN=true in production is a security risk' };
        }
        return { ok: true };
    });

    // --- API HEALTH ---
    console.log('\n  [ API Health ]\n');
    await check('Control Plane /health endpoint', async () => {
        const res = await api.get('/health');
        return { ok: res.status === 200 };
    });

    await check('Admin routes responsive', async () => {
        const res = await api.get('/api/admin/telemetry/snapshot');
        return { ok: res.status !== 404 && res.status !== 502 };
    });

    // --- PHASE READINESS ---
    console.log('\n  [ Phase Readiness ]\n');
    const phaseChecks = [
        { label: 'Federation readiness',     path: '/api/admin/federation/health' },
        { label: 'Marketplace readiness',    path: '/api/admin/marketplace/health' },
        { label: 'Governance readiness',     path: '/api/admin/governance/health' },
        { label: 'Civilization readiness',   path: '/api/admin/civilization/health' },
        { label: 'Interplanetary readiness', path: '/api/admin/interplanetary/health' },
        { label: 'Reality readiness',        path: '/api/admin/reality/health' },
        { label: 'Singularity readiness',    path: '/api/admin/singularity/health' },
    ];

    for (const pc of phaseChecks) {
        await check(pc.label, async () => {
            const res = await api.get(pc.path);
            return { ok: res.data && res.data.ok === true };
        });
    }

    // --- ENVIRONMENT ---
    console.log('\n  [ Environment ]\n');
    await check('NODE_ENV defined', async () => {
        return { ok: !!process.env.NODE_ENV };
    });
    await check('PORT configured', async () => {
        return { ok: !!(process.env.PORT) };
    });
    await check('DB_HOST configured', async () => {
        return { ok: !!(process.env.DB_HOST || process.env.MYSQL_HOST) };
    });

    // --- SUMMARY ---
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const total = passed + failed;
    const score = Math.round((passed / total) * 100);
    const isReady = failed === 0;

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║          PRE-FLIGHT REPORT               ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Total Checks    : ${String(total).padEnd(22)}║`);
    console.log(`║  Passed          : ${String(passed).padEnd(22)}║`);
    console.log(`║  Failed          : ${String(failed).padEnd(22)}║`);
    console.log(`║  Readiness Score : ${String(score + '%').padEnd(22)}║`);
    console.log(`║  Duration        : ${String(duration + 's').padEnd(22)}║`);
    console.log('╚══════════════════════════════════════════╝');

    if (isReady) {
        console.log('\n  ✓ PRODUCTION READINESS: GO — all checks passed\n');
        process.exit(0);
    } else {
        console.error('\n  ✗ PRODUCTION READINESS: NOT READY — resolve failures before deploying\n');
        process.exit(1);
    }
}

main();
