/**
 * scripts/validate-governance-intelligence.js
 * 
 * Validates the Phase 18 Autonomous Industrial AI Governance and 
 * Self-Evolving Manufacturing Intelligence features.
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
    console.log('\n--- PHASE 18 VALIDATION: AUTONOMOUS INDUSTRIAL GOVERNANCE ---');
    console.log(`Target: ${TARGET}\n`);

    if (!TOKEN) {
        console.error('FAIL: Missing PPOS_CONTROL_TOKEN environment variable.');
        process.exit(1);
    }

    let success = true;

    try {
        // [1/10] Governance Health
        console.log('[1/10] Governance Health...');
        const healthRes = await api.get('/api/admin/governance/health');
        if (healthRes.data.ok) {
            console.log('      ✓ governance engine active');
            console.log('      ✓ adaptive governance operational');
        } else {
            console.error('      FAIL: Governance engine health check failed.');
            success = false;
        }

        // [2/10] Policy Engine
        console.log('[2/10] Policy Engine...');
        const policiesRes = await api.get('/api/admin/governance/policies');
        if (policiesRes.data.ok) {
            console.log('      ✓ policy engine synchronized');
        } else {
            console.error('      FAIL: Policy engine failed.');
            success = false;
        }

        // [3/10] Constitutional Integrity
        console.log('[3/10] Constitutional Integrity...');
        const constRes = await api.get('/api/admin/governance/constitution');
        if (constRes.data.ok) {
            console.log('      ✓ constitutional integrity preserved');
        } else {
            console.error('      FAIL: Constitutional integrity check failed.');
            success = false;
        }

        // [4/10] Federated Learning
        console.log('[4/10] Federated Learning...');
        const learnRes = await api.get('/api/admin/governance/learning');
        if (learnRes.data.ok) {
            console.log('      ✓ federated learning synchronized');
        } else {
            console.error('      FAIL: Federated learning failed.');
            success = false;
        }

        // [5/10] Recursive Optimization
        console.log('[5/10] Recursive Optimization...');
        const optRes = await api.get('/api/admin/governance/optimization');
        if (optRes.data.ok) {
            console.log('      ✓ recursive optimization active');
        } else {
            console.error('      FAIL: Recursive optimization failed.');
            success = false;
        }

        // [6/10] Industrial Memory Graph
        console.log('[6/10] Industrial Memory Graph...');
        const memRes = await api.get('/api/admin/governance/memory');
        if (memRes.data.ok) {
            console.log('      ✓ industrial memory graph synchronized');
        } else {
            console.error('      FAIL: Industrial memory graph failed.');
            success = false;
        }

        // [7/10] Governance Simulations
        console.log('[7/10] Governance Simulations...');
        const simRes = await api.get('/api/admin/governance/simulations');
        if (simRes.data.ok) {
            console.log('      ✓ governance simulations operational');
        } else {
            console.error('      FAIL: Governance simulations failed.');
            success = false;
        }

        // [8/10] Ethics Enforcement
        console.log('[8/10] Ethics Enforcement...');
        const ethicsRes = await api.get('/api/admin/governance/ethics');
        if (ethicsRes.data.ok) {
            console.log('      ✓ ethics enforcement active');
        } else {
            console.error('      FAIL: Ethics enforcement failed.');
            success = false;
        }

        // [9/10] Industrial Cognition
        console.log('[9/10] Industrial Cognition...');
        const cogRes = await api.get('/api/admin/governance/cognition');
        if (cogRes.data.ok) {
            console.log('      ✓ industrial cognition operational');
        } else {
            console.error('      FAIL: Industrial cognition failed.');
            success = false;
        }

        // [10/10] Governance Digital Twin
        console.log('[10/10] Governance Digital Twin...');
        const twinRes = await api.get('/api/admin/governance/digital-twin');
        if (twinRes.data.ok) {
            console.log('      ✓ governance digital twin synchronized');
        } else {
            console.error('      FAIL: Governance digital twin failed.');
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
        console.log('✓ governance engine active');
        console.log('✓ adaptive governance operational');
        console.log('✓ federated learning synchronized');
        console.log('✓ recursive optimization active');
        console.log('✓ industrial memory graph synchronized');
        console.log('✓ governance simulations operational');
        console.log('✓ ethics enforcement active');
        console.log('✓ constitutional integrity preserved');
        console.log('✓ industrial cognition operational');
        console.log('✓ governance digital twin synchronized');
        process.exit(0);
    } else {
        console.error('PHASE 18 VALIDATION: FAILED');
        process.exit(1);
    }
}

runValidation();
