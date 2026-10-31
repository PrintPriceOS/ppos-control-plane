const crypto = require('crypto');

class FinancialReconciliationEngine {
    constructor(dependencies = {}) {
        this.ledgerService = dependencies.financialReconciliationLedgerService;
        this._mockMismatches = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async runFinancialReconciliation({ reconciliationRunId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const run = await this.ledgerService.getReconciliationRun({ reconciliationRunId, actor });
        if (!run) throw new Error('Run not found');

        await this.ledgerService.startReconciliationRun({ reconciliationRunId, actor });

        await this.reconcileCustomerPayments({ reconciliationRunId, actor });
        await this.reconcileRefundsAndReversals({ reconciliationRunId, actor });
        await this.reconcilePartnerSettlements({ reconciliationRunId, actor });
        await this.reconcilePlatformFees({ reconciliationRunId, actor });
        await this.reconcilePayoutReadiness({ reconciliationRunId, actor });
        await this.reconcileExternalPayoutEvidence({ reconciliationRunId, actor });

        await this.computeReconciliationTotals({ reconciliationRunId, actor });
        return await this.completeReconciliationRun({ reconciliationRunId, actor });
    }

    async reconcileCustomerPayments({ reconciliationRunId, actor }) {}
    async reconcileRefundsAndReversals({ reconciliationRunId, actor }) {}
    async reconcilePartnerSettlements({ reconciliationRunId, actor }) {}
    async reconcilePlatformFees({ reconciliationRunId, actor }) {}
    async reconcilePayoutReadiness({ reconciliationRunId, actor }) {}
    async reconcileExternalPayoutEvidence({ reconciliationRunId, actor }) {}

    async detectMismatch({ reconciliationRunId, mismatchPayload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        
        const mismatch = {
            id: `mismatch_${crypto.randomUUID()}`,
            reconciliation_run_id: reconciliationRunId,
            tenant_id: mismatchPayload.tenant_id,
            mismatch_type: mismatchPayload.mismatch_type,
            severity: mismatchPayload.severity,
            entity_type: mismatchPayload.entity_type,
            entity_id: mismatchPayload.entity_id,
            message: mismatchPayload.message,
            resolution_status: 'OPEN',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        this._mockMismatches.push(mismatch);

        await this.ledgerService.recordFinancialReconciliationEvent({
            reconciliationRunId,
            tenantId: mismatch.tenant_id,
            eventType: 'MISMATCH_DETECTED',
            mismatchId: mismatch.id,
            actorUserId: actor.userId,
            actorRole: actor.role,
            message: mismatch.message
        });

        return mismatch;
    }

    async computeReconciliationTotals({ reconciliationRunId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const run = await this.ledgerService.getReconciliationRun({ reconciliationRunId, actor });
        if (!run) throw new Error('Run not found');

        const mismatches = this._mockMismatches.filter(m => m.reconciliation_run_id === reconciliationRunId);
        
        run.mismatch_count = mismatches.length;
        run.blocking_count = mismatches.filter(m => m.severity === 'CRITICAL' || m.severity === 'BLOCKER').length;
        run.warning_count = mismatches.filter(m => m.severity === 'WARNING').length;

        // Mock totals
        run.total_customer_payments = 1000;
        run.total_partner_payables = 800;
        
        return run;
    }

    async completeReconciliationRun({ reconciliationRunId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const run = await this.ledgerService.getReconciliationRun({ reconciliationRunId, actor });
        if (!run) throw new Error('Run not found');

        run.run_status = run.blocking_count > 0 ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED';
        run.completed_at = new Date().toISOString();

        await this.ledgerService.recordFinancialReconciliationEvent({
            reconciliationRunId,
            tenantId: run.tenant_id,
            eventType: 'RECONCILIATION_COMPLETED',
            actorUserId: actor.userId,
            actorRole: actor.role,
            message: `Reconciliation completed with status ${run.run_status}`
        });

        return run;
    }
}

module.exports = FinancialReconciliationEngine;
