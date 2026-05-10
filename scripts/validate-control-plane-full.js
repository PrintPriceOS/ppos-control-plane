/**
 * scripts/validate-control-plane-full.js
 *
 * Phase 23 — Unified Master Validator
 *
 * Executes every Phase 12–22 validation layer, aggregates results, and
 * produces a structured CONTROL PLANE FULL VALIDATION REPORT.
 *
 * Usage:
 *   node scripts/validate-control-plane-full.js
 *   node scripts/validate-control-plane-full.js --phase=15
 *   node scripts/validate-control-plane-full.js --quick
 *   node scripts/validate-control-plane-full.js --full
 *
 * Environment:
 *   PPOS_CONTROL_PLANE_URL=http://127.0.0.1:8081
 *   PPOS_CONTROL_TOKEN=<token>
 */
require('dotenv').config();
const axios = require('axios');

const TARGET = process.env.PPOS_CONTROL_PLANE_URL || 'http://127.0.0.1:8081';
const TOKEN  = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

const api = axios.create({
    baseURL: TARGET,
    timeout: 10000,
    validateStatus: () => true,
});

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

// --- Parse CLI args ---
const args = process.argv.slice(2);
const phaseArg = args.find(a => a.startsWith('--phase='));
const targetPhase = phaseArg ? parseInt(phaseArg.split('=')[1]) : null;
const quickMode = args.includes('--quick');

// --- Phase Definitions ---
// Each phase: { phase, label, checks: [{label, path, method?, body?}] }
const PHASES = [
    {
        phase: 12,
        label: 'Autonomous MES + SLA Orchestration',
        checks: [
            { label: 'Autonomy health',           path: '/api/admin/autonomous/health' },
            { label: 'SLA monitoring active',     path: '/api/admin/autonomous/status' },
            { label: 'Reroute engine',            path: '/api/admin/autonomous/pipelines' },
        ],
    },
    {
        phase: 13,
        label: 'Predictive Industrial Intelligence',
        checks: [
            { label: 'Predictive health',         path: '/api/admin/predictive/health' },
            { label: 'Bottleneck forecasting',    path: '/api/admin/predictive/bottlenecks' },
            { label: 'Risk scoring',              path: '/api/admin/predictive/risk' },
        ],
    },
    {
        phase: 14,
        label: 'Digital Twin + Anomaly Detection',
        checks: [
            { label: 'Anomaly detection health',  path: '/api/admin/anomaly/health' },
            { label: 'Digital twin snapshot',     path: '/api/admin/anomaly/digital-twin' },
            { label: 'Failure prediction',        path: '/api/admin/anomaly/nodes' },
        ],
    },
    {
        phase: 15,
        label: 'Autonomous Economic Optimization',
        checks: [
            { label: 'Economic health',           path: '/api/admin/economic/health' },
            { label: 'Profitability scoring',     path: '/api/admin/economic/profitability' },
            { label: 'Energy optimization',       path: '/api/admin/economic/energy' },
            { label: 'Swarm coordination',        path: '/api/admin/economic/swarm' },
            { label: 'Economic digital twin',     path: '/api/admin/economic/digital-twin' },
        ],
    },
    {
        phase: 16,
        label: 'Industrial Swarm + Multi-Factory Federation',
        checks: [
            { label: 'Federation health',         path: '/api/admin/federation/health' },
            { label: 'Federation factories',      path: '/api/admin/federation/factories' },
            { label: 'Swarm consensus',           path: '/api/admin/federation/consensus' },
            { label: 'Federation snapshot',       path: '/api/admin/federation/digital-twin' },
        ],
    },
    {
        phase: 17,
        label: 'Autonomous Manufacturing Marketplace',
        checks: [
            { label: 'Marketplace health',        path: '/api/admin/marketplace/health' },
            { label: 'Listings active',           path: '/api/admin/marketplace/offers' },
            { label: 'Trade ledger',              path: '/api/admin/marketplace/ledger' },
            { label: 'Marketplace twin',          path: '/api/admin/marketplace/trade-history' },
        ],
    },
    {
        phase: 18,
        label: 'Industrial AI Governance',
        checks: [
            { label: 'Governance health',         path: '/api/admin/governance/health' },
            { label: 'Constitution active',       path: '/api/admin/governance/digital-twin' },
            { label: 'Recursive optimization',    path: '/api/admin/governance/optimization' },
            { label: 'Governance twin',           path: '/api/admin/governance/policies' },
        ],
    },
    {
        phase: 19,
        label: 'Autonomous Industrial Civilization',
        checks: [
            { label: 'Civilization health',       path: '/api/admin/civilization/health' },
            { label: 'Planetary coordination',    path: '/api/admin/civilization/planetary-load' },
            { label: 'Civilization cognition',    path: '/api/admin/civilization/cognition' },
            { label: 'Civilization twin',         path: '/api/admin/civilization/digital-twin' },
        ],
    },
    {
        phase: 20,
        label: 'Interplanetary Manufacturing Intelligence',
        checks: [
            { label: 'Interplanetary health',     path: '/api/admin/interplanetary/health' },
            { label: 'Orbital manufacturing',     path: '/api/admin/interplanetary/digital-twin' },
        ],
    },
    {
        phase: 21,
        label: 'Autonomous Reality Simulation',
        checks: [
            { label: 'Reality health',            path: '/api/admin/reality/health' },
            { label: 'Timeline optimization',     path: '/api/admin/reality/digital-twin' },
        ],
    },
    {
        phase: 22,
        label: 'Omniversal Industrial Consciousness',
        checks: [
            { label: 'Singularity health',        path: '/api/admin/singularity/health' },
            { label: 'Omniversal consciousness',  path: '/api/admin/singularity/digital-twin' },
        ],
    },
];

