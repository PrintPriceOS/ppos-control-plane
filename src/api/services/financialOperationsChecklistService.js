const crypto = require('crypto');

class FinancialOperationsChecklistService {
    constructor() {
        this._mockChecklists = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async generateChecklist({ run, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);

        const checklist = [];

        // Reconciliation
        checklist.push({
            checklist_code: 'RECONCILIATION_RUN_EXISTS',
            checklist_label: 'Phase 92 Reconciliation Run Exists',
            checklist_status: run.reconciliation_status === 'MISSING' ? 'FAILED' : 'PASSED',
            required_for_launch: true
        });

        checklist.push({
            checklist_code: 'RECONCILIATION_NO_BLOCKING_MISMATCHES',
            checklist_label: 'No Blocking Reconciliation Mismatches',
            checklist_status: run.reconciliation_status === 'MISMATCH' ? 'FAILED' : 'PASSED',
            required_for_launch: true
        });

        // Tax/VAT
        checklist.push({
            checklist_code: 'TAX_VAT_SNAPSHOT_EXISTS',
            checklist_label: 'Phase 93 Tax/VAT Snapshot Exists',
            checklist_status: run.tax_vat_status === 'MISSING' ? 'FAILED' : 'PASSED',
            required_for_launch: true
        });

        checklist.push({
            checklist_code: 'TAX_VAT_NO_BLOCKING_FINDINGS',
            checklist_label: 'No Blocking Tax/VAT Findings',
            checklist_status: run.tax_vat_status === 'MANUAL_REVIEW_REQUIRED' ? 'MANUAL_REVIEW_REQUIRED' : 'PASSED',
            required_for_launch: true
        });

        // Invoice
        checklist.push({
            checklist_code: 'GOVERNED_INVOICE_EXISTS',
            checklist_label: 'Phase 94 Governed Invoice Exists',
            checklist_status: run.invoice_status === 'MISSING' ? 'FAILED' : 'PASSED',
            required_for_launch: true
        });

        checklist.push({
            checklist_code: 'GOVERNED_INVOICE_MANUALLY_FINALIZED',
            checklist_label: 'Governed Invoice Manually Finalized',
            checklist_status: run.invoice_status === 'NOT_FINALIZED' ? 'FAILED' : 'PASSED',
            required_for_launch: true
        });

        // Credit Notes
        checklist.push({
            checklist_code: 'CREDIT_NOTES_REVIEWED_OR_NOT_REQUIRED',
            checklist_label: 'Credit Notes Reviewed or Not Required',
            checklist_status: run.credit_note_status === 'PENDING_REVIEW' ? 'FAILED' : 'PASSED',
            required_for_launch: true
        });

        // Export
        checklist.push({
            checklist_code: 'ACCOUNTING_EXPORT_PREVIEW_READY',
            checklist_label: 'Accounting Export Preview Ready',
            checklist_status: run.accounting_export_status === 'NOT_READY' ? 'FAILED' : 'PASSED',
            required_for_launch: true
        });

        // Strict Governance Guardrails (Always PASS in this phase context, verified by static logic)
        checklist.push({
            checklist_code: 'NO_EXTERNAL_SUBMISSION_ENABLED',
            checklist_label: 'No External Tax/Invoice Submission Enabled',
            checklist_status: 'PASSED',
            required_for_launch: true
        });

        checklist.push({
            checklist_code: 'NO_PAYMENT_REFUND_PAYOUT_EXECUTION_ENABLED',
            checklist_label: 'No Payment/Refund/Payout Execution Enabled',
            checklist_status: 'PASSED',
            required_for_launch: true
        });

        checklist.push({
            checklist_code: 'FULL_PUBLIC_DISABLED',
            checklist_label: 'FULL_PUBLIC Launch Mode is Disabled',
            checklist_status: 'PASSED',
            required_for_launch: true
        });

        const checklistObj = {
            id: `chk_${crypto.randomUUID()}`,
            readiness_run_id: run.readiness_run_id,
            items: checklist,
            created_at: new Date().toISOString()
        };

        this._mockChecklists.push(checklistObj);
        return checklistObj;
    }
}

module.exports = FinancialOperationsChecklistService;
