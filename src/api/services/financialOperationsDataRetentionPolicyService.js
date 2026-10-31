const crypto = require('crypto');

class FinancialOperationsDataRetentionPolicyService {
    constructor() {
        this._mockEvents = [];
        this._mockPolicies = [];
        this.SUPPORTED_DOMAINS = [
            'MARKETPLACE_ORDERS', 'PAYMENTS', 'REFUNDS', 'PAYOUTS',
            'GOVERNED_INVOICES', 'CREDIT_NOTES', 'RECONCILIATION',
            'TAX_VAT', 'PROVIDER_EVENTS', 'SETTLEMENT_FILES',
            'AUDIT_EVENTS', 'EXPORT_PREVIEWS'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createPolicy(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const policyId = `rp_${crypto.randomUUID()}`;
        const policy = {
            id: crypto.randomUUID(),
            retention_policy_id: policyId,
            tenant_id: payload.tenantId || null,
            policy_name: payload.policyName,
            policy_status: 'DRAFT',
            data_domain: payload.dataDomain,
            data_categories_json: payload.dataCategories || [],
            retention_period_days: payload.retentionPeriodDays,
            legal_hold_required: payload.legalHoldRequired || false,
            deletion_allowed: payload.deletionAllowed || false,
            anonymization_allowed: payload.anonymizationAllowed || false,
            redaction_required: payload.redactionRequired !== false, // Defaults to true
            manual_review_required: payload.manualReviewRequired !== false, // Defaults to true
            production_execution_enabled: payload.productionExecutionEnabled || false,
            full_public_enabled: payload.fullPublicEnabled || false,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockPolicies.push(policy);

        await this._recordEvent('FINOPS_DATA_RETENTION_POLICY_CREATED', policy, actor, `Retention policy ${policy.policy_name} created`);

        return policy;
    }

    async evaluatePolicyReadiness(policyId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const policy = this._mockPolicies.find(p => p.retention_policy_id === policyId);
        if (!policy) throw new Error('Policy not found');

        await this._recordEvent('FINOPS_DATA_RETENTION_POLICY_EVALUATED', policy, actor, 'Evaluating policy readiness');

        const blockers = [];

        if (!policy.data_domain || !this.SUPPORTED_DOMAINS.includes(policy.data_domain)) {
            blockers.push('DATA_DOMAIN_UNDEFINED_OR_UNSUPPORTED');
        }

        if (!policy.data_categories_json || policy.data_categories_json.length === 0) {
            blockers.push('DATA_CATEGORIES_UNDEFINED');
        }

        if (!policy.retention_period_days || policy.retention_period_days <= 0) {
            blockers.push('RETENTION_PERIOD_UNDEFINED');
        }

        if (!policy.redaction_required) {
            blockers.push('REDACTION_NOT_REQUIRED');
        }

        if (!policy.manual_review_required) {
            blockers.push('MANUAL_REVIEW_NOT_REQUIRED');
        }

        if (policy.production_execution_enabled) {
            blockers.push('PRODUCTION_EXECUTION_ENABLED');
        }

        if (policy.full_public_enabled) {
            blockers.push('FULL_PUBLIC_ENABLED');
        }

        if (blockers.length > 0) {
            policy.policy_status = 'REJECTED';
            await this._recordEvent('FINOPS_DATA_RETENTION_POLICY_WARNING_RAISED', policy, actor, `Policy evaluation failed. Blockers: ${blockers.join(', ')}`);
            await this._recordEvent('FINOPS_DATA_RETENTION_POLICY_REJECTED', policy, actor, 'Policy rejected');
            return { policy, ready: false, blockers };
        }

        policy.policy_status = 'READY_FOR_REVIEW';
        await this._recordEvent('FINOPS_DATA_RETENTION_POLICY_READY_FOR_REVIEW', policy, actor, 'Policy is ready for review');

        return { policy, ready: true, blockers: [] };
    }

    async approvePolicy(policyId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const policy = this._mockPolicies.find(p => p.retention_policy_id === policyId);
        if (!policy) throw new Error('Policy not found');

        if (policy.policy_status !== 'READY_FOR_REVIEW' && policy.policy_status !== 'MANUAL_REVIEW_REQUIRED') {
            throw new Error(`Cannot approve policy in status ${policy.policy_status}`);
        }

        policy.policy_status = 'APPROVED_FOR_READINESS';
        policy.approved_at = new Date().toISOString();
        policy.approved_by = actor.userId;

        await this._recordEvent('FINOPS_DATA_RETENTION_POLICY_APPROVED_FOR_READINESS', policy, actor, 'Policy approved for readiness');

        return policy;
    }

    async revokePolicy(policyId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const policy = this._mockPolicies.find(p => p.retention_policy_id === policyId);
        if (!policy) throw new Error('Policy not found');

        policy.policy_status = 'REVOKED';
        policy.revoked_at = new Date().toISOString();
        policy.revoked_by = actor.userId;

        await this._recordEvent('FINOPS_DATA_RETENTION_POLICY_REVOKED', policy, actor, 'Policy revoked');

        return policy;
    }

    async _recordEvent(eventType, policy, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            retention_policy_id: policy ? policy.retention_policy_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsDataRetentionPolicyService;
