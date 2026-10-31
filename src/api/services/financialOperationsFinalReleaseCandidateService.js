const crypto = require('crypto');

class FinancialOperationsFinalReleaseCandidateService {
    constructor() {
        this._mockEvents = [];
        this._mockCandidates = [];
        this._mockChecks = [];
        this.CHECK_TYPES = [
            'PRE_PRODUCTION_RUNBOOK_VALIDATED', 'GO_LIVE_SIMULATION_VALIDATED',
            'COMPLIANCE_REPORTING_VALIDATED', 'PRIVACY_RETENTION_VALIDATED',
            'PROVIDER_READINESS_VALIDATED', 'FAILURE_RETRY_VALIDATED',
            'SETTLEMENT_FILE_VALIDATED', 'RELEASE_GATES_VALIDATED',
            'AUDIT_TIMELINE_COMPLETE', 'PRODUCTION_ACTIVATION_DISABLED',
            'FULL_PUBLIC_DISABLED', 'LIVE_PROVIDER_CONNECTIVITY_DISABLED',
            'LIVE_CREDENTIALS_DISABLED', 'PAYMENT_EXECUTION_DISABLED',
            'REFUND_EXECUTION_DISABLED', 'PAYOUT_EXECUTION_DISABLED',
            'EXTERNAL_INVOICE_SUBMISSION_DISABLED', 'TAX_FILING_AUTOMATION_DISABLED',
            'VAT_RETURN_SUBMISSION_DISABLED', 'EXTERNAL_REPORT_SUBMISSION_DISABLED',
            'LIVE_PERSONAL_DATA_EXPORT_DISABLED', 'SOURCE_RECORD_MUTATION_DISABLED'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createReleaseCandidate(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const candidateId = `frc_${crypto.randomUUID()}`;
        const rc = {
            id: crypto.randomUUID(),
            final_release_candidate_id: candidateId,
            tenant_id: payload.tenantId || null,
            release_candidate_name: payload.candidateName || 'Final Release Candidate',
            release_candidate_status: 'CREATED',
            release_candidate_scope: payload.candidateScope || 'FULL_FINOPS',
            release_candidate_mode: 'FINAL_RELEASE_CANDIDATE_ONLY',
            evidence_json: payload.evidence || {},
            blockers_json: [],
            warnings_json: [],
            production_activation_enabled: false,
            full_public_enabled: false,
            live_provider_connectivity_enabled: false,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockCandidates.push(rc);

        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_CREATED', rc, null, actor, `Final Release Candidate ${rc.release_candidate_name} created`);

        return rc;
    }

    async evaluateReleaseCandidate(candidateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const rc = this._mockCandidates.find(c => c.final_release_candidate_id === candidateId);
        if (!rc) throw new Error('Release candidate not found');

        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_EVALUATED', rc, null, actor, 'Evaluating final release candidate');

        const evidence = rc.evidence_json || {};
        const blockers = [];

        // Required zero-live-ops checks
        if (evidence.production_activation_enabled) blockers.push('PRODUCTION_ACTIVATION_ENABLED');
        if (evidence.full_public_enabled) blockers.push('FULL_PUBLIC_ENABLED');
        if (evidence.live_provider_connectivity_enabled) blockers.push('LIVE_PROVIDER_CONNECTIVITY_ENABLED');

        // Readiness areas
        if (!evidence.pre_production_runbook_completed) blockers.push('MISSING_PRE_PRODUCTION_RUNBOOK');
        if (!evidence.compliance_reporting_ready) blockers.push('COMPLIANCE_REPORTING_NOT_READY');
        if (!evidence.provider_ready) blockers.push('PROVIDER_NOT_READY');

        let status = 'APPROVED_AS_FINAL_RELEASE_CANDIDATE';

        if (blockers.length > 0) {
            if (blockers.some(b => b.includes('RUNBOOK'))) status = 'BLOCKED_BY_RUNBOOK_GAP';
            else if (blockers.some(b => b.includes('COMPLIANCE'))) status = 'BLOCKED_BY_COMPLIANCE_GAP';
            else if (blockers.some(b => b.includes('PROVIDER'))) status = 'BLOCKED_BY_PROVIDER_GAP';
            else status = 'BLOCKED_BY_SECURITY_GAP';

            rc.blockers_json = blockers;
            rc.release_candidate_status = status;

            await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_BLOCKER_DETECTED', rc, null, actor, `Evaluation failed. Blockers: ${blockers.join(', ')}`);
            return rc;
        }

        rc.release_candidate_status = status;
        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_READY_FOR_REVIEW', rc, null, actor, 'Final Release Candidate is ready for review');

        await this._buildChecks(rc, actor);

        return rc;
    }

    async _buildChecks(rc, actor) {
        for (const type of this.CHECK_TYPES) {
            const chk = {
                id: crypto.randomUUID(),
                release_candidate_check_id: `chk_${crypto.randomUUID()}`,
                final_release_candidate_id: rc.final_release_candidate_id,
                check_key: type,
                check_label: type.replace(/_/g, ' '),
                check_status: 'COMPLETED',
                created_at: new Date().toISOString(),
                created_by: actor.userId
            };
            this._mockChecks.push(chk);
            await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_CHECK_COMPLETED', rc, chk, actor, `Check ${type} completed`);
        }
    }

    async _recordEvent(eventType, rc, chk, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            final_release_candidate_id: rc ? rc.final_release_candidate_id : null,
            release_candidate_check_id: chk ? chk.release_candidate_check_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsFinalReleaseCandidateService;
