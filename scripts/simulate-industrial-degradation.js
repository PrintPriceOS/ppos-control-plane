/**
 * scripts/simulate-industrial-degradation.js
 * 
 * Diagnostic utility to test platform resilience, quarantine, and incident generation.
 * ⚠️ DO NOT RUN IN PRODUCTION WITHOUT APPROVAL.
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.PPOS_CONTROL_URL || 'http://localhost:8080';
const TOKEN = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

const client = axios.create({
    baseURL: BASE_URL,
    headers: { 'Authorization': `Bearer ${TOKEN}` },
    validateStatus: false
});

async function simulate() {
    const scenario = process.argv[2] || 'WORKER_DEGRADATION';
    console.log(`[STRESS-TEST] Starting Scenario: ${scenario}`);

    switch (scenario) {
        case 'WORKER_DEGRADATION':
            await simulateWorkerDegradation();
            break;
        case 'STORAGE_LATENCY':
            await simulateStorageLatency();
            break;
        case 'INCIDENT_STORM':
            await simulateIncidentStorm();
            break;
        default:
            console.error(`Unknown scenario: ${scenario}`);
    }
}

async function simulateWorkerDegradation() {
    console.log('[SCENARIO] Sending heartbeats with high memory pressure and failure rates...');
    const workerId = 'test-worker-degraded';
    
    // Simulate gradual degradation
    for (let i = 0; i < 5; i++) {
        const pressure = 60 + (i * 10);
        console.log(`[STEP] Heartbeat ${i+1}: Memory Pressure ${pressure}%`);
        
        await client.post('/api/admin/orchestration/workers/heartbeat', {
            workerId,
            hostname: 'diag-node-01',
            status: 'HEALTHY',
            memoryPressure: pressure,
            failureRate: i * 5,
            gsVersion: '9.54'
        });
        
        await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('[VERIFY] Check Industrial Ops Dashboard for QUARANTINE status.');
}

async function simulateIncidentStorm() {
    console.log('[SCENARIO] Raising multiple concurrent incidents...');
    for (let i = 0; i < 10; i++) {
        await client.post('/api/admin/orchestration/incidents', {
            scope: 'FLEET',
            severity: i > 7 ? 'CRITICAL' : 'WARNING',
            event: 'SIMULATED_FAILURE',
            details: { test: true, iteration: i }
        });
    }
    console.log('[VERIFY] Check Incident Registry for alert grouping.');
}

simulate();
