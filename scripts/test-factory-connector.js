/**
 * scripts/test-factory-connector.js
 * 
 * Phase 34 - Live Federation Activation.
 * Validates the Factory Connector SDK endpoints.
 */
const axios = require('axios');

async function runTest() {
    console.log('--- PHASE 34 FACTORY CONNECTOR TEST ---');
    
    const BASE_URL = 'http://localhost:3000/api/connectors/factory';
    const TEST_NODE_ID = 'adv-2025';
    const TEST_API_KEY = 'industrial-dev-key-123';

    const headers = {
        'x-node-id': TEST_NODE_ID,
        'x-api-key': TEST_API_KEY,
        'Content-Type': 'application/json'
    };

    try {
        // 1. Test Config
        console.log('[TEST] Fetching Connector Config...');
        const configRes = await axios.get(`${BASE_URL}/config`, { headers });
        console.log('CONFIG:', configRes.data);

        // 2. Test Heartbeat
        console.log('\n[TEST] Sending Heartbeat...');
        const heartbeatRes = await axios.post(`${BASE_URL}/heartbeat`, {
            queue_depth: 15,
            active_jobs: 3,
            utilization_pct: 45,
            machine_state: 'PRINTING',
            worker_state: 'ACTIVE'
        }, { headers });
        console.log('HEARTBEAT:', heartbeatRes.data);

        // 3. Test Job Update (Simulated Dispatch ID)
        console.log('\n[TEST] Sending Job Update...');
        // Note: This will fail if dispatchId doesn't exist, but we check the auth/route hit
        try {
            const jobUpdateRes = await axios.post(`${BASE_URL}/job-update`, {
                dispatchId: 'mfg_disp_unknown_test',
                status: 'PRINTING',
                message: 'Commencing high-density print job'
            }, { headers });
            console.log('JOB UPDATE:', jobUpdateRes.data);
        } catch (err) {
            console.log('JOB UPDATE (Expected Error if ID missing):', err.response?.data?.error || err.message);
        }

        console.log('\n--- TEST COMPLETE ---');
    } catch (err) {
        console.error('TEST FAILED:', err.response?.data || err.message);
        if (!err.response && err.code === 'ECONNREFUSED') {
            console.log('\nTIP: Ensure the Control Plane server is running (npm run dev)');
        }
    }
}

runTest();
