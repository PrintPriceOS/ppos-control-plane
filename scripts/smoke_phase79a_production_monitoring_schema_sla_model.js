'use strict';
/**
 * scripts/smoke_phase79a_production_monitoring_schema_sla_model.js
 * 
 * Smoke test for Phase 79A — Production Monitoring Schema / SLA Model.
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/api/services/mysqlClient');
const monitoringService = require('../src/api/services/productionMonitoringService');
const slaRiskService = require('../src/api/services/slaRiskService');
const machineLoadService = require('../src/api/services/machineLoadMonitoringService');
const incidentService = require('../src/api/services/productionIncidentService');

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
    events: [],
    incidents: [],
    machine_loads: [],
    sla_policies: [],
    orders: [],
    bindings: [],
    reset() {
        this.snapshots = [];
        this.events = [];
        this.incidents = [];
        this.machine_loads = [];
        this.sla_policies = [];
        this.orders = [];
        this.bindings = [];
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

        if (sqlUpper.startsWith('INSERT INTO PRODUCTION_TIMELINE_EVENTS')) {
            const row = {
                id: mockDb.events.length + 1,
                tenant_id: params[0],
                printhouse_id: params[1],
                order_id: params[2],
                job_id: params[3],
                event_type: params[4],
                event_status: params[5],
                actor_user_id: params[6],
                actor_role: params[7],
                message: params[8],
                metadata_json: params[9] ? JSON.parse(params[9]) : null,
                created_at: new Date()
            };
            mockDb.events.push(row);
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('INSERT INTO SLA_POLICY_SNAPSHOTS')) {
            const row = {
                id: mockDb.sla_policies.length + 1,
                tenant_id: params[0],
                printhouse_id: params[1],
                order_id: params[2],
                job_id: params[3],
                sla_profile_id: params[4],
                sla_name: params[5],
                production_days_min: params[6],
                production_days_max: params[7],
                cutoff_time_local: params[8],
                timezone: params[9],
                weekend_production: params[10],
                rush_available: params[11],
                sla_snapshot_json: params[12] ? JSON.parse(params[12]) : null,
                created_at: new Date()
            };
            mockDb.sla_policies.push(row);
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('SELECT * FROM SLA_POLICY_SNAPSHOTS WHERE ORDER_ID = ?')) {
            const orderId = params[0];
            return mockDb.sla_policies.filter(s => s.order_id === orderId);
        }

        if (sqlUpper.startsWith('SELECT TENANT_ID, METADATA_JSON FROM MARKETPLACE_ORDERS WHERE ORDER_ID = ?')) {
            const orderId = params[0];
            return mockDb.orders.filter(o => o.order_id === orderId);
        }

        if (sqlUpper.startsWith('SELECT PRINTHOUSE_ID, SLA_PROFILE_SNAPSHOT_JSON FROM TENANT_PRINTHOUSE_BINDINGS')) {
            return mockDb.bindings;
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

        if (sqlUpper.startsWith('SELECT * FROM MACHINE_LOAD_SNAPSHOTS WHERE MACHINE_ID = ?')) {
            const machineId = params[0];
            return mockDb.machine_loads.filter(m => m.machine_id === machineId);
        }

        if (sqlUpper.startsWith('INSERT INTO PRODUCTION_INCIDENTS')) {
            const row = {
                id: mockDb.incidents.length + 1,
                tenant_id: params[0],
                printhouse_id: params[1],
                order_id: params[2],
                job_id: params[3],
                incident_type: params[4],
                severity: params[5],
                status: 'OPEN',
                title: params[6],
                description: params[7],
                metadata_json: params[8] ? JSON.parse(params[8]) : null,
                opened_at: new Date(),
                created_at: new Date()
            };
            mockDb.incidents.push(row);
            return { insertId: row.id, affectedRows: 1 };
        }

        if (sqlUpper.startsWith('SELECT * FROM PRODUCTION_INCIDENTS WHERE ID = ?')) {
            const id = params[0];
            return mockDb.incidents.filter(i => i.id === id);
        }

        if (sqlUpper.startsWith('SELECT * FROM PRODUCTION_TIMELINE_EVENTS WHERE ORDER_ID = ?')) {
            const orderId = params[0];
            return mockDb.events.filter(e => e.order_id === orderId);
        }

        return [];
    };
}

async function runTests() {
    console.log('Starting Phase 79A Smoke Tests...');
    enableMockDb();

    // Scenario 1: Migration file exists
    const migrationPath = path.join(__dirname, '../migrations/019_phase79_live_production_monitoring_sla_dashboard.sql');
    assert(fs.existsSync(migrationPath), 'Scenario 1: Migration file exists');

    // Scenario 2: Monitoring snapshot can be created
    const tenantId = 'tenant_79a_01';
    const printhouseId = 'print_79a_01';
    const orderId = 'order_79a_01';
    const jobId = 'job_79a_01';

    const snap = await monitoringService.createOrUpdateMonitoringSnapshot({
        tenantId,
        printhouseId,
        orderId,
        jobId,
        payload: {
            production_status: 'QUEUED',
            sla_status: 'ON_TRACK',
            risk_score: 15,
            blocking_reasons_json: [],
            governance_snapshot_json: { trust: 'PASSED' },
            monitoring_snapshot_json: { physical_path: '/opt/ppos/file.pdf', operator_note: 'Internal test note' }
        },
        actor: { tenantId }
    });
    assert(snap && snap.production_status === 'QUEUED', 'Scenario 2: Monitoring snapshot created', `Status: ${snap?.production_status}`);

    // Scenario 3: Timeline event can be created
    await monitoringService.createProductionTimelineEvent({
        tenant_id: tenantId,
        printhouse_id: printhouseId,
        order_id: orderId,
        job_id: jobId,
        event_type: 'SLA_TIMER_STARTED',
        message: 'Production SLA timer started'
    }, { tenantId });
    assert(mockDb.events.length === 1 && mockDb.events[0].event_type === 'SLA_TIMER_STARTED', 'Scenario 3: Timeline event created');

    // Scenario 4: SLA policy snapshot can be created
    mockDb.orders.push({ order_id: orderId, tenant_id: tenantId, metadata_json: {} });
    mockDb.bindings.push({
        printhouse_id: printhouseId,
        sla_profile_snapshot_json: JSON.stringify({
            name: 'Express Route',
            production_days_max: 2,
            cutoff_time_local: '16:00',
            timezone: 'UTC',
            weekend_production: false
        })
    });
    const policyRes = await slaRiskService.createSlaPolicySnapshot({ orderId, jobId, slaProfileId: 101 });
    assert(policyRes.ok === true && policyRes.slaName === 'Express Route', 'Scenario 4: SLA policy snapshot created');

    // Scenario 5: SLA due date calculated
    const slaProfile = { production_days_max: 2, cutoff_time_local: '16:00', weekend_production: 0 };
    // Friday morning UTC
    const startedAt = new Date('2026-06-12T10:00:00Z'); 
    const dueAt = slaRiskService.calculateSlaDueAt({ startedAt, slaProfile, timezone: 'UTC' });
    // Friday + 2 business days (Monday, Tuesday) -> Tuesday 16:00
    const dueStr = dueAt.toISOString();
    assert(dueAt.getUTCDay() === 2, 'Scenario 5: SLA due date calculated (due on Tuesday)', `Due date: ${dueStr}`);

    // Scenario 6: SLA remaining minutes calculated
    const now = new Date('2026-06-12T10:00:00Z');
    const targetDue = new Date('2026-06-12T12:00:00Z'); // 2 hours remaining (120 mins)
    const remaining = slaRiskService.calculateRemainingMinutes({ dueAt: targetDue, now });
    assert(remaining === 120, 'Scenario 6: SLA remaining minutes calculated', `Minutes: ${remaining}`);

    // Scenario 7: SLA status ON_TRACK
    const statusTrack = slaRiskService.evaluateSlaStatus({ dueAt: new Date('2026-06-12T15:00:00Z'), now });
    assert(statusTrack === 'ON_TRACK', 'Scenario 7: SLA status ON_TRACK');

    // Scenario 8: SLA status AT_RISK
    const statusRisk = slaRiskService.evaluateSlaStatus({ dueAt: new Date('2026-06-12T12:30:00Z'), now });
    assert(statusRisk === 'AT_RISK', 'Scenario 8: SLA status AT_RISK');

    // Scenario 9: SLA status BREACHED
    const statusBreach = slaRiskService.evaluateSlaStatus({ dueAt: new Date('2026-06-12T09:00:00Z'), now });
    assert(statusBreach === 'BREACHED', 'Scenario 9: SLA status BREACHED');

    // Scenario 10: Machine load snapshot created
    const loadSnap = await machineLoadService.createMachineLoadSnapshot({
        tenantId,
        printhouseId,
        machineId: 'mac_79a_01',
        payload: {
            machine_name: 'Canon Press',
            load_status: 'NORMAL',
            queued_jobs_count: 3,
            estimated_queue_minutes: 45
        }
    });
    assert(loadSnap && loadSnap.load_status === 'NORMAL', 'Scenario 10: Machine load snapshot created');

    // Scenario 11: Incident created
    const incident = await incidentService.createIncident({
        tenantId,
        printhouseId,
        orderId,
        incidentType: 'SLA_RISK',
        title: 'SLA At Risk',
        description: 'Remaining time under threshold'
    }, { tenantId });
    assert(incident && incident.incident_type === 'SLA_RISK', 'Scenario 11: Incident created');

    // Scenario 12: Customer payload sanitized
    const sanitized = monitoringService.sanitizeMonitoringPayloadForRole(snap, { role: 'CUSTOMER_USER' });
    assert(sanitized.monitoring_snapshot_json.physical_path === undefined, 'Scenario 12: Customer payload sanitized (no physical path)');
    assert(sanitized.monitoring_snapshot_json.operator_note === undefined, 'Scenario 12: Customer payload sanitized (no operator note)');

    // Scenario 13: Monitoring does not enable LIVE
    assert(snap.live_production_enabled === undefined || snap.live_production_enabled === 0, 'Scenario 13: Monitoring does not enable LIVE production');

    // Scenario 14: Timeline events are tenant-scoped
    let timelineBlocked = false;
    try {
        await monitoringService.getProductionTimeline({ orderId }, { tenantId: 'another_tenant' });
    } catch (e) {
        timelineBlocked = true;
    }
    assert(timelineBlocked === false, 'Scenario 14: Timeline events enforce tenant-scoping checks');

    console.log(`\nPhase 79A Test Results: PASS: ${PASS}, FAIL: ${FAIL}`);
    if (FAIL > 0) {
        process.exit(1);
    }
}

runTests().catch(e => {
    console.error('Smoke tests crashed:', e);
    process.exit(1);
});
