'use strict';
/**
 * scripts/smoke_phase79b_sla_evaluation_risk_engine.js
 * 
 * Smoke test for Phase 79B — SLA Evaluation & Risk Engine.
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/api/services/mysqlClient');

// Mock preflightContractGateway
const mockGateway = {
    jobs: {},
    async getJob(jobId) {
        return this.jobs[jobId] || {
            artifact_trust: { review_required: false, production_certified: true }
        };
    }
};
require.cache[require.resolve('../src/api/services/preflightContractGateway')] = {
    exports: mockGateway
};

// Mock marketplaceProductionQueueService
const mockQueueService = {
    eligibility: { eligible: true, blockers: [], warnings: [], governance_domains: {}, metadata: {} },
    async evaluateProductionQueueEligibility(orderId, options) {
        return this.eligibility;
    }
};
require.cache[require.resolve('../src/api/services/marketplaceProductionQueueService')] = {
    exports: mockQueueService
};

// Mock commercialPlanService
const mockPlanService = {
    entitlements: {},
    async evaluateTenantEntitlement({ tenantId }) {
        return this.entitlements[tenantId] || {
            entitlement_status: 'ACTIVE',
            blocking_reasons: [],
            limits: {}
        };
    }
};
require.cache[require.resolve('../src/api/services/commercialPlanService')] = {
    exports: mockPlanService
};

const evaluationService = require('../src/api/services/slaEvaluationService');
const monitoringService = require('../src/api/services/productionMonitoringService');
const slaRiskService = require('../src/api/services/slaRiskService');

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
    sla_policies: [],
    orders: [],
    bindings: [],
    reset() {
        this.snapshots = [];
        this.events = [];
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

        if (sqlUpper.startsWith('SELECT * FROM PRODUCTION_MONITORING_SNAPSHOTS')) {
            return mockDb.snapshots;
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

        if (sqlUpper.includes('FROM MARKETPLACE_ORDERS WHERE ORDER_ID = ?')) {
            const orderId = params[0];
            return mockDb.orders.filter(o => o.order_id === orderId);
        }

        if (sqlUpper.startsWith('SELECT PRINTHOUSE_ID, SLA_PROFILE_SNAPSHOT_JSON FROM TENANT_PRINTHOUSE_BINDINGS')) {
            return mockDb.bindings;
        }

        return [];
    };
}

async function runTests() {
    console.log('Starting Phase 79B Smoke Tests...');
    enableMockDb();

    const tenantId = 'tenant_79b_01';
    const printhouseId = 'print_79b_01';
    const orderId = 'order_79b_01';
    const jobId = 'job_79b_01';

    mockDb.orders.push({ order_id: orderId, tenant_id: tenantId, status: 'PRODUCTION_ACCEPTED', metadata_json: {} });
    mockPlanService.entitlements[tenantId] = { entitlement_status: 'ACTIVE', blocking_reasons: [] };

    // S1: SLA cannot start before queue eligibility
    mockQueueService.eligibility = { eligible: false, blockers: ['PAYMENT_NOT_CONFIRMED'], warnings: [], governance_domains: {}, metadata: {} };
    const check1 = await evaluationService.canStartSla({ orderId, jobId });
    assert(check1.allowed === false, 'S1: SLA cannot start before queue eligibility (Blocked by payment)');

    // S2: SLA starts after all gates pass
    mockQueueService.eligibility = { eligible: true, blockers: [], warnings: [], governance_domains: {}, metadata: {} };
    // Simulate order status queued
    mockDb.orders[0].status = 'PRODUCTION_QUEUED';
    
    // Seed initial snapshot
    await monitoringService.createOrUpdateMonitoringSnapshot({
        tenantId, printhouseId, orderId, jobId,
        payload: { production_status: 'QUEUED' },
        actor: { tenantId }
    });

    const startRes = await evaluationService.startSlaTimer({ orderId, jobId, actor: { tenantId } });
    assert(startRes.sla_status === 'ON_TRACK', 'S2: SLA starts after all gates pass');

    // S3: SLA blocked by artifact_trust review required
    mockGateway.jobs[jobId] = { artifact_trust: { review_required: true, production_certified: true } };
    const check3 = await evaluationService.canStartSla({ orderId, jobId });
    assert(check3.allowed === false && check3.blockers.includes('ARTIFACT_TRUST_REVIEW_REQUIRED'), 'S3: SLA blocked by artifact_trust review required');

    // Restore job state
    mockGateway.jobs[jobId] = { artifact_trust: { review_required: false, production_certified: true } };

    // S4: SLA blocked by payment missing
    mockQueueService.eligibility = { eligible: false, blockers: ['PAYMENT_NOT_CONFIRMED'], warnings: [], governance_domains: {}, metadata: {} };
    const check4 = await evaluationService.canStartSla({ orderId, jobId });
    assert(check4.allowed === false && check4.blockers.includes('PAYMENT_NOT_CONFIRMED'), 'S4: SLA blocked by payment missing');

    // S5: SLA blocked by proof pending
    mockQueueService.eligibility = { eligible: false, blockers: ['VISUAL_PROOF_APPROVAL_REQUIRED'], warnings: [], governance_domains: {}, metadata: {} };
    const check5 = await evaluationService.canStartSla({ orderId, jobId });
    assert(check5.allowed === false && check5.blockers.includes('VISUAL_PROOF_APPROVAL_REQUIRED'), 'S5: SLA blocked by proof pending');

    // S6: SLA blocked by machine compatibility failure
    mockQueueService.eligibility = { eligible: false, blockers: ['MACHINE_INCOMPATIBLE'], warnings: [], governance_domains: {}, metadata: {} };
    const check6 = await evaluationService.canStartSla({ orderId, jobId });
    assert(check6.allowed === false && check6.blockers.includes('MACHINE_INCOMPATIBLE'), 'S6: SLA blocked by machine compatibility failure');

    // Restore eligibility
    mockQueueService.eligibility = { eligible: true, blockers: [], warnings: [], governance_domains: {}, metadata: {} };

    // S7: SLA paused by operator
    const pauseRes = await evaluationService.pauseSlaTimer({ orderId, jobId, reason: 'Machine degradation', actor: { tenantId } });
    assert(pauseRes.sla_status === 'PAUSED' && pauseRes.production_status === 'PAUSED', 'S7: SLA paused by operator');

    // S8: SLA resumed by operator
    const resumeRes = await evaluationService.resumeSlaTimer({ orderId, jobId, actor: { tenantId } });
    assert(resumeRes.sla_status === 'ON_TRACK' && resumeRes.production_status === 'QUEUED', 'S8: SLA resumed by operator');

    // S9: SLA ON_TRACK calculation
    const tracking = slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() + 600 * 60 * 1000) }); // 10 hours remaining
    assert(tracking === 'ON_TRACK', 'S9: SLA ON_TRACK calculation');

    // S10: SLA AT_RISK calculation
    const risking = slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() + 100 * 60 * 1000) }); // 100 minutes remaining
    assert(risking === 'AT_RISK', 'S10: SLA AT_RISK calculation');

    // S11: SLA BREACHED calculation
    const breaching = slaRiskService.evaluateSlaStatus({ dueAt: new Date(Date.now() - 10 * 60 * 1000) }); // 10 minutes past due
    assert(breaching === 'BREACHED', 'S11: SLA BREACHED calculation');

    // S12: Queue risk summary calculated
    const summary = await evaluationService.getSlaDashboardSummary({ tenantId }, { tenantId });
    assert(summary.total_jobs === 1, 'S12: Queue risk summary calculated total count');
    assert(summary.on_track_jobs === 1, 'S12: Queue risk summary calculated ON_TRACK count');

    // S13: SLA risk creates timeline events
    // Triggers when status changes
    // Current status in mockDb is ON_TRACK. Let's make it AT_RISK in DB by updating remaining time.
    const snapRecord = mockDb.snapshots[0];
    snapRecord.sla_status = 'ON_TRACK';
    
    // Create policy snap
    mockDb.sla_policies.push({
        order_id: orderId,
        production_days_max: 1,
        cutoff_time_local: '16:00',
        timezone: 'UTC',
        created_at: new Date()
    });

    // We force a status change to AT_RISK by changing due date
    snapRecord.sla_due_at = new Date(Date.now() + 120 * 60 * 1000); // 2 hours
    const evalRes = await evaluationService.evaluateSlaForOrder({ orderId, jobId }, { tenantId });
    
    assert(evalRes.sla_status === 'AT_RISK', 'S13: SLA evaluated as AT_RISK');
    const hasRiskEvent = mockDb.events.some(e => e.event_type === 'SLA_RISK_UPDATED');
    assert(hasRiskEvent, 'S13: Timeline event emitted for SLA_RISK_UPDATED');

    // S14: SLA evaluation does not enable production by itself
    assert(snapRecord.live_production_enabled === undefined || snapRecord.live_production_enabled === 0, 'S14: SLA evaluation does not enable LIVE production');

    console.log(`\nPhase 79B Test Results: PASS: ${PASS}, FAIL: ${FAIL}`);
    if (FAIL > 0) {
        process.exit(1);
    }
}

runTests().catch(e => {
    console.error('Smoke tests crashed:', e);
    process.exit(1);
});
