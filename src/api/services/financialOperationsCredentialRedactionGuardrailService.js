const crypto = require('crypto');

class FinancialOperationsCredentialRedactionGuardrailService {
    constructor() {
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluatePayload(credentialVaultId, payloadStr, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        
        let status = 'PASS';
        let blockers = [];
        let warnings = [];

        // Check for api-key-like patterns
        if (payloadStr.match(/sk_(live|test)_[a-zA-Z0-9]+/)) blockers.push('API_KEY_DETECTED');
        if (payloadStr.includes('-----BEGIN PRIVATE KEY-----')) blockers.push('PRIVATE_KEY_DETECTED');
        if (payloadStr.match(/Bearer [a-zA-Z0-9\-\._~+\/]+=*/)) blockers.push('BEARER_TOKEN_DETECTED');
        if (payloadStr.match(/whsec_[a-zA-Z0-9]+/)) blockers.push('WEBHOOK_SECRET_DETECTED');

        if (blockers.length > 0) {
            status = 'BLOCKED';
            await this._recordEvent('FINOPS_CREDENTIAL_EXPOSURE_BLOCKER_DETECTED', credentialVaultId, actor, `Exposure blockers: ${blockers.join(', ')}`);
        } else {
            await this._recordEvent('FINOPS_CREDENTIAL_REDACTION_GUARDRAILS_EVALUATED', credentialVaultId, actor, 'Payload evaluated. PASS.');
        }

        return { status, blockers, warnings };
    }

    async evaluateReadinessRecord(vault, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);

        let status = 'PASS';
        let blockers = [];
        let warnings = [];

        if (vault.credential_reference && !vault.credential_reference_hash) {
            warnings.push('CREDENTIAL_REFERENCE_HASH_MISSING');
        }

        if (warnings.length > 0) {
            if (status === 'PASS') status = 'WARNING';
            await this._recordEvent('FINOPS_CREDENTIAL_REDACTION_WARNING_RAISED', vault.credential_vault_id, actor, `Redaction warnings: ${warnings.join(', ')}`);
        }

        return { status, blockers, warnings };
    }

    async _recordEvent(eventType, vaultId, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            credential_vault_id: vaultId,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsCredentialRedactionGuardrailService;
