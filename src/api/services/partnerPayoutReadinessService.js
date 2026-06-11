const crypto = require('crypto');

class PartnerPayoutReadinessService {
    constructor() {
        this._mockHolds = [];
        this._mockEvents = [];
        this._mockRecords = {
            'rec_1': { id: 'rec_1', settlement_status: 'CALCULATED', payout_readiness_status: 'BLOCKED', tenant_id: 't_1', printhouse_id: 'ph_1', customer_payment_confirmed: true, refund_pending: false, reversal_active: false, unresolved_dispute: false },
            'rec_no_calc': { id: 'rec_no_calc', settlement_status: 'NOT_READY', payout_readiness_status: 'NOT_ELIGIBLE', tenant_id: 't_1', printhouse_id: 'ph_1', customer_payment_confirmed: true, refund_pending: false, reversal_active: false, unresolved_dispute: false },
            'rec_no_pay': { id: 'rec_no_pay', settlement_status: 'CALCULATED', payout_readiness_status: 'BLOCKED', tenant_id: 't_1', printhouse_id: 'ph_1', customer_payment_confirmed: false, refund_pending: false, reversal_active: false, unresolved_dispute: false },
            'rec_refund': { id: 'rec_refund', settlement_status: 'CALCULATED', payout_readiness_status: 'BLOCKED', tenant_id: 't_1', printhouse_id: 'ph_1', customer_payment_confirmed: true, refund_pending: true, reversal_active: false, unresolved_dispute: false },
            'rec_reversal': { id: 'rec_reversal', settlement_status: 'CALCULATED', payout_readiness_status: 'BLOCKED', tenant_id: 't_1', printhouse_id: 'ph_1', customer_payment_confirmed: true, refund_pending: false, reversal_active: true, unresolved_dispute: false },
            'rec_dispute': { id: 'rec_dispute', settlement_status: 'CALCULATED', payout_readiness_status: 'BLOCKED', tenant_id: 't_1', printhouse_id: 'ph_1', customer_payment_confirmed: true, refund_pending: false, reversal_active: false, unresolved_dispute: true }
        };
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluatePayoutReadiness({ partnerSettlementRecordId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const record = this._mockRecords[partnerSettlementRecordId];
        if (!record) throw new Error('Settlement record not found');

        const holds = this._mockHolds.filter(h => h.partner_settlement_record_id === partnerSettlementRecordId && h.hold_status === 'ACTIVE');

        if (record.settlement_status !== 'CALCULATED' && record.settlement_status !== 'READY_FOR_REVIEW') {
            record.payout_readiness_status = 'BLOCKED';
            throw new Error('Readiness blocked without calculated settlement');
        }

        if (!record.customer_payment_confirmed) {
            record.payout_readiness_status = 'BLOCKED';
            throw new Error('Readiness blocked without customer payment confirmed');
        }

        if (record.refund_pending) {
            record.payout_readiness_status = 'BLOCKED';
            throw new Error('Readiness blocked with refund pending');
        }

        if (record.reversal_active) {
            record.payout_readiness_status = 'BLOCKED';
            throw new Error('Readiness blocked with reversal active');
        }

        if (record.unresolved_dispute) {
            record.payout_readiness_status = 'BLOCKED';
            throw new Error('Readiness blocked with unresolved dispute');
        }

        const criticalHolds = holds.filter(h => h.severity === 'CRITICAL');
        if (criticalHolds.length > 0) {
            record.payout_readiness_status = 'BLOCKED';
            throw new Error('Readiness blocked with active critical hold');
        }

        record.payout_readiness_status = 'READY_FOR_REVIEW';
        record.settlement_status = 'READY_FOR_REVIEW';

        await this._recordEvent({
            partnerSettlementRecordId, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'PAYOUT_READY_FOR_REVIEW', actor, message: 'Payout readiness evaluated: READY'
        });

        return record;
    }

    async createPayoutHold({ partnerSettlementRecordId, holdType, reason, severity = 'CRITICAL', actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const record = this._mockRecords[partnerSettlementRecordId];

        const hold = {
            id: `hld_${crypto.randomUUID()}`,
            partner_settlement_record_id: partnerSettlementRecordId,
            tenant_id: record.tenant_id,
            printhouse_id: record.printhouse_id,
            hold_type: holdType,
            hold_status: 'ACTIVE',
            severity,
            reason,
            created_by: actor.userId,
            created_by_role: actor.role,
            created_at: new Date().toISOString()
        };

        this._mockHolds.push(hold);

        await this._recordEvent({
            partnerSettlementRecordId, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'PAYOUT_HOLD_CREATED', actor, message: `Hold created: ${reason}`
        });

        return hold;
    }

    async releasePayoutHold({ holdId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const hold = this._mockHolds.find(h => h.id === holdId);
        if (!hold) throw new Error('Hold not found');

        hold.hold_status = 'RELEASED';
        hold.released_by = actor.userId;
        hold.released_by_role = actor.role;
        hold.released_at = new Date().toISOString();

        await this._recordEvent({
            partnerSettlementRecordId: hold.partner_settlement_record_id, tenantId: hold.tenant_id, printhouseId: hold.printhouse_id, eventType: 'PAYOUT_HOLD_RELEASED', actor, message: `Hold released: ${reason}`
        });

        return hold;
    }

    async dismissPayoutHold({ holdId, reason, actor }) {
        return await this.releasePayoutHold({ holdId, reason, actor });
    }

    async approvePayoutReadiness({ partnerSettlementRecordId, approvalPayload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords[partnerSettlementRecordId];

        if (record.payout_readiness_status !== 'READY_FOR_REVIEW') {
            throw new Error('Record is not READY_FOR_REVIEW');
        }

        record.payout_readiness_status = 'APPROVED';
        record.settlement_status = 'APPROVED_FOR_PAYOUT';
        record.approved_by = actor.userId;
        record.approved_by_role = actor.role;
        record.approved_at = new Date().toISOString();

        await this._recordEvent({
            partnerSettlementRecordId, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'PAYOUT_APPROVED', actor, message: 'Payout readiness approved'
        });

        return record;
    }

    async rejectPayoutReadiness({ partnerSettlementRecordId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords[partnerSettlementRecordId];

        record.payout_readiness_status = 'NOT_APPROVED';

        await this._recordEvent({
            partnerSettlementRecordId, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'PAYOUT_APPROVAL_REJECTED', actor, message: reason
        });

        return record;
    }

    async markManualPayoutScheduled({ partnerSettlementRecordId, schedulePayload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords[partnerSettlementRecordId];

        if (record.payout_readiness_status !== 'APPROVED') throw new Error('Payout not approved');

        record.settlement_status = 'PAYOUT_SCHEDULED_MANUAL';

        await this._recordEvent({
            partnerSettlementRecordId, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'PAYOUT_MARKED_MANUAL_SCHEDULED', actor, message: 'Payout manual scheduled'
        });

        return record;
    }

    async markExternalPayoutExecuted({ partnerSettlementRecordId, evidencePayload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords[partnerSettlementRecordId];

        if (!evidencePayload) throw new Error('External payout executed requires evidence');

        record.settlement_status = 'PAYOUT_EXECUTED_EXTERNALLY';
        record.payout_execution_reference = evidencePayload.reference;
        record.payout_evidence_json = evidencePayload;

        await this._recordEvent({
            partnerSettlementRecordId, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'PAYOUT_MARKED_EXTERNALLY_EXECUTED', actor, message: 'Payout externally executed'
        });

        return record;
    }

    async markPayoutFailed({ partnerSettlementRecordId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords[partnerSettlementRecordId];

        record.settlement_status = 'PAYOUT_FAILED';

        await this._recordEvent({
            partnerSettlementRecordId, tenantId: record.tenant_id, printhouseId: record.printhouse_id, eventType: 'PAYOUT_FAILED', actor, message: reason
        });

        return record;
    }

    async getPayoutReadinessStatus({ partnerSettlementRecordId, actor }) {
        return this._mockRecords[partnerSettlementRecordId];
    }

    async buildPartnerSafePayoutReadinessSummary({ partnerSettlementRecordId, actor }) {
        this._assertRole(actor, ['PRINTHOUSE', 'SYSTEM_ADMIN', 'FINANCE_ADMIN']);
        const record = this._mockRecords[partnerSettlementRecordId];
        
        return {
            id: record.id,
            settlement_status: record.settlement_status,
            payout_readiness_status: record.payout_readiness_status,
            customer_internals_hidden: true
        };
    }

    async _recordEvent(event) {
        const ev = { ...event, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = PartnerPayoutReadinessService;
