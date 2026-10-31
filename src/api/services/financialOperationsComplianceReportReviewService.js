const crypto = require('crypto');

class FinancialOperationsComplianceReportReviewService {
    constructor(definitionService, previewService) {
        this._mockEvents = [];
        this._mockFindings = [];
        this.definitionService = definitionService;
        this.previewService = previewService;
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async approveReportRun(runId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        const run = this.previewService ? this.previewService._mockRuns.find(r => r.compliance_report_run_id === runId) : null;
        if (!run) throw new Error('Run not found');

        if (run.run_status !== 'READY_FOR_REVIEW' && run.run_status !== 'MANUAL_REVIEW_REQUIRED') {
            throw new Error(`Cannot approve run in status ${run.run_status}`);
        }

        run.run_status = 'APPROVED_FOR_READINESS';
        run.completed_at = new Date().toISOString();
        run.completed_by = actor.userId;

        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_RUN_READINESS_APPROVED', run, null, actor, 'Report run approved for readiness');

        return run;
    }

    async rejectReportRun(runId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        const run = this.previewService ? this.previewService._mockRuns.find(r => r.compliance_report_run_id === runId) : null;
        if (!run) throw new Error('Run not found');

        run.run_status = 'REJECTED';
        run.completed_at = new Date().toISOString();
        run.completed_by = actor.userId;

        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_RUN_REJECTED', run, null, actor, 'Report run rejected');

        return run;
    }

    async resolveFinding(runId, findingCode, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        let finding = this._mockFindings.find(f => f.compliance_report_run_id === runId && f.finding_code === findingCode);
        
        if (!finding) {
            finding = {
                id: crypto.randomUUID(),
                compliance_report_run_id: runId,
                finding_code: findingCode,
                severity: 'MEDIUM',
                category: 'COMPLIANCE',
                message: 'Mock finding',
                status: 'RESOLVED',
                created_at: new Date().toISOString(),
                resolved_at: new Date().toISOString(),
                resolved_by: actor.userId
            };
            this._mockFindings.push(finding);
        } else {
            finding.status = 'RESOLVED';
            finding.resolved_at = new Date().toISOString();
            finding.resolved_by = actor.userId;
        }

        const run = { compliance_report_run_id: runId };
        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_FINDING_RESOLVED', run, null, actor, `Finding ${findingCode} resolved`);

        return finding;
    }

    async dismissWarning(runId, warningText, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const run = { compliance_report_run_id: runId };
        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_WARNING_DISMISSED', run, null, actor, `Warning dismissed: ${warningText}`);
        return true;
    }

    async requestAdditionalEvidence(runId, note, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const run = { compliance_report_run_id: runId };
        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_REVIEW_NOTE_ADDED', run, null, actor, `Additional evidence requested: ${note}`);
        return true;
    }

    async _recordEvent(eventType, run, section, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            compliance_report_run_id: run ? run.compliance_report_run_id : null,
            compliance_report_section_id: section ? section.compliance_report_section_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsComplianceReportReviewService;
