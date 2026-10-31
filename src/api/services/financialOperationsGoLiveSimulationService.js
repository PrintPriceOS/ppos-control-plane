const crypto = require('crypto');

class FinancialOperationsGoLiveSimulationService {
    constructor() {
        this._mockEvents = [];
        this._mockSimulations = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createSimulation(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const simId = `gls_${crypto.randomUUID()}`;
        const sim = {
            id: crypto.randomUUID(),
            go_live_simulation_id: simId,
            tenant_id: payload.tenantId || null,
            simulation_name: payload.simulationName || 'Go-Live Simulation',
            simulation_status: 'CREATED',
            simulation_scope: payload.simulationScope || 'FULL_FINOPS',
            simulation_mode: 'GO_LIVE_SIMULATION_ONLY',
            evidence_json: payload.evidence || {},
            blockers_json: [],
            warnings_json: [],
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockSimulations.push(sim);

        await this._recordEvent('FINOPS_GO_LIVE_SIMULATION_CREATED', sim, actor, `Simulation ${sim.simulation_name} created`);

        return sim;
    }

    async evaluateSimulation(simId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sim = this._mockSimulations.find(s => s.go_live_simulation_id === simId);
        if (!sim) throw new Error('Simulation not found');

        await this._recordEvent('FINOPS_GO_LIVE_SIMULATION_EVALUATED', sim, actor, 'Evaluating simulation readiness');

        const evidence = sim.evidence_json || {};
        const blockers = [];
        const warnings = [];

        // Required checks
        if (evidence.production_activation_enabled) blockers.push('PRODUCTION_ACTIVATION_ENABLED');
        if (evidence.full_public_enabled) blockers.push('FULL_PUBLIC_ENABLED');
        if (evidence.live_provider_connectivity_enabled) blockers.push('LIVE_PROVIDER_CONNECTIVITY_ENABLED');
        
        // Readiness areas
        if (!evidence.compliance_reporting_ready) blockers.push('COMPLIANCE_REPORTING_NOT_READY');
        if (!evidence.privacy_retention_ready) blockers.push('PRIVACY_RETENTION_NOT_READY');
        if (!evidence.provider_ready) blockers.push('PROVIDER_NOT_READY');
        if (!evidence.rollback_path_ready) blockers.push('ROLLBACK_PATH_NOT_READY');

        let status = 'APPROVED_FOR_SIMULATED_GO_LIVE_REVIEW';

        if (blockers.length > 0) {
            if (blockers.some(b => b.includes('COMPLIANCE'))) status = 'BLOCKED_BY_COMPLIANCE_GAP';
            else if (blockers.some(b => b.includes('PRIVACY'))) status = 'BLOCKED_BY_PRIVACY_GAP';
            else if (blockers.some(b => b.includes('PROVIDER'))) status = 'BLOCKED_BY_PROVIDER_GAP';
            else if (blockers.some(b => b.includes('ROLLBACK'))) status = 'BLOCKED_BY_ROLLBACK_GAP';
            else status = 'BLOCKED_BY_READINESS_GAP';

            sim.blockers_json = blockers;
            sim.simulation_status = status;

            await this._recordEvent('FINOPS_GO_LIVE_SIMULATION_BLOCKER_DETECTED', sim, actor, `Evaluation failed. Blockers: ${blockers.join(', ')}`);
            return sim;
        }

        sim.simulation_status = status;
        await this._recordEvent('FINOPS_GO_LIVE_SIMULATION_READY_FOR_REVIEW', sim, actor, 'Simulation is ready for review');

        return sim;
    }

    async _recordEvent(eventType, sim, actor, message) {
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

module.exports = FinancialOperationsGoLiveSimulationService;
