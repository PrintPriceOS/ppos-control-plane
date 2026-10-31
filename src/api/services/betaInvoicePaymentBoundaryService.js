const crypto = require('crypto');

class BetaInvoicePaymentBoundaryService {
    constructor(dependencies = {}) {
        this.paymentModeService = dependencies.betaPaymentModeService;
        this.paymentVerificationService = dependencies.betaPaymentVerificationService;
        this._mockOrders = {
            'bo_1': { id: 'bo_1', status: 'DRAFT', amount: 100, currency: 'USD', tenant_id: 't_1', cohort_id: 'c_1', customer_id: 'c_1', country: 'US', order_type: 'STANDARD' },
            'bo_cancelled': { id: 'bo_cancelled', status: 'CANCELLED', amount: 100, currency: 'USD', tenant_id: 't_1', cohort_id: 'c_1', customer_id: 'c_1', country: 'US', order_type: 'STANDARD' }
        };
        this._mockPaymentModes = {
            'pm_active': { id: 'pm_active', payment_mode: 'BANK_TRANSFER_MANUAL_VERIFICATION', requires_payment_before_handoff: true, requires_payment_before_production: true }
        };
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluateInvoiceReadiness({ betaOrderId, actor }) {
        const order = this._mockOrders[betaOrderId];
        if (!order) throw new Error('Beta order not found');

        if (order.status === 'CANCELLED' || order.status === 'REFUNDED' || order.status === 'REVERSED') {
            return { ready: false, reason: `Order is ${order.status}` };
        }

        const modeResult = await this.paymentModeService.evaluatePaymentModeForOrder({
            betaOrderId, orderAmount: order.amount, orderType: order.order_type, country: order.country, actor
        });

        if (!modeResult.allowed) {
            return { ready: false, reason: `No active payment mode: ${modeResult.reason}` };
        }

        return { ready: true, paymentModeId: modeResult.modeId };
    }

    async evaluatePaymentRequirement({ betaOrderId, actor }) {
        const readiness = await this.evaluateInvoiceReadiness({ betaOrderId, actor });
        if (!readiness.ready) return { required: false, reason: readiness.reason };
        return { required: true, paymentModeId: readiness.paymentModeId };
    }

    async createBetaPaymentRequest({ betaOrderId, actor }) {
        this._assertRole(actor, ['CUSTOMER', 'SYSTEM']);
        const req = await this.evaluatePaymentRequirement({ betaOrderId, actor });
        if (!req.required) throw new Error(`Payment request blocked: ${req.reason}`);

        const order = this._mockOrders[betaOrderId];
        const record = await this.paymentVerificationService.createPaymentRecordForBetaOrder({
            betaOrderId, paymentModeId: req.paymentModeId, expectedAmount: order.amount, currency: order.currency,
            tenantId: order.tenant_id, cohortId: order.cohort_id, customerId: order.customer_id, actor
        });

        await this._recordEvent({
            tenantId: order.tenant_id, betaOrderId, eventType: 'PAYMENT_REQUEST_CREATED', actor, message: 'Payment request created'
        });

        return record;
    }

    async createBetaProformaInvoiceRecord({ betaOrderId, actor }) {
        this._assertRole(actor, ['CUSTOMER', 'SYSTEM']);
        const readiness = await this.evaluateInvoiceReadiness({ betaOrderId, actor });
        if (!readiness.ready) throw new Error(`Proforma blocked: ${readiness.reason}`);

        const order = this._mockOrders[betaOrderId];
        const invoice = { id: `bpi_${crypto.randomUUID()}`, betaOrderId, status: 'ISSUED' };

        await this._recordEvent({
            tenantId: order.tenant_id, betaOrderId, eventType: 'PROFORMA_INVOICE_CREATED', actor, message: 'Proforma created'
        });

        return invoice;
    }

    async markInvoiceIssued({ invoiceRecordId, actor }) {
        // Mock
        return { id: invoiceRecordId, status: 'ISSUED' };
    }

    async buildCustomerSafeInvoicePaymentSummary({ betaOrderId, actor }) {
        this._assertRole(actor, ['CUSTOMER']);
        const order = this._mockOrders[betaOrderId];
        if (!order) throw new Error('Beta order not found');

        return {
            beta_order_id: betaOrderId,
            amount: order.amount,
            currency: order.currency
        };
    }

    async assertPaymentGateForHandoff({ liveOrderId, betaPaymentRecordId, actor }) {
        const record = await this.paymentVerificationService.getPaymentVerificationStatus({ betaPaymentRecordId, actor });
        const mode = this._mockPaymentModes[record.payment_mode_id];
        
        if (mode && mode.requires_payment_before_handoff && record.payment_status !== 'PAYMENT_CONFIRMED') {
            throw new Error('Payment required before handoff blocks unpaid order');
        }
        return true;
    }

    async assertPaymentGateForProduction({ liveOrderId, betaPaymentRecordId, actor }) {
        const record = await this.paymentVerificationService.getPaymentVerificationStatus({ betaPaymentRecordId, actor });
        const mode = this._mockPaymentModes[record.payment_mode_id];
        
        if (mode && mode.requires_payment_before_production && record.payment_status !== 'PAYMENT_CONFIRMED') {
            throw new Error('Payment required before production blocks unpaid order');
        }
        return true;
    }

    async _recordEvent(event) {
        const ev = { ...event, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = BetaInvoicePaymentBoundaryService;
