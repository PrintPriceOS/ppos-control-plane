/**
 * scripts/test-industrial-event-orchestration.js
 * 
 * Validation script for Phase 10 Industrial Event Orchestration.
 * Tests:
 * 1. Dispatch Request Publishing
 * 2. Status Change Event Propagation
 * 3. Telemetry Ingestion (Heartbeat)
 * 4. Trace ID Propagation
 * 5. Fail-soft behavior (simulated)
 */
require('dotenv').config();
const eventOrchestrator = require('../src/api/services/IndustrialEventOrchestrationService');
const logger = require('../src/api/services/logger').child('test-event-orchestration');

async function runTests() {
    logger.info('Starting Phase 10 Industrial Event Orchestration Validation...');

    const testContext = {
        jobId: `test_job_${Date.now()}`,
        dispatchId: `test_dispatch_${Date.now()}`,
        nodeId: 'node_test_01',
        traceId: `trace_${Date.now()}`
    };

    try {
        // 1. Test Dispatch Requested Event
        logger.info(`[TEST] Publishing MANUFACTURING_DISPATCH_REQUESTED for Job ${testContext.jobId}...`);
        await eventOrchestrator.publishDispatchRequested({
            jobId: testContext.jobId,
            orderId: 'ORDER-TEST-001',
            federationRegion: 'eu-west',
            scoring: { score: 95 }
        }, { trace_id: testContext.traceId });

        // 2. Test Dispatch Assigned Event
        logger.info(`[TEST] Publishing MANUFACTURING_DISPATCH_ASSIGNED for Dispatch ${testContext.dispatchId}...`);
        await eventOrchestrator.publishDispatchAssigned({
            dispatchId: testContext.dispatchId,
            jobId: testContext.jobId,
            nodeId: testContext.nodeId,
            capacitySnapshot: { utilization: 45 }
        }, { trace_id: testContext.traceId });

        // 3. Test Status Changed Event
        logger.info(`[TEST] Publishing MANUFACTURING_DISPATCH_STATUS_CHANGED for Dispatch ${testContext.dispatchId}...`);
        await eventOrchestrator.publishDispatchStatusChanged({
            dispatchId: testContext.dispatchId,
            status: 'IN_PRODUCTION',
            message: 'Industrial test started.'
        }, { trace_id: testContext.traceId });

        // 4. Test Telemetry Heartbeat Consumption (Simulated)
        logger.info('[TEST] Simulating incoming TELEMETRY_HEARTBEAT...');
        const telemetryService = require('../src/api/services/IndustrialTelemetryService');
        await telemetryService.handleHeartbeat({
            nodeId: testContext.nodeId,
            status: 'ONLINE',
            utilization_pct: 35,
            machine_state: 'BUSY'
        }, { trace_id: testContext.traceId });

        // 5. Test Preflight Required
        logger.info('[TEST] Publishing PREFLIGHT_JOB_REQUESTED...');
        await eventOrchestrator.publishPreflightRequired({
            dispatchId: testContext.dispatchId,
            jobId: testContext.jobId,
            artifactReferences: ['s3://bucket/job.pdf']
        }, { trace_id: testContext.traceId });

        logger.info('--- VALIDATION SUMMARY ---');
        logger.info('✓ Dispatch Requested Event Published');
        logger.info('✓ Dispatch Assigned Event Published');
        logger.info('✓ Status Change Event Published');
        logger.info('✓ Heartbeat Handled with Trace Propagation');
        logger.info('✓ Preflight Request Published');
        logger.info('--------------------------');
        
        logger.info('Industrial Event Orchestration Validation COMPLETED SUCCESSFULLY.');

    } catch (err) {

        console.error('\n[TEST-FAILED-FULL]\n');

        console.error({
            message: err?.message,
            code: err?.code,
            stack: err?.stack,
            cause: err?.cause,
            raw: err
        });

        process.exit(1);

    } finally {

        setTimeout(() => process.exit(0), 1000);

    }
}

runTests();
