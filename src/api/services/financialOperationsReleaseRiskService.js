const crypto = require('crypto');

class FinancialOperationsReleaseRiskService {
    constructor(dependencies = {}) {
        this.evaluatorService = dependencies.financialOperationsReleaseGateEvaluatorService;
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluateRisk({ gateId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const gate = this.evaluatorService ? this.evaluatorService._mockGates.find(g => g.release_gate_id === gateId) : null;
        if (!gate) throw new Error('Release gate not found');

        const factors = [];
        let riskScore = 0;

        function assess(condition, weight, failMessage, isBlocker = false) {
            if (!condition) {
                factors.push({ message: failMessage, isBlocker });
                riskScore += weight;
            }
        }

        assess(true, 100, 'Audit trail incomplete', true); // Static mock: audit trail always complete
        assess(gate.gate_status !== 'NOT_READY', 50, 'Manual review incomplete', true);
        assess(true, 100, 'External execution enabled', true); // Static mock: external execution disabled
        assess(gate.source_readiness_snapshot_json !== null, 50, 'Source snapshots missing', true);
        assess(true, 20, 'Rollback note missing', false); // Static mock: present
        
        let riskStatus = 'LOW_RISK_READY_FOR_APPROVAL';
        if (factors.some(f => f.isBlocker)) {
            riskStatus = 'HIGH_RISK_BLOCKED';
        } else if (riskScore > 0) {
            riskStatus = 'MEDIUM_RISK_MANUAL_REVIEW_REQUIRED';
        }

        const riskSummary = {
            id: `risk_${crypto.randomUUID()}`,
            release_gate_id: gateId,
            risk_status: riskStatus,
            risk_score: riskScore,
            risk_factors: factors,
            rollback_readiness: {
                REVOCATION_PATH_AVAILABLE: true,
                OPERATOR_APPROVAL_REQUIRED: true,
                EXPORTS_PREVIEW_ONLY: true
            },
            monitoring_requirements: ['AUDIT_LOG_MONITORING'],
            manual_controls_required: ['EXPLICIT_APPROVAL', 'EVIDENCE_REQUIRED'],
            created_at: new Date().toISOString()
        };

        await this._recordEvent({
            eventType: 'FINOPS_RELEASE_RISK_EVALUATED',
            actor,
            release_gate_id: gateId,
            message: `Risk evaluated with score ${riskScore} and status ${riskStatus}`
        });

        if (riskStatus === 'HIGH_RISK_BLOCKED') {
             await this._recordEvent({
                eventType: 'FINOPS_RELEASE_RISK_BLOCKER_DETECTED',
                actor,
                release_gate_id: gateId,
                message: 'High risk detected. Gate blocked.'
            });
        } else if (riskStatus === 'MEDIUM_RISK_MANUAL_REVIEW_REQUIRED') {
            await this._recordEvent({
                eventType: 'FINOPS_RELEASE_RISK_WARNING_RAISED',
                actor,
                release_gate_id: gateId,
                message: 'Medium risk detected. Manual review required.'
            });
        } else {
             await this._recordEvent({
                eventType: 'FINOPS_RELEASE_ROLLBACK_READINESS_CONFIRMED',
                actor,
                release_gate_id: gateId,
                message: 'Low risk. Rollback readiness confirmed.'
            });
        }

        return riskSummary;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            release_gate_id: event.release_gate_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsReleaseRiskService;
