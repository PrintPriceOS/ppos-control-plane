const crypto = require('crypto');

class FinancialOperationsProviderEventReconciliationReviewService {
    constructor(reconciliationService) {
        this.reconciliationService = reconciliationService;
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async resolveFinding(findingId, resolutionAction, reason, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);

        const finding = this.reconciliationService._mockFindings.get(findingId);
        if (!finding) throw new Error('Finding not found');
        if (finding.status === 'RESOLVED') throw new Error('Finding is already resolved');

        const run = this.reconciliationService._getRun(finding.event_reconciliation_run_id);

        finding.status = 'RESOLVED';
        finding.resolved_at = new Date().toISOString();
        finding.resolved_by = actor.userId;
        finding.evidence_json = finding.evidence_json || {};
        finding.evidence_json.resolution_action = resolutionAction;
        finding.evidence_json.resolution_reason = reason;

        await this._recordEvent('FINOPS_PROVIDER_EVENT_FINDING_RESOLVED', run, actor, `Finding ${finding.finding_code} resolved via ${resolutionAction}. Reason: ${reason}`);

        return finding;
    }

    async dismissWarning(findingId, reason, actor) {
        return this.resolveFinding(findingId, 'DISMISS_WARNING', reason, actor);
    }

    async acknowledgeUnmatchedEvent(findingId, reason, actor) {
        return this.resolveFinding(findingId, 'ACKNOWLEDGE_UNMATCHED_EVENT', reason, actor);
    }

    async resolveDuplicateEvent(findingId, reason, actor) {
        return this.resolveFinding(findingId, 'RESOLVE_DUPLICATE_EVENT', reason, actor);
    }

    async resolveAmountMismatch(findingId, reason, actor) {
        return this.resolveFinding(findingId, 'RESOLVE_AMOUNT_MISMATCH', reason, actor);
    }

    async resolveCurrencyMismatch(findingId, reason, actor) {
        return this.resolveFinding(findingId, 'RESOLVE_CURRENCY_MISMATCH', reason, actor);
    }

    async linkEventForReviewOnly(matchId, internalReferenceId, reason, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);

        const match = this.reconciliationService._mockMatches.get(matchId);
        if (!match) throw new Error('Match not found');

        const run = this.reconciliationService._getRun(match.event_reconciliation_run_id);

        match.internal_reference_id = internalReferenceId;
        match.match_status = 'MANUALLY_LINKED_FOR_REVIEW';
        match.match_reason = reason;
        match.resolved_at = new Date().toISOString();
        match.resolved_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_EVENT_LINKED_FOR_REVIEW_ONLY', run, actor, `Event manually linked for review. Reason: ${reason}`);
        return match;
    }

    async _recordEvent(eventType, run, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            event_reconciliation_run_id: run.event_reconciliation_run_id,
            provider_key: run.provider_key,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this.reconciliationService._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderEventReconciliationReviewService;
