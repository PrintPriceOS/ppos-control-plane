const crypto = require('crypto');

class FinancialOperationsProviderContractReadinessService {
    constructor(sandboxService) {
        this.sandboxService = sandboxService;
        this._mockContracts = new Map();
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createContract(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const contract = {
            id: crypto.randomUUID(),
            provider_contract_id: `pcon_${crypto.randomUUID()}`,
            tenant_id: payload.tenantId || null,
            provider_sandbox_id: payload.providerSandboxId || null,
            provider_key: payload.providerKey,
            provider_type: payload.providerType,
            provider_name: payload.providerName,
            contract_status: 'DRAFT',
            contract_scope: payload.contractScope || null,
            contract_reference: payload.contractReference || null,
            contract_version: payload.contractVersion || null,
            legal_review_status: 'PENDING',
            finance_review_status: 'PENDING',
            security_review_status: 'PENDING',
            operations_review_status: 'PENDING',
            data_processing_review_status: 'PENDING',
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockContracts.set(contract.provider_contract_id, contract);
        await this._recordEvent('FINOPS_PROVIDER_CONTRACT_CREATED', contract, actor, 'Draft provider contract readiness created');

        return contract;
    }

    async evaluateReadiness(providerContractId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'SECURITY_ADMIN']);
        const contract = this._getContract(providerContractId);
        
        let blockers = [];

        if (!contract.contract_reference) blockers.push('CONTRACT_REFERENCE_MISSING');
        if (!contract.contract_version) blockers.push('CONTRACT_VERSION_MISSING');
        if (!contract.contract_scope) blockers.push('PROVIDER_SCOPE_MISSING');
        if (!contract.provider_sandbox_id) blockers.push('PROVIDER_SANDBOX_NOT_LINKED');

        if (contract.legal_review_status !== 'APPROVED') blockers.push('LEGAL_REVIEW_PENDING');
        if (contract.finance_review_status !== 'APPROVED') blockers.push('FINANCE_REVIEW_PENDING');
        if (contract.security_review_status !== 'APPROVED') blockers.push('SECURITY_REVIEW_PENDING');
        if (contract.operations_review_status !== 'APPROVED') blockers.push('OPERATIONS_REVIEW_PENDING');
        if (contract.data_processing_review_status !== 'APPROVED') blockers.push('DATA_PROCESSING_REVIEW_PENDING');

        // Verify Sandbox Constraints
        if (contract.provider_sandbox_id && this.sandboxService) {
            try {
                const sb = this.sandboxService._getSandbox(contract.provider_sandbox_id);
                if (sb.live_provider_connectivity_enabled) blockers.push('LIVE_PROVIDER_CONNECTIVITY_ENABLED');
                if (sb.live_credentials_present) blockers.push('LIVE_CREDENTIALS_PRESENT');
                if (sb.full_public_enabled) blockers.push('FULL_PUBLIC_ENABLED');
            } catch (err) {
                blockers.push('SANDBOX_RETRIEVAL_FAILED');
            }
        }

        if (globalConfig && globalConfig.full_public_enabled) {
            blockers.push('FULL_PUBLIC_ENABLED');
        }

        const result = {
            status: blockers.length > 0 ? 'BLOCKED' : 'READY',
            blockers
        };

        await this._recordEvent('FINOPS_PROVIDER_CONTRACT_EVALUATED', contract, actor, `Contract evaluated. Status: ${result.status}`);
        return result;
    }

    _getContract(id) {
        const contract = this._mockContracts.get(id);
        if (!contract) throw new Error('Provider contract not found');
        return contract;
    }

    async _recordEvent(eventType, contract, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            provider_contract_id: contract.provider_contract_id,
            provider_sandbox_id: contract.provider_sandbox_id,
            tenant_id: contract.tenant_id,
            provider_key: contract.provider_key,
            provider_type: contract.provider_type,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderContractReadinessService;
