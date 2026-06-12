const crypto = require('crypto');

class FinancialOperationsProviderFailureClassificationService {
    constructor() {
        this._mockEvents = [];
        this.SUPPORTED_MODES = [
            'MOCK_FAILURE', 'STUBBED_FAILURE', 'SANDBOX_FAILURE',
            'DRY_RUN_FAILURE', 'SIMULATION_ONLY', 'FAILURE_RETRY_READINESS_ONLY'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async classifyFailure(payload, sourceErrorJson, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sourceStr = JSON.stringify(sourceErrorJson);

        // Must reject live provider failure markers
        if (sourceErrorJson.livemode === true || sourceErrorJson.mode === 'live' || payload.failureMode === 'LIVE_FAILURE') {
            await this._recordEvent('FINOPS_PROVIDER_FAILURE_CLASSIFICATION_BLOCKED', null, actor, 'Blocked: Live failure marker detected');
            throw new Error('Classification Blocked: Live failure marker detected');
        }

        // Must reject live credentials/secrets in payloads
        if (sourceStr.includes('sk_live_') || sourceStr.includes('rk_live_') || sourceStr.match(/bearer [a-zA-Z0-9]{32,}/i)) {
            await this._recordEvent('FINOPS_PROVIDER_FAILURE_CLASSIFICATION_BLOCKED', null, actor, 'Blocked: Plaintext secret detected in failure payload');
            throw new Error('Classification Blocked: Plaintext secret detected in failure payload');
        }

        if (!this.SUPPORTED_MODES.includes(payload.failureMode)) {
            throw new Error(`Unsupported failure mode: ${payload.failureMode}`);
        }

        const redactedPayloadJson = JSON.parse(sourceStr);
        this._redactNode(redactedPayloadJson);

        let category = 'UNKNOWN_SANDBOX_FAILURE';
        
        // Simple classification heuristic for tests
        if (sourceErrorJson.code === 'timeout' || sourceErrorJson.status === 408) {
            category = 'NETWORK_TIMEOUT';
        } else if (sourceErrorJson.status >= 500 && sourceErrorJson.status < 600) {
            category = 'PROVIDER_5XX';
        } else if (sourceErrorJson.status === 429) {
            category = 'RATE_LIMITED';
        } else if (sourceErrorJson.code === 'idempotency_conflict' || sourceErrorJson.status === 409) {
            category = 'IDEMPOTENCY_CONFLICT';
        } else if (sourceErrorJson.status >= 400 && sourceErrorJson.status < 500) {
            category = 'PROVIDER_4XX';
        }

        const classifiedFailure = {
            id: crypto.randomUUID(),
            retry_attempt_id: payload.retryAttemptId || `att_${crypto.randomUUID()}`,
            failure_retry_run_id: payload.failureRetryRunId,
            tenant_id: payload.tenantId || null,
            provider_key: payload.providerKey,
            provider_type: payload.providerType,
            failure_mode: payload.failureMode,
            failure_code: sourceErrorJson.code || sourceErrorJson.status || 'unknown',
            failure_category: category,
            request_payload_json: payload.requestPayload || {},
            response_payload_json: sourceErrorJson,
            redacted_payload_json: redactedPayloadJson,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        await this._recordEvent('FINOPS_PROVIDER_FAILURE_CLASSIFIED', classifiedFailure, actor, `Failure classified as ${category}`);

        return classifiedFailure;
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
            failure_retry_run_id: record ? record.failure_retry_run_id : null,
            retry_attempt_id: record ? record.retry_attempt_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderFailureClassificationService;
