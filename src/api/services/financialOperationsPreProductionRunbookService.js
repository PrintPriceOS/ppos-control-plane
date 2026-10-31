const crypto = require('crypto');

class FinancialOperationsPreProductionRunbookService {
    constructor() {
        this._mockEvents = [];
        this._mockRunbooks = [];
        this._mockSections = [];
        this.SECTION_TYPES = [
            'EXECUTIVE_SUMMARY', 'READINESS_BASELINE', 'SECURITY_GUARDRAILS',
            'PROVIDER_READINESS', 'COMPLIANCE_REPORTING', 'DATA_RETENTION_PRIVACY',
            'FAILURE_RETRY_AND_ROLLBACK', 'INCIDENT_RESPONSE', 'OPERATOR_TASKS',
            'GO_NO_GO_NOTES', 'EXPORT_PREVIEW'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createRunbook(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const runbookId = `pprb_${crypto.randomUUID()}`;
        const rb = {
            id: crypto.randomUUID(),
            pre_production_runbook_id: runbookId,
            tenant_id: payload.tenantId || null,
            runbook_name: payload.runbookName || 'Pre-Production Runbook',
            runbook_status: 'CREATED',
            runbook_scope: payload.runbookScope || 'FULL_FINOPS',
            runbook_mode: 'PRE_PRODUCTION_RUNBOOK_ONLY',
            evidence_json: payload.evidence || {},
            blockers_json: [],
            warnings_json: [],
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockRunbooks.push(rb);

        await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_CREATED', rb, null, actor, `Runbook ${rb.runbook_name} created`);

        return rb;
    }

    async evaluateRunbook(runbookId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const rb = this._mockRunbooks.find(r => r.pre_production_runbook_id === runbookId);
        if (!rb) throw new Error('Runbook not found');

        await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_EVALUATED', rb, null, actor, 'Evaluating runbook readiness');

        const evidence = rb.evidence_json || {};
        const blockers = [];

        // Required zero-live-ops checks
        if (evidence.production_activation_enabled) blockers.push('PRODUCTION_ACTIVATION_ENABLED');
        if (evidence.full_public_enabled) blockers.push('FULL_PUBLIC_ENABLED');
        if (evidence.live_provider_connectivity_enabled) blockers.push('LIVE_PROVIDER_CONNECTIVITY_ENABLED');

        // Readiness areas
        if (!evidence.go_live_simulation_completed) blockers.push('MISSING_GO_LIVE_SIMULATION');
        if (!evidence.compliance_reporting_ready) blockers.push('COMPLIANCE_REPORTING_NOT_READY');
        if (!evidence.privacy_retention_ready) blockers.push('PRIVACY_RETENTION_NOT_READY');
        if (!evidence.provider_ready) blockers.push('PROVIDER_NOT_READY');
        if (!evidence.rollback_path_ready) blockers.push('ROLLBACK_PATH_NOT_READY');

        let status = 'APPROVED_FOR_PRE_PRODUCTION_REVIEW';

        if (blockers.length > 0) {
            if (blockers.some(b => b.includes('COMPLIANCE'))) status = 'BLOCKED_BY_COMPLIANCE_GAP';
            else if (blockers.some(b => b.includes('PRIVACY'))) status = 'BLOCKED_BY_PRIVACY_GAP';
            else if (blockers.some(b => b.includes('PROVIDER'))) status = 'BLOCKED_BY_PROVIDER_GAP';
            else if (blockers.some(b => b.includes('ROLLBACK'))) status = 'BLOCKED_BY_ROLLBACK_GAP';
            else if (blockers.some(b => b.includes('MISSING_GO_LIVE_SIMULATION'))) status = 'BLOCKED_BY_MISSING_EVIDENCE';
            else status = 'BLOCKED_BY_SECURITY_GAP';

            rb.blockers_json = blockers;
            rb.runbook_status = status;

            await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_BLOCKER_DETECTED', rb, null, actor, `Evaluation failed. Blockers: ${blockers.join(', ')}`);
            return rb;
        }

        rb.runbook_status = status;
        await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_READY_FOR_REVIEW', rb, null, actor, 'Runbook is ready for review');

        await this._buildSections(rb, actor);

        return rb;
    }

    async _buildSections(rb, actor) {
        for (const type of this.SECTION_TYPES) {
            const sec = {
                id: crypto.randomUUID(),
                runbook_section_id: `sec_${crypto.randomUUID()}`,
                pre_production_runbook_id: rb.pre_production_runbook_id,
                section_key: type,
                section_label: type.replace(/_/g, ' '),
                section_status: 'BUILT',
                created_at: new Date().toISOString(),
                created_by: actor.userId
            };
            this._mockSections.push(sec);
            await this._recordEvent('FINOPS_PRE_PRODUCTION_RUNBOOK_SECTION_BUILT', rb, sec, actor, `Section ${type} built`);
        }
    }

    async _recordEvent(eventType, rb, sec, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            pre_production_runbook_id: rb ? rb.pre_production_runbook_id : null,
            runbook_section_id: sec ? sec.runbook_section_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsPreProductionRunbookService;
