const crypto = require('crypto');

class FinancialOperationsPilotProgramService {
    constructor() {
        this._mockPrograms = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createDraftProgram({ programName, tenantId, allowedOperations, maxOrders, maxTotalAmount, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const program = {
            id: crypto.randomUUID(),
            pilot_program_id: `pp_${crypto.randomUUID()}`,
            tenant_id: tenantId || null,
            program_name: programName,
            program_status: 'DRAFT',
            pilot_scope: tenantId ? 'TENANT' : 'GLOBAL',
            allowed_operation_types_json: allowedOperations || [],
            blocked_operation_types_json: [],
            max_orders: maxOrders || 10,
            max_invoices: 10,
            max_total_amount: maxTotalAmount || 1000.00,
            currency: 'EUR',
            requires_manual_approval: true,
            dry_run_only: true, // Hardcoded strict
            external_execution_enabled: false, // Hardcoded strict
            full_public_enabled: false, // Hardcoded strict
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockPrograms.push(program);

        await this._recordEvent({
            eventType: 'FINOPS_PILOT_PROGRAM_CREATED',
            actor,
            pilot_program_id: program.pilot_program_id,
            tenant_id: program.tenant_id,
            message: `Draft pilot program created: ${programName}`
        });

        return program;
    }

    async requestReview({ programId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const program = this._mockPrograms.find(p => p.pilot_program_id === programId);
        if (!program) throw new Error('Program not found');
        if (program.program_status !== 'DRAFT') throw new Error('Only draft programs can be submitted for review');

        program.program_status = 'MANUAL_REVIEW_REQUIRED';

        await this._recordEvent({
            eventType: 'FINOPS_PILOT_PROGRAM_READY_FOR_REVIEW',
            actor,
            pilot_program_id: program.pilot_program_id,
            tenant_id: program.tenant_id,
            message: `Pilot program submitted for manual review`
        });

        return program;
    }

    async activateProgram({ programId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const program = this._mockPrograms.find(p => p.pilot_program_id === programId);
        if (!program) throw new Error('Program not found');
        if (program.program_status !== 'MANUAL_REVIEW_REQUIRED') throw new Error('Program must be reviewed before activation');

        if (program.external_execution_enabled === true) {
            throw new Error('Cannot activate: external execution must be disabled');
        }
        if (program.full_public_enabled === true) {
            throw new Error('Cannot activate: FULL_PUBLIC must be disabled');
        }
        if (program.dry_run_only !== true) {
            throw new Error('Cannot activate: dry_run_only must be true');
        }

        program.program_status = 'ACTIVE_CONTROLLED_PILOT';
        program.activated_at = new Date().toISOString();
        program.activated_by = actor.userId;

        await this._recordEvent({
            eventType: 'FINOPS_PILOT_PROGRAM_ACTIVATED',
            actor,
            pilot_program_id: program.pilot_program_id,
            tenant_id: program.tenant_id,
            message: `Pilot program activated in DRY_RUN_ONLY mode`
        });

        return program;
    }

    async checkEligibility({ programId, operationType }) {
        const program = this._mockPrograms.find(p => p.pilot_program_id === programId);
        if (!program) throw new Error('Program not found');
        if (program.program_status !== 'ACTIVE_CONTROLLED_PILOT') throw new Error('Program is not active');

        if (!program.allowed_operation_types_json.includes(operationType)) {
            throw new Error(`Operation type ${operationType} is not allowed in this pilot program`);
        }

        return true;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            pilot_program_id: event.pilot_program_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsPilotProgramService;
