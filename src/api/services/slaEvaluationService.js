/**
 * src/api/services/slaEvaluationService.js
 * 
 * SLA Evaluation and Risk Engine Service.
 */
'use strict';

const db = require('./mysqlClient');
const queueService = require('./marketplaceProductionQueueService');
const slaRiskService = require('./slaRiskService');
const productionMonitoringService = require('./productionMonitoringService');
const logger = require('./logger').child('sla-evaluation');

class SlaEvaluationService {

    async canStartSla({ orderId, jobId = null }) {
        // 1. Check queue eligibility
        const eligibility = await queueService.evaluateProductionQueueEligibility(orderId, { ignoreOrderStatus: true });
        
        // 2. Check production queue entry exists (status: PRODUCTION_QUEUED or MACHINE_ASSIGNED)
        const orders = await db.query('SELECT status, tenant_id FROM marketplace_orders WHERE order_id = ?', [orderId]);
        if (!orders || orders.length === 0) {
            return { allowed: false, blockers: ['ORDER_NOT_FOUND'], reasons: ['ORDER_NOT_FOUND'], eligibility };
        }
        
        const order = orders[0];
        const hasQueueEntry = order.status === 'PRODUCTION_QUEUED' || order.status === 'MACHINE_ASSIGNED' || order.status === 'IN_PRODUCTION';

        // 3. Inspect individual blockers
        const blockers = [...eligibility.blockers];
        if (!hasQueueEntry) {
            blockers.push('QUEUE_ENTRY_MISSING');
        }

        // Check plan/quota blockers from Phase 78
        const commercialPlanService = require('./commercialPlanService');
        const ent = await commercialPlanService.evaluateTenantEntitlement({ tenantId: order.tenant_id });
        if (ent.blocking_reasons && ent.blocking_reasons.length > 0) {
            blockers.push(...ent.blocking_reasons);
        }

        // Check if tenant is pilot/live eligible
        if (ent.entitlement_status !== 'ACTIVE' && ent.entitlement_status !== 'PILOT') {
            blockers.push('TENANT_NOT_PILOT_OR_LIVE');
        }

        // Retrieve job gate certification
        if (jobId) {
            try {
                const gateway = require('./preflightContractGateway');
                const jobState = await gateway.getJob(jobId);
                const trust = jobState.artifact_trust || {};
                
                if (trust.review_required === true || trust.review_required === 1) {
                    blockers.push('ARTIFACT_TRUST_REVIEW_REQUIRED');
                }
                if (trust.production_certified === false || trust.production_certified === 0) {
                    blockers.push('ARTIFACT_NOT_PRODUCTION_CERTIFIED');
                }
            } catch (e) {}
        }

        const allowed = blockers.length === 0;

        return {
            allowed,
            blockers,
            eligibility
        };
    }

    async startSlaTimer({ orderId, jobId = null, actor = {} }) {
        const check = await this.canStartSla({ orderId, jobId });
        if (!check.allowed) {
            throw new Error(`SLA_START_BLOCKED: Cannot start SLA due to blockers: ${check.blockers.join(', ')}`);
        }

        const snapshot = await productionMonitoringService.getMonitoringSnapshot({ orderId, jobId });
        if (!snapshot) {
            throw new Error('MONITORING_SNAPSHOT_NOT_FOUND');
        }

        // Enforce tenant scoping
        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== snapshot.tenant_id) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        // Fetch SLA policy snapshot to calculate due date
        const policies = await db.query('SELECT * FROM sla_policy_snapshots WHERE order_id = ? ORDER BY created_at DESC LIMIT 1', [orderId]);
        if (!policies || policies.length === 0) {
            // Create SLA policy snapshot if missing
            await slaRiskService.createSlaPolicySnapshot({ orderId, jobId, slaProfileId: 1 });
        }

        const updatedSnap = await productionMonitoringService.createOrUpdateMonitoringSnapshot({
            tenantId: snapshot.tenant_id,
            printhouseId: snapshot.printhouse_id,
            orderId,
            jobId,
            payload: {
                sla_started_at: new Date(),
                sla_status: 'ON_TRACK',
                production_status: snapshot.production_status === 'NOT_STARTED' ? 'QUEUED' : snapshot.production_status
            },
            actor
        });

        await productionMonitoringService.createProductionTimelineEvent({
            tenant_id: snapshot.tenant_id,
            printhouse_id: snapshot.printhouse_id,
            order_id: orderId,
            job_id: jobId,
            event_type: 'SLA_TIMER_STARTED',
            message: 'Production SLA monitoring timer started.'
        }, actor);

        await this.auditSlaTransition({ orderId, event: 'SLA_TIMER_STARTED' });

