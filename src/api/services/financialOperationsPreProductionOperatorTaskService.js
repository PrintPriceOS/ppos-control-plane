const crypto = require('crypto');

class FinancialOperationsPreProductionOperatorTaskService {
    constructor(runbookService) {
        this._mockEvents = [];
        this._mockTasks = [];
        this._mockFindings = [];
        this.runbookService = runbookService;

        this.TASK_GROUPS = [
            'FINANCE_OPERATOR_TASKS', 'SECURITY_OPERATOR_TASKS', 'OPERATIONS_OPERATOR_TASKS',
            'COMPLIANCE_OPERATOR_TASKS', 'PRIVACY_OPERATOR_TASKS', 'PROVIDER_OPERATOR_TASKS',
            'EXECUTIVE_OPERATOR_TASKS'
        ];

        this.TASKS = [
            'CONFIRM_FINOPS_READINESS_PACK', 'CONFIRM_SECURITY_GUARDRAILS', 'CONFIRM_PROVIDER_SANDBOX_ONLY',
            'CONFIRM_NO_LIVE_CREDENTIALS', 'CONFIRM_NO_FULL_PUBLIC', 'CONFIRM_NO_PRODUCTION_ACTIVATION',
            'CONFIRM_NO_PAYMENT_EXECUTION', 'CONFIRM_NO_REFUND_EXECUTION', 'CONFIRM_NO_PAYOUT_EXECUTION',
            'CONFIRM_NO_EXTERNAL_SUBMISSION', 'CONFIRM_ROLLBACK_PATH', 'CONFIRM_INCIDENT_RESPONSE',
            'CONFIRM_COMPLIANCE_PREVIEW', 'CONFIRM_PRIVACY_PREVIEW', 'CONFIRM_FINAL_REVIEW_MEETING'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async buildOperatorTasks(runbookId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const rb = this.runbookService ? this.runbookService._mockRunbooks.find(r => r.pre_production_runbook_id === runbookId) : null;
        if (!rb) throw new Error('Runbook not found');

        const evidence = rb.evidence_json || {};

        let hasBlocker = false;

        for (const taskKey of this.TASKS) {
            const taskId = `pprt_${crypto.randomUUID()}`;
            const t = {
                id: crypto.randomUUID(),
                runbook_task_id: taskId,
                pre_production_runbook_id: runbookId,
                task_key: taskKey,
                task_label: taskKey.replace(/_/g, ' '),
                task_status: 'PENDING_CONFIRMATION',
                requires_manual_confirmation: true,
                production_execution_enabled: false,
                full_public_enabled: false,
                live_provider_connectivity_enabled: false,
                created_at: new Date().toISOString(),
                created_by: actor.userId
            };

            if (taskKey === 'CONFIRM_SECURITY_GUARDRAILS' && evidence.security_guardrails_confirmed === false) {
                t.task_status = 'BLOCKED';
                hasBlocker = true;
                this._createFinding(runbookId, taskId, 'MISSING_SECURITY_CONFIRMATION', 'HIGH', 'SECURITY', actor);
            }

            if (taskKey === 'CONFIRM_ROLLBACK_PATH' && evidence.rollback_path_confirmed === false) {
                t.task_status = 'BLOCKED';
                hasBlocker = true;
                this._createFinding(runbookId, taskId, 'MISSING_ROLLBACK_CONFIRMATION', 'HIGH', 'OPERATIONS', actor);
            }

            this._mockTasks.push(t);
        }

        await this._recordEvent('FINOPS_PRE_PRODUCTION_OPERATOR_TASK_CREATED', rb, null, actor, 'Operator tasks created');

        if (hasBlocker) {
            await this._recordEvent('FINOPS_PRE_PRODUCTION_OPERATOR_TASK_BLOCKER_DETECTED', rb, null, actor, 'Blocker detected in tasks');
        }

        return {
            tasks: this._mockTasks.filter(t => t.pre_production_runbook_id === runbookId),
            findings: this._mockFindings.filter(f => f.pre_production_runbook_id === runbookId)
        };
    }

    _createFinding(runbookId, taskId, code, severity, category, actor) {
        const finding = {
            id: crypto.randomUUID(),
            pre_production_runbook_id: runbookId,
            runbook_task_id: taskId,
            finding_code: code,
            severity,
            category,
            message: `Mock finding: ${code}`,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };
        this._mockFindings.push(finding);
        return finding;
    }

    async confirmTask(runbookId, taskKey, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        const task = this._mockTasks.find(t => t.pre_production_runbook_id === runbookId && t.task_key === taskKey);
        if (!task) throw new Error('Task not found');

        task.task_status = 'CONFIRMED';
        task.completed_at = new Date().toISOString();
        task.completed_by = actor.userId;

        const rb = { pre_production_runbook_id: runbookId };
        await this._recordEvent('FINOPS_PRE_PRODUCTION_OPERATOR_TASK_CONFIRMED', rb, task, actor, `Task ${taskKey} confirmed manually`);

        return task;
    }

    async _recordEvent(eventType, rb, task, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            pre_production_runbook_id: rb ? rb.pre_production_runbook_id : null,
            runbook_task_id: task ? task.runbook_task_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsPreProductionOperatorTaskService;
