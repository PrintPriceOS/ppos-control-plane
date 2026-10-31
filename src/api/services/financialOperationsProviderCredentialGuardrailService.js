const crypto = require('crypto');

class FinancialOperationsProviderCredentialGuardrailService {
    constructor() {
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluateGuardrails(sandboxConfig, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);

        const result = {
            id: crypto.randomUUID(),
            provider_sandbox_id: sandboxConfig.provider_sandbox_id,
            evaluated_at: new Date().toISOString(),
            status: 'PASS',
            blockers: [],
            warnings: []
        };

        // 1. Live credentials check
        if (sandboxConfig.live_credentials_present) {
            result.blockers.push('LIVE_CREDENTIALS_PRESENT');
        }

        // 2. Sandbox credentials check
        if (!sandboxConfig.sandbox_credentials_present && sandboxConfig.credentials_mode !== 'ISOLATED_MOCK') {
            result.warnings.push('MISSING_SANDBOX_CREDENTIALS');
        }

        // 3. Live connectivity check
        if (sandboxConfig.live_provider_connectivity_enabled) {
            result.blockers.push('LIVE_CONNECTIVITY_ENABLED');
        }

        // 4. Provider mode check
        if (!sandboxConfig.sandbox_only && !sandboxConfig.mock_provider_enabled && !sandboxConfig.stubbed_provider_enabled) {
            result.blockers.push('NOT_SANDBOX_OR_MOCK_ONLY');
        }

        // 5. Global FULL_PUBLIC check
        if (sandboxConfig.full_public_enabled || globalConfig.full_public_enabled) {
            result.blockers.push('FULL_PUBLIC_ENABLED');
        }

        // 6. Live Webhook endpoints check
        if (sandboxConfig.live_webhook_endpoint_enabled || globalConfig.live_webhook_endpoints_enabled) {
            result.blockers.push('LIVE_WEBHOOK_ENDPOINT_ENABLED');
        }

        // Determine final status
        if (result.blockers.length > 0) {
            result.status = 'BLOCKED';
            await this._recordEvent('FINOPS_PROVIDER_CREDENTIAL_BLOCKER_DETECTED', result, actor, `Blockers found: ${result.blockers.join(', ')}`);
        } else if (result.warnings.length > 0) {
            result.status = 'WARNING';
            await this._recordEvent('FINOPS_PROVIDER_CREDENTIAL_WARNING_RAISED', result, actor, `Warnings found: ${result.warnings.join(', ')}`);
        }

        await this._recordEvent('FINOPS_PROVIDER_CREDENTIAL_GUARDRAILS_EVALUATED', result, actor, `Credential guardrails evaluated. Status: ${result.status}`);

        return result;
    }

    async _recordEvent(eventType, result, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            provider_sandbox_id: result.provider_sandbox_id,
            payload_json: { message, blockers: result.blockers, warnings: result.warnings },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderCredentialGuardrailService;
