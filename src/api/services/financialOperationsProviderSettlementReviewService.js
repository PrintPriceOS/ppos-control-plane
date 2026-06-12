const crypto = require('crypto');

class FinancialOperationsProviderSettlementReviewService {
    constructor() {
        this._mockEvents = [];
        this._mockFindings = [];
        this._mockMatches = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async resolveFinding(finding, action, reason, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const validActions = [
            'MARK_READY_FOR_REVIEW', 'ACKNOWLEDGE_UNMATCHED_ROW', 'RESOLVE_DUPLICATE_ROW',
            'RESOLVE_GROSS_AMOUNT_MISMATCH', 'RESOLVE_FEE_AMOUNT_MISMATCH', 'RESOLVE_NET_AMOUNT_MISMATCH',
            'RESOLVE_CURRENCY_MISMATCH', 'RESOLVE_SETTLEMENT_DATE_MISMATCH', 'RESOLVE_FINDING'
        ];

        if (!validActions.includes(action)) {
            throw new Error(`Unsupported finding resolution action: ${action}`);
        }

        finding.status = 'RESOLVED';
        finding.resolved_at = new Date().toISOString();
        finding.resolved_by = actor.userId;
        finding.resolution_reason = reason;

        await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_FINDING_RESOLVED', finding, actor, `Finding resolved using ${action}. Reason: ${reason}`);

        return finding;
    }

    async dismissWarning(runId, warningId, reason, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_WARNING_DISMISSED', { settlement_file_run_id: runId }, actor, `Warning ${warningId} dismissed. Reason: ${reason}`);
        
        return { success: true, warningId, reason };
    }

    async addReviewNote(runId, rowId, matchId, note, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_REVIEW_NOTE_ADDED', {
            settlement_file_run_id: runId, settlement_row_id: rowId, settlement_match_id: matchId
        }, actor, `Review note added: ${note}`);

        return { success: true, note };
    }

    async linkRowToInternalReference(row, internalRefId, internalRefType, reason, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        // Explicit constraint check - linking is review layer only
        await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_ROW_LINKED_FOR_REVIEW_ONLY', {
            settlement_file_run_id: row.settlement_file_run_id,
            settlement_row_id: row.settlement_row_id
        }, actor, `Row linked to internal reference ${internalRefId} (${internalRefType}) for review only. Reason: ${reason}`);

        const match = {
            id: crypto.randomUUID(),
            settlement_match_id: `sm_${crypto.randomUUID()}`,
            settlement_file_run_id: row.settlement_file_run_id,
            settlement_row_id: row.settlement_row_id,
            internal_reference_id: internalRefId,
            internal_reference_type: internalRefType,
            match_status: 'MANUAL_REVIEW_REQUIRED',
            match_confidence: 'Manual',
            match_reason: reason,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockMatches.push(match);

        await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_REVIEW_ACTION_RECORDED', match, actor, 'Manual review action recorded');

        return match;
    }

    async _recordEvent(eventType, record, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            settlement_file_run_id: record ? record.settlement_file_run_id : null,
            settlement_row_id: record ? record.settlement_row_id : null,
            settlement_match_id: record ? record.settlement_match_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderSettlementReviewService;
