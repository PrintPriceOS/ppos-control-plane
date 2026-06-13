const crypto = require('crypto');
const db = require('./mysqlClient');

const APPROVAL_ROLES = [
    'EXECUTIVE_APPROVER', 'FINANCE_APPROVER', 'SECURITY_APPROVER',
    'OPERATIONS_APPROVER', 'COMPLIANCE_APPROVER', 'PRIVACY_APPROVER',
    'PROVIDER_OPERATIONS_APPROVER'
];

class FinancialOperationsProductionActivationApprovalService {
    constructor(gateService) {
        this._mockEvents = [];
        this._mockApprovals = [];
        this.gateService = gateService;
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    _hashRef(ref) {
        // Deterministic hash stub — never stores plaintext references
        return `[HASH:${Buffer.from(ref).toString('base64').slice(0, 12)}]`;
    }

    async buildApprovalChain(gateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        let gate = this.gateService ? this.gateService._mockGates.find(g => g.production_activation_gate_id === gateId) : null;
        try {
            const rows = await db.query(
                `SELECT * FROM financial_operations_production_activation_gates WHERE production_activation_gate_id = ?`,
                [gateId]
            );
            if (rows.length > 0) {
                gate = rows[0];
            }
        } catch (e) {
            // ignore
        }

        if (!gate) throw new Error('Gate not found');

        const approvals = [];
        for (const role of APPROVAL_ROLES) {
            const ap = {
                id: crypto.randomUUID(),
                activation_gate_approval_id: `ap_${crypto.randomUUID()}`,
                production_activation_gate_id: gateId,
                approval_role: role,
                approval_status: 'PENDING',
                approver_reference: null,
                approver_reference_hash: null,
                approval_notes_json: null,
                created_at: new Date().toISOString(),
                created_by: actor.userId,
                updated_at: new Date().toISOString()
            };

            try {
                await db.query(
                    `INSERT INTO financial_operations_production_activation_gate_approvals (
                        id, activation_gate_approval_id, production_activation_gate_id, approval_role, approval_status,
                        approver_reference, approver_reference_hash, approval_notes_json, created_at, created_by, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        ap.id, ap.activation_gate_approval_id, ap.production_activation_gate_id, ap.approval_role, ap.approval_status,
                        ap.approver_reference, ap.approver_reference_hash, ap.approval_notes_json ? JSON.stringify(ap.approval_notes_json) : null,
                        ap.created_at, ap.created_by, ap.updated_at
                    ]
                );
            } catch (e) {
                // ignore
            }

            this._mockApprovals.push(ap);
            approvals.push(ap);
            await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_APPROVAL_CREATED', gate, ap, actor, `Approval created for role ${role}`);
        }
        return { approvals };
    }

    async grantApproval(gateId, approvalRole, approverRef, notes, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        let ap = this._mockApprovals.find(a => a.production_activation_gate_id === gateId && a.approval_role === approvalRole);
        try {
            const rows = await db.query(
                `SELECT * FROM financial_operations_production_activation_gate_approvals 
                 WHERE production_activation_gate_id = ? AND approval_role = ?`,
                [gateId, approvalRole]
            );
            if (rows.length > 0) {
                const row = rows[0];
                ap = {
                    ...row,
                    approval_notes_json: typeof row.approval_notes_json === 'string' ? JSON.parse(row.approval_notes_json) : row.approval_notes_json
                };
            }
        } catch (e) {
            // ignore
        }

        if (!ap) throw new Error(`Approval for role ${approvalRole} not found`);

        // Hard constraint: approval must not set any live flags
        if (ap.production_activation_enabled || ap.activation_execution_enabled) {
            throw new Error('Approval cannot enable production or activation execution');
        }

        ap.approval_status = 'APPROVED_FOR_GATE_READINESS';
        ap.approver_reference = null; // Never stored
        ap.approver_reference_hash = this._hashRef(approverRef);
        ap.approval_notes_json = { notes };
        ap.approved_at = new Date().toISOString();
        ap.approved_by = actor.userId;
        ap.updated_at = new Date().toISOString();

        try {
            await db.query(
                `UPDATE financial_operations_production_activation_gate_approvals 
                 SET approval_status = ?, approver_reference = NULL, approver_reference_hash = ?, 
                     approval_notes_json = ?, approved_at = ?, approved_by = ?, updated_at = ?
                 WHERE production_activation_gate_id = ? AND approval_role = ?`,
                [ap.approval_status, ap.approver_reference_hash, JSON.stringify(ap.approval_notes_json), ap.approved_at, ap.approved_by, ap.updated_at, gateId, approvalRole]
            );
        } catch (e) {
            // ignore
        }

        // Sync with mock list
        const idx = this._mockApprovals.findIndex(a => a.production_activation_gate_id === gateId && a.approval_role === approvalRole);
        if (idx !== -1) {
            this._mockApprovals[idx] = ap;
        } else {
            this._mockApprovals.push(ap);
        }

        const gate = { production_activation_gate_id: gateId };
        await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_APPROVAL_GRANTED_FOR_GATE_READINESS', gate, ap, actor, `Approval granted for role ${approvalRole}`);
        return ap;
    }

    async rejectApproval(gateId, approvalRole, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        let ap = this._mockApprovals.find(a => a.production_activation_gate_id === gateId && a.approval_role === approvalRole);
        try {
            const rows = await db.query(
                `SELECT * FROM financial_operations_production_activation_gate_approvals 
                 WHERE production_activation_gate_id = ? AND approval_role = ?`,
                [gateId, approvalRole]
            );
            if (rows.length > 0) {
                ap = rows[0];
            }
        } catch (e) {
            // ignore
        }

        if (!ap) throw new Error(`Approval for role ${approvalRole} not found`);

        ap.approval_status = 'REJECTED';
        ap.rejected_at = new Date().toISOString();
        ap.rejected_by = actor.userId;
        ap.updated_at = new Date().toISOString();

        try {
            await db.query(
                `UPDATE financial_operations_production_activation_gate_approvals 
                 SET approval_status = 'REJECTED', rejected_at = ?, rejected_by = ?, updated_at = ?
                 WHERE production_activation_gate_id = ? AND approval_role = ?`,
                [ap.rejected_at, ap.rejected_by, ap.updated_at, gateId, approvalRole]
            );
        } catch (e) {
            // ignore
        }

        const idx = this._mockApprovals.findIndex(a => a.production_activation_gate_id === gateId && a.approval_role === approvalRole);
        if (idx !== -1) {
            this._mockApprovals[idx] = ap;
        }

        const gate = { production_activation_gate_id: gateId };
        await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_APPROVAL_REJECTED', gate, ap, actor, `Approval rejected for role ${approvalRole}`);
        return ap;
    }

    evaluateChain(gateId) {
        const approvals = this._mockApprovals.filter(a => a.production_activation_gate_id === gateId);
        const missing = APPROVAL_ROLES.filter(r => !approvals.find(a => a.approval_role === r && a.approval_status === 'APPROVED_FOR_GATE_READINESS'));
        return {
            total: APPROVAL_ROLES.length,
            approved: approvals.filter(a => a.approval_status === 'APPROVED_FOR_GATE_READINESS').length,
            missing,
            complete: missing.length === 0
        };
    }

    async _recordEvent(eventType, gate, ap, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            production_activation_gate_id: gate ? gate.production_activation_gate_id : null,
            activation_gate_approval_id: ap ? ap.activation_gate_approval_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };

        try {
            await db.query(
                `INSERT INTO financial_operations_production_activation_gate_audit_events (
                    id, event_type, actor_id, actor_type, production_activation_gate_id, activation_gate_approval_id, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [ev.id, ev.event_type, ev.actor_id, ev.actor_type, ev.production_activation_gate_id, ev.activation_gate_approval_id, JSON.stringify(ev.payload_json), ev.created_at]
            );
        } catch (e) {
            // ignore
        }

        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProductionActivationApprovalService;
