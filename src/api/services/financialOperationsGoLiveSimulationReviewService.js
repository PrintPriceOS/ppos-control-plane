const crypto = require('crypto');

class FinancialOperationsGoLiveSimulationReviewService {
    constructor(simulationService, checklistService) {
        this._mockEvents = [];
        this.simulationService = simulationService;
        this.checklistService = checklistService;
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async approveSimulatedGoLive(simId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sim = this.simulationService ? this.simulationService._mockSimulations.find(s => s.go_live_simulation_id === simId) : null;
        if (!sim) throw new Error('Simulation not found');

        if (sim.simulation_status !== 'APPROVED_FOR_SIMULATED_GO_LIVE_REVIEW') {
            throw new Error(`Cannot approve simulation in status ${sim.simulation_status}`);
        }

        sim.simulation_status = 'SIMULATED_GO_LIVE_APPROVED';
        sim.completed_at = new Date().toISOString();
        sim.completed_by = actor.userId;

        await this._recordEvent('FINOPS_SIMULATED_GO_LIVE_REVIEW_APPROVED', sim, null, actor, 'Simulated go-live approved');

        return sim;
    }

    async rejectSimulatedGoLive(simId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sim = this.simulationService ? this.simulationService._mockSimulations.find(s => s.go_live_simulation_id === simId) : null;
        if (!sim) throw new Error('Simulation not found');

        sim.simulation_status = 'REJECTED';
        sim.completed_at = new Date().toISOString();
        sim.completed_by = actor.userId;

        await this._recordEvent('FINOPS_SIMULATED_GO_LIVE_REVIEW_REJECTED', sim, null, actor, 'Simulated go-live rejected');

        return sim;
    }

    async resolveFinding(simId, findingCode, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        let finding = this.checklistService ? this.checklistService._mockFindings.find(f => f.go_live_simulation_id === simId && f.finding_code === findingCode) : null;
        
        if (!finding) {
            finding = {
                id: crypto.randomUUID(),
                go_live_simulation_id: simId,
                finding_code: findingCode,
                severity: 'MEDIUM',
                category: 'GO_LIVE',
                message: 'Mock finding',
                status: 'RESOLVED',
                created_at: new Date().toISOString(),
                resolved_at: new Date().toISOString(),
                resolved_by: actor.userId
            };
            if (this.checklistService) this.checklistService._mockFindings.push(finding);
        } else {
            finding.status = 'RESOLVED';
            finding.resolved_at = new Date().toISOString();
            finding.resolved_by = actor.userId;
        }

        const sim = { go_live_simulation_id: simId };
        await this._recordEvent('FINOPS_GO_LIVE_SIMULATION_FINDING_RESOLVED', sim, null, actor, `Finding ${findingCode} resolved`);

        return finding;
    }

    async dismissWarning(simId, warningText, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const sim = { go_live_simulation_id: simId };
        await this._recordEvent('FINOPS_GO_LIVE_SIMULATION_WARNING_DISMISSED', sim, null, actor, `Warning dismissed: ${warningText}`);
        return true;
    }

    async addReviewNote(simId, roleNote, note, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const sim = { go_live_simulation_id: simId };
        await this._recordEvent('FINOPS_GO_LIVE_SIMULATION_REVIEW_NOTE_ADDED', sim, null, actor, `${roleNote}: ${note}`);
        return true;
    }

    async requestAdditionalEvidence(simId, note, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const sim = { go_live_simulation_id: simId };
        await this._recordEvent('FINOPS_GO_LIVE_SIMULATION_REVIEW_NOTE_ADDED', sim, null, actor, `Additional evidence requested: ${note}`);
        return true;
    }

    async _recordEvent(eventType, sim, step, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            go_live_simulation_id: sim ? sim.go_live_simulation_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsGoLiveSimulationReviewService;
