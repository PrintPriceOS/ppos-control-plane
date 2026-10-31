const crypto = require('crypto');

class FinancialOperationsReleaseApprovalService {
    constructor(dependencies = {}) {
        this.evaluatorService = dependencies.financialOperationsReleaseGateEvaluatorService;
        this._mockApprovals = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async getGate(gateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const gate = this.evaluatorService._mockGates.find(g => g.release_gate_id === gateId);
        if (!gate) throw new Error('Release gate not found');
        return gate;
    }

    async executeAction({ gateId, actionType, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const gate = await this.getGate(gateId, actor);

        let message = '';

        switch (actionType) {
            case 'REQUEST_APPROVAL':
                if (gate.gate_status !== 'READY_FOR_APPROVAL') throw new Error('Gate is not ready for approval');
                message = 'Release approval requested';
                break;
            case 'APPROVE_CONTROLLED_RELEASE':
                if (gate.gate_status !== 'READY_FOR_APPROVAL') throw new Error('Gate is not ready for approval');
                gate.gate_status = 'APPROVED_FOR_CONTROLLED_RELEASE';
                gate.current_approvals++;
                gate.approved_at = new Date().toISOString();
                gate.approved_by = actor.userId;

                this._mockApprovals.push({
                    id: crypto.randomUUID(),
                    release_gate_id: gateId,
                    approval_id: `app_${crypto.randomUUID()}`,
                    approver_id: actor.userId,
                    approver_role: actor.role,
                    approval_status: 'APPROVED',
                    created_at: new Date().toISOString()
                });

                message = 'Gate approved for controlled release eligibility ONLY. No execution occurred.';
                break;
            case 'REJECT_CONTROLLED_RELEASE':
                gate.gate_status = 'BLOCKED';
                gate.blocked_at = new Date().toISOString();
                gate.blocked_by = actor.userId;
                message = `Release rejected. Reason: ${payload?.reason || 'No reason provided'}`;
                break;
            case 'REVOKE_APPROVAL':
                if (gate.gate_status !== 'APPROVED_FOR_CONTROLLED_RELEASE') throw new Error('Cannot revoke a gate that is not approved');
                gate.gate_status = 'REVOKED';
                gate.revoked_at = new Date().toISOString();
                gate.revoked_by = actor.userId;
                message = `Approval revoked. Reason: ${payload?.reason || 'No reason provided'}`;
                break;
            case 'BLOCK_RELEASE':
                gate.gate_status = 'BLOCKED';
                gate.blocked_at = new Date().toISOString();
                gate.blocked_by = actor.userId;
                message = `Release blocked manually. Reason: ${payload?.reason || 'No reason provided'}`;
                break;
            case 'UNBLOCK_AFTER_REVIEW':
                if (gate.gate_status !== 'BLOCKED') throw new Error('Gate is not blocked');
                if (!payload || !payload.evidence) throw new Error('Unblocking requires evidence');
                gate.gate_status = 'READY_FOR_APPROVAL'; // Return to ready state
                message = `Release unblocked after review. Evidence: ${payload.evidence}`;
                break;
            case 'ADD_APPROVAL_NOTE':
                if (!payload || !payload.note) throw new Error('Note required');
                message = `Approval note added: ${payload.note}`;
                break;
            case 'ADD_RELEASE_RISK_NOTE':
                if (!payload || !payload.note) throw new Error('Note required');
                message = `Release risk note added: ${payload.note}`;
                break;
            default:
                throw new Error('Invalid actionType');
        }

        await this._recordEvent({
            eventType: `FINOPS_RELEASE_${actionType}`,
            actor,
            release_gate_id: gateId,
            readiness_run_id: gate.readiness_run_id,
            tenant_id: gate.tenant_id,
            message
        });

        return gate;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            release_gate_id: event.release_gate_id,
            readiness_run_id: event.readiness_run_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsReleaseApprovalService;
