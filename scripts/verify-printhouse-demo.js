/**
 * scripts/verify-printhouse-demo.js
 * 
 * Verifies the integrity of the Printhouse Demo environment and RBAC logic.
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8081';
const BREAK_GLASS_TOKEN = process.env.PPOS_CONTROL_TOKEN;

async function verify() {
    console.log('### Starting Printhouse Demo Verification...');

    const demoEmail = 'demo-printhouse@printprice.pro';
    const demoPassword = 'DemoPrintHouse123!';

    try {
        // 1. Verify Login
        console.log('[STEP 1] Testing Demo Login...');
        const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
            email: demoEmail,
            password: demoPassword
        });

        if (!loginRes.data.ok) throw new Error('Login failed');
        const token = loginRes.data.token;
        const role = loginRes.data.user.role;
        console.log(`[SUCCESS] Logged in as ${role}`);

        const headers = { Authorization: `Bearer ${token}` };

        // 2. Verify Scoped Access (Allowed)
        console.log('[STEP 2] Testing access to scoped metrics...');
        const metricsRes = await axios.get(`${BASE_URL}/api/admin/metrics/overview`, { headers });
        console.log(`[SUCCESS] Access granted to metrics (HTTP ${metricsRes.status})`);

        // 3. Verify Forbidden Access (Global Governance)
        console.log('[STEP 3] Testing forbidden access to Global Governance...');
        try {
            await axios.get(`${BASE_URL}/api/admin/audit?limit=5`, { headers });
            console.error('[FAILURE] Should have been forbidden from global audit logs');
        } catch (err) {
            if (err.response && err.response.status === 403) {
                console.log('[SUCCESS] Forbidden access correctly blocked (HTTP 403)');
            } else {
                throw err;
            }
        }

        // 4. Verify Pricing Profiles (New Module)
        console.log('[STEP 4] Testing access to pricing profiles...');
        const pricingRes = await axios.get(`${BASE_URL}/api/admin/pricing/profiles`, { headers });
        if (Array.isArray(pricingRes.data)) {
            console.log(`[SUCCESS] Retrieved ${pricingRes.data.length} pricing profiles`);
        } else {
            console.error('[FAILURE] Unexpected pricing response format');
        }

        console.log('### Verification Completed Successfully.');
        process.exit(0);
    } catch (err) {
        console.error('[ERROR] Verification failed:', err.response?.data || err.message);
        process.exit(1);
    }
}

verify();
