const crypto = require('crypto');

class FinancialOperationsComplianceReportPreviewService {
    constructor(definitionService) {
        this._mockEvents = [];
        this._mockRuns = [];
        this._mockSections = [];
        this.definitionService = definitionService;
        this.SUPPORTED_MODES = [
            'REPORTING_READINESS_ONLY', 'COMPLIANCE_PREVIEW_ONLY',
            'REDACTED_EXPORT_PREVIEW_ONLY', 'POLICY_SIMULATION_ONLY'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createPreviewRun(definitionId, mode, candidateRecords, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        if (!this.SUPPORTED_MODES.includes(mode)) {
            throw new Error(`Unsupported preview mode: ${mode}`);
        }

        const def = this.definitionService ? this.definitionService._mockDefinitions.find(d => d.compliance_report_definition_id === definitionId) : null;
        
        let status = 'CREATED';
        const blockers = [];
        const warnings = [];

        if (!def) {
            status = 'BLOCKED_BY_DEFINITION_GAP';
            blockers.push('REPORT_DEFINITION_NOT_FOUND');
        } else if (def.report_status !== 'APPROVED_FOR_READINESS') {
            status = 'BLOCKED_BY_DEFINITION_GAP';
            blockers.push('REPORT_DEFINITION_NOT_APPROVED');
        } else {
            if (candidateRecords.length === 0) {
                status = 'BLOCKED_BY_SOURCE_GAP';
                blockers.push('MISSING_SOURCE_COVERAGE');
            }
            if (!def.redaction_required) {
                status = 'BLOCKED_BY_REDACTION_GAP';
                blockers.push('REDACTION_NOT_REQUIRED');
            }
        }

        const runId = `crr_${crypto.randomUUID()}`;

        const run = {
            id: crypto.randomUUID(),
            compliance_report_run_id: runId,
            compliance_report_definition_id: definitionId,
            tenant_id: def ? def.tenant_id : null,
            report_key: def ? def.report_key : 'UNKNOWN',
            report_domain: def ? def.report_domain : 'UNKNOWN',
            run_status: status,
            run_scope: mode,
            source_record_count: candidateRecords.length,
            included_record_count: 0,
            excluded_record_count: 0,
            finding_count: 0,
            blocker_count: blockers.length,
            warning_count: warnings.length,
            blockers_json: blockers,
            warnings_json: warnings,
            source_snapshot_json: candidateRecords,
            result_snapshot_json: [],
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockRuns.push(run);
        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_PREVIEW_CREATED', run, null, actor, `Report preview run ${runId} created`);

        if (status.startsWith('BLOCKED_')) {
            await this._recordEvent('FINOPS_COMPLIANCE_REPORT_BLOCKER_DETECTED', run, null, actor, `Run blocked: ${blockers.join(', ')}`);
            return run;
        }

        // Build sections
        const requiredSections = def.required_sections_json || [];
        const results = [];

        for (const record of candidateRecords) {
            const redactedRec = JSON.parse(JSON.stringify(record));
            if (redactedRec.customer_name) redactedRec.customer_name = '[REDACTED]';
            if (redactedRec.customer_email) redactedRec.customer_email = '[REDACTED]';
            if (redactedRec.amount < 0) {
                warnings.push(`Negative amount in record ${record.id}`);
                run.warning_count++;
            }
            results.push(redactedRec);
        }

        run.included_record_count = results.length;
        run.result_snapshot_json = results;

        for (const section of requiredSections) {
            const secRecord = {
                id: crypto.randomUUID(),
                compliance_report_section_id: `crs_${crypto.randomUUID()}`,
                compliance_report_run_id: run.compliance_report_run_id,
                section_key: section,
                section_label: section.replace('_', ' ').toUpperCase(),
                section_status: 'BUILT',
                source_count: run.included_record_count,
                redacted_preview_json: results,
                created_at: new Date().toISOString(),
                created_by: actor.userId
            };
            this._mockSections.push(secRecord);
            await this._recordEvent('FINOPS_COMPLIANCE_REPORT_SECTION_BUILT', run, secRecord, actor, `Section ${section} built`);
        }

        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_REDACTED_PREVIEW_GENERATED', run, null, actor, 'Redacted preview generated');

        if (warnings.length > 0) {
            await this._recordEvent('FINOPS_COMPLIANCE_REPORT_WARNING_RAISED', run, null, actor, 'Warnings generated during preview');
        }

        run.run_status = 'READY_FOR_REVIEW';

        return run;
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

module.exports = FinancialOperationsComplianceReportPreviewService;
