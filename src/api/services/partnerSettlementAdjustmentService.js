const crypto = require('crypto');

class PartnerSettlementAdjustmentService {
    constructor(dependencies = {}) {
        this.calculationService = dependencies.partnerSettlementCalculationService;
        this.readinessService = dependencies.partnerPayoutReadinessService;
        this._mockAdjustments = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async applyRefundImpactToSettlement({ partnerSettlementRecordId, refundAmount, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        
        await this.calculationService.calculateRefundImpact({ partnerSettlementRecordId, refundAmount, actor });
        
        await this.createAdjustmentLineItem({
            partnerSettlementRecordId,
            adjustmentPayload: { type: 'REFUND_DEDUCTION', amount: refundAmount, currency: 'USD' },
            actor
        });

        await this.readinessService.createPayoutHold({
            partnerSettlementRecordId, holdType: 'REFUND_PENDING', reason: 'Refund applied', severity: 'CRITICAL', actor
        });

        return await this.recalculateSettlementAfterAdjustment({ partnerSettlementRecordId, actor });
    }

    async applyReversalImpactToSettlement({ partnerSettlementRecordId, reversalAmount, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        
        await this.calculationService.calculateReversalImpact({ partnerSettlementRecordId, reversalAmount, actor });
        
        await this.createAdjustmentLineItem({
            partnerSettlementRecordId,
            adjustmentPayload: { type: 'REVERSAL_DEDUCTION', amount: reversalAmount, currency: 'USD' },
            actor
        });

        await this.createAdjustmentHoldIfNeeded({
            partnerSettlementRecordId, adjustmentType: 'PAYMENT_REVERSAL', actor
        });

        return await this.recalculateSettlementAfterAdjustment({ partnerSettlementRecordId, actor });
    }

    async applyCancellationImpactToSettlement({ partnerSettlementRecordId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        
        await this.readinessService.createPayoutHold({
            partnerSettlementRecordId, holdType: 'POLICY_HOLD', reason: 'Order Cancelled', severity: 'CRITICAL', actor
        });

        await this._recordEvent({
            partnerSettlementRecordId, eventType: 'CANCELLATION_IMPACT_APPLIED', actor, message: 'Cancellation hold applied'
        });

        return { id: partnerSettlementRecordId, impact_applied: true };
    }

    async applyDisputeImpactToSettlement({ partnerSettlementRecordId, disputePayload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        
        await this.calculationService.calculateDisputeHoldImpact({ partnerSettlementRecordId, disputeAmount: disputePayload.amount, actor });
        
        await this.readinessService.createPayoutHold({
            partnerSettlementRecordId, holdType: 'CUSTOMER_DISPUTE', reason: 'Dispute active', severity: 'CRITICAL', actor
        });

        return await this.recalculateSettlementAfterAdjustment({ partnerSettlementRecordId, actor });
    }

    async recalculateSettlementAfterAdjustment({ partnerSettlementRecordId, actor }) {
        // Re-calculate the payable based on updated refund/reversal buckets
        return await this.calculationService.calculatePartnerSettlement({ partnerSettlementRecordId, actor });
    }

    async createAdjustmentLineItem({ partnerSettlementRecordId, adjustmentPayload, actor }) {
        const item = {
            id: `adj_${crypto.randomUUID()}`,
            partner_settlement_record_id: partnerSettlementRecordId,
            line_item_type: adjustmentPayload.type,
            amount: adjustmentPayload.amount,
            currency: adjustmentPayload.currency,
            created_at: new Date().toISOString()
        };
        this._mockAdjustments.push(item);
        return item;
    }

    async createAdjustmentHoldIfNeeded({ partnerSettlementRecordId, adjustmentType, actor }) {
        return await this.readinessService.createPayoutHold({
            partnerSettlementRecordId, holdType: adjustmentType, reason: `Hold created for ${adjustmentType}`, severity: 'CRITICAL', actor
        });
    }

    async buildAdjustmentImpactSummary({ partnerSettlementRecordId, actor }) {
        this._assertRole(actor, ['PRINTHOUSE', 'SYSTEM_ADMIN', 'FINANCE_ADMIN']);
        const items = this._mockAdjustments.filter(a => a.partner_settlement_record_id === partnerSettlementRecordId);
        return {
            partner_settlement_record_id: partnerSettlementRecordId,
            adjustments: items.map(i => ({ type: i.line_item_type, amount: i.amount })),
            customer_internals_hidden: true
        };
    }

    async _recordEvent(event) {
        const ev = { ...event, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = PartnerSettlementAdjustmentService;
