/**
 * scripts/test-live-capacity-sync.js
 * 
 * Phase 34 - Live Federation Activation.
 * Validates the Live Capacity Sync layer and scoring integration.
 */
const db = require('../src/api/services/mysqlClient');
const capacitySync = require('../src/api/services/LiveCapacitySyncService');
const scoringService = require('../src/api/services/industrialDispatchScoringService');

async function runTest() {
    console.log('--- PHASE 34 LIVE CAPACITY SYNC TEST ---');
    const TEST_NODE_ID = 'adv-2025';

    try {
        // 1. Ensure test node exists in print_nodes
        console.log(`[SETUP] Ensuring test node ${TEST_NODE_ID} exists...`);
        await db.query(`
            INSERT INTO print_nodes (id, company_name, status, country)
            VALUES (?, 'Advanced Print Solutions', 'ONLINE', 'UK')
            ON DUPLICATE KEY UPDATE status = 'ONLINE'
        `, [TEST_NODE_ID]);

        // 2. Seed a FRESH heartbeat
        console.log('[STEP 1] Seeding FRESH heartbeat...');
        await db.query(`
            INSERT INTO node_heartbeats (
                node_id, status, utilization_pct, queue_depth, active_jobs, heartbeat_at
            ) VALUES (?, 'ONLINE', 45, 10, 2, CURRENT_TIMESTAMP)
        `, [TEST_NODE_ID]);

        // 3. Run Sync
        console.log('[STEP 2] Running Live Capacity Sync...');
        const syncResult = await capacitySync.syncLiveCapacity();
        console.log('SYNC RESULT:', syncResult);

        // 4. Validate Scoring (Eligible)
        console.log('[STEP 3] Validating Scoring Eligibility (Fresh)...');
        const scoreResultFresh = await scoringService.scoreDispatchCandidates({
            destination_country: 'UK',
            product_type: 'BOOK'
        });
        const candidateFresh = scoreResultFresh.candidates.find(c => c.node_id === TEST_NODE_ID);
        console.log('SCORING (FRESH):', candidateFresh ? `ELIGIBLE (Score: ${candidateFresh.score_total})` : 'REJECTED');

        // 5. Seed a STALE heartbeat (simulated)
        console.log('\n[STEP 4] Seeding STALE heartbeat (30m ago)...');
        await db.query(`
            UPDATE node_heartbeats 
            SET heartbeat_at = DATE_SUB(NOW(), INTERVAL 30 MINUTE)
            WHERE node_id = ?
        `, [TEST_NODE_ID]);

        // 6. Run Sync again
        console.log('[STEP 5] Running Live Capacity Sync (Stale)...');
        await capacitySync.syncLiveCapacity();

        // 7. Validate Scoring (Rejected)
        console.log('[STEP 6] Validating Scoring Eligibility (Stale)...');
        const scoreResultStale = await scoringService.scoreDispatchCandidates({
            destination_country: 'UK',
            product_type: 'BOOK'
        });
        const candidateStale = scoreResultStale.candidates.find(c => c.node_id === TEST_NODE_ID);
        const rejection = scoreResultStale.rejected.find(r => r.node_id === TEST_NODE_ID);
        console.log('SCORING (STALE):', candidateStale ? 'ELIGIBLE (WRONG)' : `REJECTED (Reason: ${rejection?.reason})`);

        console.log('\n--- TEST COMPLETE ---');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        process.exit(1);
    }
}

runTest();
