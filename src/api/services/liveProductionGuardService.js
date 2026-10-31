const crypto = require('crypto');

class LiveProductionGuardService {
    constructor(dependencies = {}) {
        this.enablementSvc = dependencies.liveProductionEnablementService;
        this.db = dependencies.db;
    }

    async evaluateGuard(action, { tenantId, printhouseId, orderId, jobId, actor, context = {} }) {
        const enablement = await this.enablementSvc.getLiveEnablement({ tenantId, printhouseId });

        const decision = {
            action,
            decision: 'BLOCKED',
            blocking_reasons: [],
            warning_reasons: []
        };

        // Rule 1: Master switch
        if (!enablement.live_production_enabled || enablement.enablement_status !== 'ACTIVE') {
            decision.blocking_reasons.push('Live production is not ACTIVE and ENABLED for this tenant/printhouse pair.');
            await this._auditDecision(decision, { tenantId, printhouseId, orderId, jobId, enablementId: enablement.id, actor, snapshot: enablement });
            return decision;
        }

        // Rule 2: Scope checks
        if (!enablement.live_scope) {
            decision.blocking_reasons.push('Live scope is missing.');
        } else if (enablement.live_scope === 'INTERNAL_TEST') {
            if (!context.isInternalTest) {
                decision.blocking_reasons.push('Action restricted to INTERNAL_TEST scope only.');
            }
        } else if (enablement.live_scope === 'PARTNER_PILOT') {
            if (!context.isPartnerPilot) {
                decision.warning_reasons.push('Action occurs under PARTNER_PILOT scope. External SLA not guaranteed.');
            }
        }

        // Rule 3: Action-specific limits
        if (action === 'CREATE_LIVE_ORDER') {
            // Check max limits if provided in context
            if (enablement.max_live_orders_per_day && context.currentOrdersToday >= enablement.max_live_orders_per_day) {
                decision.blocking_reasons.push(`Exceeds daily order limit of ${enablement.max_live_orders_per_day}`);
            }
        }

        if (action === 'GENERATE_LIVE_HANDOFF') {
            if (enablement.require_manual_handoff_approval && !context.hasManualHandoffApproval) {
                decision.blocking_reasons.push('Manual handoff approval is required but missing.');
            }
        }

        if (action === 'ENTER_LIVE_QUEUE') {
             if (enablement.require_artifact_trust_certified && !context.hasArtifactTrust) {
                 decision.blocking_reasons.push('Artifact trust certification is required but missing.');
             }
        }

        // If no blocking reasons, then it is ALLOWED or WARNING
        if (decision.blocking_reasons.length === 0) {
            if (decision.warning_reasons.length > 0) {
                decision.decision = 'WARNING';
            } else if (enablement.require_operator_confirmation && context.needsOperatorConfirmation) {
                decision.decision = 'REVIEW_REQUIRED';
            } else {
                decision.decision = 'ALLOWED';
            }
        }

        await this._auditDecision(decision, { tenantId, printhouseId, orderId, jobId, enablementId: enablement.id, actor, snapshot: enablement });
        
        return decision;
    }

    async checkGuardOrThrow(action, params) {
        const result = await this.evaluateGuard(action, params);
        if (result.decision === 'BLOCKED') {
            throw new Error(`Live Production Guard BLOCKED action ${action}: ${result.blocking_reasons.join(', ')}`);
        }
        return result;
    }

    async _auditDecision(decision, { tenantId, printhouseId, orderId, jobId, enablementId, actor, snapshot }) {
        if (!this.db) return;
        
        await this.db.query(`
            INSERT INTO live_production_guard_decisions
            (id, tenant_id, printhouse_id, order_id, job_id, enablement_id, action, decision, blocking_reasons_json, warning_reasons_json, governance_snapshot_json, actor_user_id, actor_role, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            crypto.randomUUID(),
            tenantId,
            printhouseId,
            orderId || null,
            jobId || null,
            enablementId,
            decision.action,
            decision.decision,
            JSON.stringify(decision.blocking_reasons),
            JSON.stringify(decision.warning_reasons),
            JSON.stringify(snapshot),
            actor.userId,
            actor.role
        ]);
    }
}

module.exports = LiveProductionGuardService;
