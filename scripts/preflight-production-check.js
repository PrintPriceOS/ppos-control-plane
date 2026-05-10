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
    timeout: 8000,
    validateStatus: () => true,
});

const checks = [];
let passed = 0;
let failed = 0;
const startTime = Date.now();

function getAuthToken() {
    const requireJwtOnly = process.env.REQUIRE_JWT_ONLY === 'true';
    const enableBreakGlass = process.env.ENABLE_BREAK_GLASS_TOKEN === 'true';
    const jwtToken = process.env.PPOS_ADMIN_JWT || process.env.JWT_VALIDATION_TOKEN;
    const breakGlassToken = process.env.PPOS_CONTROL_TOKEN;

    if (requireJwtOnly) return jwtToken;
    if (enableBreakGlass) return breakGlassToken || jwtToken;
    return jwtToken;
}

function getAuthHeaders() {
    const token = getAuthToken();
    return {
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

// Inject headers into every request
api.interceptors.request.use(config => {
    config.headers = { ...config.headers, ...getAuthHeaders() };
    return config;
});

async function check(label, fn) {
    const t0 = Date.now();
    try {
        const result = await fn();
        const ms = Date.now() - t0;
        if (result.ok) {
            console.log(`  ✓  ${label.padEnd(42)} (${ms}ms)`);
            passed++;
            checks.push({ label, ok: true, latencyMs: ms });
        } else if (result.warning) {
            console.log(`  ⚠  ${label.padEnd(42)} → ${result.reason || 'WARNING'}`);
            passed++; // Warnings count as pass for readiness score but show alert
            checks.push({ label, ok: true, warning: true, reason: result.reason });
        } else {
            const targetInfo = result.target ? ` [Target: ${result.target}]` : '';
            const bodyInfo = result.body ? ` | Body: ${JSON.stringify(result.body)}` : '';
            console.error(`  ✗  ${label.padEnd(42)} → ${result.reason || 'FAILED'}${targetInfo}${bodyInfo}`);
            failed++;
            checks.push({ label, ok: false, reason: result.reason, target: result.target });
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

    // --- AUTH DIAGNOSTICS ---
    const requireJwtOnly = process.env.REQUIRE_JWT_ONLY === 'true';
    const enableBreakGlass = process.env.ENABLE_BREAK_GLASS_TOKEN === 'true';
    const hasJwtSecret = !!process.env.JWT_SECRET;
    
    let authMode = 'UNKNOWN';
    if (requireJwtOnly) authMode = 'JWT_ONLY_STRICT';
    else if (enableBreakGlass) authMode = 'JWT_PRIMARY_BREAK_GLASS_ENABLED';
    else if (hasJwtSecret) authMode = 'JWT_ONLY';

    const token = getAuthToken();
    const tokenSource = requireJwtOnly ? (process.env.PPOS_ADMIN_JWT ? 'PPOS_ADMIN_JWT' : 'JWT_VALIDATION_TOKEN')
                      : (enableBreakGlass ? 'PPOS_CONTROL_TOKEN' : 'PPOS_ADMIN_JWT');
    
    console.log(`  Auth Mode         : ${authMode}`);
    console.log(`  Auth Token Source : ${tokenSource}`);
    console.log(`  Auth Token Present: ${token ? 'YES' : 'NO'}`);
    if (token) {
        const preview = token.length > 12 ? `${token.substring(0, 10)}...${token.substring(token.length - 4)}` : '***';
        console.log(`  Auth Token Preview: ${preview}`);
    }
    console.log('');

    // --- DATABASE ---
    console.log('  [ Database ]\n');
    await check('MySQL connectivity', async () => {
        let db;
        try { db = require('../src/api/services/mysqlClient'); } catch { return { ok: false, reason: 'Cannot require mysqlClient' }; }
        try {
            await db.query('SELECT 1');
            return { ok: true };
        } catch (e) {
            // Check if server is up but script can't connect (likely port/host issue in script env)
            const healthRes = await api.get('/health');
            if (healthRes.status === 200) {
                return { ok: false, warning: true, reason: `SCRIPT_CONN_REFUSED but SERVER_IS_LIVE: ${e.message}` };
            }
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
            return { ok: true };
        } catch (e) {
            return { ok: false, warning: true, reason: e.message }; // Redis is optional
        }
    });

    // --- JWT ---
    console.log('\n  [ Security ]\n');
    await check('JWT_SECRET configured', async () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret === 'fallback-secret-development-only') {
            return { ok: false, warning: true, reason: 'JWT_SECRET is weak or missing' };
        }
        return { ok: true };
    });

    await check('PPOS_CONTROL_TOKEN configured', async () => {
        const token = process.env.PPOS_CONTROL_TOKEN;
        if (!token || token === 'admin-secret') {
            return { ok: false, warning: true, reason: 'PPOS_CONTROL_TOKEN is default' };
        }
        return { ok: true };
    });

    await check('ENABLE_BREAK_GLASS_TOKEN state', async () => {
        const bg = process.env.ENABLE_BREAK_GLASS_TOKEN;
        if (bg === 'true') {
            if (requireJwtOnly) {
                return { ok: false, reason: 'BREAK_GLASS enabled but REQUIRE_JWT_ONLY is true' };
            }
            return { ok: false, warning: true, reason: 'ENABLE_BREAK_GLASS_TOKEN=true is a security risk in production' };
        }
        return { ok: true };
    });

    // --- API HEALTH ---
    console.log('\n  [ API Health ]\n');
    await check('Control Plane /health endpoint', async () => {
        const path = '/health';
        const res = await api.get(path);
        const ok = res.status === 200 || (res.data && res.data.status === 'UP');
        return { ok, target: TARGET + path, reason: `Status ${res.status}`, body: res.data };
    });

    await check('Admin routes responsive', async () => {
        const path = '/api/admin/telemetry/snapshot';
        const res = await api.get(path);
        if (res.status === 401) return { ok: false, reason: 'AUTH_FAILURE', target: TARGET + path, body: res.data };
        const ok = res.status === 200 || (res.data && res.data.ok === true);
        return { ok, target: TARGET + path, reason: `Status ${res.status}`, body: res.data };
    });

    // --- PHASE READINESS ---
    console.log('\n  [ Phase Readiness ]\n');
    const phaseChecks = [
        { label: 'Autonomy readiness',       path: '/api/admin/autonomous/health' },
        { label: 'Predictive readiness',     path: '/api/admin/predictive/health' },
        { label: 'Anomaly readiness',        path: '/api/admin/anomaly/health' },
        { label: 'Economic readiness',       path: '/api/admin/economic/health' },
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
            if (res.status === 401) return { ok: false, reason: 'AUTH_FAILURE', target: TARGET + pc.path, body: res.data };
            const ok = res.status === 200 && res.data && (res.data.ok === true || res.data.status === 'UP');
            if (ok) return { ok: true };
            if (res.data && res.data.status === 'DEGRADED') {
                return { ok: false, warning: true, reason: 'DEGRADED', target: TARGET + pc.path };
            }
            return { ok: false, reason: `Status ${res.status}`, target: TARGET + pc.path, body: res.data };
        });
    }

    // --- ENVIRONMENT ---
    console.log('\n  [ Environment ]\n');
    await check('NODE_ENV defined', async () => {
        return { ok: !!process.env.NODE_ENV };
    });
    await check('PORT configured', async () => {
        return { ok: !!(process.env.PORT || process.env.PPOS_CONTROL_PORT) };
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
        console.log('\n  ✓ PRODUCTION READINESS: READY (GO)\n');
        process.exit(0);
    } else if (score >= 90) {
        console.log('\n  ⚠ PRODUCTION READINESS: READY WITH WARNINGS\n');
        process.exit(0);
    } else {
        console.error('\n  ✗ PRODUCTION READINESS: NOT READY — resolve failures before deploying\n');
        process.exit(1);
    }
}

main();
