const crypto = require('crypto');

class FinancialOperationsPreProductionRunbookReviewService {
    constructor(runbookService, taskService) {
        this._mockEvents = [];
        this.runbookService = runbookService;
        this.taskService = taskService;
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async approvePreProductionRunbook(runbookId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const rb = this.runbookService ? this.runbookService._mockRunbooks.find(r => r.pre_production_runbook_id === runbookId) : null;
        if (!rb) throw new Error('Runbook not found');

        if (rb.runbook_status !== 'APPROVED_FOR_PRE_PRODUCTION_REVIEW') {
            throw new Error(`Cannot approve runbook in status ${rb.runbook_status}`);
        }

        rb.runbook_status = 'PRE_PRODUCTION_RUNBOOK_APPROVED';
        rb.completed_at = new Date().toISOString();
        rb.completed_by = actor.userId;

        await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_REVIEW_APPROVED', rb, null, actor, 'Pre-production runbook approved');

        return rb;
    }

    async rejectPreProductionRunbook(runbookId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const rb = this.runbookService ? this.runbookService._mockRunbooks.find(r => r.pre_production_runbook_id === runbookId) : null;
        if (!rb) throw new Error('Runbook not found');

        rb.runbook_status = 'REJECTED';
        rb.completed_at = new Date().toISOString();
        rb.completed_by = actor.userId;

        await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_REVIEW_REJECTED', rb, null, actor, 'Pre-production runbook rejected');

        return rb;
    }

    async confirmOperatorTaskByReview(runbookId, taskKey, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        const task = this.taskService ? this.taskService._mockTasks.find(t => t.pre_production_runbook_id === runbookId && t.task_key === taskKey) : null;
        if (!task) throw new Error('Task not found');

        task.task_status = 'CONFIRMED';
        task.completed_at = new Date().toISOString();
        task.completed_by = actor.userId;

        const rb = { pre_production_runbook_id: runbookId };
        await this._recordEvent('FINOPS_PRE_PRODUCTION_OPERATOR_TASK_CONFIRMED_BY_REVIEW', rb, task, actor, `Task ${taskKey} confirmed by review`);

        return task;
    }

    async resolveFinding(runbookId, findingCode, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        let finding = this.taskService ? this.taskService._mockFindings.find(f => f.pre_production_runbook_id === runbookId && f.finding_code === findingCode) : null;
        
        if (!finding) {
            finding = {
                id: crypto.randomUUID(),
                pre_production_runbook_id: runbookId,
                finding_code: findingCode,
                severity: 'MEDIUM',
                category: 'PRE_PRODUCTION',
                message: 'Mock finding',
                status: 'RESOLVED',
                created_at: new Date().toISOString(),
                resolved_at: new Date().toISOString(),
                resolved_by: actor.userId
            };
            if (this.taskService) this.taskService._mockFindings.push(finding);
        } else {
            finding.status = 'RESOLVED';
            finding.resolved_at = new Date().toISOString();
            finding.resolved_by = actor.userId;
        }

        const rb = { pre_production_runbook_id: runbookId };
        await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_FINDING_RESOLVED', rb, null, actor, `Finding ${findingCode} resolved`);

        return finding;
    }

    async dismissWarning(runbookId, warningText, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const rb = { pre_production_runbook_id: runbookId };
        await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_WARNING_DISMISSED', rb, null, actor, `Warning dismissed: ${warningText}`);
        return true;
    }

    async requestAdditionalEvidence(runbookId, note, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const rb = { pre_production_runbook_id: runbookId };
        await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_REVIEW_NOTE_ADDED', rb, null, actor, `Additional evidence requested: ${note}`);
        return true;
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

module.exports = FinancialOperationsPreProductionRunbookReviewService;