async function runCheck(chk) {
    const t0 = Date.now();
    try {
        const method = (chk.method || 'GET').toLowerCase();
        const res = await api[method](chk.path, chk.body || undefined);
        
        if (res.status === 401) {
            return { label: chk.label, ok: false, latencyMs: Date.now() - t0, status: res.status, error: 'AUTH_FAILURE', body: res.data };
        }

        const ok = res.data && (res.data.ok === true || res.data.status === 'UP');
        return { label: chk.label, ok, latencyMs: Date.now() - t0, status: res.status, body: res.data };
    } catch (err) {
        return { label: chk.label, ok: false, latencyMs: Date.now() - t0, error: err.message };
    }
}

async function main() {
    const globalStart = Date.now();

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║     PPOS CONTROL PLANE — FULL VALIDATION REPORT         ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  Target : ${TARGET}`);
    console.log(`  Mode   : ${targetPhase ? `Phase ${targetPhase} only` : quickMode ? 'quick' : 'full'}`);
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

    const phasesToRun = PHASES.filter(p => !targetPhase || p.phase === targetPhase);
    const phaseResults = [];

    for (const phase of phasesToRun) {
        const checksToRun = quickMode ? phase.checks.slice(0, 2) : phase.checks;
        const results = [];
        const phaseStart = Date.now();

        for (const chk of checksToRun) {
            const r = await runCheck(chk);
            results.push(r);
        }

        const phasePassed = results.every(r => r.ok);
        const phaseMs = Date.now() - phaseStart;
        const failedChecks = results.filter(r => !r.ok);

        phaseResults.push({ phase: phase.phase, label: phase.label, passed: phasePassed, results, phaseMs });

        const statusIcon = phasePassed ? '✓' : '✗';
        const statusText = phasePassed ? 'PASS' : 'FAIL';
        console.log(`  ${statusIcon}  Phase ${String(phase.phase).padEnd(4)} [${statusText}]  ${phase.label.padEnd(44)} (${phaseMs}ms)`);
        if (!phasePassed && !quickMode) {
            failedChecks.forEach(fc => {
                const errorInfo = fc.error ? ` — ${fc.error}` : '';
                const statusInfo = fc.status ? ` [Status: ${fc.status}]` : '';
                const bodyInfo = fc.body && fc.status !== 200 ? ` | Body: ${JSON.stringify(fc.body)}` : '';
                console.log(`         ↳ FAIL: ${fc.label}${errorInfo}${statusInfo}${bodyInfo}`);
            });
        }
    }

    // --- Aggregate ---
    const totalPhases = phaseResults.length;
    const passedPhases = phaseResults.filter(p => p.passed).length;
    const failedPhases = totalPhases - passedPhases;
    const allChecks = phaseResults.flatMap(p => p.results);
    const totalChecks = allChecks.length;
    const passedChecks = allChecks.filter(c => c.ok).length;
    const criticalFailures = failedPhases;
    const warnings = allChecks.filter(c => !c.ok && phaseResults.find(p => p.results.includes(c) && p.passed)).length;
    const globalScore = Math.round((passedPhases / totalPhases) * 100);
    const duration = ((Date.now() - globalStart) / 1000).toFixed(1);
    const isReady = failedPhases === 0;

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║          CONTROL PLANE FULL VALIDATION REPORT            ║');
    console.log('╠══════════════════════════════════════════════════════════╣');

    phaseResults.forEach(p => {
        const icon = p.passed ? '✓' : '✗';
        console.log(`║  ${icon}  Phase ${String(p.phase).padEnd(4)} : ${p.passed ? 'PASS' : 'FAIL'.padEnd(4)}  ${p.label.slice(0, 42).padEnd(42)} ║`);
    });

    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Global Stability Score  : ${String(globalScore + '/100').padEnd(30)}║`);
    console.log(`║  Validation Duration     : ${String(duration + 's').padEnd(30)}║`);
    console.log(`║  Total Checks            : ${String(totalChecks).padEnd(30)}║`);
    console.log(`║  Checks Passed           : ${String(passedChecks).padEnd(30)}║`);
    console.log(`║  Critical Failures       : ${String(criticalFailures).padEnd(30)}║`);
    console.log(`║  Warnings                : ${String(warnings).padEnd(30)}║`);
    console.log('╚══════════════════════════════════════════════════════════╝');

    if (isReady) {
        console.log('\n  ✓ SYSTEM STATUS: PRODUCTION READY\n');
        process.exit(0);
    } else {
        console.error(`\n  ✗ SYSTEM STATUS: ${failedPhases} PHASE(S) FAILING — resolve before production deployment\n`);
        process.exit(1);
    }
}

main();
