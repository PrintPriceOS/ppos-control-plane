const crypto = require('crypto');

class FinancialOperationsProviderSettlementFileParserService {
    constructor() {
        this._mockEvents = [];
        this.SUPPORTED_MODES = [
            'MOCK_SETTLEMENT_FILE', 'STUBBED_SETTLEMENT_FILE', 'SANDBOX_SETTLEMENT_FILE',
            'DRY_RUN_SETTLEMENT_FILE', 'SIMULATION_ONLY', 'SETTLEMENT_FILE_READINESS_ONLY'
        ];
        this.SUPPORTED_FORMATS = ['CSV', 'JSON', 'NDJSON', 'TSV', 'FIXED_WIDTH_STUB'];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async parseSettlementFile(runPayload, fileContentStr, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        if (!this.SUPPORTED_MODES.includes(runPayload.fileMode)) {
            await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_FILE_PARSE_BLOCKED', null, actor, `Blocked: Unsupported file mode ${runPayload.fileMode}`);
            throw new Error(`Unsupported file mode: ${runPayload.fileMode}`);
        }

        if (runPayload.fileMode === 'LIVE_SETTLEMENT_FILE' || fileContentStr.includes('"livemode": true') || fileContentStr.includes('live_marker')) {
            await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_FILE_PARSE_BLOCKED', null, actor, 'Blocked: Live settlement marker detected');
            throw new Error('Classification Blocked: Live settlement marker detected');
        }

        if (fileContentStr.includes('sk_live_') || fileContentStr.includes('rk_live_') || fileContentStr.match(/bearer [a-zA-Z0-9]{32,}/i)) {
            await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_FILE_PARSE_BLOCKED', null, actor, 'Blocked: Plaintext secret detected in settlement payload');
            throw new Error('Classification Blocked: Plaintext secret detected in settlement payload');
        }

        const runId = runPayload.settlementFileRunId || `sfr_${crypto.randomUUID()}`;
        
        await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_FILE_PARSED', { settlement_file_run_id: runId }, actor, `Parsed ${runPayload.fileFormat} file`);

        const rows = this._stubParse(fileContentStr, runPayload.fileFormat);
        const normalizedRows = [];

        for (let i = 0; i < rows.length; i++) {
            const rowPayload = rows[i];
            const redactedPayload = JSON.parse(JSON.stringify(rowPayload));
            let redacted = this._redactNode(redactedPayload);
            
            if (redacted) {
                await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_FILE_REDACTION_WARNING_RAISED', { settlement_file_run_id: runId, settlement_row_id: `row_${i}` }, actor, 'Redacted sensitive data in row');
            }

            const normalized = {
                id: crypto.randomUUID(),
                settlement_row_id: `srow_${crypto.randomUUID()}`,
                settlement_file_run_id: runId,
                tenant_id: runPayload.tenantId || null,
                provider_key: runPayload.providerKey,
                provider_type: runPayload.providerType,
                row_number: i + 1,
                row_status: 'NORMALIZED',
                transaction_reference: rowPayload.transaction_id || rowPayload.ref || null,
                provider_transaction_id: rowPayload.provider_txn_id || null,
                internal_reference_id: rowPayload.internal_ref || null,
                gross_amount: rowPayload.gross ? parseFloat(rowPayload.gross) : null,
                fee_amount: rowPayload.fee ? parseFloat(rowPayload.fee) : null,
                net_amount: rowPayload.net ? parseFloat(rowPayload.net) : null,
                currency: rowPayload.currency || null,
                row_payload_json: rowPayload,
                redacted_payload_json: redactedPayload,
                created_at: new Date().toISOString(),
                created_by: actor.userId
            };
            normalizedRows.push(normalized);
            await this._recordEvent('FINOPS_PROVIDER_SETTLEMENT_FILE_NORMALIZED', normalized, actor, `Normalized row ${i + 1}`);
        }

        return {
            settlement_file_run_id: runId,
            parsed_row_count: rows.length,
            normalized_rows: normalizedRows
        };
    }

    _stubParse(str, format) {
        try {
            if (format === 'JSON') {
                return JSON.parse(str);
            }
            if (format === 'NDJSON') {
                return str.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
            }
            if (format === 'CSV') {
                const lines = str.split('\n').filter(l => l.trim());
                if (lines.length < 2) return [];
                const headers = lines[0].split(',');
                return lines.slice(1).map(l => {
                    const vals = l.split(',');
                    const obj = {};
                    headers.forEach((h, i) => obj[h] = vals[i]);
                    return obj;
                });
            }
            return [{ raw: str }];
        } catch(e) {
            return [];
        }
    }

    _redactNode(node) {
        let redacted = false;
        if (!node || typeof node !== 'object') return redacted;
        for (const key in node) {
            if (typeof node[key] === 'string') {
                if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || key.toLowerCase().includes('password')) {
                    node[key] = '[REDACTED]';
                    redacted = true;
                }
            } else if (typeof node[key] === 'object') {
                const childRedacted = this._redactNode(node[key]);
                if (childRedacted) redacted = true;
            }
        }
        return redacted;
    }

    async _recordEvent(eventType, record, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            settlement_file_run_id: record ? record.settlement_file_run_id : null,
            settlement_row_id: record ? record.settlement_row_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderSettlementFileParserService;
