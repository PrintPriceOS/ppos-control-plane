const crypto = require('crypto');
const BetaPaymentModeService = require('./betaPaymentModeService');

class BetaPaymentVerificationService {
    constructor(dependencies = {}) {
        this.paymentModeService = dependencies.betaPaymentModeService || new BetaPaymentModeService();
        this._mockRecords = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createPaymentRecordForBetaOrder({ betaOrderId, paymentModeId, expectedAmount, currency, tenantId, cohortId, customerId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'CUSTOMER']);
        
        const record = {
            id: `bpr_${crypto.randomUUID()}`,
            tenant_id: tenantId,
            cohort_id: cohortId,
            customer_id: customerId,
            beta_order_id: betaOrderId,
            payment_mode_id: paymentModeId,
            payment_status: 'PAYMENT_REQUIRED',
            amount_expected: expectedAmount,
            currency: currency,
            verification_status: 'NOT_STARTED',
            created_at: new Date().toISOString()
        };

        this._mockRecords.push(record);

        await this.paymentModeService.recordBetaPaymentEvent({
            tenantId, cohortId, eventType: 'PAYMENT_RECORD_CREATED', actor, message: 'Created payment record'
        });

        return record;
    }

    async submitCustomerPaymentReference({ betaPaymentRecordId, referencePayload, actor }) {
        this._assertRole(actor, ['CUSTOMER']);
        const record = this._mockRecords.find(r => r.id === betaPaymentRecordId);
        if (!record) throw new Error('Record not found');
        if (record.customer_id !== actor.userId) throw new Error('Customer may submit reference only for own payment record');

        record.customer_reference = referencePayload.reference;
        record.payment_status = 'PAYMENT_REFERENCE_SUBMITTED';

        await this.paymentModeService.recordBetaPaymentEvent({
            tenantId: record.tenant_id, cohortId: record.cohort_id, eventType: 'PAYMENT_REFERENCE_SUBMITTED', actor, message: 'Reference submitted'
        });

        return record;
    }

    async submitPaymentEvidence({ betaPaymentRecordId, evidencePayload, actor }) {
        this._assertRole(actor, ['CUSTOMER']);
        const record = this._mockRecords.find(r => r.id === betaPaymentRecordId);
        if (!record) throw new Error('Record not found');
        if (record.customer_id !== actor.userId) throw new Error('Customer may submit evidence only for own payment record');

        record.evidence_json = evidencePayload;
        record.payment_status = 'VERIFICATION_PENDING';
        record.verification_status = 'PENDING';

        await this.paymentModeService.recordBetaPaymentEvent({
            tenantId: record.tenant_id, cohortId: record.cohort_id, eventType: 'PAYMENT_EVIDENCE_SUBMITTED', actor, message: 'Evidence submitted'
        });

        return record;
    }

    async requestPaymentVerification({ betaPaymentRecordId, actor }) {
        this._assertRole(actor, ['OPS_ADMIN']);
        const record = this._mockRecords.find(r => r.id === betaPaymentRecordId);
        if (!record) throw new Error('Record not found');

        record.verification_status = 'NEEDS_MORE_INFO';

        await this.paymentModeService.recordBetaPaymentEvent({
            tenantId: record.tenant_id, cohortId: record.cohort_id, eventType: 'PAYMENT_VERIFICATION_REQUESTED', actor, message: 'More info requested'
        });

        return record;
    }

    async approvePaymentVerification({ betaPaymentRecordId, verificationPayload, actor }) {
        this._assertRole(actor, ['CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'SYSTEM_ADMIN']);
        const record = this._mockRecords.find(r => r.id === betaPaymentRecordId);
        if (!record) throw new Error('Record not found');

        record.verification_status = 'APPROVED';
        record.verified_by = actor.userId;
        record.verified_by_role = actor.role;
        record.verified_at = new Date().toISOString();

        await this.paymentModeService.recordBetaPaymentEvent({
            tenantId: record.tenant_id, cohortId: record.cohort_id, eventType: 'PAYMENT_VERIFICATION_APPROVED', actor, message: 'Verification approved'
        });

        return record;
    }

    async rejectPaymentVerification({ betaPaymentRecordId, reason, actor }) {
        this._assertRole(actor, ['CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'SYSTEM_ADMIN']);
        const record = this._mockRecords.find(r => r.id === betaPaymentRecordId);
        if (!record) throw new Error('Record not found');

        record.verification_status = 'REJECTED';
        record.rejected_by = actor.userId;
        record.rejected_by_role = actor.role;
        record.rejected_at = new Date().toISOString();
        record.rejection_reason = reason;

        await this.paymentModeService.recordBetaPaymentEvent({
            tenantId: record.tenant_id, cohortId: record.cohort_id, eventType: 'PAYMENT_VERIFICATION_REJECTED', actor, message: reason
        });

        return record;
    }

    async confirmPaymentAfterVerification({ betaPaymentRecordId, amountReceived, currency, actor }) {
        this._assertRole(actor, ['CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'SYSTEM_ADMIN']);
        const record = this._mockRecords.find(r => r.id === betaPaymentRecordId);
        if (!record) throw new Error('Record not found');

        if (record.verification_status !== 'APPROVED' && record.provider_status !== 'CONFIRMED') {
            throw new Error('Payment confirmation requires approved verification or valid provider-confirmed status');
        }

        if (amountReceived !== record.amount_expected) {
            throw new Error('Amount mismatch');
        }

        if (currency !== record.currency) {
            throw new Error('Currency mismatch');
        }

        record.payment_status = 'PAYMENT_CONFIRMED';
        record.amount_received = amountReceived;
        record.confirmed_by = actor.userId;
        record.confirmed_by_role = actor.role;
        record.confirmed_at = new Date().toISOString();

        await this.paymentModeService.recordBetaPaymentEvent({
            tenantId: record.tenant_id, cohortId: record.cohort_id, eventType: 'PAYMENT_CONFIRMED', actor, message: 'Payment confirmed'
        });

        return record;
    }

    async validateProviderWebhook({ providerName, payload, signature }) {
        // Mock validation
        if (signature !== 'valid-signature') {
            throw new Error('Provider webhook without valid signature rejected');
        }
        return true;
    }

    async handleProviderWebhook({ providerName, payload, signature, actor }) {
        this._assertRole(actor, ['SYSTEM']);
        await this.validateProviderWebhook({ providerName, payload, signature });

        const record = this._mockRecords.find(r => r.id === payload.betaPaymentRecordId);
        if (!record) throw new Error('Record not found');

        record.provider_status = payload.status;
        
        await this.paymentModeService.recordBetaPaymentEvent({
            tenantId: record.tenant_id, cohortId: record.cohort_id, eventType: 'PAYMENT_PROVIDER_WEBHOOK_RECEIVED', actor, message: 'Provider webhook received'
        });

        return record;
    }

    async getPaymentVerificationStatus({ betaPaymentRecordId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN', 'CUSTOMER']);
        const record = this._mockRecords.find(r => r.id === betaPaymentRecordId);
        if (!record) throw new Error('Record not found');
        return record;
    }

    async buildCustomerSafePaymentStatus({ betaPaymentRecordId, actor }) {
        this._assertRole(actor, ['CUSTOMER']);
        const record = this._mockRecords.find(r => r.id === betaPaymentRecordId);
        if (!record) throw new Error('Record not found');
        return {
            payment_status: record.payment_status,
            verification_status: record.verification_status,
            amount_expected: record.amount_expected,
            currency: record.currency
        };
    }
}

module.exports = BetaPaymentVerificationService;
