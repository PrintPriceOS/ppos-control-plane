const crypto = require('crypto');

class FinancialOperationsPartnerSandboxAccessService {
    constructor(dependencies = {}) {
        this.sandboxService = dependencies.financialOperationsPartnerSandboxService;
        this._mockSessions = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createSession({ sandboxId, requestedOperations, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'PARTNER_ADMIN']);

        const sandbox = this.sandboxService ? this.sandboxService._mockSandboxes.find(s => s.sandbox_id === sandboxId) : null;
        if (!sandbox) throw new Error('Sandbox not found');

        if (sandbox.sandbox_status !== 'ACTIVE_SANDBOX') {
            throw new Error('Cannot create session: Sandbox is not active');
        }

        // Validate operations against sandbox allowlist
        for (const op of requestedOperations) {
            if (!sandbox.allowed_operation_types_json.includes(op)) {
                throw new Error(`Operation ${op} is not allowed in this sandbox`);
            }
        }

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour session

        const session = {
            id: crypto.randomUUID(),
            sandbox_session_id: `sbs_${crypto.randomUUID()}`,
            sandbox_id: sandboxId,
            tenant_id: sandbox.tenant_id,
            partner_id: sandbox.partner_id,
            session_status: 'ACTIVE',
            access_mode: 'MOCK_PROVIDER', // Defaults to mock provider for sandbox
            expires_at: expiresAt.toISOString(),
            allowed_operations_json: requestedOperations,
            rate_limit_snapshot_json: { requests_remaining: sandbox.max_requests_per_day },
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockSessions.push(session);

        await this._recordEvent({
            eventType: 'FINOPS_PARTNER_SANDBOX_SESSION_CREATED',
            actor,
            sandbox_id: sandboxId,
            sandbox_session_id: session.sandbox_session_id,
            tenant_id: session.tenant_id,
            partner_id: session.partner_id,
            message: `Sandbox session created with operations: ${requestedOperations.join(',')}`
        });

        return session;
    }

    async validateAccess({ sessionId, operationType }) {
        const session = this._mockSessions.find(s => s.sandbox_session_id === sessionId);
        if (!session) throw new Error('Session not found');

        if (session.session_status !== 'ACTIVE') {
            throw new Error(`Access blocked: Session is ${session.session_status}`);
        }

        if (new Date() > new Date(session.expires_at)) {
            session.session_status = 'EXPIRED';
            throw new Error('Access blocked: Session expired');
        }

        if (!session.allowed_operations_json.includes(operationType)) {
            throw new Error(`Access blocked: Operation ${operationType} not allowed in session`);
        }

        // Simple rate limiting mock
        if (session.rate_limit_snapshot_json.requests_remaining <= 0) {
            await this._recordEvent({
                eventType: 'FINOPS_PARTNER_SANDBOX_RATE_LIMIT_WARNING',
                actor: { role: 'SYSTEM', userId: 'system' },
                sandbox_id: session.sandbox_id,
                sandbox_session_id: sessionId,
                tenant_id: session.tenant_id,
                partner_id: session.partner_id,
                message: `Rate limit exceeded for session`
            });
            throw new Error('Access blocked: Rate limit exceeded');
        }

        session.rate_limit_snapshot_json.requests_remaining--;

        return session;
    }

    async revokeSession({ sessionId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const session = this._mockSessions.find(s => s.sandbox_session_id === sessionId);
        if (!session) throw new Error('Session not found');

        session.session_status = 'REVOKED';
        session.revoked_at = new Date().toISOString();
        session.revoked_by = actor.userId;

        await this._recordEvent({
            eventType: 'FINOPS_PARTNER_SANDBOX_SESSION_REVOKED',
            actor,
            sandbox_id: session.sandbox_id,
            sandbox_session_id: sessionId,
            tenant_id: session.tenant_id,
            partner_id: session.partner_id,
            message: `Sandbox session revoked manually`
        });

        return session;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            sandbox_id: event.sandbox_id,
            sandbox_session_id: event.sandbox_session_id,
            tenant_id: event.tenant_id,
            partner_id: event.partner_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsPartnerSandboxAccessService;
