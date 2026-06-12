const crypto = require('crypto');

class FinancialOperationsProviderCircuitBreakerReadinessService {
    constructor() {
        this._mockEvents = [];
        this._mockReviews = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluateReadiness(runId, policyJson, configOverrides, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const review = {
            id: crypto.randomUUID(),
            circuit_breaker_review_id: `cbr_${crypto.randomUUID()}`,
            failure_retry_run_id: runId,
            circuit_breaker_status: 'DRAFT',
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        const checks = {
            CIRCUIT_BREAKER_POLICY_DEFINED: !!policyJson,
            OPEN_THRESHOLD_DEFINED: !!policyJson?.open_threshold,
            HALF_OPEN_POLICY_DEFINED: !!policyJson?.half_open_policy,
            CLOSE_POLICY_DEFINED: !!policyJson?.close_policy,
            DEAD_LETTER_PATH_DEFINED: !!policyJson?.dead_letter_path,
            MANUAL_REVIEW_PATH_DEFINED: !!policyJson?.manual_review_path,
            INCIDENT_PATH_DEFINED: !!policyJson?.incident_path,
            IDEMPOTENCY_REQUIRED: policyJson?.idempotency_required !== false,
            NO_LIVE_PROVIDER_CONNECTIVITY: configOverrides.liveProviderConnectivity !== true,
            FULL_PUBLIC_DISABLED: configOverrides.fullPublic !== true
        };

        review.evidence_json.checks = checks;

        const allPassed = Object.values(checks).every(v => v === true);

        if (allPassed) {
            review.circuit_breaker_status = 'APPROVED_FOR_READINESS';
            await this._recordEvent('FINOPS_PROVIDER_CIRCUIT_BREAKER_APPROVED_FOR_READINESS', review, actor, 'Circuit breaker and DLQ readiness approved');
            await this._recordEvent('FINOPS_PROVIDER_DEAD_LETTER_READINESS_CONFIRMED', review, actor, 'Dead-letter readiness confirmed');
        } else {
            review.circuit_breaker_status = 'MANUAL_REVIEW_REQUIRED';
            const failedChecks = Object.keys(checks).filter(k => !checks[k]);
            await this._recordEvent('FINOPS_PROVIDER_CIRCUIT_BREAKER_WARNING_RAISED', review, actor, `Readiness blocked. Failed checks: ${failedChecks.join(', ')}`);
        }

        this._mockReviews.push(review);
        await this._recordEvent('FINOPS_PROVIDER_CIRCUIT_BREAKER_READINESS_EVALUATED', review, actor, `Readiness evaluated. Status: ${review.circuit_breaker_status}`);

        return review;
    }

    async simulateStateChange(reviewId, targetState, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const review = this._mockReviews.find(r => r.id === reviewId);
        if (!review) throw new Error('Review not found');

        if (!['OPEN_SIMULATED', 'HALF_OPEN_SIMULATED', 'CLOSED_SIMULATED'].includes(targetState)) {
            throw new Error(`Invalid simulated state: ${targetState}`);
        }

        review.circuit_breaker_status = targetState;
        review.updated_at = new Date().toISOString();

        await this._recordEvent('FINOPS_PROVIDER_CIRCUIT_BREAKER_STATE_SIMULATED', review, actor, `Circuit breaker state simulated to ${targetState}`);

        return review;
    }

    async _recordEvent(eventType, record, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            failure_retry_run_id: record ? record.failure_retry_run_id : null,
            circuit_breaker_review_id: record ? record.circuit_breaker_review_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderCircuitBreakerReadinessService;
