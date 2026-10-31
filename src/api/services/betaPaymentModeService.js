const crypto = require('crypto');

class BetaPaymentModeService {
    constructor() {
        this._mockPaymentModes = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createBetaPaymentMode({ cohortId, tenantId, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN']);

        const mode = {
            id: `bpm_${crypto.randomUUID()}`,
            tenant_id: tenantId,
            cohort_id: cohortId,
            payment_mode: payload.paymentMode || 'DISABLED',
            mode_status: 'DRAFT',
            currency: payload.currency || 'USD',
            allowed_countries_json: payload.allowedCountries || [],
            allowed_order_types_json: payload.allowedOrderTypes || [],
            max_amount_per_order: payload.maxAmountPerOrder || null,
            max_amount_per_customer: payload.maxAmountPerCustomer || null,
            requires_manual_verification: payload.requiresManualVerification || false,
            requires_invoice_before_payment: payload.requiresInvoiceBeforePayment || false,
            requires_payment_before_handoff: payload.requiresPaymentBeforeHandoff || false,
            requires_payment_before_production: payload.requiresPaymentBeforeProduction || false,
            provider_name: payload.providerName || null,
            provider_readiness_json: payload.providerReadiness || null,
            customer_safe_instructions_json: payload.customerSafeInstructions || null,
            created_by: actor.userId,
            created_by_role: actor.role,
            created_at: new Date().toISOString()
        };

        if (mode.payment_mode === 'BANK_TRANSFER_MANUAL_VERIFICATION') {
            mode.requires_manual_verification = true;
        }

        this._mockPaymentModes.push(mode);

        await this.recordBetaPaymentEvent({
            tenantId, cohortId, eventType: 'PAYMENT_MODE_CREATED', actor, message: `Created payment mode ${mode.payment_mode}`
        });

        return mode;
    }

    async activateBetaPaymentMode({ paymentModeId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);

        const mode = this._mockPaymentModes.find(m => m.id === paymentModeId);
        if (!mode) throw new Error('Payment mode not found');

        if (mode.payment_mode === 'EXTERNAL_PROVIDER_LIVE_APPROVED') {
            if (!mode.provider_readiness_json || mode.provider_readiness_json.status !== 'READY') {
                throw new Error('External provider live mode requires provider readiness to be READY');
            }
        }

        mode.mode_status = 'ACTIVE';

        await this.recordBetaPaymentEvent({
            tenantId: mode.tenant_id, cohortId: mode.cohort_id, eventType: 'PAYMENT_MODE_ACTIVATED', actor, message: `Activated payment mode ${mode.payment_mode}`
        });

        return mode;
    }

    async pauseBetaPaymentMode({ paymentModeId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN']);
        const mode = this._mockPaymentModes.find(m => m.id === paymentModeId);
        if (!mode) throw new Error('Payment mode not found');

        mode.mode_status = 'PAUSED';

        await this.recordBetaPaymentEvent({
            tenantId: mode.tenant_id, cohortId: mode.cohort_id, eventType: 'PAYMENT_MODE_PAUSED', actor, message: `Paused payment mode ${mode.payment_mode}: ${reason}`
        });

        return mode;
    }

    async disableBetaPaymentMode({ paymentModeId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN']);
        const mode = this._mockPaymentModes.find(m => m.id === paymentModeId);
        if (!mode) throw new Error('Payment mode not found');

        mode.mode_status = 'DISABLED';

        await this.recordBetaPaymentEvent({
            tenantId: mode.tenant_id, cohortId: mode.cohort_id, eventType: 'PAYMENT_MODE_PAUSED', actor, message: `Disabled payment mode: ${reason}`
        });

        return mode;
    }

    async getActivePaymentMode({ cohortId, tenantId, orderType, country, actor }) {
        const mode = this._mockPaymentModes.find(m => 
            m.cohort_id === cohortId && 
            m.tenant_id === tenantId && 
            m.mode_status === 'ACTIVE'
        );

        if (!mode) return null;

        if (mode.allowed_order_types_json && mode.allowed_order_types_json.length > 0 && !mode.allowed_order_types_json.includes(orderType)) {
            return null;
        }

        if (mode.allowed_countries_json && mode.allowed_countries_json.length > 0 && !mode.allowed_countries_json.includes(country)) {
            return null;
        }

        // Return a customer-safe version if actor is customer
        if (actor.role === 'CUSTOMER') {
            return {
                id: mode.id,
                payment_mode: mode.payment_mode,
                currency: mode.currency,
                customer_safe_instructions_json: mode.customer_safe_instructions_json
            };
        }

        return mode;
    }

    async evaluatePaymentModeForOrder({ betaOrderId, orderAmount, orderType, country, actor }) {
        // Mock evaluating which mode applies. We'll just return the active one if it fits.
        const mode = await this.getActivePaymentMode({ cohortId: 'c_1', tenantId: 't_1', orderType, country, actor: { role: 'SYSTEM' } });
        if (!mode || mode.payment_mode === 'DISABLED') {
            return { allowed: false, reason: 'No active payment mode' };
        }

        if (mode.max_amount_per_order && orderAmount > mode.max_amount_per_order) {
            return { allowed: false, reason: 'Amount exceeds max_amount_per_order' };
        }

        return { allowed: true, modeId: mode.id };
    }

    async assertPaymentModeAllowed({ cohortId, tenantId, orderType, country, amount, actor }) {
        const result = await this.evaluatePaymentModeForOrder({ betaOrderId: 'mock', orderAmount: amount, orderType, country, actor });
        if (!result.allowed) {
            throw new Error(`Payment mode not allowed: ${result.reason}`);
        }
    }

    async recordBetaPaymentEvent(event) {
        const ev = {
            id: `bpe_${crypto.randomUUID()}`,
            tenant_id: event.tenantId,
            cohort_id: event.cohortId,
            event_type: event.eventType,
            actor_user_id: event.actor.userId,
            actor_role: event.actor.role,
            message: event.message,
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = BetaPaymentModeService;
