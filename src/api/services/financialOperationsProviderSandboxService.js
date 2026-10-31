const crypto = require('crypto');

class FinancialOperationsProviderSandboxService {
    constructor() {
        this._mockSandboxes = new Map();
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createSandboxConfig(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const allowedProviderTypes = [
            'PAYMENT_PROVIDER', 'REFUND_PROVIDER', 'PAYOUT_PROVIDER',
            'BANKING_PROVIDER', 'ACCOUNTING_PROVIDER', 'E_INVOICING_PROVIDER', 'TAX_PROVIDER'
        ];

        if (!allowedProviderTypes.includes(payload.providerType)) {
            throw new Error(`Invalid provider type. Allowed: ${allowedProviderTypes.join(',')}`);
        }

        const sandbox = {
            id: crypto.randomUUID(),
            provider_sandbox_id: `psand_${crypto.randomUUID()}`,
            tenant_id: payload.tenantId || null,
            provider_key: payload.providerKey,
            provider_type: payload.providerType,
            provider_name: payload.providerName,
            sandbox_status: 'DRAFT',
            connectivity_mode: 'SANDBOX_ONLY',
            allowed_operation_types_json: payload.allowedOperations || [],
            blocked_operation_types_json: payload.blockedOperations || [],
            credentials_mode: 'ISOLATED_MOCK',
            credential_reference: payload.credentialReference || null,
            live_credentials_present: false,
            sandbox_credentials_present: payload.sandboxCredentialsPresent || false,
            live_provider_connectivity_enabled: false,
            sandbox_only: true,
            mock_provider_enabled: true,
            stubbed_provider_enabled: true,
            full_public_enabled: false,
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockSandboxes.set(sandbox.provider_sandbox_id, sandbox);

        await this._recordEvent('FINOPS_PROVIDER_SANDBOX_CREATED', sandbox, actor, 'Draft provider sandbox created');

        return sandbox;
    }

    async requestReview(providerSandboxId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const sandbox = this._getSandbox(providerSandboxId);

        if (sandbox.sandbox_status !== 'DRAFT') throw new Error('Must be DRAFT to request review');

        sandbox.sandbox_status = 'MANUAL_REVIEW_REQUIRED';
        await this._recordEvent('FINOPS_PROVIDER_SANDBOX_READY_FOR_REVIEW', sandbox, actor, 'Provider sandbox submitted for review');
        return sandbox;
    }

    async activateSandbox(providerSandboxId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const sandbox = this._getSandbox(providerSandboxId);

        if (sandbox.sandbox_status !== 'MANUAL_REVIEW_REQUIRED' && sandbox.sandbox_status !== 'SUSPENDED') {
            throw new Error('Must be in review or suspended to activate');
        }

        if (sandbox.live_provider_connectivity_enabled) {
            await this._recordEvent('FINOPS_PROVIDER_SANDBOX_WARNING_RAISED', sandbox, actor, 'Activation blocked: live_provider_connectivity_enabled is true');
            throw new Error('Cannot activate: live_provider_connectivity_enabled is true');
        }

        if (sandbox.live_credentials_present) {
            await this._recordEvent('FINOPS_PROVIDER_SANDBOX_WARNING_RAISED', sandbox, actor, 'Activation blocked: live_credentials_present is true');
            throw new Error('Cannot activate: live_credentials_present is true');
        }

        if (sandbox.full_public_enabled) {
            await this._recordEvent('FINOPS_PROVIDER_SANDBOX_WARNING_RAISED', sandbox, actor, 'Activation blocked: full_public_enabled is true');
            throw new Error('Cannot activate: full_public_enabled is true');
        }

        sandbox.sandbox_status = 'ACTIVE_SANDBOX';
        sandbox.activated_at = new Date().toISOString();
        sandbox.activated_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_SANDBOX_ACTIVATED', sandbox, actor, 'Provider sandbox activated');
        return sandbox;
    }

    async suspendSandbox(providerSandboxId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const sandbox = this._getSandbox(providerSandboxId);

        sandbox.sandbox_status = 'SUSPENDED';
        sandbox.suspended_at = new Date().toISOString();
        sandbox.suspended_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_SANDBOX_SUSPENDED', sandbox, actor, 'Provider sandbox suspended');
        return sandbox;
    }

    async revokeSandbox(providerSandboxId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const sandbox = this._getSandbox(providerSandboxId);

        sandbox.sandbox_status = 'REVOKED';
        sandbox.revoked_at = new Date().toISOString();
        sandbox.revoked_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_SANDBOX_REVOKED', sandbox, actor, 'Provider sandbox revoked');
        return sandbox;
    }

    async closeSandbox(providerSandboxId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN']);
        const sandbox = this._getSandbox(providerSandboxId);

        sandbox.sandbox_status = 'CLOSED';
        sandbox.closed_at = new Date().toISOString();
        sandbox.closed_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_SANDBOX_CLOSED', sandbox, actor, 'Provider sandbox closed');
        return sandbox;
    }

    _getSandbox(id) {
        const sandbox = this._mockSandboxes.get(id);
        if (!sandbox) throw new Error('Provider sandbox not found');
        return sandbox;
    }

    async _recordEvent(eventType, sandbox, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            provider_sandbox_id: sandbox.provider_sandbox_id,
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

module.exports = FinancialOperationsProviderSandboxService;
