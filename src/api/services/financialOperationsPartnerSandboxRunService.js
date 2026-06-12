const crypto = require('crypto');

class FinancialOperationsPartnerSandboxRunService {
    constructor(dependencies = {}) {
        this.accessService = dependencies.financialOperationsPartnerSandboxAccessService;
        this._mockRuns = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createRun({ sessionId, operationType, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'PARTNER_ADMIN']);

        // This enforces validation against active session, expiration, allowlist, and rate limit
        const session = this.accessService ? await this.accessService.validateAccess({ sessionId, operationType }) : null;
        if (!session && this.accessService) throw new Error('Session validation failed');

        const run = {
            id: crypto.randomUUID(),
            sandbox_run_id: `sbr_${crypto.randomUUID()}`,
            sandbox_session_id: sessionId,
            sandbox_id: session ? session.sandbox_id : 'sb_mock',
            tenant_id: session ? session.tenant_id : 't_mock',
            partner_id: session ? session.partner_id : 'p_mock',
            pilot_run_id: null,
            order_id: payload.order_id || null,
            invoice_id: payload.invoice_id || null,
            operation_type: operationType,
            run_status: 'CREATED',
            execution_mode: 'MOCK_PROVIDER', // Enforce local mock provider
            mock_provider_name: 'LOCAL_DETERMINISTIC_MOCK',
            amount: payload.amount || 0,
            currency: payload.currency || 'EUR',
            request_payload_json: payload,
            response_payload_json: null,
            blockers_json: [],
            warnings_json: [],
            evidence_json: {},
            source_snapshot_json: {},
            result_snapshot_json: null,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockRuns.push(run);

        await this._recordEvent({
            eventType: 'FINOPS_PARTNER_SANDBOX_RUN_CREATED',
            actor,
            sandbox_id: run.sandbox_id,
            sandbox_session_id: run.sandbox_session_id,
            sandbox_run_id: run.sandbox_run_id,
            tenant_id: run.tenant_id,
            partner_id: run.partner_id,
            message: `Sandbox run created for ${operationType}`
        });

        return run;
    }

    async executeMockProvider({ runId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'PARTNER_ADMIN']);

        const run = this._mockRuns.find(r => r.sandbox_run_id === runId);
        if (!run) throw new Error('Run not found');

        if (run.run_status !== 'CREATED' && run.run_status !== 'READY_FOR_MOCK_PROVIDER') {
            throw new Error('Run must be in CREATED or READY_FOR_MOCK_PROVIDER state');
        }

        if (run.execution_mode !== 'MOCK_PROVIDER' && run.execution_mode !== 'DRY_RUN' && run.execution_mode !== 'SANDBOX_ONLY') {
            throw new Error('Strict execution mode violation: Live execution attempted');
        }

        run.run_status = 'MOCK_PROVIDER_COMPLETED';
        
        // Deterministic local mock response
        run.response_payload_json = {
            status: 'success',
            provider_reference: `mock_${crypto.randomUUID()}`,
            simulated_at: new Date().toISOString(),
            note: 'This is a deterministic local mock response. No external API was called.'
        };

        run.result_snapshot_json = {
            mock_success: true,
            simulated_response_status: '200 OK'
        };

        run.completed_at = new Date().toISOString();
        run.completed_by = actor.userId;

        await this._recordEvent({
            eventType: 'FINOPS_PARTNER_SANDBOX_MOCK_PROVIDER_COMPLETED',
            actor,
            sandbox_id: run.sandbox_id,
            sandbox_session_id: run.sandbox_session_id,
            sandbox_run_id: run.sandbox_run_id,
            tenant_id: run.tenant_id,
            partner_id: run.partner_id,
            message: `Mock provider completed locally for ${run.operation_type}`
        });

        return run;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            sandbox_id: event.sandbox_id,
            sandbox_session_id: event.sandbox_session_id,
            sandbox_run_id: event.sandbox_run_id,
            tenant_id: event.tenant_id,
            partner_id: event.partner_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsPartnerSandboxRunService;
