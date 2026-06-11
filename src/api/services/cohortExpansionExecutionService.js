const CohortExpansionExecutionAuditService = require('./cohortExpansionExecutionAuditService');
const ExpansionApprovalGatingEngine = require('./expansionApprovalGatingEngine');
const CohortExpansionReviewService = require('./cohortExpansionReviewService');

class CohortExpansionExecutionService {
    constructor(dependencies = {}) {
        this.auditService = dependencies.cohortExpansionExecutionAuditService || new CohortExpansionExecutionAuditService();
        this.gatingEngine = dependencies.expansionApprovalGatingEngine || new ExpansionApprovalGatingEngine();
        this.reviewService = dependencies.cohortExpansionReviewService || new CohortExpansionReviewService();
        
        // Mock cohort state
        this._mockCohorts = {
            'c_1': { id: 'c_1', type: 'INVITE_ONLY', limits: { invites: 50, max_orders_per_day: 10 } }
        };
    }

    _assertRole(actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
    }

    async prepareExpansionExecution({ expansionReviewId, proposedLimits, actor }) {
        this._assertRole(actor);

        const review = await this.reviewService.getExpansionReview({ reviewId: expansionReviewId, actor });
        if (review.review_decision !== 'APPROVED_FOR_LIMITED_EXPANSION') {
            throw new Error('Expansion review must be APPROVED_FOR_LIMITED_EXPANSION');
        }

        const readiness = await this.gatingEngine.checkExpansionReadiness({ 
            cohortId: review.cohort_id, 
            tenantId: review.tenant_id, 
            expansionReviewId, 
            actor 
        });

        if (!readiness.gates.mandatory_actions_resolved || !readiness.gates.critical_actions_resolved) {
            throw new Error('All mandatory and critical hardening actions must be resolved');
        }

        if (proposedLimits.countries?.includes('*') || proposedLimits.order_types?.includes('*')) {
            throw new Error('Wildcard expansion blocked');
        }

        const execution = await this.auditService.createExpansionExecutionAuditRecord({
            expansionReviewId,
            sourceCohortId: review.cohort_id,
            tenantId: review.tenant_id,
            expansionType: 'MIXED_LIMITED_EXPANSION',
            proposedLimits
        }, actor);

        return execution;
    }

    async validateExpansionExecution({ expansionExecutionId, actor }) {
        this._assertRole(actor);
        const execution = await this.auditService.getExpansionExecutionAuditRecord({ expansionExecutionId, actor });
        
        if (execution.proposed_limits_json?.countries?.includes('*') || execution.proposed_limits_json?.order_types?.includes('*')) {
            throw new Error('Wildcard expansion blocked');
        }

        execution.execution_status = 'READY';
        await this.auditService.recordExpansionExecutionEvent({
            expansionExecutionId, tenantId: execution.tenant_id, eventType: 'EXPANSION_EXECUTION_VALIDATED', actor, message: 'Validation passed'
        });

        return execution;
    }

    async approveExpansionExecution({ expansionExecutionId, actor }) {
        this._assertRole(actor);
        const execution = await this.auditService.getExpansionExecutionAuditRecord({ expansionExecutionId, actor });
        
        execution.execution_status = 'APPROVED_FOR_EXECUTION';
        execution.approved_by = actor.userId;
        execution.approved_at = new Date().toISOString();

        await this.auditService.recordExpansionExecutionEvent({
            expansionExecutionId, tenantId: execution.tenant_id, eventType: 'EXPANSION_EXECUTION_APPROVED', actor, message: 'Approved for execution'
        });

        // Note: Approval does not execute
        return execution;
    }

    async executeExpansion({ expansionExecutionId, actor }) {
        this._assertRole(actor);
        const execution = await this.auditService.getExpansionExecutionAuditRecord({ expansionExecutionId, actor });
        
        if (execution.execution_status !== 'APPROVED_FOR_EXECUTION') {
            throw new Error('Execution not approved');
        }

        const cohort = this._mockCohorts[execution.source_cohort_id];
        
        await this.auditService.captureCohortLimitSnapshot({
            expansionExecutionId, cohortId: cohort.id, snapshotType: 'BEFORE_EXPANSION', tenantId: execution.tenant_id, limits: cohort.limits, actor
        });

        await this.auditService.captureCohortLimitSnapshot({
            expansionExecutionId, cohortId: cohort.id, snapshotType: 'ROLLBACK_TARGET', tenantId: execution.tenant_id, limits: cohort.limits, actor
        });

        // Mutate cohort safely within bounds
        cohort.limits = { ...cohort.limits, ...execution.proposed_limits_json };

        execution.execution_status = 'ACTIVE';
        execution.executed_by = actor.userId;
        execution.executed_at = new Date().toISOString();

        await this.auditService.recordExpansionExecutionEvent({
            expansionExecutionId, tenantId: execution.tenant_id, eventType: 'EXPANSION_EXECUTION_STARTED', actor, message: 'Expansion applied'
        });

        return execution;
    }

    async pauseExpansion({ expansionExecutionId, reason, actor }) {
        this._assertRole(actor);
        const execution = await this.auditService.getExpansionExecutionAuditRecord({ expansionExecutionId, actor });
        
        execution.execution_status = 'PAUSED';
        execution.paused_by = actor.userId;
        execution.paused_at = new Date().toISOString();

        await this.auditService.recordExpansionExecutionEvent({
            expansionExecutionId, tenantId: execution.tenant_id, eventType: 'EXPANSION_PAUSED', actor, message: reason
        });

        return execution;
    }

    async rollbackExpansion({ expansionExecutionId, reason, actor }) {
        this._assertRole(actor);
        const execution = await this.auditService.getExpansionExecutionAuditRecord({ expansionExecutionId, actor });
        
        const snapshots = this.auditService._mockSnapshots.filter(s => s.expansion_execution_id === expansionExecutionId);
        const rollbackTarget = snapshots.find(s => s.snapshot_type === 'ROLLBACK_TARGET');

        if (!rollbackTarget) throw new Error('Rollback target missing');

        const cohort = this._mockCohorts[execution.source_cohort_id];
        cohort.limits = rollbackTarget.limits_json;

        execution.execution_status = 'ROLLED_BACK';
        execution.rollback_by = actor.userId;
        execution.rollback_at = new Date().toISOString();
        execution.rollback_reason = reason;

        await this.auditService.recordExpansionExecutionEvent({
            expansionExecutionId, tenantId: execution.tenant_id, eventType: 'EXPANSION_ROLLED_BACK', actor, message: reason
        });

        return execution;
    }

    async cancelExpansion({ expansionExecutionId, reason, actor }) {
        this._assertRole(actor);
        const execution = await this.auditService.getExpansionExecutionAuditRecord({ expansionExecutionId, actor });
        
        if (['ACTIVE', 'PAUSED', 'ROLLED_BACK'].includes(execution.execution_status)) {
            throw new Error('Cancel after execution blocked; rollback required');
        }

        execution.execution_status = 'CANCELLED';
        await this.auditService.recordExpansionExecutionEvent({
            expansionExecutionId, tenantId: execution.tenant_id, eventType: 'EXPANSION_CANCELLED', actor, message: reason
        });

        return execution;
    }
}

module.exports = CohortExpansionExecutionService;
