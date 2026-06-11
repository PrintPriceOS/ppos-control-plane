const crypto = require('crypto');

class PartnerSettlementCalculationService {
    constructor(dependencies = {}) {
        this.commercialTermsService = dependencies.partnerCommercialTermsService;
        this._mockJobs = {
            'job_1': { id: 'job_1', status: 'COMPLETED', evidence: true, customer_payment_confirmed: true, tenant_id: 't_1', printhouse_id: 'ph_1', order_amount: 100, currency: 'USD' },
            'job_no_ev': { id: 'job_no_ev', status: 'COMPLETED', evidence: false, customer_payment_confirmed: true, tenant_id: 't_1', printhouse_id: 'ph_1' },
            'job_no_pay': { id: 'job_no_pay', status: 'COMPLETED', evidence: true, customer_payment_confirmed: false, tenant_id: 't_1', printhouse_id: 'ph_1' }
        };
        this._mockRecords = [];
        this._mockLineItems = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createSettlementRecordForCompletedJob({ partnerLiveJobId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN']);
        const job = this._mockJobs[partnerLiveJobId];
        if (!job) throw new Error('Job not found');

        if (!job.evidence) throw new Error('Settlement creation blocked without completion evidence');
        if (!job.customer_payment_confirmed) throw new Error('Settlement creation blocked without customer payment confirmed');

        const terms = await this.commercialTermsService.assertPartnerCommercialTermsActive({ tenantId: job.tenant_id, printhouseId: job.printhouse_id, actor });

        const record = {
            id: `psr_${crypto.randomUUID()}`,
            tenant_id: job.tenant_id,
            printhouse_id: job.printhouse_id,
            partner_live_job_id: job.id,
            commercial_terms_id: terms.id,
            settlement_status: 'CALCULATION_PENDING',
            payout_readiness_status: 'NOT_ELIGIBLE',
            gross_order_amount: job.order_amount,
            currency: job.currency,
            refund_amount: 0,
            reversal_amount: 0,
            dispute_hold_amount: 0,
            created_at: new Date().toISOString()
        };

        this._mockRecords.push(record);

        await this._recordEvent({
            partnerSettlementRecordId: record.id, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'SETTLEMENT_RECORD_CREATED', actor, message: 'Created settlement record'
        });

        return record;
    }

    async calculatePlatformFee({ grossAmount, terms }) {
        if (terms.platform_fee_type === 'PERCENTAGE') {
            return grossAmount * (terms.platform_fee_value / 100);
        } else if (terms.platform_fee_type === 'FIXED') {
            return terms.platform_fee_value;
        }
        return 0;
    }

    async calculatePartnerSettlement({ partnerSettlementRecordId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords.find(r => r.id === partnerSettlementRecordId);
        if (!record) throw new Error('Settlement record not found');

        const terms = await this.commercialTermsService.assertPartnerCommercialTermsActive({ tenantId: record.tenant_id, printhouseId: record.printhouse_id, actor });

        const fee = await this.calculatePlatformFee({ grossAmount: record.gross_order_amount, terms });
        
        let payable = record.gross_order_amount - fee;
        if (terms.settlement_model === 'REVENUE_SHARE') {
            payable = record.gross_order_amount * (terms.partner_share_percentage / 100);
        }

        record.platform_fee_amount = fee;
        record.partner_payable_amount = payable;

        record.net_payable_amount = record.partner_payable_amount - record.refund_amount - record.reversal_amount - record.dispute_hold_amount;

        if (record.net_payable_amount < 0) {
            // Negative payable blocked or zeroed with audit
            record.net_payable_amount = 0;
            await this._recordEvent({
                partnerSettlementRecordId: record.id, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'NEGATIVE_PAYABLE_ZEROED', actor, message: 'Negative payable zeroed'
            });
        }

        record.settlement_status = 'CALCULATED';

        await this._recordEvent({
            partnerSettlementRecordId: record.id, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'SETTLEMENT_CALCULATED', actor, message: 'Settlement calculated'
        });

        return record;
    }

    async createSettlementLineItems({ partnerSettlementRecordId, calculation, actor }) {
        const item = {
            id: `sli_${crypto.randomUUID()}`,
            partner_settlement_record_id: partnerSettlementRecordId,
            line_item_type: 'PRINT_COST',
            amount: calculation.partner_payable_amount,
            currency: calculation.currency,
            created_at: new Date().toISOString()
        };
        this._mockLineItems.push(item);
        return item;
    }

    async calculateRefundImpact({ partnerSettlementRecordId, refundAmount, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords.find(r => r.id === partnerSettlementRecordId);
        record.refund_amount += refundAmount;
        return await this.calculatePartnerSettlement({ partnerSettlementRecordId, actor });
    }

    async calculateReversalImpact({ partnerSettlementRecordId, reversalAmount, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords.find(r => r.id === partnerSettlementRecordId);
        record.reversal_amount += reversalAmount;
        return await this.calculatePartnerSettlement({ partnerSettlementRecordId, actor });
    }

    async calculateDisputeHoldImpact({ partnerSettlementRecordId, disputeAmount, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords.find(r => r.id === partnerSettlementRecordId);
        record.dispute_hold_amount += disputeAmount;
        return await this.calculatePartnerSettlement({ partnerSettlementRecordId, actor });
    }

    async buildSettlementCalculationSnapshot({ partnerSettlementRecordId, actor }) {
        this._assertRole(actor, ['PRINTHOUSE', 'SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords.find(r => r.id === partnerSettlementRecordId);
        if (!record) throw new Error('Settlement record not found');

        const snapshot = {
            gross_order_amount: record.gross_order_amount,
            partner_payable_amount: record.partner_payable_amount,
            net_payable_amount: record.net_payable_amount,
            currency: record.currency
        };

        if (actor.role === 'PRINTHOUSE') {
            // Partner-safe summary must not expose customer provider payloads
            snapshot.provider_payloads_hidden = true;
        }

        return snapshot;
    }

    async _recordEvent(event) {
        const ev = { ...event, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = PartnerSettlementCalculationService;
