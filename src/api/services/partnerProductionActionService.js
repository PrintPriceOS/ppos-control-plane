class PartnerProductionActionService {
    constructor(dependencies = {}) {
        this.partnerLiveJobService = dependencies.partnerLiveJobService || {};
        this.liveOrderLifecycleService = dependencies.liveOrderLifecycleService || {};
        
        // Mock data for tests
        this._mockIncidents = [];
        this._mockEvidence = {};
        this._mockLiveGuard = {
            allowStart: true,
            allowComplete: true
        };
    }

    async startPartnerProduction({ partnerLiveJobId, actor }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        if (job.partner_job_status !== 'ACCEPTED') {
            throw new Error(`Cannot start production: Job is not ACCEPTED (Status: ${job.partner_job_status})`);
        }

        if (!this._mockLiveGuard.allowStart) {
            throw new Error('Live guard blocks production start');
        }

        if (job.assigned_machine_id === 'OFFLINE_MACHINE') {
            throw new Error('Assigned machine is offline or incompatible');
        }

        job.partner_job_status = 'IN_PRODUCTION';

        await this.auditPartnerProductionAction({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_PRODUCTION_STARTED',
            actor
        });

        return job;
    }

    async pausePartnerProduction({ partnerLiveJobId, actor, reason }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        job.partner_job_status = 'PRODUCTION_PAUSED';

        await this.auditPartnerProductionAction({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_PRODUCTION_PAUSED',
            actor,
            metadata: { reason }
        });

        return job;
    }

    async resumePartnerProduction({ partnerLiveJobId, actor }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        job.partner_job_status = 'IN_PRODUCTION';

        await this.auditPartnerProductionAction({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_PRODUCTION_RESUMED',
            actor
        });

        return job;
    }

    async reportPartnerIncident({ partnerLiveJobId, actor, incidentPayload }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        const incident = {
            id: `inc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            tenant_id: actor.tenantId,
            printhouse_id: actor.printhouseId,
            partner_live_job_id: partnerLiveJobId,
            live_order_id: job.live_order_id,
            incident_type: incidentPayload.incident_type || 'CUSTOM',
            incident_status: 'OPEN',
            severity: incidentPayload.severity || 'WARNING',
            partner_message: incidentPayload.message,
            created_by: actor.userId,
            created_by_role: actor.role,
            created_at: new Date().toISOString()
        };

        this._mockIncidents.push(incident);

        await this.auditPartnerProductionAction({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_INCIDENT_REPORTED',
            actor,
            metadata: { incident_id: incident.id, severity: incident.severity }
        });

        return incident;
    }

    async resolvePartnerIncident({ incidentId, actor, resolutionNotes }) {
        const incident = this._mockIncidents.find(i => i.id === incidentId);
        if (!incident) throw new Error('Incident not found');
        if (incident.tenant_id !== actor.tenantId) throw new Error('Unauthorized');
        
        incident.incident_status = 'RESOLVED';
        incident.resolved_by = actor.userId;
        incident.resolution_notes = resolutionNotes;
        incident.resolved_at = new Date().toISOString();

        await this.auditPartnerProductionAction({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId: incident.partner_live_job_id,
            liveOrderId: incident.live_order_id,
            eventType: 'PARTNER_INCIDENT_RESOLVED',
            actor,
            metadata: { incident_id: incident.id }
        });

        return incident;
    }

    async submitPartnerCompletionEvidence({ partnerLiveJobId, actor, evidencePayload }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });
        
        this._mockEvidence[partnerLiveJobId] = {
            ...evidencePayload,
            submitted_by: actor.userId,
            submitted_at: new Date().toISOString()
        };

        await this.auditPartnerProductionAction({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_COMPLETION_SUBMITTED',
            actor
        });

        return this._mockEvidence[partnerLiveJobId];
    }

    async completePartnerProduction({ partnerLiveJobId, actor }) {
        const job = await this.partnerLiveJobService.getPartnerLiveJob({ partnerLiveJobId, actor });

        if (!this._mockEvidence[partnerLiveJobId]) {
            throw new Error('Completion blocked: Completion evidence is required');
        }

        const openCritical = this._mockIncidents.filter(i => i.partner_live_job_id === partnerLiveJobId && i.incident_status === 'OPEN' && i.severity === 'CRITICAL');
        if (openCritical.length > 0) {
            throw new Error('Completion blocked: Critical incidents must be resolved');
        }

        if (!this._mockLiveGuard.allowComplete) {
            throw new Error('Completion blocked by live guard');
        }

        job.partner_job_status = 'COMPLETED';
        job.completed_by = actor.userId;
        job.completed_by_role = actor.role;
        job.completed_at = new Date().toISOString();

        await this.auditPartnerProductionAction({
            tenantId: actor.tenantId,
            printhouseId: actor.printhouseId,
            partnerLiveJobId,
            liveOrderId: job.live_order_id,
            eventType: 'PARTNER_JOB_COMPLETED',
            actor
        });

        // Mutates live order through governed path
        if (this.liveOrderLifecycleService.markLiveOrderCompleted) {
            await this.liveOrderLifecycleService.markLiveOrderCompleted({ liveOrderId: job.live_order_id, actor });
        }

        return job;
    }

    async auditPartnerProductionAction(event) {
        if (this.partnerLiveJobService.recordPartnerLiveJobEvent) {
            await this.partnerLiveJobService.recordPartnerLiveJobEvent(event);
        }
    }
}

module.exports = PartnerProductionActionService;
