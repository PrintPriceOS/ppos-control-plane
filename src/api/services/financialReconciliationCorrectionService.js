const crypto = require('crypto');

class FinancialReconciliationCorrectionService {
    constructor(dependencies = {}) {
        this.ledgerService = dependencies.financialReconciliationLedgerService;
        this.engineService = dependencies.financialReconciliationEngine;
        this._mockAdjustments = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async acknowledgeMismatch({ mismatchId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const mismatch = this.engineService._mockMismatches.find(m => m.id === mismatchId);
        if (!mismatch) throw new Error('Mismatch not found');

        mismatch.resolution_status = 'ACKNOWLEDGED';
        mismatch.updated_at = new Date().toISOString();

        await this._recordEvent({
            reconciliationRunId: mismatch.reconciliation_run_id, mismatchId: mismatch.id, tenantId: mismatch.tenant_id, eventType: 'MISMATCH_ACKNOWLEDGED', actor, message: 'Mismatch acknowledged'
        });

        return mismatch;
    }

    async resolveMismatch({ mismatchId, resolutionPayload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const mismatch = this.engineService._mockMismatches.find(m => m.id === mismatchId);
        if (!mismatch) throw new Error('Mismatch not found');

        mismatch.resolution_status = 'RESOLVED';
        mismatch.resolved_by = actor.userId;
        mismatch.resolved_by_role = actor.role;
        mismatch.resolved_at = new Date().toISOString();
        mismatch.resolution_notes = resolutionPayload.notes;
        mismatch.updated_at = new Date().toISOString();

        await this._recordEvent({
            reconciliationRunId: mismatch.reconciliation_run_id, mismatchId: mismatch.id, tenantId: mismatch.tenant_id, eventType: 'MISMATCH_RESOLVED', actor, message: `Mismatch resolved: ${resolutionPayload.notes}`
        });

        return mismatch;
    }

    async dismissMismatch({ mismatchId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        if (!reason) throw new Error('Dismiss mismatch requires reason');

        const mismatch = this.engineService._mockMismatches.find(m => m.id === mismatchId);
        if (!mismatch) throw new Error('Mismatch not found');

        mismatch.resolution_status = 'DISMISSED';
        mismatch.resolved_by = actor.userId;
        mismatch.resolved_by_role = actor.role;
        mismatch.resolved_at = new Date().toISOString();
        mismatch.resolution_notes = reason;
        mismatch.updated_at = new Date().toISOString();

        await this._recordEvent({
            reconciliationRunId: mismatch.reconciliation_run_id, mismatchId: mismatch.id, tenantId: mismatch.tenant_id, eventType: 'MISMATCH_DISMISSED', actor, message: `Mismatch dismissed: ${reason}`
        });

        return mismatch;
    }

    async createManualReconciliationAdjustment({ reconciliationRunId, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        
        const adjustment = {
            id: `adj_${crypto.randomUUID()}`,
            reconciliation_run_id: reconciliationRunId,
            mismatch_id: payload.mismatch_id,
            tenant_id: payload.tenant_id,
            adjustment_type: payload.adjustment_type,
            adjustment_status: 'DRAFT',
            amount: payload.amount,
            currency: payload.currency,
            reason: payload.reason,
            created_by: actor.userId,
            created_by_role: actor.role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        this._mockAdjustments.push(adjustment);
        return adjustment;
    }

    async approveManualReconciliationAdjustment({ adjustmentId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const adjustment = this._mockAdjustments.find(a => a.id === adjustmentId);
        if (!adjustment) throw new Error('Adjustment not found');

        adjustment.adjustment_status = 'APPROVED';
        adjustment.approved_by = actor.userId;
        adjustment.approved_by_role = actor.role;
        adjustment.updated_at = new Date().toISOString();

        return adjustment;
    }

    async rejectManualReconciliationAdjustment({ adjustmentId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const adjustment = this._mockAdjustments.find(a => a.id === adjustmentId);
        if (!adjustment) throw new Error('Adjustment not found');

        adjustment.adjustment_status = 'REJECTED';
        adjustment.updated_at = new Date().toISOString();

        return adjustment;
    }

    async applyApprovedManualAdjustment({ adjustmentId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const adjustment = this._mockAdjustments.find(a => a.id === adjustmentId);
        if (!adjustment) throw new Error('Adjustment not found');
        if (adjustment.adjustment_status !== 'APPROVED') throw new Error('Adjustment must be approved before applying');

        adjustment.adjustment_status = 'APPLIED';
        adjustment.applied_by = actor.userId;
        adjustment.applied_by_role = actor.role;
        adjustment.updated_at = new Date().toISOString();

        // Create adjustment snapshot
        await this.ledgerService.createLedgerSnapshot({
            reconciliationRunId: adjustment.reconciliation_run_id,
            payload: {
                tenant_id: adjustment.tenant_id,
                snapshot_type: 'COMMERCIAL_ADJUSTMENT',
                amount: adjustment.amount,
                currency: adjustment.currency,
                ledger_status: 'RECORDED'
            },
            actor
        });

        return adjustment;
    }

    async getCorrectionTimeline({ reconciliationRunId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        return this._mockEvents.filter(e => e.reconciliation_run_id === reconciliationRunId);
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            reconciliation_run_id: event.reconciliationRunId,
            mismatch_id: event.mismatchId,
            tenant_id: event.tenantId,
            event_type: event.eventType,
            actor_user_id: event.actor.userId,
            actor_role: event.actor.role,
            message: event.message,
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        this.ledgerService._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialReconciliationCorrectionService;
