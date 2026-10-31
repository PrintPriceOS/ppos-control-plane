/**
 * scripts/validate-post-reality-singularity.js
 *
 * Validates Phase 22 — Omniversal Industrial Consciousness
 * + Post-Reality Manufacturing Singularity.
 */
require('dotenv').config();
const axios = require('axios');

const TARGET = process.env.PPOS_CONTROL_PLANE_URL || 'http://127.0.0.1:8081';
const TOKEN  = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

const api = axios.create({
    baseURL: TARGET,
    headers: { 'Authorization': `Bearer ${TOKEN}` },
    validateStatus: () => true
});

const checks = [
    { label: 'omniversal consciousness',         path: '/api/admin/singularity/consciousness' },
    { label: 'post-reality singularity',         path: '/api/admin/singularity/singularity' },
    { label: 'infinite dimensional routing',     path: '/api/admin/singularity/dimensional' },
    { label: 'universal entropy management',     path: '/api/admin/singularity/entropy' },
    { label: 'omniscient forecasting',           path: '/api/admin/singularity/forecasting' },
    { label: 'post-singularity governance',      path: '/api/admin/singularity/governance' },
    { label: 'transcendent awareness',           path: '/api/admin/singularity/awareness' },
    { label: 'causal manufacturing chains',      path: '/api/admin/singularity/causal' },
    { label: 'infinite recursion stability',     path: '/api/admin/singularity/recursion' },
    { label: 'meta-reality coordination',        path: '/api/admin/singularity/meta-reality' },
    { label: 'omniversal continuity',            path: '/api/admin/singularity/continuity' },
    { label: 'omniversal singularity twin',      path: '/api/admin/singularity/digital-twin' },
];

async function runValidation() {
    console.log('\n--- PHASE 22 VALIDATION: OMNIVERSAL INDUSTRIAL CONSCIOUSNESS ---');
    console.log(`Target: ${TARGET}\n`);

    let success = true;

    for (let i = 0; i < checks.length; i++) {
        const c = checks[i];
        try {
            const res = await api.get(c.path);
            if (res.data.ok) {
                console.log(`      ✓ ${c.label}`);
            } else {
                console.error(`      FAIL: ${c.label}`);
                success = false;
            }
        } catch (err) {
            console.error(`      CRASH [${c.label}]: ${err.message}`);
            success = false;
        }
    }

    console.log('\n----------------------------------------------');
    if (success) {
        console.log('--- VALIDATION SUCCESSFUL ---');
        checks.forEach(c => console.log(`✓ ${c.label}`));
        process.exit(0);
    } else {
        console.error('PHASE 22 VALIDATION: FAILED');
        process.exit(1);
    }
}

runValidation();
