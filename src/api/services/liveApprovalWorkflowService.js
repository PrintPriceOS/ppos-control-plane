class LiveApprovalWorkflowService {
    constructor(dependencies = {}) {
        this.enablementSvc = dependencies.liveProductionEnablementService;
        this.readinessSvc = dependencies.liveReadinessEvaluationService;
        this.db = dependencies.db;
    }

    _assertRole(actor, allowedRoles) {
        if (!actor || !allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor ? actor.role : 'UNKNOWN'} not in allowed roles: ${allowedRoles.join(', ')}`);
        }
    }

    async submitLiveApprovalRequest({ tenantId, printhouseId, liveScope, actor, justification }) {
        this._assertRole(actor, ['CONTROL_PLANE_ADMIN', 'SYSTEM_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN']);
        
        // Partner users can request, but we must ensure they are requesting for their own scope (mocked checking here)
        
        const state = await this.enablementSvc.requestLiveEnablement({
            tenantId,
            printhouseId,
            requestedScope: liveScope,
            actor
        });

        if (justification && this.db) {
            await this.auditLiveApprovalWorkflowEvent({
                tenantId, printhouseId,
                eventType: 'LIVE_ENABLEMENT_JUSTIFICATION_ADDED',
                actor,
                message: justification
            });
        }

        return state;
    }

    async reviewLiveApprovalRequest({ tenantId, printhouseId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'OPS_ADMIN']);
        
        return this.enablementSvc.moveLiveEnablementToReview({ tenantId, printhouseId, actor });
    }

    async approveLiveApprovalRequest({ tenantId, printhouseId, actor, approvalNotes, approvalPayload }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        // Check readiness
        const readiness = await this.readinessSvc.evaluateLiveReadiness({ tenantId, printhouseId, actor });
        if (!readiness.ready_for_controlled_live) {
            throw new Error('Cannot approve: Readiness evaluation failed.');
        }

        const payload = {
            ...approvalPayload,
            approval_notes: approvalNotes,
            readiness_hash: readiness.snapshot_hash
        };

        return this.enablementSvc.approveLiveEnablement({
            tenantId,
            printhouseId,
            approvalPayload: payload,
            actor
        });
    }

    async rejectLiveApprovalRequest({ tenantId, printhouseId, actor, reason }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'OPS_ADMIN', 'CONTROL_PLANE_ADMIN']);
        return this.enablementSvc.rejectLiveEnablement({ tenantId, printhouseId, reason, actor });
    }

    async activateControlledLive({ tenantId, printhouseId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        return this.enablementSvc.activateLiveEnablement({ tenantId, printhouseId, actor });
    }

    async pauseControlledLive({ tenantId, printhouseId, actor, reason }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        return this.enablementSvc.pauseLiveEnablement({ tenantId, printhouseId, reason, actor });
    }

    async resumeControlledLive({ tenantId, printhouseId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        
        const readiness = await this.readinessSvc.evaluateLiveReadiness({ tenantId, printhouseId, actor });
        if (!readiness.ready_for_controlled_live) {
            throw new Error('Cannot resume: Readiness evaluation failed.');
        }

        return this.enablementSvc.resumeLiveEnablement({ tenantId, printhouseId, actor });
    }

    async revokeControlledLive({ tenantId, printhouseId, actor, reason, impactScope }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        
        // Ensure revocation takes immediate effect
        const state = await this.enablementSvc.revokeLiveEnablement({
            tenantId,
            printhouseId,
            reason,
            impactScope,
            actor
        });

        // Record the revocation detail in the separate tracking table if DB exists
        if (this.db) {
            await this.db.query(`
                INSERT INTO live_production_revocations
                (id, tenant_id, printhouse_id, enablement_id, revocation_type, reason, impact_scope, actor_user_id, actor_role, created_at)
                VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                tenantId, printhouseId, state.id, 'MANUAL', reason, impactScope, actor.userId, actor.role
            ]);
        }

        return state;
    }

    async getLiveApprovalTimeline({ tenantId, printhouseId }) {
        if (!this.db) return [];
        const rows = await this.db.query(`
            SELECT * FROM live_production_approval_events
            WHERE tenant_id = ? AND printhouse_id = ?
            ORDER BY created_at ASC
        `, [tenantId, printhouseId]);
        return rows;
    }

    async auditLiveApprovalWorkflowEvent(event) {
        if (!this.db) return;
        return this.enablementSvc.auditLiveEnablementEvent(event);
    }
}

module.exports = LiveApprovalWorkflowService;
