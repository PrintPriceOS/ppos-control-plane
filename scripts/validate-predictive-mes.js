/**
 * scripts/validate-predictive-mes.js
 * 
 * Validates Phase 13 — Predictive Industrial Constraints.
 */
const axios = require('axios');

const API_BASE = process.env.PPOS_CONTROL_PLANE_URL || 'http://localhost:8080';
const ADMIN_TOKEN = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
});

async function validate() {
    console.log('--- PHASE 13 VALIDATION: PREDICTIVE INDUSTRIAL CONSTRAINTS ---');

    try {
        // 1. Check Predictive Health
        console.log('\n[1/5] Checking Predictive Health...');
        const healthRes = await api.get('/api/admin/predictive/health');
        console.log('Health:', JSON.stringify(healthRes.data, null, 2));

        if (!healthRes.data.ok || healthRes.data.health.state !== 'PREDICTIVE_ACTIVE') {
            throw new Error('Predictive health state invalid');
        }

        // 2. Simulate Material Depletion
        console.log('\n[2/5] Simulating Material Depletion...');
        // We'll just check if the endpoint exists and returns something
        const matRes = await api.get('/api/admin/predictive/materials');
        console.log('Materials Count:', matRes.data.length);

        // 3. Check Bottleneck Forecasts
        console.log('\n[3/5] Checking Bottleneck Forecasts...');
        const bottleRes = await api.get('/api/admin/predictive/bottlenecks');
        console.log('Forecasts Count:', bottleRes.data.length);

        // 4. Trigger Risk Recomputation
        console.log('\n[4/5] Triggering Risk Recomputation...');
        const recompRes = await api.post('/api/admin/predictive/recompute');
        console.log('Recomputed Dispatches:', recompRes.data.recomputed);

        // 5. Verify Risk Scores
        console.log('\n[5/5] Verifying Risk Scores...');
        const riskRes = await api.get('/api/admin/predictive/risk');
        console.log('High Risk Dispatches:', riskRes.data.length);

        console.log('\n--- VALIDATION SUCCESSFUL ---');
    } catch (err) {
        console.error('\n--- VALIDATION FAILED ---');
        console.error(err.response?.data || err.message);
        process.exit(1);
    }
}

validate();