        return updatedSnap;
    }

    async pauseSlaTimer({ orderId, jobId = null, reason, actor = {} }) {
        const snapshot = await productionMonitoringService.getMonitoringSnapshot({ orderId, jobId });
        if (!snapshot) {
            throw new Error('MONITORING_SNAPSHOT_NOT_FOUND');
        }

        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== snapshot.tenant_id) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        const updatedSnap = await productionMonitoringService.createOrUpdateMonitoringSnapshot({
            tenantId: snapshot.tenant_id,
            printhouseId: snapshot.printhouse_id,
            orderId,
            jobId,
            payload: {
                sla_status: 'PAUSED',
                production_status: 'PAUSED'
            },
            actor
        });

        await productionMonitoringService.createProductionTimelineEvent({
            tenant_id: snapshot.tenant_id,
            printhouse_id: snapshot.printhouse_id,
            order_id: orderId,
            job_id: jobId,
            event_type: 'SLA_TIMER_PAUSED',
            message: `SLA timer paused. Reason: ${reason || 'None provided'}`
        }, actor);

        await this.auditSlaTransition({ orderId, event: 'SLA_TIMER_PAUSED', reason });

        return updatedSnap;
    }

    async resumeSlaTimer({ orderId, jobId = null, actor = {} }) {
        const snapshot = await productionMonitoringService.getMonitoringSnapshot({ orderId, jobId });
        if (!snapshot) {
            throw new Error('MONITORING_SNAPSHOT_NOT_FOUND');
        }

        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== snapshot.tenant_id) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        const updatedSnap = await productionMonitoringService.createOrUpdateMonitoringSnapshot({
            tenantId: snapshot.tenant_id,
            printhouseId: snapshot.printhouse_id,
            orderId,
            jobId,
            payload: {
                sla_status: 'ON_TRACK',
                production_status: 'QUEUED'
            },
            actor
        });

        await productionMonitoringService.createProductionTimelineEvent({
            tenant_id: snapshot.tenant_id,
            printhouse_id: snapshot.printhouse_id,
            order_id: orderId,
            job_id: jobId,
            event_type: 'SLA_TIMER_RESUMED',
            message: 'SLA timer resumed.'
        }, actor);

        await this.auditSlaTransition({ orderId, event: 'SLA_TIMER_RESUMED' });

        return updatedSnap;
    }

    async evaluateSlaForOrder({ orderId, jobId = null }, actor = {}) {
        const check = await this.canStartSla({ orderId, jobId });
        const snapshot = await productionMonitoringService.getMonitoringSnapshot({ orderId, jobId });

        if (!snapshot) {
            return null;
        }

        if (actor.tenantId && actor.tenantId !== 'system-tenant' && actor.tenantId !== snapshot.tenant_id) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        // Hard rule: SLA timer pauses or marks BLOCKED if governance blocks exist
        if (check.blockers.length > 0) {
            return await productionMonitoringService.createOrUpdateMonitoringSnapshot({
                tenantId: snapshot.tenant_id,
                printhouseId: snapshot.printhouse_id,
                orderId,
                jobId,
                payload: {
                    sla_status: 'BLOCKED',
                    blocking_reasons_json: check.blockers
                },
                actor
            });
        }

        // If not started yet and allowed, let's start it
        if (!snapshot.sla_started_at && check.allowed) {
            await this.startSlaTimer({ orderId, jobId, actor });
        }

        return await productionMonitoringService.evaluateProductionMonitoringState({ orderId, jobId }, actor);
    }

    async evaluateSlaRiskForQueue({ tenantId = null, printhouseId = null }, actor = {}) {
        const filters = { tenantId, printhouseId };
        const list = await productionMonitoringService.listMonitoringSnapshots(filters, actor);

        for (const snap of list) {
            try {
                await this.evaluateSlaForOrder({ orderId: snap.order_id, jobId: snap.job_id }, actor);
            } catch (err) {
                logger.error({ event: 'eval_sla_queue_item_failed', orderId: snap.order_id, error: err.message });
            }
        }

        return await this.getSlaDashboardSummary(filters, actor);
    }

    async getSlaDashboardSummary(filters = {}, actor = {}) {
        const list = await productionMonitoringService.listMonitoringSnapshots(filters, actor);

        let queued = 0;
        let active = 0;
        let blocked = 0;
        let onTrack = 0;
        let atRisk = 0;
        let breached = 0;

        for (const s of list) {
            if (s.production_status === 'QUEUED') queued++;
            if (s.production_status === 'IN_PRODUCTION' || s.production_status === 'ASSIGNED_TO_MACHINE') active++;
            if (s.sla_status === 'BLOCKED') blocked++;
            if (s.sla_status === 'ON_TRACK') onTrack++;
            if (s.sla_status === 'AT_RISK') atRisk++;
            if (s.sla_status === 'BREACHED') breached++;
        }

        return {
            total_jobs: list.length,
            queued_jobs: queued,
            active_jobs: active,
            blocked_jobs: blocked,
            on_track_jobs: onTrack,
            at_risk_jobs: atRisk,
            breached_jobs: breached
        };
    }

    async auditSlaTransition(event) {
        logger.debug({ event: 'sla_transition', ...event });
    }
}

module.exports = new SlaEvaluationService();
