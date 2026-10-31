const crypto = require('crypto');

class CohortExpansionExecutionAuditService {
    constructor() {
        this._mockExecutions = [];
        this._mockEvents = [];
        this._mockSnapshots = [];
    }

    _assertRole(actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
    }

    _assertTenant(tenantId, actor) {
        if (actor.tenantId && actor.tenantId !== tenantId) {
            throw new Error('Cross-tenant audit access blocked');
        }
    }

    async createExpansionExecutionAuditRecord(payload, actor) {
        this._assertRole(actor);
        this._assertTenant(payload.tenantId, actor);

        const execution = {
            id: `cee_${crypto.randomUUID()}`,
            expansion_review_id: payload.expansionReviewId,
            source_cohort_id: payload.sourceCohortId,
            tenant_id: payload.tenantId,
            execution_status: 'DRAFT',
            expansion_type: payload.expansionType,
            proposed_limits_json: payload.proposedLimits,
            requested_by: actor.userId,
            requested_by_role: actor.role,
            requested_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        this._mockExecutions.push(execution);
        return execution;
    }

    async recordExpansionExecutionEvent(event) {
        const ev = {
            id: `ceee_${crypto.randomUUID()}`,
            expansion_execution_id: event.expansionExecutionId,
            tenant_id: event.tenantId,
            event_type: event.eventType,
            actor_user_id: event.actor.userId,
            actor_role: event.actor.role,
            message: event.message,
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }

    async captureCohortLimitSnapshot({ expansionExecutionId, cohortId, snapshotType, tenantId, limits, actor }) {
        this._assertRole(actor);
        this._assertTenant(tenantId, actor);

        const snapshot = {
            id: `cels_${crypto.randomUUID()}`,
            expansion_execution_id: expansionExecutionId,
            cohort_id: cohortId,
            tenant_id: tenantId,
            snapshot_type: snapshotType,
            limits_json: limits,
            created_at: new Date().toISOString()
        };
        this._mockSnapshots.push(snapshot);
        return snapshot;
    }

    async getExpansionExecutionTimeline({ expansionExecutionId, actor }) {
        this._assertRole(actor);
        const execution = this._mockExecutions.find(e => e.id === expansionExecutionId);
        if (!execution) throw new Error('Execution not found');
        this._assertTenant(execution.tenant_id, actor);

        return this._mockEvents.filter(e => e.expansion_execution_id === expansionExecutionId);
    }

    async getExpansionExecutionAuditRecord({ expansionExecutionId, actor }) {
        this._assertRole(actor);
        const record = this._mockExecutions.find(e => e.id === expansionExecutionId);
        if (!record) throw new Error('Execution not found');
        this._assertTenant(record.tenant_id, actor);
        return this.sanitizeExpansionExecutionForRole(record, actor);
    }

    sanitizeExpansionExecutionForRole(record, actor) {
        return record;
    }
}

module.exports = CohortExpansionExecutionAuditService;
