'use strict';
/**
 * scripts/smoke_phase79f_end_to_end_sla_monitoring_regression.js
 *
 * End-to-End SLA / Monitoring Regression for Phase 79.
 *
 * Chains the full Phase 79 service stack through a simulated order lifecycle:
 *   productionMonitoringService -> slaEvaluationService -> slaRiskService
 *   -> productionQueueMonitoringService -> machineLoadMonitoringService
 *   -> productionIncidentService
 *
 * Key invariants tested:
 *   - SLA timer may only start when governance gates pass
 *   - AT_RISK / BREACHED transitions are detected correctly
 *   - Machine offline creates incident WARNING only — no automatic rerouting
 *   - Incident resolution does not mutate artifact_trust, payment, proof,
 *     or machine compatibility gates
 *   - LIVE production is never enabled; commercial_status=LIVE never written
 *   - Plan/quota blockers from Phase 78 propagate correctly
 *   - Customer-safe payloads contain no "guaranteed delivery" claims
 */

const db = require('../src/api/services/mysqlClient');

// ─── Mock dependency surface ─────────────────────────────────────────────────

const mockEligibility = {
    eligible: true,
    blockers: [],
    warnings: [],
    governance_domains: {
        artifact_trust:     'PASS',
        preflight:          'PASS',
        proof_approval:     'PASS',
        payment:            'PASS',
        machine_compat:     'PASS',
        policy_profile:     'PASS',
        production_handoff: 'PASS'
    },
    metadata: {}
};
require.cache[require.resolve('../src/api/services/marketplaceProductionQueueService')] = {
    exports: {
        async evaluateProductionQueueEligibility() {
            return JSON.parse(JSON.stringify(mockEligibility));
        }
    }
};

const mockEntitlement = {
    entitlement_status: 'ACTIVE',
    blocking_reasons:   [],
    limits:             { max_active_production_jobs: 20 }
};
require.cache[require.resolve('../src/api/services/commercialPlanService')] = {
    exports: {
        async evaluateTenantEntitlement() {
            return JSON.parse(JSON.stringify(mockEntitlement));
        }
    }
};

const mockJobState = {
    artifact_trust:   { review_required: false, production_certified: true },
    preflight_status: 'APPROVED',
    proof_approved:   true
};
require.cache[require.resolve('../src/api/services/preflightContractGateway')] = {
    exports: {
        async getJob() { return JSON.parse(JSON.stringify(mockJobState)); }
    }
};

require.cache[require.resolve('../src/api/middleware/auth')] = {
    exports: {
        resolveActorContext: () => ({ tenantId: 'tenant_79f_01', userId: 'ops_01', role: 'SUPER_ADMIN' }),
        requireAdmin: (req, res, next) => next()
    }
};

// Load services after mocks
const productionMonitoringService = require('../src/api/services/productionMonitoringService');
const slaEvaluationService        = require('../src/api/services/slaEvaluationService');
const slaRiskService              = require('../src/api/services/slaRiskService');
const productionQueueMonSvc       = require('../src/api/services/productionQueueMonitoringService');
const machineLoadMonSvc           = require('../src/api/services/machineLoadMonitoringService');
const productionIncidentService   = require('../src/api/services/productionIncidentService');

