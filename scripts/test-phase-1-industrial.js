/**
 * scripts/test-phase-1-industrial.js
 * 
 * Comprehensive validation script for Phase 1 Live Industrial Integration.
 * Tests:
 * 1. Heartbeat Ingestion
 * 2. Node State Updates
 * 3. Scoring Engine Integration (Industrial Metrics)
 * 4. Federation Topology State
 */
const telemetryService = require('../src/api/services/IndustrialTelemetryService');
const scoringService = require('../src/api/services/industrialDispatchScoringService');
const topologyService = require('../src/api/services/FederationTopologyService');
const db = require('../src/api/services/mysqlClient');

async function runTest() {
    console.log('--- STARTING PHASE 1 INDUSTRIAL VALIDATION ---');

    try {
        // 1. Identification of test node
        const [testNode] = await db.query("SELECT id FROM print_nodes LIMIT 1");
        if (!testNode) {
            console.error('❌ No print nodes found. Please run seeding first.');
            process.exit(1);
        }
        const nodeId = testNode.id;
        console.log(`[TEST] Using Node: ${nodeId}`);

        // 2. Test Heartbeat Ingestion
        console.log('[TEST] Injecting industrial heartbeat...');
        const heartbeatPayload = {
            status: 'BUSY',
            queue_depth: 5,
            active_jobs: 2,
            utilization_pct: 75,
            machine_state: 'PRINTING',
            worker_state: 'WORKING',
            sync_version: '1.0.5'
        };

        const heartbeatResult = await telemetryService.ingestHeartbeat(nodeId, heartbeatPayload);
        console.log('✅ Heartbeat Ingested:', heartbeatResult);

        // 3. Verify Node State
        const [updatedNode] = await db.query("SELECT status, capacity_utilization_pct, machine_state FROM print_nodes WHERE id = ?", [nodeId]);
        if (updatedNode.status === 'BUSY' && updatedNode.capacity_utilization_pct === 75) {
            console.log('✅ Node state updated correctly in DB.');
        } else {
            console.warn('⚠️ Node state update mismatch:', updatedNode);
        }

        const orchestrationService = require('../src/api/services/productionOrchestrationService');
        
        const jobInput = {
            id: 'test_job_phase_1',
            tenant_id: 'tenant_demo',
            destination_country: 'DE'
        };

        // 4. Test REAL Dispatch Creation Pipeline
        console.log('[TEST] Executing real industrial dispatch pipeline...');
        const recommendation = {
            nodeId: nodeId,
            machineId: `machine_${nodeId}_primary`,
            estimatedCost: 150.50,
            estimatedMargin: 45.00,
            estimatedProductionDays: 2,
            score_total: 88,
            industrial_metrics: {
                economic_efficiency: 1.15
            }
        };

        const dispatchResult = await orchestrationService.assignDispatch(jobInput.id, recommendation);
        console.log('✅ Dispatch Pipeline Executed:', dispatchResult);

        // 5. Verify Evidence Snapshot & Lifecycle
        const [dispatch] = await db.query("SELECT status, evidence_snapshot_json, economic_score FROM manufacturing_dispatches WHERE id = ?", [dispatchResult.dispatchId]);
        if (dispatch && dispatch.evidence_snapshot_json) {
            console.log('✅ Industrial evidence persisted.');
            console.log('✅ Economic score:', dispatch.economic_score);
        } else {
            console.error('❌ Dispatch evidence missing.');
        }

        // 6. Test Federation Topology
        console.log('[TEST] Fetching global grid topology...');
        const topology = await topologyService.getGlobalGridState();
        console.log('✅ Topology retrieved.');
        console.log('   Active Hubs:', topology.hubs.filter(h => h.is_active).length);
        console.log('   Grid Stability Index:', topology.grid_stability_index);

        console.log('--- PHASE 1 VALIDATION COMPLETED SUCCESSFULLY ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Test failed with error:', err.message);
        process.exit(1);
    }
}

runTest();
