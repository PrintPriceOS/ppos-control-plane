const crypto = require('crypto');

class CohortExpansionAuditService {
    constructor() {
        this._mockEvents = [];
    }

    _assertRole(actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
    }

    async recordExpansionEvent({ tenant_id, cohort_id, expansion_review_id, hardening_action_id, event_type, metadata_json, actor }) {
        this._assertRole(actor);
        const event = {
            id: `cea_${crypto.randomUUID()}`,
            tenant_id,
            cohort_id,
            expansion_review_id,
            hardening_action_id,
            event_type,
            actor_id: actor.userId,
            actor_role: actor.role,
            metadata_json: metadata_json || {},
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(event);
        return event;
    }

    async listExpansionEvents(filters, actor) {
        this._assertRole(actor);
        let filtered = this._mockEvents;
        if (filters.tenant_id) filtered = filtered.filter(e => e.tenant_id === filters.tenant_id);
        if (filters.cohort_id) filtered = filtered.filter(e => e.cohort_id === filters.cohort_id);
        if (filters.expansion_review_id) filtered = filtered.filter(e => e.expansion_review_id === filters.expansion_review_id);
        return filtered;
    }
}

module.exports = CohortExpansionAuditService;
