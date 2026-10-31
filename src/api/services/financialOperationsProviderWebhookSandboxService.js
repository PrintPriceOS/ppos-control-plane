const crypto = require('crypto');

class FinancialOperationsProviderWebhookSandboxService {
    constructor() {
        this._mockSandboxes = new Map();
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createWebhookSandboxReadiness(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sandbox = {
            id: crypto.randomUUID(),
            webhook_sandbox_id: `wsbox_${crypto.randomUUID()}`,
            tenant_id: payload.tenantId || null,
            provider_sandbox_id: payload.providerSandboxId || null,
            credential_vault_id: payload.credentialVaultId || null,
            provider_contract_id: payload.providerContractId || null,
            provider_sla_id: payload.providerSlaId || null,
            provider_key: payload.providerKey,
            provider_type: payload.providerType,
            provider_name: payload.providerName,
            webhook_status: 'DRAFT',
            webhook_scope: payload.webhookScope || 'DEFAULT',
            webhook_mode: payload.webhookMode || 'MOCK_WEBHOOK',
            endpoint_mode: payload.endpointMode || 'LOCAL_SIMULATION',
            endpoint_reference: payload.endpointReference || null,
            endpoint_reference_hash: payload.endpointReferenceHash || null,
            live_endpoint_enabled: payload.liveEndpointEnabled || false,
            sandbox_endpoint_enabled: payload.sandboxEndpointEnabled !== undefined ? payload.sandboxEndpointEnabled : true,
            mock_webhook_enabled: true,
            stubbed_webhook_enabled: true,
            live_signing_secret_present: payload.liveSigningSecretPresent || false,
            sandbox_signing_secret_present: payload.sandboxSigningSecretPresent || false,
            signature_validation_mode: payload.signatureValidationMode || 'MOCK_ONLY',
            redaction_required: payload.redactionRequired !== undefined ? payload.redactionRequired : true,
            replay_protection_required: payload.replayProtectionRequired !== undefined ? payload.replayProtectionRequired : true,
            idempotency_required: payload.idempotencyRequired !== undefined ? payload.idempotencyRequired : true,
            live_provider_connectivity_enabled: payload.liveProviderConnectivityEnabled || false,
            full_public_enabled: payload.fullPublicEnabled || false,
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockSandboxes.set(sandbox.webhook_sandbox_id, sandbox);
        await this._recordEvent('FINOPS_PROVIDER_WEBHOOK_SANDBOX_CREATED', sandbox, actor, 'Draft webhook sandbox readiness created');

        return sandbox;
    }

    async evaluateReadiness(webhookSandboxId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const sandbox = this._getSandbox(webhookSandboxId);
        
        let blockers = [];

        if (sandbox.live_endpoint_enabled) blockers.push('LIVE_ENDPOINT_ENABLED');
        if (sandbox.live_signing_secret_present) blockers.push('LIVE_SIGNING_SECRET_PRESENT');
        if (sandbox.live_provider_connectivity_enabled) blockers.push('LIVE_PROVIDER_CONNECTIVITY_ENABLED');
        if (sandbox.full_public_enabled) blockers.push('FULL_PUBLIC_ENABLED');
        if (!sandbox.redaction_required) blockers.push('REDACTION_NOT_REQUIRED');
        if (!sandbox.replay_protection_required) blockers.push('REPLAY_PROTECTION_NOT_REQUIRED');
        if (!sandbox.idempotency_required) blockers.push('IDEMPOTENCY_NOT_REQUIRED');

        if (globalConfig && globalConfig.full_public_enabled) {
            blockers.push('GLOBAL_FULL_PUBLIC_ENABLED');
        }

        const validModes = ['MOCK_WEBHOOK', 'STUBBED_WEBHOOK', 'SANDBOX_EVENT', 'DRY_RUN_EVENT', 'SIMULATION_ONLY', 'WEBHOOK_READINESS_ONLY'];
        if (!validModes.includes(sandbox.webhook_mode)) {
            blockers.push('INVALID_WEBHOOK_MODE');
        }

        const result = {
            status: blockers.length > 0 ? 'BLOCKED' : 'READY',
            blockers
        };

        await this._recordEvent('FINOPS_PROVIDER_WEBHOOK_SANDBOX_EVALUATED', sandbox, actor, `Webhook sandbox evaluated. Status: ${result.status}`);
        return result;
    }

    async approveWebhookSandboxReadiness(webhookSandboxId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const sandbox = this._getSandbox(webhookSandboxId);

        const evalResult = await this.evaluateReadiness(webhookSandboxId, globalConfig, actor);
        if (evalResult.status === 'BLOCKED') {
            throw new Error(`Cannot approve webhook sandbox readiness. Blockers: ${evalResult.blockers.join(', ')}`);
        }

        sandbox.webhook_status = 'APPROVED_FOR_READINESS';
        sandbox.activated_at = new Date().toISOString();
        sandbox.activated_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_WEBHOOK_SANDBOX_APPROVED_FOR_READINESS', sandbox, actor, 'Webhook sandbox approved for readiness');
        return sandbox;
    }

    _getSandbox(id) {
        const sandbox = this._mockSandboxes.get(id);
        if (!sandbox) throw new Error('Webhook sandbox not found');
        return sandbox;
    }

    async _recordEvent(eventType, sandbox, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            webhook_sandbox_id: sandbox.webhook_sandbox_id,
            credential_vault_id: sandbox.credential_vault_id,
            provider_sandbox_id: sandbox.provider_sandbox_id,
            provider_contract_id: sandbox.provider_contract_id,
            tenant_id: sandbox.tenant_id,
            provider_key: sandbox.provider_key,
            provider_type: sandbox.provider_type,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderWebhookSandboxService;
