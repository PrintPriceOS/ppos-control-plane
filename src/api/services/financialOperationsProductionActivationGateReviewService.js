const crypto = require('crypto');
const db = require('./mysqlClient');

class FinancialOperationsProductionActivationGateReviewService {
    constructor(gateService) {
        this._mockEvents = [];
        this.gateService = gateService;
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async approveForFutureActivationReview(gateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        let gate = this.gateService ? this.gateService._mockGates.find(g => g.production_activation_gate_id === gateId) : null;
        
        try {
            const rows = await db.query(
                `SELECT * FROM financial_operations_production_activation_gates WHERE production_activation_gate_id = ?`,
                [gateId]
            );
            if (rows.length > 0) {
                const row = rows[0];
                gate = { ...row };
                // Parse JSON fields safely
                for (const k of ['blockers_json', 'warnings_json', 'evidence_json']) {
                    if (typeof gate[k] === 'string') {
                        gate[k] = JSON.parse(gate[k]);
                    }
                }
            }
        } catch (e) {
            // ignore
        }

        if (!gate) throw new Error('Gate not found');

        if (gate.activation_gate_status !== 'APPROVED_FOR_FUTURE_ACTIVATION_REVIEW') {
            throw new Error(`Cannot approve gate in status ${gate.activation_gate_status}`);
        }

        // Hard assertion: approval must never set production flags
        gate.production_activation_enabled = false;
        gate.activation_execution_enabled = false;
        gate.full_public_enabled = false;

        gate.approved_at = new Date().toISOString();
        gate.approved_by = actor.userId;

        try {
            await db.query(
                `UPDATE financial_operations_production_activation_gates 
                 SET approved_at = ?, approved_by = ?, production_activation_enabled = 0, activation_execution_enabled = 0, full_public_enabled = 0, updated_at = ?
                 WHERE production_activation_gate_id = ?`,
                [gate.approved_at, gate.approved_by, new Date().toISOString(), gateId]
            );
        } catch (e) {
            // ignore
        }

        // Sync with mock service
        if (this.gateService) {
            const idx = this.gateService._mockGates.findIndex(g => g.production_activation_gate_id === gateId);
            if (idx !== -1) {
                this.gateService._mockGates[idx] = gate;
            } else {
                this.gateService._mockGates.push(gate);
            }
        }

        await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_GATE_APPROVED_FOR_FUTURE_REVIEW', gate, actor, 'Gate approved for future activation review');
        return gate;
    }

    async rejectGate(gateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
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
        gate.activation_gate_status = 'REJECTED';

        try {
            await db.query(
                `UPDATE financial_operations_production_activation_gates 
                 SET activation_gate_status = 'REJECTED', updated_at = ?
                 WHERE production_activation_gate_id = ?`,
                [new Date().toISOString(), gateId]
            );
        } catch (e) {
            // ignore
        }

        if (this.gateService) {
            const idx = this.gateService._mockGates.findIndex(g => g.production_activation_gate_id === gateId);
            if (idx !== -1) {
                this.gateService._mockGates[idx].activation_gate_status = 'REJECTED';
            }
        }

        await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_GATE_REJECTED', gate, actor, 'Gate rejected');
        return gate;
    }

    async revokeGate(gateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
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
        
        const revokedAt = new Date().toISOString();
        const revokedBy = actor.userId;

        try {
            await db.query(
                `UPDATE financial_operations_production_activation_gates 
                 SET activation_gate_status = 'REVOKED', revoked_at = ?, revoked_by = ?, updated_at = ?
                 WHERE production_activation_gate_id = ?`,
                [revokedAt, revokedBy, new Date().toISOString(), gateId]
            );
        } catch (e) {
            // ignore
        }

        if (this.gateService) {
            const idx = this.gateService._mockGates.findIndex(g => g.production_activation_gate_id === gateId);
            if (idx !== -1) {
                this.gateService._mockGates[idx].activation_gate_status = 'REVOKED';
                this.gateService._mockGates[idx].revoked_at = revokedAt;
                this.gateService._mockGates[idx].revoked_by = revokedBy;
            }
        }

        gate.activation_gate_status = 'REVOKED';
        gate.revoked_at = revokedAt;
        gate.revoked_by = revokedBy;

        await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_GATE_REVOKED', gate, actor, 'Gate revoked');
        return gate;
    }

    async resolveFinding(gateId, findingCode, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        
        try {
            await db.query(
                `UPDATE financial_operations_production_activation_gate_findings 
                 SET status = 'RESOLVED', resolved_at = ?, resolved_by = ? 
                 WHERE production_activation_gate_id = ? AND finding_code = ?`,
                [new Date().toISOString(), actor.userId, gateId, findingCode]
            );
        } catch (e) {
            // ignore
        }

        const gate = { production_activation_gate_id: gateId };
        await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_GATE_FINDING_RESOLVED', gate, actor, `Finding ${findingCode} resolved`);
        return true;
    }

    async dismissWarning(gateId, warningText, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const gate = { production_activation_gate_id: gateId };
        await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_GATE_WARNING_DISMISSED', gate, actor, `Warning dismissed: ${warningText}`);
        return true;
    }

    async addReviewNote(gateId, noteType, note, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const gate = { production_activation_gate_id: gateId };
        await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_GATE_REVIEW_NOTE_ADDED', gate, actor, `Note added (${noteType}): ${note}`);
        return true;
    }

    async requestAdditionalEvidence(gateId, note, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const gate = { production_activation_gate_id: gateId };
        await this._recordEvent('FINOPS_PRODUCTION_ACTIVATION_GATE_REVIEW_ACTION_RECORDED', gate, actor, `Additional evidence requested: ${note}`);
        return true;
    }

    async _recordEvent(eventType, gate, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            production_activation_gate_id: gate ? gate.production_activation_gate_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };

        try {
            await db.query(
                `INSERT INTO financial_operations_production_activation_gate_audit_events (
                    id, event_type, actor_id, actor_type, production_activation_gate_id, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [ev.id, ev.event_type, ev.actor_id, ev.actor_type, ev.production_activation_gate_id, JSON.stringify(ev.payload_json), ev.created_at]
            );
        } catch (e) {
            // ignore
        }

        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProductionActivationGateReviewService;
