const BetaObservabilityEventService = require('./betaObservabilityEventService');

class BetaFunnelTrackingService {
    constructor(dependencies = {}) {
        this.betaObservabilityEventService = dependencies.betaObservabilityEventService || new BetaObservabilityEventService();
    }

    async _safeTrack(event) {
        try {
            await this.betaObservabilityEventService.recordBetaFunnelEventOnce(event, event.idempotency_key);
        } catch (e) {
            console.warn(`[FunnelTrackingService] Failed to track event ${event.event_type}: ${e.message}`);
        }
    }

    buildFunnelContext(payload, actor) {
        return {
            tenant_id: payload.tenant_id,
            cohort_id: payload.cohort_id,
            customer_id: payload.customer_id || actor.userId,
            beta_registration_id: payload.beta_registration_id,
            invite_code_id: payload.invite_code_id,
            live_order_id: payload.live_order_id,
            beta_order_id: payload.beta_order_id,
            offer_id: payload.offer_id,
            event_source: payload.event_source || 'CONTROL_PLANE',
            correlation_id: this.betaObservabilityEventService.buildEventCorrelationId(payload),
            idempotency_key: payload.idempotency_key || `idem_${Date.now()}_${Math.random()}`
        };
    }

    async trackInviteLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, {});
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // e.g. INVITE_ISSUED, INVITE_REDEEMED
            event_status: 'SUCCESS',
            pii_minimized_json: { email: payload.email }
        });
    }

    async trackRegistrationLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // REGISTRATION_STARTED, TERMS_ACCEPTED, BETA_CUSTOMER_ACTIVATED
            event_status: 'SUCCESS'
        });
    }

    async trackOfferLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // OFFER_REQUESTED, OFFER_GENERATED
            event_status: 'SUCCESS'
        });
    }

    async trackOrderLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // ORDER_CREATED
            event_status: 'SUCCESS'
        });
    }

    async trackFileUploadLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // FILE_UPLOAD_COMPLETED
            event_status: 'SUCCESS'
        });
    }

    async trackPreflightLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // PREFLIGHT_COMPLETED
            event_status: 'SUCCESS'
        });
    }

    async trackProofLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // PROOF_APPROVED
            event_status: 'SUCCESS'
        });
    }

    async trackPaymentLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // PAYMENT_REFERENCE_SUBMITTED
            event_status: 'SUCCESS'
        });
    }

    async trackLivePipelineLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // LIVE_PIPELINE_ENTERED
            event_status: 'SUCCESS'
        });
    }

    async trackPartnerLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // PARTNER_JOB_ACCEPTED
            event_status: 'SUCCESS'
        });
    }

    async trackSupportLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.customer_id });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // SUPPORT_TICKET_CREATED
            event_status: 'INFO'
        });
    }

    async trackEmergencyLifecycleEvent(payload) {
        const ctx = this.buildFunnelContext(payload, { userId: payload.actor?.userId });
        await this._safeTrack({
            ...ctx,
            event_type: payload.event_type, // EMERGENCY_STOP_TRIGGERED, ROLLBACK_TRIGGERED
            event_status: 'WARNING'
        });
    }
}

module.exports = BetaFunnelTrackingService;
