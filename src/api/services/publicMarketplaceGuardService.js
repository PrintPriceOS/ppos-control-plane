class PublicMarketplaceGuardService {
    constructor(dependencies = {}) {
        this.launchControlService = dependencies.launchControlService || {};
        this._mockDecisions = [];
    }

    async evaluatePublicActionAllowed({ action, tenantId, printhouseId, customerId, orderType, actor, payload }) {
        const state = await this.launchControlService.getLaunchControlState(actor);
        const cohortId = state.active_cohort_id;
        let cohort = null;
        
        if (cohortId && this.launchControlService._mockCohorts) {
            cohort = this.launchControlService._mockCohorts.find(c => c.id === cohortId);
        }

        const blockers = [];
        const warnings = [];

        // Base checks
        if (!state.public_marketplace_launch_enabled) {
            blockers.push('Launch disabled');
        }
        if (state.launch_status === 'EMERGENCY_STOP' || state.emergency_stop_active) {
            blockers.push('Emergency stop active');
        }
        if (state.launch_status === 'PAUSED') {
            blockers.push('Launch paused');
        }

        // Action specific checks
        const intakeActions = [
            'PUBLIC_CREATE_ORDER',
            'PUBLIC_UPLOAD_FILES',
            'PUBLIC_SUBMIT_PREFLIGHT',
            'PUBLIC_ENTER_LIVE_PIPELINE'
        ];
        if (intakeActions.includes(action) && !state.public_intake_enabled) {
            blockers.push('Public intake disabled');
        }
        if (action === 'PUBLIC_UPLOAD_FILES' && !state.public_file_upload_enabled) {
            blockers.push('Public file upload disabled');
        }
        if (action === 'PUBLIC_PAYMENT_REFERENCE' && !state.public_payment_enabled) {
            blockers.push('Public payment disabled');
        }

        // Cohort checks
        if (state.launch_scope === 'LIMITED_PUBLIC') {
            if (!cohort || cohort.cohort_status !== 'ACTIVE') {
                blockers.push('No active cohort for limited rollout');
            } else {
                if (tenantId && cohort.allowed_tenant_ids_json && !cohort.allowed_tenant_ids_json.includes(tenantId)) {
                    blockers.push('Tenant not allowed in active cohort');
                }
                if (printhouseId && cohort.allowed_printhouse_ids_json && !cohort.allowed_printhouse_ids_json.includes(printhouseId)) {
                    blockers.push('Printhouse not allowed in active cohort');
                }
                if (orderType && cohort.allowed_order_types_json && !cohort.allowed_order_types_json.includes(orderType)) {
                    blockers.push('Order type not allowed in active cohort');
                }
                if (cohort.daily_orders_exceeded) {
                    blockers.push('Daily order limit exceeded for cohort');
                }
            }
        }

        const decision = blockers.length > 0 ? 'BLOCKED' : 'ALLOWED';

        const result = {
            action,
            decision,
            blocking_reasons_json: blockers,
            warning_reasons_json: warnings,
            launch_control_id: state.id,
            cohort_id: cohortId,
            tenant_id: tenantId,
            printhouse_id: printhouseId,
            customer_id: customerId,
            actor_user_id: actor.userId,
            actor_role: actor.role,
            created_at: new Date().toISOString()
        };

        await this.recordPublicGuardDecision(result);
        return result;
    }

    async assertPublicActionAllowed(args) {
        const result = await this.evaluatePublicActionAllowed(args);
        if (result.decision !== 'ALLOWED') {
            throw new Error(`Public Guard Blocked: ${result.blocking_reasons_json.join(', ')}`);
        }
        return result;
    }

    async buildPublicGuardDecision(args) {
        return this.evaluatePublicActionAllowed(args);
    }

    async recordPublicGuardDecision(decision) {
        this._mockDecisions.push(decision);
    }

    sanitizePublicGuardDecisionForRole(decision, actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            // Customers and partners only get generic reasons to avoid leaking governance rules
            const sanitized = { ...decision };
            if (sanitized.decision === 'BLOCKED') {
                sanitized.blocking_reasons_json = ['Action blocked by marketplace guard'];
            }
            delete sanitized.launch_control_id;
            delete sanitized.cohort_id;
            return sanitized;
        }
        return decision;
    }
}

module.exports = PublicMarketplaceGuardService;
