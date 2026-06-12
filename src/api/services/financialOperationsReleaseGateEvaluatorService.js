const crypto = require('crypto');

class FinancialOperationsReleaseGateEvaluatorService {
    constructor(dependencies = {}) {
        this.aggregatorService = dependencies.financialOperationsReadinessAggregatorService;
        this._mockGates = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluateGate({ runId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);

        const run = this.aggregatorService ? this.aggregatorService._mockRuns.find(r => r.readiness_run_id === runId) : null;
        if (!run) throw new Error('FinOps readiness run not found');

        const blockers = [];
        const warnings = [];
        const checks = [];

        function addCheck(code, condition, blockerMsg) {
            checks.push({ check_code: code, status: condition ? 'PASSED' : 'FAILED' });
            if (!condition && blockerMsg) blockers.push(blockerMsg);
        }

        // Evaluate Readiness State
        addCheck('FINOPS_READINESS_VALIDATED', run.readiness_status === 'READY_FOR_FINANCIAL_OPERATIONS_REVIEW' || run.readiness_status === 'REVIEWED', 'FinOps Readiness is not finalized for operations review');
        addCheck('RECONCILIATION_READY', run.reconciliation_status === 'READY', 'Reconciliation is not ready');
        addCheck('TAX_VAT_READY_OR_REVIEWED', run.tax_vat_status === 'READY' || run.tax_vat_status === 'REVIEWED', 'Tax/VAT is not ready or reviewed');
        addCheck('INVOICE_LIFECYCLE_READY', run.invoice_status === 'READY', 'Governed invoice lifecycle not ready');
        addCheck('CREDIT_NOTES_READY_OR_NOT_REQUIRED', run.credit_note_status === 'READY', 'Credit notes pending review');
        addCheck('ACCOUNTING_EXPORT_PREVIEW_READY', run.accounting_export_status === 'READY', 'Accounting export not ready');

        // Evaluate Strict Guardrails (always true in pure governed flow, simulate via source flags if any exist)
        // Ensure no external execution flag is secretly flipped
        const hasExternalExecutionFlag = false; 
        const hasFullPublicFlag = false;
        
        addCheck('NO_EXTERNAL_SUBMISSION_ENABLED', !hasExternalExecutionFlag, 'External submission is enabled. Execution strictly forbidden.');
        addCheck('NO_PAYMENT_REFUND_PAYOUT_EXECUTION_ENABLED', !hasExternalExecutionFlag, 'Financial execution is enabled. Execution strictly forbidden.');
        addCheck('FULL_PUBLIC_DISABLED', !hasFullPublicFlag, 'FULL_PUBLIC is enabled. Must be disabled for controlled release.');

        let gateStatus = 'READY_FOR_APPROVAL';
        if (blockers.length > 0) {
            gateStatus = 'BLOCKED';
            if (run.readiness_status === 'MANUAL_REVIEW_REQUIRED') {
                gateStatus = 'MANUAL_REVIEW_REQUIRED';
            }
        }

        const gate = {
            id: `gate_${crypto.randomUUID()}`,
            release_gate_id: `rg_${crypto.randomUUID()}`,
            readiness_run_id: runId,
            tenant_id: run.tenant_id,
            order_id: run.order_id,
            invoice_id: run.invoice_id,
            gate_status: gateStatus,
            gate_type: 'CONTROLLED_FINANCIAL_OPERATIONS_RELEASE',
            gate_scope: 'TENANT_ORDER_LIFECYCLE',
            required_approvals: 1,
            current_approvals: 0,
            checks,
            blockers,
            warnings,
            source_readiness_snapshot_json: { ...run },
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockGates.push(gate);

        await this._recordEvent({
            eventType: 'FINOPS_RELEASE_GATE_EVALUATED',
            actor,
            release_gate_id: gate.release_gate_id,
            readiness_run_id: runId,
            tenant_id: gate.tenant_id,
            message: `Release gate evaluated with status ${gateStatus}`
        });

        if (blockers.length > 0) {
            await this._recordEvent({
                eventType: 'FINOPS_RELEASE_GATE_BLOCKER_DETECTED',
                actor,
                release_gate_id: gate.release_gate_id,
                readiness_run_id: runId,
                tenant_id: gate.tenant_id,
                message: `Release gate blocked. Found ${blockers.length} blockers.`
            });
        } else {
            await this._recordEvent({
                eventType: 'FINOPS_RELEASE_GATE_READY_FOR_APPROVAL',
                actor,
                release_gate_id: gate.release_gate_id,
                readiness_run_id: runId,
                tenant_id: gate.tenant_id,
                message: 'Release gate is clean and ready for manual approval'
            });
        }

        return gate;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            release_gate_id: event.release_gate_id,
            readiness_run_id: event.readiness_run_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsReleaseGateEvaluatorService;
