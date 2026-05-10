/**
 * scripts/validate-interplanetary-civilization.js
 * 
 * Validates the Phase 20 Interplanetary Industrial Civilization
 * and Autonomous Civilization Survival features.
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
    console.log('\n--- PHASE 20 VALIDATION: INTERPLANETARY INDUSTRIAL CIVILIZATION ---');
    console.log(`Target: ${TARGET}\n`);

    if (!TOKEN) {
        console.error('FAIL: Missing PPOS_CONTROL_TOKEN environment variable.');
        process.exit(1);
    }

    let success = true;

    try {
        // [1/12] Interplanetary Federations
        console.log('[1/12] Interplanetary Federations...');
        const fedRes = await api.get('/api/admin/interplanetary/federations');
        if (fedRes.data.ok) {
            console.log('      ✓ interplanetary federations synchronized');
        } else {
            console.error('      FAIL: Interplanetary federations failed.');
            success = false;
        }

        // [2/12] Orbital Manufacturing
        console.log('[2/12] Orbital Manufacturing...');
        const orbRes = await api.get('/api/admin/interplanetary/orbital');
        if (orbRes.data.ok) {
            console.log('      ✓ orbital manufacturing operational');
        } else {
            console.error('      FAIL: Orbital manufacturing failed.');
            success = false;
        }

        // [3/12] Stellar Logistics
        console.log('[3/12] Stellar Logistics...');
        const logRes = await api.get('/api/admin/interplanetary/logistics');
        if (logRes.data.ok) {
            console.log('      ✓ stellar logistics active');
        } else {
            console.error('      FAIL: Stellar logistics failed.');
            success = false;
        }

        // [4/12] Civilization Survival
        console.log('[4/12] Civilization Survival...');
        const surRes = await api.get('/api/admin/interplanetary/survival');
        if (surRes.data.ok) {
            console.log('      ✓ civilization survival systems active');
        } else {
            console.error('      FAIL: Civilization survival failed.');
            success = false;
        }

        // [5/12] Synthetic Consciousness
        console.log('[5/12] Synthetic Consciousness...');
        const conRes = await api.get('/api/admin/interplanetary/consciousness');
        if (conRes.data.ok) {
            console.log('      ✓ synthetic industrial consciousness synchronized');
        } else {
            console.error('      FAIL: Synthetic consciousness failed.');
            success = false;
        }

        // [6/12] Deep Space Expansion
        console.log('[6/12] Deep Space Expansion...');
        const expRes = await api.get('/api/admin/interplanetary/expansion');
        if (expRes.data.ok) {
            console.log('      ✓ deep space expansion operational');
        } else {
            console.error('      FAIL: Deep space expansion failed.');
            success = false;
        }

        // [7/12] Interplanetary Equilibrium
        console.log('[7/12] Interplanetary Equilibrium...');
        const eqRes = await api.get('/api/admin/interplanetary/equilibrium');
        if (eqRes.data.ok) {
            console.log('      ✓ interplanetary equilibrium preserved');
        } else {
            console.error('      FAIL: Interplanetary equilibrium failed.');
            success = false;
        }

        // [8/12] Post-Civilization Governance
        console.log('[8/12] Post-Civilization Governance...');
        const govRes = await api.get('/api/admin/interplanetary/governance');
        if (govRes.data.ok) {
            console.log('      ✓ post-civilization governance active');
        } else {
            console.error('      FAIL: Post-civilization governance failed.');
            success = false;
        }

        // [9/12] Galactic Risk Forecasting
        console.log('[9/12] Galactic Risk Forecasting...');
        const riskRes = await api.get('/api/admin/interplanetary/risk');
        if (riskRes.data.ok) {
            console.log('      ✓ galactic forecasting synchronized');
        } else {
            console.error('      FAIL: Galactic forecasting failed.');
            success = false;
        }

        // [10/12] Infinite Optimization
        console.log('[10/12] Infinite Optimization...');
        const optRes = await api.get('/api/admin/interplanetary/optimization');
        if (optRes.data.ok) {
            console.log('      ✓ infinite optimization operational');
        } else {
            console.error('      FAIL: Infinite optimization failed.');
            success = false;
        }

        // [11/12] Civilization Continuity
        console.log('[11/12] Civilization Continuity...');
        const contRes = await api.get('/api/admin/interplanetary/continuity');
        if (contRes.data.ok) {
            console.log('      ✓ civilization continuity preserved');
        } else {
            console.error('      FAIL: Civilization continuity failed.');
            success = false;
        }

        // [12/12] Interplanetary Digital Twin
        console.log('[12/12] Interplanetary Digital Twin...');
        const twinRes = await api.get('/api/admin/interplanetary/digital-twin');
        if (twinRes.data.ok) {
            console.log('      ✓ interplanetary digital twin synchronized');
        } else {
            console.error('      FAIL: Interplanetary digital twin failed.');
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
        console.log('✓ interplanetary federations synchronized');
        console.log('✓ orbital manufacturing operational');
        console.log('✓ stellar logistics active');
        console.log('✓ civilization survival systems active');
        console.log('✓ synthetic industrial consciousness synchronized');
        console.log('✓ deep space expansion operational');
        console.log('✓ interplanetary equilibrium preserved');
        console.log('✓ post-civilization governance active');
        console.log('✓ galactic forecasting synchronized');
        console.log('✓ infinite optimization operational');
        console.log('✓ civilization continuity preserved');
        console.log('✓ interplanetary digital twin synchronized');
        process.exit(0);
    } else {
        console.error('PHASE 20 VALIDATION: FAILED');
        process.exit(1);
    }
}

runValidation();
