const crypto = require('crypto');

class FinancialOperationsProviderSettlementReconciliationService {
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

    async reconcileSettlementRun(runId, normalizedRows, internalSandboxRecords, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_RECONCILIATION_RUN_CREATED', { settlement_file_run_id: runId }, actor, `Starting reconciliation for run ${runId}`);

        let matchedCount = 0;
        let unmatchedCount = 0;
        let duplicateCount = 0;
        let mismatchedCount = 0;

        for (const row of normalizedRows) {
            const result = await this._matchRow(row, internalSandboxRecords, actor);
            if (result.match_status === 'MATCHED') matchedCount++;
            else if (result.match_status === 'UNMATCHED') unmatchedCount++;
            else if (result.match_status === 'DUPLICATE') duplicateCount++;
            else mismatchedCount++;
        }

        return {
            settlement_file_run_id: runId,
            matched_row_count: matchedCount,
            unmatched_row_count: unmatchedCount,
            duplicate_row_count: duplicateCount,
            mismatched_row_count: mismatchedCount
        };
    }

    async _matchRow(row, internalRecords, actor) {
        if (!row.transaction_reference && !row.provider_transaction_id) {
            await this._createFinding(row, null, 'MISSING_TRANSACTION_REFERENCE', 'HIGH', 'Validation', 'Missing transaction reference in settlement row');
            return await this._createMatch(row, null, 'UNMATCHED', 'None', 'Missing reference identifiers', actor);
        }

        const candidates = internalRecords.filter(r => 
            (r.reference_id && (r.reference_id === row.transaction_reference || r.reference_id === row.provider_transaction_id)) ||
            (r.internal_id && r.internal_id === row.internal_reference_id)
        );

        if (candidates.length === 0) {
            await this._createFinding(row, null, 'UNMATCHED_SETTLEMENT_ROW', 'MEDIUM', 'Reconciliation', 'Settlement row could not be matched to internal sandbox records');
            return await this._createMatch(row, null, 'UNMATCHED', 'None', 'No matching internal record found', actor);
        }

        if (candidates.length > 1) {
            await this._createFinding(row, null, 'DUPLICATE_SETTLEMENT_ROW', 'HIGH', 'Reconciliation', 'Settlement row matches multiple internal sandbox records');
            return await this._createMatch(row, null, 'DUPLICATE', 'Low', 'Multiple matching internal records found', actor);
        }

        const internalRec = candidates[0];
        const match = await this._createMatch(row, internalRec, 'MATCHED', 'High', 'Exact reference match', actor);

        let mismatchDetected = false;

        if (row.gross_amount !== null && internalRec.gross_amount !== null && row.gross_amount !== internalRec.gross_amount) {
            match.gross_amount_match_status = 'MISMATCH';
            mismatchDetected = true;
            await this._createFinding(row, match.settlement_match_id, 'MISMATCHED_GROSS_AMOUNT', 'HIGH', 'Reconciliation', 'Gross amount mismatch');
        }

        if (row.fee_amount !== null && internalRec.fee_amount !== null && row.fee_amount !== internalRec.fee_amount) {
            match.fee_amount_match_status = 'MISMATCH';
            mismatchDetected = true;
            await this._createFinding(row, match.settlement_match_id, 'MISMATCHED_FEE_AMOUNT', 'HIGH', 'Reconciliation', 'Fee amount mismatch');
        }

        if (row.net_amount !== null && internalRec.net_amount !== null && row.net_amount !== internalRec.net_amount) {
            match.net_amount_match_status = 'MISMATCH';
            mismatchDetected = true;
            await this._createFinding(row, match.settlement_match_id, 'MISMATCHED_NET_AMOUNT', 'HIGH', 'Reconciliation', 'Net amount mismatch');
        }

        if (row.currency && internalRec.currency && row.currency !== internalRec.currency) {
            match.currency_match_status = 'MISMATCH';
            mismatchDetected = true;
            await this._createFinding(row, match.settlement_match_id, 'MISMATCHED_CURRENCY', 'HIGH', 'Reconciliation', 'Currency mismatch');
        }

        if (mismatchDetected) {
            match.match_status = 'MISMATCHED_AMOUNT_OR_CURRENCY';
            await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_MISMATCH_DETECTED', match, actor, 'Mismatch detected during reconciliation');
        } else {
            await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_ROW_MATCHED', match, actor, 'Row successfully matched without mismatch');
        }

        return match;
    }

    async _createMatch(row, internalRec, matchStatus, confidence, reason, actor) {
        const match = {
            id: crypto.randomUUID(),
            settlement_match_id: `sm_${crypto.randomUUID()}`,
            settlement_file_run_id: row.settlement_file_run_id,
            settlement_row_id: row.settlement_row_id,
            internal_reference_id: internalRec ? (internalRec.internal_id || internalRec.reference_id) : null,
            internal_reference_type: internalRec ? internalRec.type : null,
            match_status: matchStatus,
            match_confidence: confidence,
            match_reason: reason,
            gross_amount_match_status: internalRec && row.gross_amount === internalRec.gross_amount ? 'MATCH' : 'PENDING',
            fee_amount_match_status: internalRec && row.fee_amount === internalRec.fee_amount ? 'MATCH' : 'PENDING',
            net_amount_match_status: internalRec && row.net_amount === internalRec.net_amount ? 'MATCH' : 'PENDING',
            currency_match_status: internalRec && row.currency === internalRec.currency ? 'MATCH' : 'PENDING',
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };
        this._mockMatches.push(match);

        if (matchStatus === 'UNMATCHED') {
            await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_ROW_UNMATCHED', match, actor, 'Row remains unmatched');
        } else if (matchStatus === 'DUPLICATE') {
            await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_DUPLICATE_DETECTED', match, actor, 'Duplicate row match detected');
        }

        return match;
    }

    async _createFinding(row, matchId, code, severity, category, message) {
        const finding = {
            id: crypto.randomUUID(),
            settlement_file_run_id: row.settlement_file_run_id,
            settlement_row_id: row.settlement_row_id,
            settlement_match_id: matchId,
            finding_code: code,
            severity,
            category,
            message,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };
        this._mockFindings.push(finding);
        return finding;
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

module.exports = FinancialOperationsProviderSettlementReconciliationService;
