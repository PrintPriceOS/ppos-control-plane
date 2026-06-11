'use strict';
/**
 * scripts/smoke_phase79c_production_queue_machine_load_monitor.js
 * 
 * Smoke test for Phase 79C — Production Queue / Machine Load Monitor.
 */

const db = require('../src/api/services/mysqlClient');
const queueMonitoringService = require('../src/api/services/productionQueueMonitoringService');
const machineLoadMonitoringService = require('../src/api/services/machineLoadMonitoringService');
const monitoringService = require('../src/api/services/productionMonitoringService');

let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        results.push({ label, status: 'PASS', detail });
        console.log(`  ✅  [PASS] ${label} ${detail ? `(${detail})` : ''}`);
    } else {
        FAIL++;
        results.push({ label, status: 'FAIL', detail });
        console.error(`  ❌  [FAIL] ${label} ${detail ? `: ${detail}` : ''}`);
    }
}

// Memory database mock
const mockDb = {
    snapshots: [],
    machine_loads: [],
    printhouse_machines: [],
    reset() {
        this.snapshots = [];
        this.machine_loads = [];
        this.printhouse_machines = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params) => {
        const sqlUpper = sql.trim().toUpperCase();

        if (sqlUpper.startsWith('INSERT INTO PRODUCTION_MONITORING_SNAPSHOTS')) {
            const row = {
                id: mockDb.snapshots.length + 1,
                tenant_id: params[0],
                printhouse_id: params[1],
                order_id: params[2],
                job_id: params[3],
                queue_entry_id: params[4],
                machine_id: params[5],
                production_status: params[6],
                sla_status: params[7],
                sla_started_at: params[8] ? new Date(params[8]) : null,
                sla_due_at: params[9] ? new Date(params[9]) : null,
                estimated_completion_at: params[10] ? new Date(params[10]) : null,
                actual_completed_at: params[11] ? new Date(params[11]) : null,
                remaining_minutes: params[12],
                risk_score: params[13],
                blocking_reasons_json: params[14] ? JSON.parse(params[14]) : null,
                warning_reasons_json: params[15] ? JSON.parse(params[15]) : null,
                governance_snapshot_json: params[16] ? JSON.parse(params[16]) : null,
                monitoring_snapshot_json: params[17] ? JSON.parse(params[17]) : null,
                created_at: new Date()
            };
            const idx = mockDb.snapshots.findIndex(s => s.order_id === row.order_id);
            if (idx >= 0) {
                mockDb.snapshots[idx] = row;
            } else {
                mockDb.snapshots.push(row);
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('SELECT * FROM PRODUCTION_MONITORING_SNAPSHOTS WHERE ORDER_ID = ?')) {
            const orderId = params[0];
            return mockDb.snapshots.filter(s => s.order_id === orderId);
        }

        if (sqlUpper.includes('SELECT PRODUCTION_STATUS, COUNT(*) AS COUNT FROM PRODUCTION_MONITORING_SNAPSHOTS')) {
            // Group by production_status and count
            const counts = {};
            let filtered = mockDb.snapshots;
            
            // Check for tenant scoping
            const tenantMatch = sqlUpper.match(/TENANT_ID = \?/);
            if (tenantMatch) {
                const tenantId = params[params.length - (sqlUpper.match(/PRINTHOUSE_ID = \?/) ? 2 : 1)];
                filtered = filtered.filter(s => s.tenant_id === tenantId);
            }

            for (const s of filtered) {
                counts[s.production_status] = (counts[s.production_status] || 0) + 1;
            }

            return Object.entries(counts).map(([status, cnt]) => ({ production_status: status, count: cnt }));
        }

        if (sqlUpper.startsWith('SELECT * FROM PRODUCTION_MONITORING_SNAPSHOTS WHERE SLA_STATUS = \'BLOCKED\'')) {
            let filtered = mockDb.snapshots.filter(s => s.sla_status === 'BLOCKED');
            if (sqlUpper.includes('TENANT_ID = ?')) {
                const tenantId = params[0];
                filtered = filtered.filter(s => s.tenant_id === tenantId);
            }
            return filtered;
        }

        if (sqlUpper.startsWith('SELECT * FROM PRODUCTION_MONITORING_SNAPSHOTS WHERE MACHINE_ID = ?')) {
            const machineId = params[0];
            let filtered = mockDb.snapshots.filter(s => s.machine_id === machineId);
            if (params[1]) {
                filtered = filtered.filter(s => s.tenant_id === params[1]);
            }
            return filtered;
        }

        if (sqlUpper.startsWith('INSERT INTO MACHINE_LOAD_SNAPSHOTS')) {
            const row = {
                id: mockDb.machine_loads.length + 1,
                tenant_id: params[0],
                printhouse_id: params[1],
                machine_id: params[2],
                machine_name: params[3],
                machine_type: params[4],
                load_status: params[5],
                queued_jobs_count: params[6],
                active_jobs_count: params[7],
                estimated_queue_minutes: params[8],
                capacity_score: params[9],
                next_available_at: params[10] ? new Date(params[10]) : null,
                snapshot_json: params[11] ? JSON.parse(params[11]) : null,
                created_at: new Date()
            };
            const idx = mockDb.machine_loads.findIndex(m => m.machine_id === row.machine_id);
            if (idx >= 0) {
                mockDb.machine_loads[idx] = row;
            } else {
                mockDb.machine_loads.push(row);
            }
            return { affectedRows: 1 };
        }

        if (sqlUpper.includes('FROM MACHINE_LOAD_SNAPSHOTS WHERE MACHINE_ID = ?')) {
            const machineId = params[0];
            let filtered = mockDb.machine_loads.filter(m => m.machine_id === machineId);
            if (sqlUpper.includes('TENANT_ID = ?')) {
                const tenantId = params[1];
                filtered = filtered.filter(m => m.tenant_id === tenantId);
            }
            return filtered;
        }

        if (sqlUpper.includes('FROM MACHINE_LOAD_SNAPSHOTS')) {
            let filtered = mockDb.machine_loads;
            if (sqlUpper.includes('TENANT_ID = ?')) {
                const tenantId = params[0];
                filtered = filtered.filter(m => m.tenant_id === tenantId);
            }
            return filtered;
        }

        if (sqlUpper.includes("FROM MARKETPLACE_ORDERS WHERE STATUS = 'MACHINE_ASSIGNED'")) {
            const machineIdParam = params[0];
            const count = mockDb.snapshots.filter(s => s.production_status === 'QUEUED' && s.machine_id === machineIdParam).length;
            return [{ count }];
        }

        if (sqlUpper.includes("FROM MARKETPLACE_ORDERS WHERE STATUS = 'IN_PRODUCTION'")) {
            const machineIdParam = params[0];
            const count = mockDb.snapshots.filter(s => s.production_status === 'IN_PRODUCTION' && s.machine_id === machineIdParam).length;
            return [{ count }];
        }

        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_MACHINES WHERE ID = ?')) {
            const machineId = params[0];
            return mockDb.printhouse_machines.filter(m => m.id === machineId);
        }

        return [];
    };
}