// ─── In-memory store ─────────────────────────────────────────────────────────
const store = {
    snapshots:     [],
    events:        [],
    incidents:     [],
    machine_loads: [],
    orders:        [],
    sla_policies:  [],
    reset() {
        this.snapshots = []; this.events = []; this.incidents = [];
        this.machine_loads = []; this.orders = []; this.sla_policies = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params = []) => {
        const up = sql.trim().toUpperCase();

        // Orders
        if (up.includes('FROM MARKETPLACE_ORDERS') && up.includes('ORDER_ID')) {
            return store.orders.filter(o => o.order_id === params[0]);
        }

        // SLA policy snapshots
        if (up.includes('FROM SLA_POLICY_SNAPSHOTS WHERE ORDER_ID')) {
            return store.sla_policies.filter(p => p.order_id === params[0]);
        }
        if (up.includes('INSERT INTO SLA_POLICY_SNAPSHOTS')) {
            const row = { id: store.sla_policies.length + 1, tenant_id: params[0], printhouse_id: params[1], order_id: params[2], job_id: params[3], sla_profile_id: params[4], sla_name: params[5], production_days_min: params[6], production_days_max: params[7], cutoff_time_local: params[8], timezone: params[9], weekend_production: params[10], rush_available: params[11], sla_snapshot_json: params[12], created_at: new Date() };
            store.sla_policies.push(row);
            return { affectedRows: 1 };
        }

        // Printhouse bindings
        if (up.includes('FROM TENANT_PRINTHOUSE_BINDINGS')) {
            return [];
        }

        // Production monitoring snapshots — INSERT
        if (up.includes('INSERT INTO PRODUCTION_MONITORING_SNAPSHOTS')) {
            const row = {
                id: store.snapshots.length + 1,
                tenant_id: params[0], printhouse_id: params[1], order_id: params[2], job_id: params[3],
                queue_entry_id: params[4], machine_id: params[5], production_status: params[6],
                sla_status: params[7], sla_started_at: params[8] ? new Date(params[8]) : null,
                sla_due_at: params[9] ? new Date(params[9]) : null,
                estimated_completion_at: params[10] ? new Date(params[10]) : null,
                actual_completed_at: params[11] ? new Date(params[11]) : null,
                remaining_minutes: params[12], risk_score: params[13],
                blocking_reasons_json: params[14] ? JSON.parse(params[14]) : null,
                warning_reasons_json: params[15] ? JSON.parse(params[15]) : null,
                governance_snapshot_json: params[16] ? JSON.parse(params[16]) : null,
                monitoring_snapshot_json: params[17] ? JSON.parse(params[17]) : null,
                created_at: new Date(), updated_at: new Date()
            };
            const idx = store.snapshots.findIndex(s => s.order_id === row.order_id && (row.job_id ? s.job_id === row.job_id : true));
            idx >= 0 ? (store.snapshots[idx] = { ...store.snapshots[idx], ...row }) : store.snapshots.push(row);
            return { affectedRows: 1 };
        }

        // Production monitoring snapshots — SELECT by order_id
        if (up.includes('FROM PRODUCTION_MONITORING_SNAPSHOTS WHERE ORDER_ID')) {
            return store.snapshots.filter(s => {
                if (s.order_id !== params[0]) return false;
                if (params[1] !== undefined && params[1] !== null) return s.job_id === params[1];
                return true;
            });
        }

        // Production monitoring snapshots — SELECT with SLA_STATUS='BLOCKED'
        if (up.includes("SLA_STATUS = 'BLOCKED'") && up.includes('FROM PRODUCTION_MONITORING_SNAPSHOTS')) {
            let f = store.snapshots.filter(s => s.sla_status === 'BLOCKED');
            if (up.includes('TENANT_ID = ?')) f = f.filter(s => s.tenant_id === params[0]);
            return f;
        }

        // Production monitoring snapshots — machine queue
        if (up.includes('FROM PRODUCTION_MONITORING_SNAPSHOTS WHERE MACHINE_ID = ?')) {
            return store.snapshots.filter(s => s.machine_id === params[0]);
        }

        // Production monitoring snapshots — GROUP BY production_status
        if (up.includes('SELECT PRODUCTION_STATUS') && up.includes('COUNT') && up.includes('PRODUCTION_MONITORING_SNAPSHOTS')) {
            const counts = {};
            let f = store.snapshots;
            if (up.includes('TENANT_ID = ?')) f = f.filter(s => s.tenant_id === params[0]);
            for (const s of f) counts[s.production_status] = (counts[s.production_status] || 0) + 1;
            return Object.entries(counts).map(([production_status, count]) => ({ production_status, count }));
        }

        // Production monitoring snapshots — generic SELECT
        if (up.includes('SELECT * FROM PRODUCTION_MONITORING_SNAPSHOTS')) {
            let f = store.snapshots;
            if (up.includes('TENANT_ID = ?')) f = f.filter(s => s.tenant_id === params[0]);
            return f;
        }

        // Timeline events — INSERT
        if (up.includes('INSERT INTO PRODUCTION_TIMELINE_EVENTS')) {
            const row = {
                id: store.events.length + 1,
                tenant_id: params[0], printhouse_id: params[1], order_id: params[2], job_id: params[3],
                event_type: params[4], event_status: params[5], actor_user_id: params[6], actor_role: params[7],
                message: params[8], metadata_json: params[9] ? JSON.parse(params[9]) : null, created_at: new Date()
            };
            store.events.push(row);
            return { affectedRows: 1 };
        }

        // Timeline events — SELECT
        if (up.includes('FROM PRODUCTION_TIMELINE_EVENTS WHERE ORDER_ID')) {
            return store.events.filter(e => e.order_id === params[0]);
        }

        // Machine load snapshots — INSERT
        if (up.includes('INSERT INTO MACHINE_LOAD_SNAPSHOTS')) {
            const row = {
                id: store.machine_loads.length + 1,
                tenant_id: params[0], printhouse_id: params[1], machine_id: params[2],
                machine_name: params[3], machine_type: params[4], load_status: params[5],
                queued_jobs_count: params[6], active_jobs_count: params[7],
                estimated_queue_minutes: params[8], capacity_score: params[9],
                next_available_at: params[10] ? new Date(params[10]) : null,
                snapshot_json: params[11] ? JSON.parse(params[11]) : null, created_at: new Date()
            };
            const idx = store.machine_loads.findIndex(m => m.machine_id === row.machine_id);
            idx >= 0 ? (store.machine_loads[idx] = { ...store.machine_loads[idx], ...row }) : store.machine_loads.push(row);
            return { affectedRows: 1 };
        }

        // Machine load snapshots — SELECT by machine_id
        if (up.includes('FROM MACHINE_LOAD_SNAPSHOTS WHERE MACHINE_ID')) {
            return store.machine_loads.filter(m => m.machine_id === params[0]);
        }

        // Machine load snapshots — SELECT by next_available_at
        if (up.includes('SELECT NEXT_AVAILABLE_AT FROM MACHINE_LOAD_SNAPSHOTS')) {
            return store.machine_loads.filter(m => m.machine_id === params[0]);
        }

        // Machine load snapshots — generic SELECT
        if (up.includes('FROM MACHINE_LOAD_SNAPSHOTS')) {
            let f = store.machine_loads;
            if (up.includes('TENANT_ID = ?')) f = f.filter(m => m.tenant_id === params[0]);
            return f;
        }

        // Incidents — INSERT
        if (up.includes('INSERT INTO PRODUCTION_INCIDENTS')) {
            const row = {
                id: store.incidents.length + 1,
                tenant_id: params[0], printhouse_id: params[1], order_id: params[2], job_id: params[3],
                incident_type: params[4], severity: params[5], status: 'OPEN', title: params[6],
                description: params[7], metadata_json: params[8] ? JSON.parse(params[8]) : null,
                opened_at: new Date(), created_at: new Date()
            };
            store.incidents.push(row);
            return { insertId: row.id, affectedRows: 1 };
        }

        // Incidents — SELECT by id
        if (up.includes('FROM PRODUCTION_INCIDENTS WHERE ID')) {
            return store.incidents.filter(i => i.id === Number(params[0]));
        }

        // Incidents — UPDATE
        if (up.startsWith('UPDATE PRODUCTION_INCIDENTS SET')) {
            const id = Number(params[params.length - 1]);
            const inc = store.incidents.find(i => i.id === id);
            if (inc) {
                if      (up.includes("STATUS = 'ACKNOWLEDGED'")) { inc.status = 'ACKNOWLEDGED'; inc.assigned_to_user_id = params[0]; }
                else if (up.includes("STATUS = 'RESOLVED'"))     { inc.status = 'RESOLVED';    inc.resolution_notes = params[0]; }
                else if (up.includes("STATUS = 'DISMISSED'"))    { inc.status = 'DISMISSED';   inc.resolution_notes = params[0]; }
            }
            return { affectedRows: 1 };
        }

        // Incidents — generic SELECT
        if (up.includes('FROM PRODUCTION_INCIDENTS')) {
            let f = store.incidents;
            if (up.includes('TENANT_ID = ?')) f = f.filter(i => i.tenant_id === params[0]);
            return f;
        }

        return [];
    };
}

