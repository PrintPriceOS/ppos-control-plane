const crypto = require('crypto');

class FinancialOperationsComplianceReportDefinitionService {
    constructor() {
        this._mockEvents = [];
        this._mockDefinitions = [];
        this.SUPPORTED_DOMAINS = [
            'FINANCIAL_RECONCILIATION', 'ACCOUNTING_EXPORT_READINESS',
            'TAX_VAT_READINESS', 'GOVERNED_INVOICES', 'CREDIT_NOTES',
            'PROVIDER_EVENTS', 'SETTLEMENT_FILES', 'DATA_RETENTION_PRIVACY',
            'AUDIT_TRAIL', 'FINOPS_RELEASE_READINESS'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createDefinition(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        const defId = `crd_${crypto.randomUUID()}`;
        const def = {
            id: crypto.randomUUID(),
            compliance_report_definition_id: defId,
            tenant_id: payload.tenantId || null,
            report_key: payload.reportKey,
            report_name: payload.reportName,
            report_status: 'DRAFT',
            report_domain: payload.reportDomain,
            jurisdiction: payload.jurisdiction || null,
            data_sources_json: payload.dataSources || [],
            required_sections_json: payload.requiredSections || [],
            redaction_required: payload.redactionRequired !== false,
            manual_review_required: payload.manualReviewRequired !== false,
            external_submission_enabled: payload.externalSubmissionEnabled || false,
            tax_filing_enabled: payload.taxFilingEnabled || false,
            production_execution_enabled: payload.productionExecutionEnabled || false,
            full_public_enabled: payload.fullPublicEnabled || false,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockDefinitions.push(def);

        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_DEFINITION_CREATED', def, actor, `Definition ${def.report_name} created`);

        return def;
    }

    async evaluateDefinitionReadiness(defId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        const def = this._mockDefinitions.find(d => d.compliance_report_definition_id === defId);
        if (!def) throw new Error('Definition not found');

        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_DEFINITION_EVALUATED', def, actor, 'Evaluating definition readiness');

        const blockers = [];

        if (!def.report_key) blockers.push('REPORT_KEY_UNDEFINED');
        if (!def.report_domain || !this.SUPPORTED_DOMAINS.includes(def.report_domain)) blockers.push('REPORT_DOMAIN_UNDEFINED_OR_UNSUPPORTED');
        if (!def.data_sources_json || def.data_sources_json.length === 0) blockers.push('DATA_SOURCES_UNDEFINED');
        if (!def.required_sections_json || def.required_sections_json.length === 0) blockers.push('REQUIRED_SECTIONS_UNDEFINED');
        if (!def.redaction_required) blockers.push('REDACTION_NOT_REQUIRED');
        if (!def.manual_review_required) blockers.push('MANUAL_REVIEW_NOT_REQUIRED');
        if (def.external_submission_enabled) blockers.push('EXTERNAL_SUBMISSION_ENABLED');
        if (def.tax_filing_enabled) blockers.push('TAX_FILING_ENABLED');
        if (def.production_execution_enabled) blockers.push('PRODUCTION_EXECUTION_ENABLED');
        if (def.full_public_enabled) blockers.push('FULL_PUBLIC_ENABLED');

        if (blockers.length > 0) {
            def.report_status = 'REJECTED';
            await this._recordEvent('FINOPS_COMPLIANCE_REPORT_DEFINITION_WARNING_RAISED', def, actor, `Evaluation failed. Blockers: ${blockers.join(', ')}`);
            await this._recordEvent('FINOPS_COMPLIANCE_REPORT_DEFINITION_REJECTED', def, actor, 'Definition rejected');
            return { definition: def, ready: false, blockers };
        }

        def.report_status = 'READY_FOR_REVIEW';
        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_DEFINITION_READY_FOR_REVIEW', def, actor, 'Definition is ready for review');

        return { definition: def, ready: true, blockers: [] };
    }

    async approveDefinition(defId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        const def = this._mockDefinitions.find(d => d.compliance_report_definition_id === defId);
        if (!def) throw new Error('Definition not found');

        if (def.report_status !== 'READY_FOR_REVIEW' && def.report_status !== 'MANUAL_REVIEW_REQUIRED') {
            throw new Error(`Cannot approve definition in status ${def.report_status}`);
        }

        def.report_status = 'APPROVED_FOR_READINESS';
        def.approved_at = new Date().toISOString();
        def.approved_by = actor.userId;

        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_DEFINITION_APPROVED_FOR_READINESS', def, actor, 'Definition approved for readiness');

        return def;
    }

    async revokeDefinition(defId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        const def = this._mockDefinitions.find(d => d.compliance_report_definition_id === defId);
        if (!def) throw new Error('Definition not found');

        def.report_status = 'REVOKED';
        def.revoked_at = new Date().toISOString();
        def.revoked_by = actor.userId;

        await this._recordEvent('FINOPS_COMPLIANCE_REPORT_DEFINITION_REVOKED', def, actor, 'Definition revoked');

        return def;
    }

    async _recordEvent(eventType, def, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            compliance_report_definition_id: def ? def.compliance_report_definition_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsComplianceReportDefinitionService;
