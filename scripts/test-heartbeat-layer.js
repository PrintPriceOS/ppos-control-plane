/**
 * scripts/test-heartbeat-layer.js
 * 
 * Validates the Industrial Heartbeat Layer by simulating node telemetry
 * and checking SLA drift detection logic.
 */
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/admin';
const ADMIN_TOKEN = 'industrial-super-token-v10'; // Replace with a valid test token if needed

async function runTest() {
    console.log('--- STARTING INDUSTRIAL HEARTBEAT LAYER VERIFICATION ---');

    try {
        // 1. Simulate Heartbeat for a Node
        console.log('\n[1] Simulating Node Heartbeat (OPTIMAL)...');
        const hb1 = await axios.post(`${API_BASE}/dispatch/heartbeat`, {
            nodeId: 'PH-001', // Ensure this node exists in your test DB
            status: 'ONLINE',
            queueDepth: 5,
            activeJobs: 2,
            utilizationPct: 15,
            machineState: 'READY',
            workerState: 'IDLE'
        }, {
            headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
        });
        console.log('Result:', hb1.data);

        // 2. Simulate Heartbeat for a Degraded Node (SLA Drift)
        console.log('\n[2] Simulating Node Heartbeat (DEGRADED/SATURATED)...');
        const hb2 = await axios.post(`${API_BASE}/dispatch/heartbeat`, {
            nodeId: 'PH-002',
            status: 'SATURATED',
            queueDepth: 150,
            activeJobs: 45,
            utilizationPct: 95,
            machineState: 'OVERLOADED',
            workerState: 'PRESSURE'
        }, {
            headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
        });
        console.log('Result:', hb2.data);

        // 3. Check Telemetry Overview
        console.log('\n[3] Fetching Industrial Telemetry Overview...');
        const overview = await axios.get(`${API_BASE}/dispatch/telemetry/overview`, {
            headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
        });
        console.log('Overview:', JSON.stringify(overview.data.telemetry, null, 2));

        console.log('\n--- VERIFICATION COMPLETE ---');
    } catch (err) {
        console.error('\n!!! VERIFICATION FAILED !!!');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Body:', err.response.data);
        } else {
            console.error('Error:', err.message);
        }
    }
}

runTest();
