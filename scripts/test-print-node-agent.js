/**
 * scripts/test-print-node-agent.js
 * 
 * Phase 34 - Live Federation Activation.
 * Validates the Industrial Print Node Agent layer.
 */
const axios = require('axios');

async function runTest() {
    console.log('--- PHASE 34 PRINT NODE AGENT TEST ---');
    
    const BASE_URL = 'http://localhost:3000/api/admin/nodes';
    // Use an existing node or a new one for testing
    const TEST_NODE_ID = 'test-agent-001';

    // Note: Since this is /api/admin, it requires admin auth.
    // For a simple script validation, we assume local dev without strict auth or using a known token.
    // However, if we're running it manually, we might need to provide a token.
    const headers = {
        'Content-Type': 'application/json'
        // 'Authorization': 'Bearer ...' // In production this is required
    };

    try {
        // 1. Test Heartbeat Ingestion
        console.log(`[TEST] Sending Agent Heartbeat for ${TEST_NODE_ID}...`);
        const heartbeatRes = await axios.post(`${BASE_URL}/heartbeat`, {
            node_id: TEST_NODE_ID,
            printhouse_id: 'ph_test_001',
            status: 'ONLINE',
            machine_state: 'PRINTING',
            worker_state: 'ACTIVE',
            queue_depth: 25,
            active_jobs: 5,
            capacity_utilization_pct: 62,
            sync_version: '1.0.2-beta'
        }, { headers });
        console.log('RESULT:', heartbeatRes.data);

        // 2. Test Live Nodes List
        console.log('\n[TEST] Fetching Live Nodes...');
        const liveRes = await axios.get(`${BASE_URL}/live`, { headers });
        console.log('LIVE NODES:', liveRes.data.nodes?.length || 0, 'found');

        // 3. Test Node Status
        console.log(`\n[TEST] Fetching Status for ${TEST_NODE_ID}...`);
        const statusRes = await axios.get(`${BASE_URL}/status/${TEST_NODE_ID}`, { headers });
        console.log('STATUS:', statusRes.data.status?.id === TEST_NODE_ID ? 'MATCH' : 'MISMATCH');
        if (statusRes.data.status?.latest_heartbeat) {
            console.log('LATEST HEARTBEAT AT:', statusRes.data.status.latest_heartbeat.heartbeat_at);
        }

        console.log('\n--- TEST COMPLETE ---');
    } catch (err) {
        console.error('TEST FAILED:', err.response?.data || err.message);
        if (err.response?.status === 401) {
            console.log('TIP: Ensure you are authenticated or PPOS_AUTH_DISABLED=true is set in dev.');
        }
    }
}

runTest();
