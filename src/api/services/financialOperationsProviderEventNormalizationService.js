const crypto = require('crypto');

class FinancialOperationsProviderEventNormalizationService {
    constructor() {
        this._mockEvents = [];
        this.SUPPORTED_MODES = [
            'MOCK_PROVIDER_EVENT', 'STUBBED_PROVIDER_EVENT', 'SANDBOX_EVENT',
            'DRY_RUN_EVENT', 'SIMULATION_ONLY', 'EVENT_RECONCILIATION_READINESS_ONLY'
        ];
        this.SUPPORTED_TYPES = [
            'PAYMENT_AUTHORIZED_EVENT', 'PAYMENT_CAPTURED_EVENT', 'PAYMENT_FAILED_EVENT',
            'REFUND_CREATED_EVENT', 'REFUND_FAILED_EVENT', 'PAYOUT_CREATED_EVENT',
            'PAYOUT_FAILED_EVENT', 'INVOICE_SUBMITTED_EVENT', 'TAX_FILING_STATUS_EVENT',
            'ACCOUNTING_EXPORT_STATUS_EVENT'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async normalizeProviderEvent(payload, sourceEventJson, signature, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        // Must reject live event markers
        if (sourceEventJson.livemode === true || sourceEventJson.mode === 'live' || payload.eventMode === 'LIVE_EVENT') {
            await this._recordEvent('FINOPS_PROVIDER_EVENT_NORMALIZATION_BLOCKED', null, actor, 'Blocked: Live event marker detected');
            throw new Error('Normalization Blocked: Live event marker detected');
        }

        // Must reject live signatures
        if (signature && !signature.includes('sandbox') && !signature.includes('fake') && !signature.includes('test')) {
            await this._recordEvent('FINOPS_PROVIDER_EVENT_NORMALIZATION_BLOCKED', null, actor, 'Blocked: Live signature marker detected');
            throw new Error('Normalization Blocked: Live signature marker detected');
        }

        // Must reject plaintext secrets
        const sourceStr = JSON.stringify(sourceEventJson);
        if (sourceStr.includes('sk_live_') || sourceStr.includes('rk_live_') || sourceStr.match(/bearer [a-zA-Z0-9]{32,}/i)) {
            await this._recordEvent('FINOPS_PROVIDER_EVENT_NORMALIZATION_BLOCKED', null, actor, 'Blocked: Plaintext secret detected in payload');
            throw new Error('Normalization Blocked: Plaintext secret detected in payload');
        }

        if (!this.SUPPORTED_MODES.includes(payload.eventMode)) {
            throw new Error(`Unsupported event mode: ${payload.eventMode}`);
        }

        if (!this.SUPPORTED_TYPES.includes(payload.eventType)) {
            throw new Error(`Unsupported event type: ${payload.eventType}`);
        }

        // Must redact payloads
        const redactedPayloadJson = JSON.parse(sourceStr);
        this._redactNode(redactedPayloadJson);

        const normalized = {
            id: crypto.randomUUID(),
            provider_event_record_id: `pevt_${crypto.randomUUID()}`,
            event_reconciliation_run_id: payload.eventReconciliationRunId,
            tenant_id: payload.tenantId || null,
            provider_key: payload.providerKey,
            provider_type: payload.providerType,
            event_type: payload.eventType,
            event_mode: payload.eventMode,
            event_status: 'NORMALIZED',
            provider_event_id: sourceEventJson.id || null,
            internal_reference_id: sourceEventJson.metadata?.internal_reference_id || null,
            idempotency_key: sourceEventJson.idempotency_key || null,
            event_timestamp: sourceEventJson.created ? new Date(sourceEventJson.created * 1000).toISOString() : new Date().toISOString(),
            amount: sourceEventJson.amount ? (sourceEventJson.amount / 100).toFixed(4) : null,
            currency: sourceEventJson.currency ? sourceEventJson.currency.toUpperCase() : null,
            request_payload_json: sourceEventJson,
            normalized_event_json: {
                provider_event_id: sourceEventJson.id,
                amount: sourceEventJson.amount,
                currency: sourceEventJson.currency,
                status: sourceEventJson.status
            },
            redacted_payload_json: redactedPayloadJson,
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        await this._recordEvent('FINOPS_PROVIDER_EVENT_NORMALIZED', normalized, actor, 'Event normalized successfully');

        return normalized;
    }

    _redactNode(node) {
        if (!node || typeof node !== 'object') return;
        for (const key in node) {
            if (typeof node[key] === 'string') {
                if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || key.toLowerCase().includes('password')) {
                    node[key] = '[REDACTED]';
                }
            } else if (typeof node[key] === 'object') {
                this._redactNode(node[key]);
            }
        }
    }

    async _recordEvent(eventType, record, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            provider_event_record_id: record ? record.provider_event_record_id : null,
            event_reconciliation_run_id: record ? record.event_reconciliation_run_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderEventNormalizationService;
