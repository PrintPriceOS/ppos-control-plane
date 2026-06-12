const crypto = require('crypto');

class FinancialOperationsFinalReleaseEvidencePackService {
    constructor(candidateService) {
        this._mockEvents = [];
        this._mockPacks = [];
        this.candidateService = candidateService;

        this.EVIDENCE_SECTIONS = [
            'EXECUTIVE_SUMMARY', 'READINESS_HISTORY', 'SECURITY_GUARDRAILS',
            'PROVIDER_READINESS', 'COMPLIANCE_AND_REPORTING', 'DATA_RETENTION_AND_PRIVACY',
            'FAILURE_RETRY_AND_ROLLBACK', 'SETTLEMENT_AND_RECONCILIATION',
            'GO_LIVE_SIMULATION', 'PRE_PRODUCTION_RUNBOOK',
            'FINAL_BLOCKERS_AND_WARNINGS', 'FINAL_APPROVAL_NOTES'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async buildEvidencePack(candidateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const rc = this.candidateService ? this.candidateService._mockCandidates.find(c => c.final_release_candidate_id === candidateId) : null;
        if (!rc) throw new Error('Release candidate not found');

        const evidenceItems = [];
        for (const secKey of this.EVIDENCE_SECTIONS) {
            evidenceItems.push({
                id: crypto.randomUUID(),
                release_candidate_evidence_id: `ev_${crypto.randomUUID()}`,
                final_release_candidate_id: rc.final_release_candidate_id,
                evidence_key: secKey,
                evidence_label: secKey.replace(/_/g, ' '),
                evidence_status: 'BUILT',
                evidence_json: { notes: `Evidence for ${secKey}` },
                redacted_preview_json: { notes: '[REDACTED]' },
                created_at: new Date().toISOString(),
                created_by: actor.userId
            });
        }

        this._mockPacks.push({
            final_release_candidate_id: candidateId,
            evidence: evidenceItems
        });

        const rb = { final_release_candidate_id: candidateId };
        await this._recordEvent('FINOPS_FINAL_RELEASE_EVIDENCE_PACK_CREATED', rb, null, actor, 'Final Release Evidence Pack created');
        await this._recordEvent('FINOPS_FINAL_RELEASE_NOTES_CREATED', rb, null, actor, 'Final Release Notes generated');
        await this._recordEvent('FINOPS_FINAL_RELEASE_EVIDENCE_REDACTED', rb, null, actor, 'Final Release Evidence redacted');

        return {
            items: evidenceItems,
            safetyStatement: {
                activates_production: false,
                full_public_enabled: false,
                live_providers_connected: false,
                executes_payment: false,
                executes_refund: false,
                executes_payout: false,
                submits_reports_externally: false,
                submits_invoices_externally: false,
                files_taxes: false,
                submits_vat_returns: false,
                mutates_source_records: false
            }
        };
    }

    async _recordEvent(eventType, rc, evd, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            final_release_candidate_id: rc ? rc.final_release_candidate_id : null,
            release_candidate_evidence_id: evd ? evd.release_candidate_evidence_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsFinalReleaseEvidencePackService;
