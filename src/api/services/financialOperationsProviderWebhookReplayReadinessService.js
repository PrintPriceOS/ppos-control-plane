const crypto = require('crypto');

class FinancialOperationsProviderWebhookReplayReadinessService {
    constructor(sandboxService) {
        this.sandboxService = sandboxService;
        this._mockReplays = new Map();
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createReplayReadiness(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sandbox = this.sandboxService._getSandbox(payload.webhookSandboxId);

        const review = {
            id: crypto.randomUUID(),
            replay_review_id: `rply_${crypto.randomUUID()}`,
            webhook_sandbox_id: sandbox.webhook_sandbox_id,
            tenant_id: sandbox.tenant_id,
            provider_key: sandbox.provider_key,
            provider_type: sandbox.provider_type,
            replay_status: 'DRAFT',
            idempotency_key: payload.idempotencyKey || null,
            replay_window_seconds: payload.replayWindowSeconds || null,
            duplicate_detection_status: payload.duplicateDetectionStatus || 'NOT_CONFIGURED',
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockReplays.set(review.replay_review_id, review);
        await this._recordEvent('FINOPS_PROVIDER_WEBHOOK_REPLAY_REVIEW_CREATED', review, actor, 'Draft webhook replay review created');

        return review;
    }

    async evaluateReadiness(replayReviewId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const review = this._getReview(replayReviewId);
        
        let blockers = [];

        if (!review.idempotency_key) blockers.push('IDEMPOTENCY_KEY_NOT_DEFINED');
        if (!review.replay_window_seconds) blockers.push('REPLAY_WINDOW_NOT_DEFINED');
        if (review.duplicate_detection_status !== 'CONFIGURED') blockers.push('DUPLICATE_DETECTION_NOT_DEFINED');

        try {
            const sandbox = this.sandboxService._getSandbox(review.webhook_sandbox_id);
            if (!sandbox.replay_protection_required) blockers.push('REPLAY_PROTECTION_NOT_REQUIRED');
            if (!sandbox.idempotency_required) blockers.push('IDEMPOTENCY_NOT_REQUIRED');
            if (sandbox.live_signing_secret_present) blockers.push('LIVE_SIGNING_SECRET_PRESENT');
            if (sandbox.live_endpoint_enabled) blockers.push('LIVE_ENDPOINT_ENABLED');
            if (sandbox.live_provider_connectivity_enabled) blockers.push('LIVE_PROVIDER_CONNECTIVITY_ENABLED');
            if (sandbox.full_public_enabled) blockers.push('FULL_PUBLIC_ENABLED');
        } catch (err) {
            blockers.push('SANDBOX_RETRIEVAL_FAILED');
        }

        const result = {
            status: blockers.length > 0 ? 'BLOCKED' : 'READY',
            blockers
        };

        await this._recordEvent('FINOPS_PROVIDER_WEBHOOK_REPLAY_READINESS_EVALUATED', review, actor, `Replay readiness evaluated. Status: ${result.status}`);
        return result;
    }

    async approveReplayReadiness(replayReviewId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const review = this._getReview(replayReviewId);

        const evalResult = await this.evaluateReadiness(replayReviewId, globalConfig, actor);
        if (evalResult.status === 'BLOCKED') {
            throw new Error(`Cannot approve replay readiness. Blockers: ${evalResult.blockers.join(', ')}`);
        }

        review.replay_status = 'APPROVED_FOR_READINESS';
        review.approved_at = new Date().toISOString();
        review.approved_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_WEBHOOK_REPLAY_APPROVED_FOR_READINESS', review, actor, 'Replay readiness approved');
        return review;
    }

    _getReview(id) {
        const review = this._mockReplays.get(id);
        if (!review) throw new Error('Replay review not found');
        return review;
    }

    async _recordEvent(eventType, review, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            replay_review_id: review.replay_review_id,
            webhook_sandbox_id: review.webhook_sandbox_id,
            tenant_id: review.tenant_id,
            provider_key: review.provider_key,
            provider_type: review.provider_type,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderWebhookReplayReadinessService;
