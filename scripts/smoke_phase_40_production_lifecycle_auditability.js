/**
 * scripts/smoke_phase_40_production_lifecycle_auditability.js
 * 
 * Asserts that the Production Queue lifecycle properly emits centralized audit events.
 */

require('dotenv').config();
const mysqlClient = require('../src/api/services/mysqlClient');
const { v4: uuidv4 } = require('uuid');
const lifecycleAudit = require('../src/api/services/marketplaceLifecycleAuditService');
const auditLogger = require('../src/api/services/auditLoggerService');

async function test() {
    console.log('================================================================================');
    console.log('PHASE 40 SMOKE TEST: PRODUCTION LIFECYCLE AUDITABILITY');
    console.log('================================================================================');

    const testOrderId = `test_ord_phase40_${Date.now()}`;
    const traceId = uuidv4();

    console.log(`[1] Injecting simulated audit events for order ${testOrderId}...`);
    try {
        await lifecycleAudit.auditProductionQueueTransition('PRODUCTION_QUEUE_ELIGIBILITY_CHECKED', 'SUCCESS', {
            order_id: testOrderId,
            previous_status: 'PAYMENT_CONFIRMED',
            next_status: 'PAYMENT_CONFIRMED',
            actor: 'admin',
            trace_id: traceId
        });

        await lifecycleAudit.auditProductionQueueTransition('PRODUCTION_QUEUED', 'SUCCESS', {
            order_id: testOrderId,
            previous_status: 'PAYMENT_CONFIRMED',
            next_status: 'PRODUCTION_QUEUED',
            actor: 'admin',
            trace_id: traceId
        });

        await lifecycleAudit.auditMachineAssignmentTransition('MACHINE_ASSIGNED', 'SUCCESS', {
            order_id: testOrderId,
            previous_status: 'PRODUCTION_QUEUED',
            next_status: 'PRODUCTION_QUEUED',
            machine_id: 'PRN-001',
            actor: 'admin',
            trace_id: traceId
        });

        await lifecycleAudit.auditProductionExecutionTransition('PRODUCTION_COMPLETED', 'SUCCESS', {
            order_id: testOrderId,
            previous_status: 'PRODUCTION_QUEUED',
            next_status: 'PRODUCTION_COMPLETED',
            actor: 'system',
            trace_id: traceId
        });

        await lifecycleAudit.auditDeliveryHandoffTransition('DELIVERY_HANDOFF_READY', 'SUCCESS', {
            order_id: testOrderId,
            previous_status: 'PRODUCTION_COMPLETED',
            next_status: 'DELIVERY_HANDOFF_READY',
            actor: 'system',
            trace_id: traceId
        });

        console.log(`[2] Verifying events in api_audit_logs...`);
        const rows = await mysqlClient.query(`
            SELECT event_type, status, metadata_json
            FROM api_audit_logs
            WHERE JSON_EXTRACT(metadata_json, '$.order_id') = ?
            ORDER BY created_at ASC
        `, [testOrderId]);

        if (rows.length !== 5) {
            throw new Error(`Expected 5 audit events, found ${rows.length}`);
        }

        const events = rows.map(r => r.event_type);
        console.log('Found events:', events);

        const expected = [
            'PRODUCTION_QUEUE_ELIGIBILITY_CHECKED',
            'PRODUCTION_QUEUED',
            'MACHINE_ASSIGNED',
            'PRODUCTION_COMPLETED',
            'DELIVERY_HANDOFF_READY'
        ];

        for (let i = 0; i < expected.length; i++) {
            if (events[i] !== expected[i]) {
                throw new Error(`Expected event ${expected[i]} at position ${i}, got ${events[i]}`);
            }
        }

        const machineAssignedEvent = rows.find(r => r.event_type === 'MACHINE_ASSIGNED');
        const metadata = typeof machineAssignedEvent.metadata_json === 'string' ? JSON.parse(machineAssignedEvent.metadata_json) : machineAssignedEvent.metadata_json;

        if (metadata.machine_id !== 'PRN-001') {
            throw new Error('Machine ID was not correctly persisted in canonical metadata format.');
        }

        console.log('✅ Audit simulation and persistence successful!');
        console.log('✅ Canonical metadata format validated.');

    } catch (e) {
        console.error('❌ Test failed:', e.message);
        process.exit(1);
    } finally {
        await mysqlClient.query(`
            DELETE FROM api_audit_logs WHERE JSON_EXTRACT(metadata_json, '$.order_id') = ?
        `, [testOrderId]);
        process.exit(0);
    }
}

test();