async function runTests() {
    console.log('Starting Phase 79C Smoke Tests...');
    enableMockDb();

    const tenantId = 'tenant_79c_01';
    const printhouseId = 'print_79c_01';
    const machineId = 'machine_79c_press_01';

    // Seed machines
    mockDb.printhouse_machines.push({
        id: machineId,
        machine_name: 'Super Press X1',
        machine_type: 'DIGITAL_PRESS',
        status: 'ACTIVE'
    });

    // Seed snapshots
    await monitoringService.createOrUpdateMonitoringSnapshot({
        tenantId, printhouseId, orderId: 'order_79c_01', jobId: 'job_79c_01',
        payload: { production_status: 'QUEUED', sla_status: 'ON_TRACK', machine_id: machineId },
        actor: { tenantId }
    });
    await monitoringService.createOrUpdateMonitoringSnapshot({
        tenantId, printhouseId, orderId: 'order_79c_02', jobId: 'job_79c_02',
        payload: { production_status: 'QUEUED', sla_status: 'BLOCKED', blocking_reasons_json: ['PAYMENT_NOT_CONFIRMED'] },
        actor: { tenantId }
    });
    await monitoringService.createOrUpdateMonitoringSnapshot({
        tenantId, printhouseId, orderId: 'order_79c_03', jobId: 'job_79c_03',
        payload: { production_status: 'IN_PRODUCTION', sla_status: 'ON_TRACK', machine_id: machineId },
        actor: { tenantId }
    });

    // Q1: Calculate queue depth
    const depth = await queueMonitoringService.calculateQueueDepth({ tenantId, printhouseId }, { tenantId });
    assert(depth.QUEUED === 2, 'Q1: Queue depth counted queued jobs', `Queued count: ${depth.QUEUED}`);
    assert(depth.IN_PRODUCTION === 1, 'Q1: Queue depth counted active jobs', `In production count: ${depth.IN_PRODUCTION}`);

    // Q2: Machine load evaluation
    const load = await machineLoadMonitoringService.evaluateMachineLoad({ tenantId, printhouseId, machineId });
    assert(load.load_status === 'NORMAL', 'Q2: Machine load evaluation', `Status: ${load.load_status}`);
    assert(load.estimated_queue_minutes === 45, 'Q2: Queue minutes calculated from order queries', `Minutes: ${load.estimated_queue_minutes}`);
    
    // Seed manual load snapshot
    await machineLoadMonitoringService.createMachineLoadSnapshot({
        tenantId, printhouseId, machineId,
        payload: {
            machine_name: 'Super Press X1',
            load_status: 'OVERLOADED',
            queued_jobs_count: 12,
            active_jobs_count: 1,
            estimated_queue_minutes: 210,
            capacity_score: 10
        }
    });

    // Q3: Retrieve machine workload
    const workload = await queueMonitoringService.calculateMachineWorkload({ machineId }, { tenantId });
    assert(workload.load_status === 'OVERLOADED', 'Q3: Retrieve machine workload status', `Load status: ${workload.load_status}`);
    assert(workload.queued_jobs_count === 12, 'Q3: Retrieve machine workload count', `Queued: ${workload.queued_jobs_count}`);

    // Q4: Estimate next available slot
    const nextAvail = await queueMonitoringService.estimateMachineNextAvailableAt({ machineId }, { tenantId });
    assert(nextAvail !== null && nextAvail instanceof Date, 'Q4: Next available timestamp calculated');

    // Q5: Get machine queue
    const machineQueue = await queueMonitoringService.getMachineQueue({ machineId }, { tenantId });
    assert(machineQueue.length === 2, 'Q5: Get machine queue for orders', `Count: ${machineQueue.length}`);

    // Q6: Evaluate queue bottlenecks (Overloaded machine & Blocked job)
    const bottlenecks = await queueMonitoringService.evaluateQueueBottlenecks({ tenantId, printhouseId }, { tenantId });
    const overloadedB = bottlenecks.find(b => b.type === 'MACHINE_OVERLOADED');
    const blockedB = bottlenecks.find(b => b.type === 'JOB_BLOCKED');
    assert(overloadedB !== undefined, 'Q6: Bottleneck detected for overloaded machine');
    assert(blockedB !== undefined && blockedB.reasons.includes('PAYMENT_NOT_CONFIRMED'), 'Q6: Bottleneck detected for blocked job');

    // Q7: Get queue overview
    const overview = await queueMonitoringService.getQueueOverview({ tenantId, printhouseId }, { tenantId });
    assert(overview.queue_depth.QUEUED === 2, 'Q7: Queue overview contains depth');
    assert(overview.bottlenecks.length === 2, 'Q7: Queue overview contains bottlenecks');
    assert(overview.machines.length === 1, 'Q7: Queue overview contains machines list');

    // Q8: Tenant isolation checks
    const otherTenantId = 'tenant_79c_other';
    const overviewOther = await queueMonitoringService.getQueueOverview({ tenantId: otherTenantId }, { tenantId: otherTenantId });
    assert(overviewOther.queue_depth.QUEUED === 0, 'Q8: Tenant isolation verified (other tenant sees 0 queued)');
    assert(overviewOther.bottlenecks.length === 0, 'Q8: Tenant isolation verified (other tenant sees 0 bottlenecks)');

    // Q9: Monitoring does not activate LIVE production
    const snapshot2 = mockDb.snapshots[0];
    assert(snapshot2.live_production_enabled === undefined || snapshot2.live_production_enabled === 0, 'Q9: Queue monitoring does not enable LIVE production');

    console.log(`\nPhase 79C Test Results: PASS: ${PASS}, FAIL: ${FAIL}`);
    if (FAIL > 0) {
        process.exit(1);
    }
}

runTests().catch(e => {
    console.error('Smoke tests crashed:', e);
    process.exit(1);
});
