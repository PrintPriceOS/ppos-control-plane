class AdminLiveOpsCommandService {
    constructor(dependencies = {}) {
        this.readModelService = dependencies.readModelService || {};
        this._mockDb = {
            escalations: [],
            incidents: [],
            liveOrders: [{ id: 'lo_1', status: 'ACTIVE', hasCriticalIncident: false }],
            enablements: [{ tenantId: 't_A', printhouseId: 'ph_1', status: 'ACTIVE' }]
        };
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized: Role ${actor.role} lacks permission for this command action`);
        }
    }

    async createLiveOpsEscalation({ liveOrderId, partnerLiveJobId, escalationType, severity, message, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const esc = {
            id: `esc_${Date.now()}`,
            liveOrderId, partnerLiveJobId, escalationType, severity, message,
            status: 'OPEN',
            createdBy: actor.userId,
            createdAt: new Date().toISOString()
        };
        this._mockDb.escalations.push(esc);
        await this.recordCommandActionDecision({ eventType: 'COMMAND_ESCALATION_CREATED', actor, metadata: { escalationId: esc.id } });
        return esc;
    }

    async acknowledgeLiveOpsEscalation({ escalationId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const esc = this._mockDb.escalations.find(e => e.id === escalationId);
        if (!esc) throw new Error('Escalation not found');
        esc.status = 'ACKNOWLEDGED';
        await this.recordCommandActionDecision({ eventType: 'COMMAND_ESCALATION_ACKNOWLEDGED', actor, metadata: { escalationId } });
        return esc;
    }

    async resolveLiveOpsEscalation({ escalationId, resolutionNotes, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const esc = this._mockDb.escalations.find(e => e.id === escalationId);
        if (!esc) throw new Error('Escalation not found');
        esc.status = 'RESOLVED';
        esc.resolutionNotes = resolutionNotes;
        await this.recordCommandActionDecision({ eventType: 'COMMAND_ESCALATION_RESOLVED', actor, metadata: { escalationId } });
        return esc;
    }

    async triageIncidentFromCommandCenter({ incidentId, action, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        await this.recordCommandActionDecision({ eventType: 'COMMAND_INCIDENT_TRIAGED', actor, metadata: { incidentId, action } });
        return { success: true };
    }

    async pauseLiveOrderFromCommandCenter({ liveOrderId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const order = this._mockDb.liveOrders.find(o => o.id === liveOrderId);
        if (order) order.status = 'PAUSED';
        await this.recordCommandActionDecision({ eventType: 'COMMAND_ORDER_PAUSED', actor, metadata: { liveOrderId, reason } });
        return { success: true };
    }

    async resumeLiveOrderFromCommandCenter({ liveOrderId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const order = this._mockDb.liveOrders.find(o => o.id === liveOrderId);
        if (order && order.hasCriticalIncident) throw new Error('Cannot resume with critical incident');
        if (order) order.status = 'ACTIVE';
        await this.recordCommandActionDecision({ eventType: 'COMMAND_ORDER_RESUMED', actor, metadata: { liveOrderId } });
        return { success: true };
    }

    async triggerLiveOrderRollback({ liveOrderId, rollbackType, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        if (!reason) throw new Error('Rollback requires explicit reason');
        await this.recordCommandActionDecision({ eventType: 'COMMAND_ROLLBACK_TRIGGERED', actor, metadata: { liveOrderId, rollbackType, reason } });
        return { success: true };
    }

    async revokeLiveEnablementFromCommandCenter({ tenantId, printhouseId, reason, impactScope, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const enablement = this._mockDb.enablements.find(e => e.tenantId === tenantId && e.printhouseId === printhouseId);
        if (enablement) enablement.status = 'REVOKED';
        await this.recordCommandActionDecision({ eventType: 'COMMAND_LIVE_REVOKED', actor, metadata: { tenantId, printhouseId, reason, impactScope } });
        return { success: true };
    }

    async requestPartnerReassignment({ partnerLiveJobId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        await this.recordCommandActionDecision({ eventType: 'COMMAND_REASSIGNMENT_REQUESTED', actor, metadata: { partnerLiveJobId, reason } });
        return { success: true, warning: 'Reassignment requested. Auto-reroute is disabled. Await partner acknowledgement.' };
    }

    async reviewHandoffPackageFromCommandCenter({ liveOrderId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        await this.recordCommandActionDecision({ eventType: 'COMMAND_HANDOFF_REVIEWED', actor, metadata: { liveOrderId } });
        return { reviewed: true, action: 'Handoff not sent by review' };
    }

    async reviewCompletionEvidenceFromCommandCenter({ partnerLiveJobId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        await this.recordCommandActionDecision({ eventType: 'COMMAND_COMPLETION_REVIEWED', actor, metadata: { partnerLiveJobId } });
        return { reviewed: true, action: 'Completion not executed by review' };
    }

    async blockLiveOrderFromCommandCenter({ liveOrderId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const order = this._mockDb.liveOrders.find(o => o.id === liveOrderId);
        if (order) order.status = 'BLOCKED';
        await this.recordCommandActionDecision({ eventType: 'COMMAND_ACTION_BLOCKED', actor, metadata: { liveOrderId, reason } });
        return { success: true };
    }

    async recordCommandActionDecision(decision) {
        if (this.readModelService.recordCommandEvent) {
            await this.readModelService.recordCommandEvent(decision);
        }
    }
}

module.exports = AdminLiveOpsCommandService;
