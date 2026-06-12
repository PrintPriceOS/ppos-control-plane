const crypto = require('crypto');

class FinancialOperationsProviderSlaReadinessService {
    constructor(sandboxService, contractService) {
        this.sandboxService = sandboxService;
        this.contractService = contractService;
        this._mockSlas = new Map();
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createSla(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sla = {
            id: crypto.randomUUID(),
            provider_sla_id: `psla_${crypto.randomUUID()}`,
            provider_contract_id: payload.providerContractId,
            provider_sandbox_id: payload.providerSandboxId || null,
            provider_key: payload.providerKey,
            provider_type: payload.providerType,
            sla_status: 'DRAFT',
            uptime_target: payload.uptimeTarget || null,
            response_time_target: payload.responseTimeTarget || null,
            incident_response_target: payload.incidentResponseTarget || null,
            support_hours: payload.supportHours || null,
            escalation_path_json: payload.escalationPath || [],
            monitoring_requirements_json: payload.monitoringRequirements || [],
            rollback_requirements_json: payload.rollbackRequirements || [],
            rate_limit_commitments_json: payload.rateLimitCommitments || [],
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockSlas.set(sla.provider_sla_id, sla);
        await this._recordEvent('FINOPS_PROVIDER_SLA_CREATED', sla, actor, 'Draft provider SLA readiness created');

        return sla;
    }

    async evaluateReadiness(providerSlaId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'SECURITY_ADMIN']);
        const sla = this._getSla(providerSlaId);
        
        let blockers = [];

        if (!sla.uptime_target) blockers.push('UPTIME_TARGET_MISSING');
        if (!sla.response_time_target) blockers.push('RESPONSE_TIME_TARGET_MISSING');
        if (!sla.incident_response_target) blockers.push('INCIDENT_RESPONSE_TARGET_MISSING');
        if (!sla.support_hours) blockers.push('SUPPORT_HOURS_MISSING');
        if (!sla.escalation_path_json || sla.escalation_path_json.length === 0) blockers.push('ESCALATION_PATH_MISSING');
        if (!sla.monitoring_requirements_json || sla.monitoring_requirements_json.length === 0) blockers.push('MONITORING_REQUIREMENTS_MISSING');
        if (!sla.rollback_requirements_json || sla.rollback_requirements_json.length === 0) blockers.push('ROLLBACK_REQUIREMENTS_MISSING');
        if (!sla.rate_limit_commitments_json || sla.rate_limit_commitments_json.length === 0) blockers.push('RATE_LIMIT_COMMITMENTS_MISSING');
        if (!sla.provider_contract_id) blockers.push('CONTRACT_NOT_LINKED');

        // Check linked contract readiness
        if (sla.provider_contract_id && this.contractService) {
            try {
                const c = this.contractService._getContract(sla.provider_contract_id);
                if (c.contract_status !== 'APPROVED_FOR_READINESS') {
                    blockers.push('CONTRACT_NOT_APPROVED');
                }
            } catch(e) {
                blockers.push('CONTRACT_RETRIEVAL_FAILED');
            }
        }

        // Verify Sandbox Constraints
        if (sla.provider_sandbox_id && this.sandboxService) {
            try {
                const sb = this.sandboxService._getSandbox(sla.provider_sandbox_id);
                if (sb.live_provider_connectivity_enabled) blockers.push('LIVE_PROVIDER_CONNECTIVITY_ENABLED');
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

        await this._recordEvent('FINOPS_PROVIDER_SLA_EVALUATED', sla, actor, `SLA evaluated. Status: ${result.status}`);
        return result;
    }

    _getSla(id) {
        const sla = this._mockSlas.get(id);
        if (!sla) throw new Error('Provider SLA not found');
        return sla;
    }

    async _recordEvent(eventType, sla, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            provider_contract_id: sla.provider_contract_id,
            provider_sla_id: sla.provider_sla_id,
            provider_sandbox_id: sla.provider_sandbox_id,
            provider_key: sla.provider_key,
            provider_type: sla.provider_type,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderSlaReadinessService;
