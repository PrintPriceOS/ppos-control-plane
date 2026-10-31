const crypto = require('crypto');
const CohortExpansionAuditService = require('./cohortExpansionAuditService');

class BetaHardeningActionService {
    constructor(dependencies = {}) {
        this.auditService = dependencies.cohortExpansionAuditService || new CohortExpansionAuditService();
        this._mockActions = [];
    }

    _assertRole(actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
    }

    async createHardeningAction({ tenantId, cohortId, expansionReviewId, category, severity, isMandatory, description, actor }) {
        this._assertRole(actor);

        const validCategories = [
            'UX', 'COPY', 'PUBLIC_GUARD', 'FILE_UPLOAD', 'PREFLIGHT', 'PROOF',
            'PAYMENT', 'CUSTOMER_COMMUNICATIONS', 'SUPPORT', 'INCIDENT_RESPONSE',
            'PARTNER_HANDOFF', 'SECURITY', 'PRIVACY', 'RBAC', 'TENANT_ISOLATION',
            'COHORT_LIMITS', 'EMERGENCY_STOP', 'ROLLBACK', 'OTHER'
        ];

        if (!validCategories.includes(category)) {
            throw new Error(`Invalid category: ${category}`);
        }

        const action = {
            id: `bha_${crypto.randomUUID()}`,
            tenant_id: tenantId,
            cohort_id: cohortId,
            expansion_review_id: expansionReviewId || null,
            category,
            severity,
            is_mandatory: isMandatory || false,
            action_status: 'OPEN',
            description,
            resolution_notes: null,
            created_by: actor.userId,
            resolved_by: null,
            resolved_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        this._mockActions.push(action);

        await this.auditService.recordExpansionEvent({
            tenant_id: tenantId,
            cohort_id: cohortId,
            expansion_review_id: expansionReviewId,
            hardening_action_id: action.id,
            event_type: 'HARDENING_ACTION_CREATED',
            metadata_json: { category, severity, is_mandatory: action.is_mandatory },
            actor
        });

        return action;
    }

    async resolveHardeningAction({ actionId, resolutionNotes, actor }) {
        this._assertRole(actor);

        const action = this._mockActions.find(a => a.id === actionId);
        if (!action) throw new Error('Action not found');

        action.action_status = 'RESOLVED';
        action.resolution_notes = resolutionNotes;
        action.resolved_by = actor.userId;
        action.resolved_at = new Date().toISOString();
        action.updated_at = new Date().toISOString();

        await this.auditService.recordExpansionEvent({
            tenant_id: action.tenant_id,
            cohort_id: action.cohort_id,
            expansion_review_id: action.expansion_review_id,
            hardening_action_id: action.id,
            event_type: 'HARDENING_ACTION_RESOLVED',
            metadata_json: { resolution_notes: resolutionNotes },
            actor
        });

        return action;
    }

    async listHardeningActions(filters, actor) {
        this._assertRole(actor);
        let filtered = this._mockActions;
        if (filters.tenant_id) filtered = filtered.filter(a => a.tenant_id === filters.tenant_id);
        if (filters.cohort_id) filtered = filtered.filter(a => a.cohort_id === filters.cohort_id);
        if (filters.expansion_review_id) filtered = filtered.filter(a => a.expansion_review_id === filters.expansion_review_id);
        if (filters.action_status) filtered = filtered.filter(a => a.action_status === filters.action_status);
        return filtered;
    }
}

module.exports = BetaHardeningActionService;
