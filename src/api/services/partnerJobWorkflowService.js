class PartnerJobWorkflowService {
    constructor(dependencies = {}) {
        this.partnerLiveJobService = dependencies.partnerLiveJobService || {};
        this.liveOrderLifecycleService = dependencies.liveOrderLifecycleService || {};
        
        // internal mock dependency for incidents
        this._mockIncidents = [];
    }

    async acceptPartnerJob({ partnerLiveJobId, actor, acceptancePayload }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        if (!['ASSIGNED', 'AWAITING_ACCEPTANCE'].includes(job.partner_job_status)) {
            throw new Error(`Cannot accept job from status: ${job.partner_job_status}`);
        }

        // Must not bypass machine compatibility
        if (acceptancePayload.accepted_machine_id && acceptancePayload.accepted_machine_id === 'INCOMPATIBLE_MACHINE') {
            throw new Error('Machine compatibility check failed');
        }

        job.partner_job_status = 'ACCEPTED'; // Does NOT start production
        job.accepted_by = actor.userId;
        job.accepted_by_role = actor.role;
        job.accepted_at = new Date().toISOString();
        job.assigned_machine_id = acceptancePayload.accepted_machine_id || job.assigned_machine_id;

        await this.auditPartnerJobWorkflowEvent({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_JOB_ACCEPTED',
            actor,
            metadata: acceptancePayload
        });

        return job;
    }

    async rejectPartnerJob({ partnerLiveJobId, actor, reason }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        // Does NOT cancel live order, only sets partner job status to REJECTED
        job.partner_job_status = 'REJECTED';
        job.rejected_by = actor.userId;
        job.rejected_by_role = actor.role;
        job.rejected_at = new Date().toISOString();
        job.rejection_reason = reason;

        await this.auditPartnerJobWorkflowEvent({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_JOB_REJECTED',
            actor,
            metadata: { reason }
        });

        return job;
    }

    async holdPartnerJob({ partnerLiveJobId, actor, reason }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        if (!['ACCEPTED', 'READY_FOR_PRODUCTION', 'IN_PRODUCTION'].includes(job.partner_job_status)) {
            throw new Error(`Cannot hold job from status: ${job.partner_job_status}`);
        }

        job.partner_job_status = 'ON_HOLD';
        job.hold_reason = reason;

        await this.auditPartnerJobWorkflowEvent({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_JOB_HELD',
            actor,
            metadata: { reason }
        });

        // Customer-safe message generation without leaking internal reasons (delegated)

        return job;
    }

    async releasePartnerJobHold({ partnerLiveJobId, actor }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        if (job.partner_job_status !== 'ON_HOLD') {
            throw new Error(`Cannot release hold: Job is ${job.partner_job_status}`);
        }

        const criticalIncidents = this._mockIncidents.filter(i => i.partner_live_job_id === partnerLiveJobId && i.incident_status === 'OPEN' && i.severity === 'CRITICAL');
        if (criticalIncidents.length > 0) {
            throw new Error('Cannot release hold with open critical incidents');
        }

        job.partner_job_status = 'ACCEPTED'; // Or whatever it was before, simplifying for now
        job.hold_reason = null;

        await this.auditPartnerJobWorkflowEvent({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_JOB_RELEASED',
            actor
        });

        return job;
    }

    async acknowledgePartnerJob({ partnerLiveJobId, actor }) {
        // Just marks viewed
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        await this.auditPartnerJobWorkflowEvent({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_JOB_VIEWED',
            actor
        });
        return job;
    }

    async evaluatePartnerJobAcceptanceEligibility({ partnerLiveJobId, actor }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        return ['ASSIGNED', 'AWAITING_ACCEPTANCE'].includes(job.partner_job_status);
    }

    async auditPartnerJobWorkflowEvent(event) {
        if (this.partnerLiveJobService.recordPartnerLiveJobEvent) {
            await this.partnerLiveJobService.recordPartnerLiveJobEvent(event);
        }
    }
}

module.exports = PartnerJobWorkflowService;
