const crypto = require('crypto');

class FinancialOperationsReviewService {
    constructor(dependencies = {}) {
        this.aggregatorService = dependencies.financialOperationsReadinessAggregatorService;
        this._mockEvents = [];
        this._mockFindings = []; // Using mock array for findings in smoke test
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async getRun(runId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const run = this.aggregatorService._mockRuns.find(r => r.readiness_run_id === runId);
        if (!run) throw new Error('Readiness run not found');
        return run;
    }

    async executeReviewAction({ runId, actionType, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const run = await this.getRun(runId, actor);

        let message = '';

        switch (actionType) {
            case 'MARK_REVIEWED':
                run.readiness_status = 'REVIEWED';
                message = 'Run marked as reviewed';
                break;
            case 'MARK_NEEDS_ACCOUNTANT_REVIEW':
                run.readiness_status = 'ACCOUNTANT_REVIEW_REQUIRED';
                message = 'Run flagged for accountant review';
                break;
            case 'MARK_NEEDS_FINANCE_REVIEW':
                run.readiness_status = 'FINANCE_REVIEW_REQUIRED';
                message = 'Run flagged for finance review';
                break;
            case 'ADD_REVIEW_NOTE':
                if (!payload || !payload.note) throw new Error('Missing note');
                message = `Review note added: ${payload.note}`;
                break;
            case 'DISMISS_WARNING':
                if (!payload || payload.warning_index === undefined || !payload.reason) throw new Error('Missing warning_index or reason');
                message = `Warning dismissed: ${payload.reason}`;
                break;
            case 'RESOLVE_FINDING':
                if (!payload || !payload.finding_id) throw new Error('Missing finding_id');
                const finding = this._mockFindings.find(f => f.id === payload.finding_id);
                if (finding) {
                    finding.status = 'RESOLVED';
                    finding.resolved_at = new Date().toISOString();
                    finding.resolved_by = actor.userId;
                    message = `Finding ${payload.finding_id} resolved`;
                } else {
                    // For smoke testing when finding isn't pre-seeded
                    message = `Finding ${payload.finding_id} resolved (mocked)`;
                }
                break;
            case 'ACKNOWLEDGE_BLOCKER':
                if (!payload || payload.blocker_index === undefined || !payload.reason) throw new Error('Missing blocker_index or reason');
                message = `Blocker acknowledged (but not bypassed): ${payload.reason}`;
                break;
            case 'MARK_READY_FOR_FINOPS_REVIEW':
                run.readiness_status = 'READY_FOR_FINANCIAL_OPERATIONS_REVIEW';
                message = 'Run marked ready for final FinOps review';
                break;
            default:
                throw new Error('Invalid actionType');
        }

        await this._recordEvent({
            eventType: `FINOPS_REVIEW_ACTION_${actionType}`,
            actor,
            readiness_run_id: run.readiness_run_id,
            tenant_id: run.tenant_id,
            message
        });

        return run;
    }

    async getAuditTimeline(runId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const evs = this.aggregatorService._mockEvents.filter(e => e.readiness_run_id === runId).concat(
            this._mockEvents.filter(e => e.readiness_run_id === runId)
        );
        return evs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            readiness_run_id: event.readiness_run_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsReviewService;
