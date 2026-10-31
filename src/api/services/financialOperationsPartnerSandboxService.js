const crypto = require('crypto');

class FinancialOperationsPartnerSandboxService {
    constructor() {
        this._mockSandboxes = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createDraftSandbox({ sandboxName, tenantId, partnerId, partnerType, allowedOperations, maxOrders, maxTotalAmount, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sandbox = {
            id: crypto.randomUUID(),
            sandbox_id: `sb_${crypto.randomUUID()}`,
            tenant_id: tenantId,
            partner_id: partnerId || null,
            partner_type: partnerType || 'PRINTHOUSE',
            sandbox_name: sandboxName,
            sandbox_status: 'DRAFT',
            sandbox_scope: partnerId ? 'PARTNER' : 'TENANT',
            allowed_operation_types_json: allowedOperations || [],
            blocked_operation_types_json: [],
            max_requests_per_day: 1000,
            max_orders: maxOrders || 100,
            max_invoices: 100,
            max_total_amount: maxTotalAmount || 10000.00,
            currency: 'EUR',
            requires_manual_approval: true,
            sandbox_only: true, // strictly enforced
            mock_provider_enabled: true, // strictly enforced
            external_execution_enabled: false, // strictly enforced
            full_public_enabled: false, // strictly enforced
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockSandboxes.push(sandbox);

        await this._recordEvent({
            eventType: 'FINOPS_PARTNER_SANDBOX_CREATED',
            actor,
            sandbox_id: sandbox.sandbox_id,
            tenant_id: sandbox.tenant_id,
            partner_id: sandbox.partner_id,
            message: `Draft partner sandbox created: ${sandboxName}`
        });

        return sandbox;
    }

    async requestReview({ sandboxId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const sandbox = this._mockSandboxes.find(s => s.sandbox_id === sandboxId);
        if (!sandbox) throw new Error('Sandbox not found');
        if (sandbox.sandbox_status !== 'DRAFT') throw new Error('Only draft sandboxes can be submitted for review');

        sandbox.sandbox_status = 'MANUAL_REVIEW_REQUIRED';

        await this._recordEvent({
            eventType: 'FINOPS_PARTNER_SANDBOX_READY_FOR_REVIEW',
            actor,
            sandbox_id: sandbox.sandbox_id,
            tenant_id: sandbox.tenant_id,
            partner_id: sandbox.partner_id,
            message: `Partner sandbox submitted for manual review`
        });

        return sandbox;
    }

    async activateSandbox({ sandboxId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const sandbox = this._mockSandboxes.find(s => s.sandbox_id === sandboxId);
        if (!sandbox) throw new Error('Sandbox not found');
        if (sandbox.sandbox_status !== 'MANUAL_REVIEW_REQUIRED') throw new Error('Sandbox must be reviewed before activation');

        if (sandbox.external_execution_enabled === true) {
            throw new Error('Cannot activate: external execution must be disabled');
        }
        if (sandbox.full_public_enabled === true) {
            throw new Error('Cannot activate: FULL_PUBLIC must be disabled');
        }
        if (sandbox.sandbox_only !== true) {
            throw new Error('Cannot activate: sandbox_only must be true');
        }

        sandbox.sandbox_status = 'ACTIVE_SANDBOX';
        sandbox.activated_at = new Date().toISOString();
        sandbox.activated_by = actor.userId;

        await this._recordEvent({
            eventType: 'FINOPS_PARTNER_SANDBOX_ACTIVATED',
            actor,
            sandbox_id: sandbox.sandbox_id,
            tenant_id: sandbox.tenant_id,
            partner_id: sandbox.partner_id,
            message: `Partner sandbox activated in SANDBOX_ONLY mode`
        });

        return sandbox;
    }

    async suspendSandbox({ sandboxId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const sandbox = this._mockSandboxes.find(s => s.sandbox_id === sandboxId);
        if (!sandbox) throw new Error('Sandbox not found');
        
        sandbox.sandbox_status = 'SUSPENDED';
        sandbox.suspended_at = new Date().toISOString();
        sandbox.suspended_by = actor.userId;

        await this._recordEvent({
            eventType: 'FINOPS_PARTNER_SANDBOX_SUSPENDED',
            actor,
            sandbox_id: sandbox.sandbox_id,
            tenant_id: sandbox.tenant_id,
            partner_id: sandbox.partner_id,
            message: `Partner sandbox suspended`
        });

        return sandbox;
    }

    async checkEligibility({ sandboxId, operationType }) {
        const sandbox = this._mockSandboxes.find(s => s.sandbox_id === sandboxId);
        if (!sandbox) throw new Error('Sandbox not found');
        if (sandbox.sandbox_status !== 'ACTIVE_SANDBOX') throw new Error('Sandbox is not active');

        if (!sandbox.allowed_operation_types_json.includes(operationType)) {
            throw new Error(`Operation type ${operationType} is not allowed in this sandbox`);
        }

        return true;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            sandbox_id: event.sandbox_id,
            tenant_id: event.tenant_id,
            partner_id: event.partner_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsPartnerSandboxService;
