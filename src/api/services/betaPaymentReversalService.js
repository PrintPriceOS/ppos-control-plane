const crypto = require('crypto');

class BetaPaymentReversalService {
    constructor(dependencies = {}) {
        this.paymentModeService = dependencies.betaPaymentModeService;
        this.paymentVerificationService = dependencies.betaPaymentVerificationService;
        this._mockOrders = {
            'bo_1': { id: 'bo_1', status: 'DRAFT', customer_id: 'c_1', in_production: false },
            'bo_prod': { id: 'bo_prod', status: 'CONFIRMED', customer_id: 'c_1', in_production: true }
        };
        this._mockRefundRequests = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async assertCancellationAllowed({ betaOrderId, actor }) {
        const order = this._mockOrders[betaOrderId];
        if (!order) throw new Error('Beta order not found');

        if (actor.role === 'CUSTOMER' && order.customer_id !== actor.userId) {
            throw new Error('Customer may request cancellation only for own beta order');
        }

        if (order.in_production && actor.role === 'CUSTOMER') {
            return { allowed: false, reason: 'Production-started cancellation requires admin review' };
        }

        return { allowed: true };
    }

    async requestBetaOrderCancellation({ betaOrderId, reason, actor }) {
        this._assertRole(actor, ['CUSTOMER', 'SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const check = await this.assertCancellationAllowed({ betaOrderId, actor });
        if (!check.allowed) throw new Error(check.reason);

        const order = this._mockOrders[betaOrderId];
        order.cancellation_requested = true;
        order.cancellation_reason = reason;

        await this._recordEvent({ betaOrderId, eventType: 'ORDER_CANCELLATION_REQUESTED', actor, message: reason });
        return order;
    }

    async approveBetaOrderCancellation({ betaOrderId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const order = this._mockOrders[betaOrderId];
        if (!order) throw new Error('Beta order not found');

        order.status = 'CANCELLED';
        
        await this._recordEvent({ betaOrderId, eventType: 'ORDER_CANCELLATION_APPROVED', actor, message: 'Cancellation approved' });
        return order;
    }

    async rejectBetaOrderCancellation({ betaOrderId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const order = this._mockOrders[betaOrderId];
        if (!order) throw new Error('Beta order not found');

        order.cancellation_requested = false;
        
        await this._recordEvent({ betaOrderId, eventType: 'ORDER_CANCELLATION_REJECTED', actor, message: reason });
        return order;
    }

    async assertRefundAllowed({ betaPaymentRecordId, actor }) {
        const record = await this.paymentVerificationService.getPaymentVerificationStatus({ betaPaymentRecordId, actor });
        if (actor.role === 'CUSTOMER' && record.customer_id !== actor.userId) {
            throw new Error('Customer may request refund only for own payment record');
        }
        return { allowed: true, record };
    }

    async requestRefund({ betaPaymentRecordId, amount, reason, actor }) {
        this._assertRole(actor, ['CUSTOMER', 'SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const check = await this.assertRefundAllowed({ betaPaymentRecordId, actor });

        const req = {
            id: `brr_${crypto.randomUUID()}`,
            beta_payment_record_id: betaPaymentRecordId,
            customer_id: check.record.customer_id,
            refund_status: 'REQUESTED',
            amount_requested: amount,
            currency: check.record.currency,
            reason
        };
        this._mockRefundRequests.push(req);

        check.record.payment_status = 'REFUND_REQUESTED';

        await this._recordEvent({ betaPaymentRecordId, eventType: 'REFUND_REQUESTED', actor, message: reason });
        return req;
    }

    async approveRefund({ refundRequestId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const req = this._mockRefundRequests.find(r => r.id === refundRequestId);
        if (!req) throw new Error('Refund request not found');

        req.refund_status = 'APPROVED';
        req.approved_by = actor.userId;

        const record = await this.paymentVerificationService.getPaymentVerificationStatus({ betaPaymentRecordId: req.beta_payment_record_id, actor });
        record.payment_status = 'REFUND_PENDING';

        await this._recordEvent({ betaPaymentRecordId: req.beta_payment_record_id, eventType: 'REFUND_APPROVED', actor, message: 'Refund approved' });
        return req;
    }

    async rejectRefund({ refundRequestId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const req = this._mockRefundRequests.find(r => r.id === refundRequestId);
        if (!req) throw new Error('Refund request not found');

        req.refund_status = 'REJECTED';
        req.rejected_by = actor.userId;

        const record = await this.paymentVerificationService.getPaymentVerificationStatus({ betaPaymentRecordId: req.beta_payment_record_id, actor });
        record.payment_status = 'PAYMENT_CONFIRMED'; // Or previous state

        await this._recordEvent({ betaPaymentRecordId: req.beta_payment_record_id, eventType: 'REFUND_REJECTED', actor, message: reason });
        return req;
    }

    async markRefundCompleted({ refundRequestId, evidencePayload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const req = this._mockRefundRequests.find(r => r.id === refundRequestId);
        if (!req) throw new Error('Refund request not found');
        if (!evidencePayload) throw new Error('Refund completion requires evidence');

        req.refund_status = 'COMPLETED';
        req.evidence_json = evidencePayload;

        const record = await this.paymentVerificationService.getPaymentVerificationStatus({ betaPaymentRecordId: req.beta_payment_record_id, actor });
        record.payment_status = 'REFUNDED';

        await this._recordEvent({ betaPaymentRecordId: req.beta_payment_record_id, eventType: 'REFUND_COMPLETED', actor, message: 'Refund completed' });
        return req;
    }

    async reversePayment({ betaPaymentRecordId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = await this.paymentVerificationService.getPaymentVerificationStatus({ betaPaymentRecordId, actor });
        
        record.payment_status = 'REVERSED';
        record.historical_confirmation_preserved = true; // explicitly preserve history in mock

        await this._recordEvent({ betaPaymentRecordId, eventType: 'PAYMENT_REVERSED', actor, message: reason });
        return record;
    }

    async buildCustomerSafeRefundStatus({ betaPaymentRecordId, actor }) {
        this._assertRole(actor, ['CUSTOMER']);
        const req = this._mockRefundRequests.find(r => r.beta_payment_record_id === betaPaymentRecordId);
        return req ? { refund_status: req.refund_status, amount_requested: req.amount_requested } : null;
    }

    async _recordEvent(event) {
        const ev = { ...event, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = BetaPaymentReversalService;
