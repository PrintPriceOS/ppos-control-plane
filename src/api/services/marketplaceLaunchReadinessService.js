const crypto = require('crypto');

class MarketplaceLaunchReadinessService {
    constructor(dependencies = {}) {
        this.mockState = {
            artifact_trust_active: true,
            live_guard_active: true,
            command_center_active: true,
            emergency_stop_available: true,
            customer_portal_active: true,
            partner_job_board_active: true,
            payment_mode: 'PAYMENT_REFERENCE_ONLY',
            cohort_scope_defined: true,
            tenant_isolation_active: true,
            has_forbidden_claims: false
        };
    }

    async evaluatePublicMarketplaceReadiness({ cohortId = null, actor }) {
        const domains = {
            core_governance: await this.evaluateLaunchDomainReadiness({ domain: 'core_governance', actor }),
            order_lifecycle: await this.evaluateLaunchDomainReadiness({ domain: 'order_lifecycle', actor }),
            commercial_billing: await this.evaluateLaunchDomainReadiness({ domain: 'commercial_billing', actor }),
            partner_readiness: await this.evaluateLaunchDomainReadiness({ domain: 'partner_readiness', actor }),
            customer_readiness: await this.evaluateLaunchDomainReadiness({ domain: 'customer_readiness', actor }),
            operational_readiness: await this.evaluateLaunchDomainReadiness({ domain: 'operational_readiness', actor }),
            security_isolation: await this.evaluateLaunchDomainReadiness({ domain: 'security_isolation', actor }),
            cohort_readiness: cohortId ? await this.evaluateCohortReadiness({ cohortId, actor }) : 'NOT_EVALUATED',
            public_exposure: await this.evaluateLaunchDomainReadiness({ domain: 'public_exposure', actor })
        };

        const blocking_reasons = [];
        
        if (!this.mockState.artifact_trust_active) blocking_reasons.push('Missing artifact trust governance');
        if (!this.mockState.live_guard_active) blocking_reasons.push('Missing live order guard');
        if (!this.mockState.command_center_active) blocking_reasons.push('Missing admin command center');
        if (!this.mockState.emergency_stop_available) blocking_reasons.push('Missing emergency stop capability');
        if (!this.mockState.customer_portal_active) blocking_reasons.push('Missing customer portal validation');
        if (!this.mockState.partner_job_board_active) blocking_reasons.push('Missing partner job board validation');
        if (this.mockState.payment_mode === 'DISABLED' || !this.mockState.payment_mode) blocking_reasons.push('Public payment mode not explicitly configured');
        if (!this.mockState.cohort_scope_defined && cohortId) blocking_reasons.push('Cohort scope undefined');
        if (!this.mockState.tenant_isolation_active) blocking_reasons.push('Tenant isolation validation failed');
        if (this.mockState.has_forbidden_claims) blocking_reasons.push('Forbidden public claims detected (e.g. certified, guaranteed delivery)');

        for (const [k, v] of Object.entries(domains)) {
            if (v === 'FAILED') blocking_reasons.push(`Domain check failed: ${k}`);
        }

        const ready_for_launch_review = blocking_reasons.length === 0;

        return {
            ready_for_launch_review,
            ready_for_limited_public_rollout: false,
            ready_for_full_public: false,
            domains,
            blocking_reasons,
            warning_reasons: [],
            required_approvals: ["SYSTEM_ADMIN", "CONTROL_PLANE_ADMIN"],
            snapshot_hash: this._generateHash(domains, blocking_reasons)
        };
    }

    async evaluateLaunchDomainReadiness({ domain, actor }) {
        switch(domain) {
            case 'core_governance':
                return (this.mockState.artifact_trust_active && this.mockState.live_guard_active && this.mockState.command_center_active && this.mockState.emergency_stop_available) ? 'PASSED' : 'FAILED';
            case 'order_lifecycle':
                return (this.mockState.customer_portal_active && this.mockState.partner_job_board_active && this.mockState.command_center_active) ? 'PASSED' : 'FAILED';
            case 'commercial_billing':
                return (this.mockState.payment_mode !== 'DISABLED') ? 'PASSED' : 'FAILED';
            case 'partner_readiness':
                return this.mockState.partner_job_board_active ? 'PASSED' : 'FAILED';
            case 'customer_readiness':
                return (this.mockState.customer_portal_active && !this.mockState.has_forbidden_claims) ? 'PASSED' : 'FAILED';
            case 'operational_readiness':
                return this.mockState.command_center_active ? 'PASSED' : 'FAILED';
            case 'security_isolation':
                return this.mockState.tenant_isolation_active ? 'PASSED' : 'FAILED';
            case 'public_exposure':
                return !this.mockState.has_forbidden_claims ? 'PASSED' : 'FAILED';
            default:
                return 'NOT_EVALUATED';
        }
    }

    async evaluateCohortReadiness({ cohortId, actor }) {
        return this.mockState.cohort_scope_defined ? 'PASSED' : 'FAILED';
    }

    async buildLaunchReadinessSnapshot({ cohortId = null, actor }) {
        const evalResult = await this.evaluatePublicMarketplaceReadiness({ cohortId, actor });
        return {
            timestamp: new Date().toISOString(),
            evaluation: evalResult,
            snapshot_hash: evalResult.snapshot_hash
        };
    }

    sanitizeLaunchReadinessForRole(snapshot, actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN'].includes(actor.role)) {
            // Strip raw details if necessary, but for readiness it's usually safe overview
            const s = JSON.parse(JSON.stringify(snapshot));
            delete s.evaluation.snapshot_hash;
            return s;
        }
        return snapshot;
    }

    _generateHash(domains, blockers) {
        return crypto.createHash('sha256').update(JSON.stringify({ domains, blockers })).digest('hex');
    }
}

module.exports = MarketplaceLaunchReadinessService;
