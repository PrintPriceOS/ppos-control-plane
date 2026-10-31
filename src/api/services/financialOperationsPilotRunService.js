const crypto = require('crypto');

class FinancialOperationsPilotRunService {
    constructor(dependencies = {}) {
        this.programService = dependencies.financialOperationsPilotProgramService;
        this.evaluatorService = dependencies.financialOperationsReleaseGateEvaluatorService;
        this._mockRuns = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createRun({ gateId, programId, operationType, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);

        const gate = this.evaluatorService ? this.evaluatorService._mockGates.find(g => g.release_gate_id === gateId) : null;
        if (!gate) throw new Error('Release gate not found');
        if (gate.gate_status !== 'APPROVED_FOR_CONTROLLED_RELEASE') {
            throw new Error('Gate must be approved for controlled release');
        }

        const program = this.programService ? this.programService._mockPrograms.find(p => p.pilot_program_id === programId) : null;
        if (!program) throw new Error('Pilot program not found');
        if (program.program_status !== 'ACTIVE_CONTROLLED_PILOT') {
            throw new Error('Pilot program must be active');
        }

        if (!program.allowed_operation_types_json.includes(operationType)) {
            throw new Error(`Operation type ${operationType} not allowed in this pilot program`);
        }

        const run = {
            id: crypto.randomUUID(),
            pilot_run_id: `pr_${crypto.randomUUID()}`,
            pilot_program_id: programId,
            release_gate_id: gateId,
            readiness_run_id: gate.readiness_run_id,
            tenant_id: gate.tenant_id,
            order_id: gate.order_id,
            invoice_id: gate.invoice_id,
            operation_type: operationType,
            run_status: 'CREATED',
            execution_mode: 'DRY_RUN', // Always strictly dry run
            amount: 100.00, // mock
            currency: 'EUR',
            blockers_json: [],
            warnings_json: [],
            evidence_json: {},
            source_snapshot_json: { ...gate },
            result_snapshot_json: null,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockRuns.push(run);

        await this._recordEvent({
            eventType: 'FINOPS_PILOT_RUN_CREATED',
            actor,
            pilot_program_id: programId,
            pilot_run_id: run.pilot_run_id,
            release_gate_id: gateId,
            tenant_id: run.tenant_id,
            message: `Pilot run created for operation ${operationType}`
        });

        return run;
    }

    async evaluateEligibility({ runId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const run = this._mockRuns.find(r => r.pilot_run_id === runId);
        if (!run) throw new Error('Pilot run not found');

        run.run_status = 'READY_FOR_DRY_RUN';

        await this._recordEvent({
            eventType: 'FINOPS_PILOT_RUN_EVALUATED',
            actor,
            pilot_program_id: run.pilot_program_id,
            pilot_run_id: runId,
            message: 'Pilot run evaluated and is ready for dry run'
        });

        return run;
    }

    async executeDryRun({ runId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const run = this._mockRuns.find(r => r.pilot_run_id === runId);
        if (!run) throw new Error('Pilot run not found');

        if (run.run_status !== 'READY_FOR_DRY_RUN') {
            throw new Error('Pilot run must be evaluated and ready');
        }
        if (run.execution_mode !== 'DRY_RUN') {
            throw new Error('Pilot run execution mode MUST be DRY_RUN');
        }

        run.run_status = 'DRY_RUN_COMPLETED';
        run.result_snapshot_json = {
            dry_run_success: true,
            simulated_response: '200 OK',
            message: 'Simulated successfully without external execution',
            timestamp: new Date().toISOString()
        };
        run.completed_at = new Date().toISOString();
        run.completed_by = actor.userId;

        await this._recordEvent({
            eventType: 'FINOPS_PILOT_DRY_RUN_COMPLETED',
            actor,
            pilot_program_id: run.pilot_program_id,
            pilot_run_id: runId,
            message: `DRY_RUN completed for ${run.operation_type}. No external endpoints were invoked.`
        });

        return run;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            pilot_program_id: event.pilot_program_id,
            pilot_run_id: event.pilot_run_id,
            release_gate_id: event.release_gate_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsPilotRunService;
