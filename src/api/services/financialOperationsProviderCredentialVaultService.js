const crypto = require('crypto');

class FinancialOperationsProviderCredentialVaultService {
    constructor() {
        this._mockVaults = new Map();
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createVaultReadiness(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const vault = {
            id: crypto.randomUUID(),
            credential_vault_id: `cvault_${crypto.randomUUID()}`,
            tenant_id: payload.tenantId || null,
            provider_contract_id: payload.providerContractId || null,
            provider_sla_id: payload.providerSlaId || null,
            provider_sandbox_id: payload.providerSandboxId || null,
            provider_key: payload.providerKey,
            provider_type: payload.providerType,
            provider_name: payload.providerName,
            vault_status: 'DRAFT',
            vault_scope: payload.vaultScope || 'DEFAULT',
            credential_mode: payload.credentialMode || 'MOCK_SECRET',
            credential_reference: payload.credentialReference || null,
            credential_reference_hash: payload.credentialReferenceHash || null,
            secret_material_present: payload.secretMaterialPresent || false,
            live_credentials_present: payload.liveCredentialsPresent || false,
            sandbox_credentials_present: payload.sandboxCredentialsPresent || false,
            mock_secret_enabled: true,
            stubbed_secret_enabled: true,
            redaction_required: payload.redactionRequired !== undefined ? payload.redactionRequired : true,
            rotation_required: payload.rotationRequired !== undefined ? payload.rotationRequired : true,
            live_provider_connectivity_enabled: payload.liveProviderConnectivityEnabled || false,
            full_public_enabled: payload.fullPublicEnabled || false,
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockVaults.set(vault.credential_vault_id, vault);
        await this._recordEvent('FINOPS_PROVIDER_CREDENTIAL_VAULT_CREATED', vault, actor, 'Draft provider credential vault readiness created');

        return vault;
    }

    async evaluateReadiness(credentialVaultId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const vault = this._getVault(credentialVaultId);
        
        let blockers = [];

        if (vault.secret_material_present) blockers.push('SECRET_MATERIAL_PRESENT');
        if (vault.live_credentials_present) blockers.push('LIVE_CREDENTIALS_PRESENT');
        if (vault.live_provider_connectivity_enabled) blockers.push('LIVE_PROVIDER_CONNECTIVITY_ENABLED');
        if (vault.full_public_enabled) blockers.push('FULL_PUBLIC_ENABLED');
        if (!vault.redaction_required) blockers.push('REDACTION_NOT_REQUIRED');

        if (globalConfig && globalConfig.full_public_enabled) {
            blockers.push('GLOBAL_FULL_PUBLIC_ENABLED');
        }

        const validModes = ['MOCK_SECRET', 'STUBBED_SECRET', 'SANDBOX_REFERENCE', 'REDACTED_REFERENCE', 'VAULT_READINESS_ONLY'];
        if (!validModes.includes(vault.credential_mode)) {
            blockers.push('INVALID_CREDENTIAL_MODE');
        }

        const result = {
            status: blockers.length > 0 ? 'BLOCKED' : 'READY',
            blockers
        };

        await this._recordEvent('FINOPS_PROVIDER_CREDENTIAL_VAULT_EVALUATED', vault, actor, `Vault evaluated. Status: ${result.status}`);
        return result;
    }

    async approveVaultReadiness(credentialVaultId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const vault = this._getVault(credentialVaultId);

        const evalResult = await this.evaluateReadiness(credentialVaultId, globalConfig, actor);
        if (evalResult.status === 'BLOCKED') {
            throw new Error(`Cannot approve vault readiness. Blockers: ${evalResult.blockers.join(', ')}`);
        }

        vault.vault_status = 'APPROVED_FOR_READINESS';
        vault.activated_at = new Date().toISOString();
        vault.activated_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_CREDENTIAL_VAULT_APPROVED_FOR_READINESS', vault, actor, 'Vault approved for readiness');
        return vault;
    }

    _getVault(id) {
        const vault = this._mockVaults.get(id);
        if (!vault) throw new Error('Provider credential vault not found');
        return vault;
    }

    async _recordEvent(eventType, vault, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            credential_vault_id: vault.credential_vault_id,
            provider_contract_id: vault.provider_contract_id,
            provider_sandbox_id: vault.provider_sandbox_id,
            tenant_id: vault.tenant_id,
            provider_key: vault.provider_key,
            provider_type: vault.provider_type,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderCredentialVaultService;
