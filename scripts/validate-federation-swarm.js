/**
 * PHASE 16 — INDUSTRIAL FEDERATION & SWARM VALIDATION
 * 
 * This script validates the federated industrial operating system.
 * It checks:
 * 1. Federation Health & Swarm Stability
 * 2. Factory Registry Integrity
 * 3. Distributed Delegation Lineage
 * 4. Swarm Consensus Logging
 * 5. Global Intelligence Insights
 */

const axios = require('axios');

const BASE_URL = process.env.PPOS_CONTROL_PLANE_URL || 'http://localhost:8080';
const ADMIN_TOKEN = process.env.PPOS_CONTROL_TOKEN || 'dev-admin-token';

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

async function validateFederation() {
    console.log('--- PHASE 16: INDUSTRIAL FEDERATION VALIDATION ---');
    console.log(`Target: ${BASE_URL}\n`);

    let success = true;

    try {
        // 1. Check Federation Health
        console.log('[1/7] Checking Federation Health...');
        const healthRes = await api.get('/api/admin/federation/health');
        if (healthRes.data.ok) {
            console.log('      PASS: Federation Health operational.');
            console.log(`      Status: ${healthRes.data.health.state}`);
            console.log(`      Stability: ${healthRes.data.health.swarmStability}%`);
        } else {
            console.error('      FAIL: Federation Health reports error.');
            success = false;
        }

        // 2. Check Factory Registry
        console.log('[2/7] Checking Factory Registry...');
        const factoriesRes = await api.get('/api/admin/federation/factories');
        if (factoriesRes.data.ok && Array.isArray(factoriesRes.data.factories)) {
            console.log(`      PASS: Found ${factoriesRes.data.factories.length} registered factories.`);
        } else {
            console.error('      FAIL: Factory Registry inaccessible or empty.');
            success = false;
        }

        // 3. Check Distributed Delegations
        console.log('[3/7] Checking Distributed Delegations...');
        const delegationsRes = await api.get('/api/admin/federation/delegations');
        if (delegationsRes.data.ok) {
            console.log(`      PASS: Delegation ledger accessible (${delegationsRes.data.delegations.length} events).`);
        } else {
            console.error('      FAIL: Delegation ledger inaccessible.');
            success = false;
        }

        // 4. Check Swarm Consensus
        console.log('[4/7] Checking Swarm Consensus...');
        const consensusRes = await api.get('/api/admin/federation/consensus');
        if (consensusRes.data.ok) {
            console.log(`      PASS: Consensus event stream LIVE.`);
        } else {
            console.error('      FAIL: Consensus stream inaccessible.');
            success = false;
        }

        // 5. Check Federated Digital Twin
        console.log('[5/7] Checking Federated Digital Twin...');
        const twinRes = await api.get('/api/admin/federation/digital-twin');
        if (twinRes.data.ok) {
            console.log(`      PASS: Global observability snapshots found.`);
        } else {
            console.error('      FAIL: Federated Digital Twin inaccessible.');
            success = false;
        }

        // 6. Test Federation Snapshot
        console.log('[6/7] Testing Federation Snapshot Trigger...');
        const snapshotRes = await api.post('/api/admin/federation/snapshot');
        if (snapshotRes.data.ok) {
            console.log('      PASS: Manual snapshot triggered successfully.');
        } else {
            console.error('      FAIL: Manual snapshot trigger failed.');
            success = false;
        }

        // 7. Check Federation Recovery Logs
        console.log('[7/7] Checking Federation Recovery Logs...');
        const recoveryRes = await api.get('/api/admin/federation/recovery');
        if (recoveryRes.data.ok) {
            console.log('      PASS: Recovery logs accessible.');
        } else {
            console.error('      FAIL: Recovery logs inaccessible.');
            success = false;
        }

    } catch (err) {
        console.error('\n!!! VALIDATION CRASHED !!!');
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error(`Body: ${JSON.stringify(err.response.data)}`);
        } else {
            console.error(err.message);
        }
        success = false;
    }

    console.log('\n----------------------------------------------');
    if (success) {
        console.log('PHASE 16 VALIDATION: SUCCESS');
        process.exit(0);
    } else {
        console.log('PHASE 16 VALIDATION: FAILED');
        process.exit(1);
    }
}

validateFederation();
