class PartnerLiveJobService {
    constructor(dependencies = {}) {
        this.liveOrderLifecycleService = dependencies.liveOrderLifecycleService || {};
        this._mockDb = {
            jobs: [],
            events: []
        };
    }

    async createPartnerLiveJobFromLiveOrder({ liveOrderId, actor, handoffEligible = true }) {
        if (!handoffEligible) {
            throw new Error('Partner job creation blocked: Live order not handoff eligible');
        }

        const job = {
            id: `pjob_${Date.now()}`,
            tenant_id: actor.tenantId,
            printhouse_id: actor.printhouseId || 'ph_1',
            live_order_id: liveOrderId,
            job_number: `PJ-${Date.now()}`,
            partner_job_status: 'AWAITING_ACCEPTANCE',
            created_at: new Date().toISOString()
        };

        this._mockDb.jobs.push(job);
        
        await this.recordPartnerLiveJobEvent({
            tenantId: job.tenant_id,
            printhouseId: job.printhouse_id,
            partnerLiveJobId: job.id,
            liveOrderId,
            eventType: 'PARTNER_JOB_ASSIGNED',
            actor
        });

        return job;
    }

    async getPartnerLiveJob({ partnerLiveJobId, actor }) {
        const job = this._mockDb.jobs.find(j => j.id === partnerLiveJobId);
        if (!job) throw new Error('Partner job not found');
        await this.assertPartnerCanViewJob({ partnerLiveJobId, actor, job });
        return job;
    }

    async listPartnerLiveJobs(filters = {}, actor) {
        return this._mockDb.jobs.filter(j => {
            if (j.tenant_id !== actor.tenantId) return false;
            if (['PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR'].includes(actor.role)) {
                if (j.printhouse_id !== actor.printhouseId) return false;
            }
            if (filters.status && j.partner_job_status !== filters.status) return false;
            return true;
        });
    }

    async assertPartnerCanViewJob({ partnerLiveJobId, actor, job = null }) {
        if (!job) {
            job = this._mockDb.jobs.find(j => j.id === partnerLiveJobId);
            if (!job) throw new Error('Job not found');
        }

        if (job.tenant_id !== actor.tenantId) {
            throw new Error('Unauthorized: Cross-tenant access blocked');
        }
        
        if (['PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR'].includes(actor.role)) {
            if (job.printhouse_id !== actor.printhouseId) {
                throw new Error('Unauthorized: Cross-printhouse access blocked');
            }
        }
        return true;
    }

    async assertPartnerCanActOnJob({ partnerLiveJobId, action, actor }) {
        await this.assertPartnerCanViewJob({ partnerLiveJobId, actor });
        // Real implementation would check role + action mapping + live guard constraints
        return true;
    }

    sanitizePartnerJobPayload(payload, actor) {
        // Redact internal governance JSONs, operator metadata, and billing info
        const safePayload = { ...payload };
        delete safePayload.operator_snapshot_json;
        delete safePayload.governance_snapshot_json;
        delete safePayload.raw_billing_data;
        delete safePayload.customer_financial_data;
        
        // Allowed safe components
        safePayload.partner_safe_customer_json = payload.shipping_address || {};
        safePayload.partner_safe_specifications_json = payload.production_specs || {};
        safePayload.partner_safe_handoff_json = payload.handoff_reference || {};
        
        return safePayload;
    }

    async buildPartnerSafeJobPayload({ partnerLiveJobId, actor, orderPayload = {} }) {
        const job = await this.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        return {
            id: job.id,
            job_number: job.job_number,
            status: job.partner_job_status,
            ...this.sanitizePartnerJobPayload(orderPayload, actor)
        };
    }

    async syncPartnerJobStatusFromLiveOrder({ liveOrderId, actor, liveOrderStatus }) {
        const job = this._mockDb.jobs.find(j => j.live_order_id === liveOrderId);
        if (!job) return;

        // Ensure partner status doesn't exceed live order status conceptually.
        // Simple mock mapping:
        if (liveOrderStatus === 'COMPLETED' && job.partner_job_status !== 'COMPLETED') {
            throw new Error('Partner job status cannot exceed live order status or out of sync');
        }
        // ... logic
    }

    async recordPartnerLiveJobEvent(event) {
        this._mockDb.events.push({
            id: `pevt_${Date.now()}`,
            ...event,
            created_at: new Date().toISOString()
        });
        
        if (this.liveOrderLifecycleService.recordLiveOrderEvent) {
            await this.liveOrderLifecycleService.recordLiveOrderEvent({
                tenantId: event.tenantId,
                liveOrderId: event.liveOrderId,
                eventType: event.eventType,
                actor: event.actor,
                message: `Partner Event: ${event.eventType}`
            });
        }
    }
}

module.exports = PartnerLiveJobService;