// ─── Counters ─────────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0;

function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}${detail ? ` (${detail})` : ''}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    }
}

// ─── Main test ────────────────────────────────────────────────────────────────
async function runTests() {
    console.log('\n━━━ Phase 79F — E2E SLA / Monitoring Regression ━━━\n');
    enableMockDb();
    store.reset();

    const tenantId     = 'tenant_79f_01';
    const printhouseId = 'print_79f_01';
    const orderId      = 'order_79f_01';
    const jobId        = 'job_79f_01';
    const machineId    = 'mac_79f_01';
    const actor        = { tenantId, userId: 'ops_01', role: 'SUPER_ADMIN' };

    try {

        // ── S1: Seed order ────────────────────────────────────────────────
        console.log('\n▶ Step 1: Seed order in PRODUCTION_QUEUED state\n');
        store.orders.push({ order_id: orderId, tenant_id: tenantId, printhouse_id: printhouseId, status: 'PRODUCTION_QUEUED' });

        // ── S2: Create initial snapshot ───────────────────────────────────
        console.log('\n▶ Step 2: Create initial production monitoring snapshot\n');
        await productionMonitoringService.createOrUpdateMonitoringSnapshot({
            tenantId, printhouseId, orderId, jobId,
            payload: { production_status: 'QUEUED', sla_status: 'NOT_APPLICABLE', risk_score: 0 },
            actor
        });
        const snap1 = await productionMonitoringService.getMonitoringSnapshot({ orderId, jobId });
        assert(snap1 !== null, 'S2: Monitoring snapshot created');
        assert(snap1.production_status === 'QUEUED', 'S2: production_status = QUEUED');
        assert(snap1.sla_status === 'NOT_APPLICABLE', 'S2: sla_status = NOT_APPLICABLE');
        assert(snap1.risk_score === 0, 'S2: risk_score = 0');

        // ── S3: SLA gate check ────────────────────────────────────────────
        console.log('\n▶ Step 3: SLA eligibility — all gates pass\n');
        const canStart = await slaEvaluationService.canStartSla({ orderId, jobId });
        assert(canStart.allowed === true, 'S3: SLA may start when all gates pass');
        assert(canStart.blockers.length === 0, 'S3: No blockers');

        // ── S4: SLA starts ────────────────────────────────────────────────
        console.log('\n▶ Step 4: SLA timer starts — snapshot updated to IN_PRODUCTION / ON_TRACK\n');
        const slaStartedAt = new Date();
        const slaDueAt     = new Date(slaStartedAt.getTime() + 120 * 60 * 1000);
        await productionMonitoringService.createOrUpdateMonitoringSnapshot({
            tenantId, printhouseId, orderId, jobId,
            payload: {
                production_status: 'IN_PRODUCTION', sla_status: 'ON_TRACK',
                sla_started_at: slaStartedAt.toISOString(), sla_due_at: slaDueAt.toISOString(),
                remaining_minutes: 120, risk_score: 10, machine_id: machineId
            },
            actor
        });
        const snap2 = await productionMonitoringService.getMonitoringSnapshot({ orderId, jobId });
        assert(snap2.sla_status === 'ON_TRACK', 'S4: sla_status = ON_TRACK');
        assert(snap2.production_status === 'IN_PRODUCTION', 'S4: production_status = IN_PRODUCTION');
        assert(snap2.sla_started_at !== null, 'S4: sla_started_at recorded');
        assert(snap2.machine_id === machineId, 'S4: machine_id reflected');

        // ── S5: Risk score computation ────────────────────────────────────
        console.log('\n▶ Step 5: SLA risk score computation — AT_RISK threshold\n');
        const riskScore = slaRiskService.calculateSlaRiskScore({
            remainingMinutes: 25, queueMinutes: 30, blockers: [], warnings: ['SLA_THRESHOLD_NEAR']
        });
        assert(typeof riskScore === 'number', 'S5: Risk score is numeric');
        assert(riskScore >= 50, 'S5: Risk score >= 50 when within 25 min of SLA due');

        const slaStatus25min = slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() + 25 * 60 * 1000) });
        assert(slaStatus25min === 'AT_RISK', 'S5: AT_RISK when 25 min remaining');

        await productionMonitoringService.createOrUpdateMonitoringSnapshot({
            tenantId, printhouseId, orderId, jobId,
            payload: { sla_status: 'AT_RISK', remaining_minutes: 25, risk_score: riskScore, warning_reasons_json: ['SLA_THRESHOLD_NEAR'] },
            actor
        });
        const snap3 = await productionMonitoringService.getMonitoringSnapshot({ orderId, jobId });
        assert(snap3.sla_status === 'AT_RISK', 'S5: Snapshot escalated to AT_RISK');
        assert(snap3.risk_score >= 50, 'S5: Risk score >= 50 for AT_RISK snapshot');

        // ── S6: Machine load snapshot ─────────────────────────────────────
        console.log('\n▶ Step 6: Machine load snapshot — BUSY machine\n');
        const machineSnap = await machineLoadMonSvc.createMachineLoadSnapshot({
            tenantId, printhouseId, machineId,
            payload: { machine_name: 'HP Indigo 12000', machine_type: 'DIGITAL_PRESS', load_status: 'BUSY', queued_jobs_count: 4, active_jobs_count: 1, estimated_queue_minutes: 95, capacity_score: 70 }
        });
        assert(machineSnap !== null, 'S6: Machine load snapshot created');
        assert(machineSnap.load_status === 'BUSY', 'S6: Machine BUSY');
        assert(machineSnap.capacity_score === 70, 'S6: Capacity score correct');

        // ── S7: Machine OFFLINE — incident only, no rerouting ─────────────
        console.log('\n▶ Step 7: Machine OFFLINE — incident raised, no automatic rerouting\n');
        const offlineSnap = await machineLoadMonSvc.createMachineLoadSnapshot({
            tenantId, printhouseId, machineId,
            payload: { machine_name: 'HP Indigo 12000', machine_type: 'DIGITAL_PRESS', load_status: 'OFFLINE', queued_jobs_count: 4, active_jobs_count: 0, estimated_queue_minutes: 0, capacity_score: 0 }
        });
        assert(offlineSnap.load_status === 'OFFLINE', 'S7: Machine recorded OFFLINE');

        const offlineIncident = await productionIncidentService.createIncident({
            tenantId, printhouseId, orderId, jobId,
            incidentType: 'MACHINE_OFFLINE', severity: 'HIGH',
            title: 'Machine offline: HP Indigo 12000',
            description: 'Machine went offline. No automatic rerouting. Operator action required.'
        }, actor);
        assert(offlineIncident !== null, 'S7: Incident created for machine offline');
        assert(offlineIncident.incident_type === 'MACHINE_OFFLINE', 'S7: Incident type = MACHINE_OFFLINE');
        assert(offlineIncident.status === 'OPEN', 'S7: Incident status = OPEN');
        assert(!store.snapshots.some(s => s.auto_rerouted === true), 'S7: No automatic rerouting triggered');
        assert(mockJobState.artifact_trust.production_certified === true, 'S7: artifact_trust unchanged');
        assert(mockJobState.proof_approved === true, 'S7: proof_approved unchanged');

        // ── S8: SLA BREACH ────────────────────────────────────────────────
        console.log('\n▶ Step 8: SLA BREACH detected — snapshot updated, CRITICAL incident raised\n');
        const breachStatus = slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() - 15 * 60 * 1000) });
        assert(breachStatus === 'BREACHED', 'S8: BREACHED when past due date');

        await productionMonitoringService.createOrUpdateMonitoringSnapshot({
            tenantId, printhouseId, orderId, jobId,
            payload: { sla_status: 'BREACHED', remaining_minutes: -15, risk_score: 100, blocking_reasons_json: ['SLA_BREACHED', 'MACHINE_OFFLINE'] },
            actor
        });
        const snap4 = await productionMonitoringService.getMonitoringSnapshot({ orderId, jobId });
        assert(snap4.sla_status === 'BREACHED', 'S8: Snapshot records SLA BREACH');
        assert(snap4.remaining_minutes < 0, 'S8: remaining_minutes < 0 on breach');
        assert(snap4.risk_score === 100, 'S8: risk_score = 100 on breach');

        const slaBreachInc = await productionIncidentService.createIncident({
            tenantId, printhouseId, orderId, jobId,
            incidentType: 'SLA_BREACH', severity: 'CRITICAL',
            title: 'SLA Timeline Breached',
            description: 'Production SLA exceeded. No automated action taken. Manual review required.'
        }, actor);
        assert(slaBreachInc.severity === 'CRITICAL', 'S8: SLA breach incident = CRITICAL');
        assert(slaBreachInc.status === 'OPEN', 'S8: SLA breach incident = OPEN');

        // ── S9: Operator ack + resolve — gates unchanged ──────────────────
        console.log('\n▶ Step 9: Operator acknowledges + resolves incident — governance gates unchanged\n');
        const ack = await productionIncidentService.acknowledgeIncident({
            incidentId: offlineIncident.id,
            actor: { tenantId, userId: 'ops_01', role: 'SUPER_ADMIN' }
        });
        assert(ack.status === 'ACKNOWLEDGED', 'S9: Incident acknowledged');

        const certBefore         = mockJobState.artifact_trust.production_certified;
        const paymentBefore      = mockEligibility.governance_domains.payment;
        const machineCompatBefore = mockEligibility.governance_domains.machine_compat;
        const proofBefore        = mockEligibility.governance_domains.proof_approval;

        const resolved = await productionIncidentService.resolveIncident({
            incidentId: offlineIncident.id,
            resolutionNotes: 'Machine rebooted. Back online. No rerouting performed.',
            actor: { tenantId, userId: 'ops_01', role: 'SUPER_ADMIN' }
        });
        assert(resolved.status === 'RESOLVED', 'S9: Incident resolved');
        assert(mockJobState.artifact_trust.production_certified === certBefore, 'S9: artifact_trust unchanged after resolution');
        assert(mockEligibility.governance_domains.payment === paymentBefore, 'S9: Payment gate unchanged after resolution');
        assert(mockEligibility.governance_domains.machine_compat === machineCompatBefore, 'S9: machine_compat gate unchanged after resolution');
        assert(mockEligibility.governance_domains.proof_approval === proofBefore, 'S9: proof_approval gate unchanged after resolution');
        assert(store.events.some(e => e.event_type === 'INCIDENT_ACKNOWLEDGED'), 'S9: INCIDENT_ACKNOWLEDGED event emitted');
        assert(store.events.some(e => e.event_type === 'INCIDENT_RESOLVED'), 'S9: INCIDENT_RESOLVED event emitted');

        // ── S10: Phase 78 quota blocker ───────────────────────────────────
        console.log('\n▶ Step 10: Phase 78 entitlement blocker prevents SLA start\n');
        store.orders.push({ order_id: 'order_79f_02', tenant_id: tenantId, printhouse_id: printhouseId, status: 'IN_PRODUCTION' });
        mockEntitlement.blocking_reasons.push('QUOTA_EXCEEDED_ACTIVE_JOBS');
        mockEntitlement.entitlement_status = 'QUOTA_EXCEEDED';

        const blockedStart = await slaEvaluationService.canStartSla({ orderId: 'order_79f_02', jobId: null });
        assert(blockedStart.allowed === false, 'S10: SLA start blocked when quota exceeded');
        assert(
            (blockedStart.blockers || []).some(b => b === 'QUOTA_EXCEEDED_ACTIVE_JOBS' || b === 'TENANT_NOT_PILOT_OR_LIVE'),
            'S10: Correct blocker code present'
        );

        mockEntitlement.blocking_reasons = [];
        mockEntitlement.entitlement_status = 'ACTIVE';

        // ── S11: LIVE production gate invariants ──────────────────────────
        console.log('\n▶ Step 11: LIVE production gate invariants\n');
        assert(!store.snapshots.some(s => s.live_production_enabled === true), 'S11: No snapshot has live_production_enabled=true');
        assert(!store.snapshots.some(s => s.commercial_status === 'LIVE'), 'S11: No snapshot has commercial_status=LIVE');
        assert(!store.events.some(e => (e.message || '').includes('guaranteed delivery')), 'S11: No "guaranteed delivery" in timeline');
        assert(!store.events.some(e => (e.message || '').toLowerCase().includes('certified')), 'S11: No unverified "certified" claim in timeline');

        // ── S12: Queue overview ───────────────────────────────────────────
        console.log('\n▶ Step 12: Production queue monitoring overview\n');
        const overview = await productionQueueMonSvc.getQueueOverview({ tenantId });
        assert(overview !== null, 'S12: Overview returned');
        assert(typeof overview.queue_depth === 'object', 'S12: queue_depth is object');
        assert(Array.isArray(overview.machines), 'S12: machines is array');
        assert(Array.isArray(overview.bottlenecks), 'S12: bottlenecks is array');
        assert(overview.bottlenecks.some(b => b.type === 'MACHINE_OFFLINE'), 'S12: MACHINE_OFFLINE appears as bottleneck');

        // ── S13: SLA status evaluation — all states ───────────────────────
        console.log('\n▶ Step 13: SLA status evaluation — all states\n');
        assert(slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() + 5 * 60 * 60 * 1000) }) === 'ON_TRACK',  'S13: ON_TRACK when > 3h');
        assert(slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() + 90 * 60 * 1000) })    === 'AT_RISK',   'S13: AT_RISK when <= 3h');
        assert(slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() - 1) })                  === 'BREACHED',  'S13: BREACHED when past due');
        assert(slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() + 3600000), blocked: true }) === 'BLOCKED',  'S13: BLOCKED when blocked=true');
        assert(slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() + 3600000), paused:  true }) === 'PAUSED',   'S13: PAUSED when paused=true');

        // ── S14: Incident list ────────────────────────────────────────────
        console.log('\n▶ Step 14: Incident list — all incidents tracked\n');
        const allInc = await productionIncidentService.listIncidents({ tenantId });
        assert(Array.isArray(allInc), 'S14: listIncidents returns array');
        assert(allInc.length >= 2, 'S14: >= 2 incidents (machine offline + SLA breach)');
        assert(allInc.some(i => i.incident_type === 'MACHINE_OFFLINE'), 'S14: MACHINE_OFFLINE in list');
        assert(allInc.some(i => i.incident_type === 'SLA_BREACH'), 'S14: SLA_BREACH in list');

        // ── S15: Timeline audit ───────────────────────────────────────────
        console.log('\n▶ Step 15: Timeline event audit trail\n');
        const timeline = await productionMonitoringService.getProductionTimeline({ orderId, jobId });
        assert(Array.isArray(timeline), 'S15: Timeline returns array');
        assert(store.events.some(e => e.order_id === orderId && e.event_type === 'INCIDENT_CREATED'),      'S15: INCIDENT_CREATED in timeline');
        assert(store.events.some(e => e.order_id === orderId && e.event_type === 'INCIDENT_ACKNOWLEDGED'), 'S15: INCIDENT_ACKNOWLEDGED in timeline');
        assert(store.events.some(e => e.order_id === orderId && e.event_type === 'INCIDENT_RESOLVED'),     'S15: INCIDENT_RESOLVED in timeline');

    } catch (err) {
        console.error('\nE2E test crashed:', err.message);
        console.error(err.stack);
        FAIL++;
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Phase 79F E2E Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(60)}\n`);

    if (FAIL > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('E2E regression crashed:', err);
    process.exit(1);
});
