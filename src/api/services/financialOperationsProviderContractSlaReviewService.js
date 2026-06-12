const crypto = require('crypto');

class FinancialOperationsProviderContractSlaReviewService {
    constructor(contractReadinessService, slaReadinessService) {
        this.contractService = contractReadinessService;
        this.slaService = slaReadinessService;
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async performContractReviewAction(providerContractId, actionType, payload, globalConfig, actor) {
        const contract = this.contractService._getContract(providerContractId);

        switch (actionType) {
            case 'MARK_READY_FOR_REVIEW':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
                contract.contract_status = 'READY_FOR_REVIEW';
                break;
            case 'MARK_LEGAL_REVIEWED':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'LEGAL_ADMIN']);
                contract.legal_review_status = 'APPROVED';
                break;
            case 'MARK_FINANCE_REVIEWED':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'FINANCE_ADMIN']);
                contract.finance_review_status = 'APPROVED';
                break;
            case 'MARK_SECURITY_REVIEWED':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
                contract.security_review_status = 'APPROVED';
                break;
            case 'MARK_OPERATIONS_REVIEWED':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'OPERATIONS_ADMIN']);
                contract.operations_review_status = 'APPROVED';
                break;
            case 'MARK_DATA_PROCESSING_REVIEWED':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'PRIVACY_ADMIN']);
                contract.data_processing_review_status = 'APPROVED';
                break;
            case 'APPROVE_CONTRACT_FOR_READINESS':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
                const evalResult = await this.contractService.evaluateReadiness(providerContractId, globalConfig, actor);
                if (evalResult.status === 'BLOCKED') {
                    throw new Error(`Cannot approve contract readiness. Blockers: ${evalResult.blockers.join(', ')}`);
                }
                contract.contract_status = 'APPROVED_FOR_READINESS';
                contract.approved_at = new Date().toISOString();
                contract.approved_by = actor.userId;
                await this._recordEvent('FINOPS_PROVIDER_CONTRACT_READINESS_APPROVED', { provider_contract_id: providerContractId }, actor, 'Contract approved for readiness');
                return contract;
            case 'REJECT_CONTRACT':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
                contract.contract_status = 'REJECTED';
                contract.rejected_at = new Date().toISOString();
                contract.rejected_by = actor.userId;
                break;
            case 'REVOKE_CONTRACT_READINESS':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
                contract.contract_status = 'REVOKED';
                contract.revoked_at = new Date().toISOString();
                contract.revoked_by = actor.userId;
                await this._recordEvent('FINOPS_PROVIDER_CONTRACT_READINESS_REVOKED', { provider_contract_id: providerContractId }, actor, 'Contract readiness revoked');
                return contract;
            case 'ADD_REVIEW_NOTE':
                await this._recordEvent('FINOPS_PROVIDER_CONTRACT_SLA_REVIEW_NOTE_ADDED', { provider_contract_id: providerContractId }, actor, payload.note);
                return contract;
            default:
                throw new Error('Unknown action type');
        }

        await this._recordEvent('FINOPS_PROVIDER_CONTRACT_SLA_REVIEW_ACTION_RECORDED', { provider_contract_id: providerContractId }, actor, `Contract action: ${actionType}`);
        return contract;
    }

    async performSlaReviewAction(providerSlaId, actionType, payload, globalConfig, actor) {
        const sla = this.slaService._getSla(providerSlaId);

        switch (actionType) {
            case 'MARK_READY_FOR_REVIEW':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
                sla.sla_status = 'READY_FOR_REVIEW';
                break;
            case 'APPROVE_SLA_FOR_READINESS':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
                const evalResult = await this.slaService.evaluateReadiness(providerSlaId, globalConfig, actor);
                if (evalResult.status === 'BLOCKED') {
                    throw new Error(`Cannot approve SLA readiness. Blockers: ${evalResult.blockers.join(', ')}`);
                }
                sla.sla_status = 'APPROVED_FOR_READINESS';
                sla.approved_at = new Date().toISOString();
                sla.approved_by = actor.userId;
                await this._recordEvent('FINOPS_PROVIDER_SLA_READINESS_APPROVED', { provider_sla_id: providerSlaId }, actor, 'SLA approved for readiness');
                return sla;
            case 'REJECT_SLA':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
                sla.sla_status = 'REJECTED';
                break;
            case 'REVOKE_SLA_READINESS':
                this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
                sla.sla_status = 'REVOKED';
                sla.revoked_at = new Date().toISOString();
                sla.revoked_by = actor.userId;
                await this._recordEvent('FINOPS_PROVIDER_SLA_READINESS_REVOKED', { provider_sla_id: providerSlaId }, actor, 'SLA readiness revoked');
                return sla;
            case 'ADD_REVIEW_NOTE':
                await this._recordEvent('FINOPS_PROVIDER_CONTRACT_SLA_REVIEW_NOTE_ADDED', { provider_sla_id: providerSlaId }, actor, payload.note);
                return sla;
            case 'DISMISS_WARNING':
                await this._recordEvent('FINOPS_PROVIDER_CONTRACT_SLA_REVIEW_ACTION_RECORDED', { provider_sla_id: providerSlaId }, actor, `Warning dismissed: ${payload.reason}`);
                return sla;
            default:
                throw new Error('Unknown action type');
        }

        await this._recordEvent('FINOPS_PROVIDER_CONTRACT_SLA_REVIEW_ACTION_RECORDED', { provider_sla_id: providerSlaId }, actor, `SLA action: ${actionType}`);
        return sla;
    }

    async _recordEvent(eventType, entity, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            provider_contract_id: entity.provider_contract_id || null,
            provider_sla_id: entity.provider_sla_id || null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderContractSlaReviewService;
