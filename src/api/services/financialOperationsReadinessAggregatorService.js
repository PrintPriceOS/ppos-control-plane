const crypto = require('crypto');

class FinancialOperationsReadinessAggregatorService {
    constructor() {
        this._mockRuns = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async aggregateReadiness({ reconciliationSnapshot, taxSnapshot, invoice, creditNotes = [], exportStatus, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);

        const blockers = [];
        const warnings = [];

        let reconStatus = 'READY';
        if (!reconciliationSnapshot) {
            reconStatus = 'MISSING';
            blockers.push('Missing Phase 92 reconciliation snapshot');
        } else if (reconciliationSnapshot.mismatch_count > 0) {
            reconStatus = 'MISMATCH';
            blockers.push('Reconciliation mismatch present. Pending correction');
        }

        let taxStatus = 'READY';
        if (!taxSnapshot) {
            taxStatus = 'MISSING';
            blockers.push('Missing Phase 93 tax/VAT readiness snapshot');
        } else if (taxSnapshot.readiness_status !== 'READY' && taxSnapshot.readiness_status !== 'REVIEWED' && taxSnapshot.readiness_status !== 'REVIEWED_WITH_OVERRIDE') {
            taxStatus = 'MANUAL_REVIEW_REQUIRED';
            blockers.push('Tax/VAT readiness snapshot requires manual review');
        }

        let invStatus = 'READY';
        if (!invoice) {
            invStatus = 'MISSING';
            blockers.push('Missing Phase 94 governed invoice');
        } else if (invoice.lifecycle_status !== 'FINALIZED') {
            invStatus = 'NOT_FINALIZED';
            blockers.push(`Governed invoice is in status ${invoice.lifecycle_status}. Manual finalization required.`);
        }

        let cnStatus = 'READY';
        for (const cn of creditNotes) {
            if (cn.lifecycle_status !== 'FINALIZED') {
                cnStatus = 'PENDING_REVIEW';
                blockers.push(`Credit note ${cn.credit_note_id} is pending review or finalization.`);
            }
        }

        let expStatus = 'READY';
        if (exportStatus !== 'READY') {
            expStatus = 'NOT_READY';
            blockers.push('Accounting export is not ready or has not been generated');
        }

        let readinessStatus = 'READY_FOR_INTERNAL_REVIEW';
        if (blockers.length > 0) {
            readinessStatus = 'MANUAL_REVIEW_REQUIRED';
            if (reconStatus !== 'READY') readinessStatus = 'BLOCKED_BY_RECONCILIATION';
            else if (taxStatus !== 'READY') readinessStatus = 'BLOCKED_BY_TAX_VAT_REVIEW';
            else if (invStatus !== 'READY') readinessStatus = 'BLOCKED_BY_INVOICE_LIFECYCLE';
            else if (cnStatus !== 'READY') readinessStatus = 'BLOCKED_BY_CREDIT_NOTE_LIFECYCLE';
            else if (expStatus !== 'READY') readinessStatus = 'BLOCKED_BY_ACCOUNTING_EXPORT';
        } else {
            readinessStatus = 'READY_FOR_FINANCIAL_OPERATIONS_REVIEW';
        }

        const run = {
            id: `finops_run_${crypto.randomUUID()}`,
            readiness_run_id: `run_${crypto.randomUUID()}`,
            tenant_id: invoice ? invoice.tenant_id : null,
            order_id: invoice ? invoice.order_id : null,
            invoice_id: invoice ? invoice.invoice_id : null,
            reconciliation_run_id: reconciliationSnapshot ? reconciliationSnapshot.run_id : null,
            tax_vat_snapshot_id: taxSnapshot ? taxSnapshot.id : null,
            governed_invoice_id: invoice ? invoice.id : null,
            readiness_status: readinessStatus,
            reconciliation_status: reconStatus,
            tax_vat_status: taxStatus,
            invoice_status: invStatus,
            credit_note_status: cnStatus,
            accounting_export_status: expStatus,
            blockers,
            warnings,
            source_snapshot_json: { reconciliationSnapshot, taxSnapshot, invoice, creditNotes, exportStatus },
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockRuns.push(run);

        await this._recordEvent({
            eventType: 'FINOPS_READINESS_RUN_CREATED',
            actor,
            readiness_run_id: run.readiness_run_id,
            tenant_id: run.tenant_id,
            message: `FinOps readiness run created with status ${readinessStatus}`
        });

        if (blockers.length > 0) {
            for (const b of blockers) {
                await this._recordEvent({
                    eventType: 'FINOPS_READINESS_BLOCKER_DETECTED',
                    actor,
                    readiness_run_id: run.readiness_run_id,
                    tenant_id: run.tenant_id,
                    message: b
                });
            }
        } else {
            await this._recordEvent({
                eventType: 'FINOPS_READINESS_READY_FOR_REVIEW',
                actor,
                readiness_run_id: run.readiness_run_id,
                tenant_id: run.tenant_id,
                message: 'All phases ready. Proceed to final review.'
            });
        }

        return run;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            readiness_run_id: event.readiness_run_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsReadinessAggregatorService;
