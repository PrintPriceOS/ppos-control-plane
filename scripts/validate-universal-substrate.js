/**
 * scripts/validate-universal-substrate.js
 * 
 * Validates the Phase 21 Autonomous Reality Simulation
 * and Universal Industrial Substrate features.
 */
require('dotenv').config();
const axios = require('axios');

const TARGET = process.env.PPOS_CONTROL_PLANE_URL || 'http://127.0.0.1:8081';
const TOKEN = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

const api = axios.create({
    baseURL: TARGET,
    headers: { 'Authorization': `Bearer ${TOKEN}` },
    validateStatus: () => true
});

async function runValidation() {
    console.log('\n--- PHASE 21 VALIDATION: UNIVERSAL INDUSTRIAL SUBSTRATE ---');
    console.log(`Target: ${TARGET}\n`);

    if (!TOKEN) {
        console.error('FAIL: Missing PPOS_CONTROL_TOKEN environment variable.');
        process.exit(1);
    }

    let success = true;

    try {
        // Reality Simulation
        const simRes = await api.get('/api/admin/reality/health');
        if (simRes.data.ok) {
            console.log('      ✓ reality simulation synchronized');
        } else {
            console.error('      FAIL: Reality simulation failed.');
            success = false;
        }

        // Timeline Optimization
        const timeRes = await api.get('/api/admin/reality/timeline');
        if (timeRes.data.ok) {
            console.log('      ✓ timeline optimization active');
        } else {
            console.error('      FAIL: Timeline optimization failed.');
            success = false;
        }

        // Parallel Civilization Modeling
        const parRes = await api.get('/api/admin/reality/parallel');
        if (parRes.data.ok) {
            console.log('      ✓ parallel civilization modeling operational');
        } else {
            console.error('      FAIL: Parallel modeling failed.');
            success = false;
        }

        // Quantum Forecasting
        const quantRes = await api.get('/api/admin/reality/quantum');
        if (quantRes.data.ok) {
            console.log('      ✓ quantum forecasting synchronized');
        } else {
            console.error('      FAIL: Quantum forecasting failed.');
            success = false;
        }

        // Universal Substrate
        const subRes = await api.get('/api/admin/reality/substrate');
        if (subRes.data.ok) {
            console.log('      ✓ universal substrate active');
        } else {
            console.error('      FAIL: Universal substrate failed.');
            success = false;
        }

        // Transcendent Optimization
        const optRes = await api.get('/api/admin/reality/optimization');
        if (optRes.data.ok) {
            console.log('      ✓ transcendent optimization operational');
        } else {
            console.error('      FAIL: Transcendent optimization failed.');
            success = false;
        }

        // Omniscient Digital Twin
        const twinRes = await api.get('/api/admin/reality/digital-twin');
        if (twinRes.data.ok) {
            console.log('      ✓ omniscient digital twin synchronized');
        } else {
            console.error('      FAIL: Omniscient digital twin failed.');
            success = false;
        }

        // Recursive Existence Stability
        const stabRes = await api.get('/api/admin/reality/stability');
        if (stabRes.data.ok) {
            console.log('      ✓ recursive existence stability preserved');
        } else {
            console.error('      FAIL: Recursive existence stability failed.');
            success = false;
        }

    } catch (err) {
        console.error('\n!!! VALIDATION CRASHED !!!');
        console.error(err.message);
        success = false;
    }

    console.log('\n----------------------------------------------');
    if (success) {
        console.log('--- VALIDATION SUCCESSFUL ---');
        console.log('✓ reality simulation synchronized');
        console.log('✓ timeline optimization active');
        console.log('✓ parallel civilization modeling operational');
        console.log('✓ quantum forecasting synchronized');
        console.log('✓ universal substrate active');
        console.log('✓ transcendent optimization operational');
        console.log('✓ omniscient digital twin synchronized');
        console.log('✓ recursive existence stability preserved');
        process.exit(0);
    } else {
        console.error('PHASE 21 VALIDATION: FAILED');
        process.exit(1);
    }
}

runValidation();
