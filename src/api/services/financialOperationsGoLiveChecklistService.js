const crypto = require('crypto');

class FinancialOperationsGoLiveChecklistService {
    constructor(simulationService) {
        this._mockEvents = [];
        this._mockChecklists = [];
        this._mockSteps = [];
        this._mockFindings = [];
        this.simulationService = simulationService;
        this.CHECKLIST_GROUPS = [
            'FINANCIAL_READINESS', 'SECURITY_GUARDRAILS', 'PROVIDER_READINESS',
            'COMPLIANCE_REPORTING', 'DATA_RETENTION_PRIVACY', 'INCIDENT_RESPONSE',
            'ROLLBACK_READINESS', 'AUDIT_TIMELINE', 'OPERATOR_APPROVALS',
            'CUSTOMER_IMPACT_REVIEW'
        ];
        this.STEPS = [
            'VERIFY_FINOPS_READINESS', 'VERIFY_RELEASE_GATES', 'VERIFY_PILOT_EVIDENCE',
            'VERIFY_PROVIDER_SANDBOX', 'VERIFY_PROVIDER_CONTRACT_SLA', 'VERIFY_CREDENTIAL_VAULT',
            'VERIFY_WEBHOOK_SANDBOX', 'VERIFY_EVENT_RECONCILIATION', 'VERIFY_FAILURE_RETRY',
            'VERIFY_SETTLEMENT_FILES', 'VERIFY_DATA_RETENTION_PRIVACY', 'VERIFY_COMPLIANCE_REPORTING',
            'VERIFY_ROLLBACK', 'VERIFY_INCIDENT_RESPONSE', 'VERIFY_FINAL_GO_NO_GO_REVIEW'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async buildChecklistAndSteps(simId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sim = this.simulationService ? this.simulationService._mockSimulations.find(s => s.go_live_simulation_id === simId) : null;
        if (!sim) throw new Error('Simulation not found');

        const evidence = sim.evidence_json || {};

        let hasBlocker = false;
        let requiresManualReview = false;

        for (const group of this.CHECKLIST_GROUPS) {
            const clId = `glc_${crypto.randomUUID()}`;
            const cl = {
                id: crypto.randomUUID(),
                go_live_checklist_id: clId,
                go_live_simulation_id: simId,
                checklist_key: group,
                checklist_status: 'EVALUATED',
                checklist_scope: 'SIMULATION_ONLY',
                created_at: new Date().toISOString(),
                created_by: actor.userId
            };

            if (group === 'ROLLBACK_READINESS' && !evidence.rollback_path_ready) {
                cl.checklist_status = 'BLOCKED';
                hasBlocker = true;
                this._createFinding(simId, null, clId, 'MISSING_ROLLBACK', 'HIGH', group, actor);
            }

            if (group === 'INCIDENT_RESPONSE' && !evidence.incident_response_ready) {
                cl.checklist_status = 'BLOCKED';
                hasBlocker = true;
                this._createFinding(simId, null, clId, 'MISSING_INCIDENT_RESPONSE', 'HIGH', group, actor);
            }

            if (group === 'OPERATOR_APPROVALS') {
                cl.checklist_status = 'MANUAL_REVIEW_REQUIRED';
                requiresManualReview = true;
            }

            this._mockChecklists.push(cl);
        }

        for (const stepKey of this.STEPS) {
            const stId = `glst_${crypto.randomUUID()}`;
            const st = {
                id: crypto.randomUUID(),
                go_live_step_id: stId,
                go_live_simulation_id: simId,
                step_key: stepKey,
                step_label: stepKey.replace('_', ' ').toUpperCase(),
                step_status: 'EVALUATED',
                created_at: new Date().toISOString(),
                created_by: actor.userId
            };

            this._mockSteps.push(st);
            await this._recordEvent('FINOPS_GO_LIVE_STEP_EVALUATED', sim, st, null, actor, `Step ${stepKey} evaluated`);
        }

        await this._recordEvent('FINOPS_GO_LIVE_CHECKLIST_CREATED', sim, null, null, actor, 'Checklists and steps built');

        if (hasBlocker) {
            await this._recordEvent('FINOPS_GO_LIVE_CHECKLIST_BLOCKER_DETECTED', sim, null, null, actor, 'Blocker detected in checklist');
        } else if (requiresManualReview) {
            await this._recordEvent('FINOPS_GO_LIVE_CHECKLIST_WARNING_RAISED', sim, null, null, actor, 'Manual review required for checklist');
        }

        return {
            checklists: this._mockChecklists.filter(c => c.go_live_simulation_id === simId),
            steps: this._mockSteps.filter(s => s.go_live_simulation_id === simId),
            findings: this._mockFindings.filter(f => f.go_live_simulation_id === simId)
        };
    }

    _createFinding(simId, stepId, clId, code, severity, category, actor) {
        const finding = {
            id: crypto.randomUUID(),
            go_live_simulation_id: simId,
            go_live_step_id: stepId,
            go_live_checklist_id: clId,
            finding_code: code,
            severity,
            category,
            message: `Mock finding: ${code}`,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };
        this._mockFindings.push(finding);
        return finding;
    }

    async _recordEvent(eventType, sim, step, cl, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            go_live_simulation_id: sim ? sim.go_live_simulation_id : null,
            go_live_step_id: step ? step.go_live_step_id : null,
            go_live_checklist_id: cl ? cl.go_live_checklist_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsGoLiveChecklistService;
