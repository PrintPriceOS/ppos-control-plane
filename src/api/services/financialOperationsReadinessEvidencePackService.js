const crypto = require('crypto');

class FinancialOperationsReadinessEvidencePackService {
    constructor() {
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async generateEvidencePack(review, goNoGoStatus, sourceEvidenceList, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'SECURITY_ADMIN']);

        const pack = {
            id: crypto.randomUUID(),
            activation_review_id: review.activation_review_id,
            tenant_id: review.tenant_id,
            generated_at: new Date().toISOString(),
            generated_by: actor.userId,
            readiness_summary: sourceEvidenceList.find(e => e.type === 'READINESS') || {},
            release_gate_summary: sourceEvidenceList.find(e => e.type === 'RELEASE_GATE') || {},
            pilot_summary: sourceEvidenceList.find(e => e.type === 'PILOT') || {},
            partner_sandbox_summary: sourceEvidenceList.find(e => e.type === 'SANDBOX') || {},
            hardening_summary: sourceEvidenceList.find(e => e.type === 'HARDENING') || {},
            security_guardrail_summary: sourceEvidenceList.find(e => e.type === 'SECURITY') || {},
            operational_readiness_summary: sourceEvidenceList.find(e => e.type === 'OPERATIONAL') || {},
            audit_timeline_summary: sourceEvidenceList.find(e => e.type === 'AUDIT') || {},
            go_no_go_summary: {
                status: goNoGoStatus,
                decision_timestamp: new Date().toISOString()
            },
            blockers: review.blockers || [],
            warnings: review.warnings || [],
            final_statement: {
                production_activation: 'NOT_ENABLED',
                live_provider_connectivity: 'NOT_ENABLED',
                payment_execution: 'NOT_ENABLED',
                refund_execution: 'NOT_ENABLED',
                payout_execution: 'NOT_ENABLED',
                external_invoice_submission: 'NOT_ENABLED',
                tax_filing_automation: 'NOT_ENABLED',
                full_public_launch: 'NOT_ENABLED',
                source_record_mutation: 'NOT_ENABLED',
                message: `This evidence pack confirms that production activation is NOT enabled. Live providers are NOT connected. Phase 100 review represents readiness evidence for future controlled activation review only.`
            }
        };

        await this._recordEvent('FINOPS_FINAL_READINESS_EVIDENCE_PACK_GENERATED', pack, actor, 'Final readiness evidence pack generated');

        if (pack.blockers.length > 0) {
            await this._recordEvent('FINOPS_FINAL_READINESS_EVIDENCE_BLOCKER_INCLUDED', pack, actor, `Evidence pack includes blockers: ${pack.blockers.join(', ')}`);
        }

        if (pack.warnings.length > 0) {
            await this._recordEvent('FINOPS_FINAL_READINESS_EVIDENCE_WARNING_RAISED', pack, actor, `Evidence pack includes warnings: ${pack.warnings.join(', ')}`);
        }

        return pack;
    }

    async _recordEvent(eventType, pack, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            activation_review_id: pack.activation_review_id,
            tenant_id: pack.tenant_id,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsReadinessEvidencePackService;
