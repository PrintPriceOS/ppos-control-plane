class MarketplaceLaunchWorkflowService {
    constructor(dependencies = {}) {
        this.launchControlService = dependencies.launchControlService || {};
        this.launchReadinessService = dependencies.launchReadinessService || {};
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized: Role ${actor.role} lacks permission for launch workflow`);
        }
    }

    async submitLaunchReviewRequest({ actor, justification }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const readiness = await this.launchReadinessService.evaluatePublicMarketplaceReadiness({ actor });
        if (!readiness.ready_for_launch_review) {
            throw new Error('Cannot request review: Readiness domains failed');
        }
        const state = await this.launchControlService.requestLaunchReview({ actor });
        await this.auditLaunchWorkflowEvent({ event_type: 'LAUNCH_REVIEW_REQUESTED', actor, metadata: { justification } });
        return state;
    }

    async reviewLaunchReadiness({ actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        return await this.launchReadinessService.buildLaunchReadinessSnapshot({ actor });
    }

    async approveMarketplaceLaunch({ actor, approvalPayload }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        
        // Always require a fresh readiness snapshot on approval
        const snapshot = await this.launchReadinessService.buildLaunchReadinessSnapshot({ actor });
        if (!snapshot.evaluation.ready_for_launch_review) {
            throw new Error('Approval blocked: Current readiness fails');
        }

        const payload = {
            ...approvalPayload,
            readiness_snapshot: snapshot
        };

        const state = await this.launchControlService.approveLaunch({ approvalPayload: payload, actor });
        await this.auditLaunchWorkflowEvent({ event_type: 'LAUNCH_APPROVED', actor, metadata: { payload } });
        return state;
    }

    async rejectMarketplaceLaunch({ actor, reason }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        // Mock state change
        const state = await this.launchControlService.getLaunchControlState(actor);
        state.launch_status = 'REJECTED';
        await this.auditLaunchWorkflowEvent({ event_type: 'LAUNCH_REJECTED', actor, metadata: { reason } });
        return state;
    }

    async activateLimitedRollout({ cohortId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const state = await this.launchControlService.activateLimitedPublicRollout({ cohortId, actor });
        await this.auditLaunchWorkflowEvent({ event_type: 'LAUNCH_ACTIVATED', actor, metadata: { cohortId } });
        return state;
    }

    async pauseMarketplaceLaunch({ actor, reason }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const state = await this.launchControlService.pauseLaunch({ reason, actor });
        await this.auditLaunchWorkflowEvent({ event_type: 'LAUNCH_PAUSED', actor, metadata: { reason } });
        return state;
    }

    async resumeMarketplaceLaunch({ actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const snapshot = await this.launchReadinessService.buildLaunchReadinessSnapshot({ actor });
        if (!snapshot.evaluation.ready_for_launch_review) {
            throw new Error('Resume blocked: Fresh readiness fails');
        }
        const state = await this.launchControlService.resumeLaunch({ actor });
        await this.auditLaunchWorkflowEvent({ event_type: 'LAUNCH_RESUMED', actor });
        return state;
    }

    async triggerMarketplaceEmergencyStop({ actor, reason }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const state = await this.launchControlService.triggerEmergencyStop({ reason, actor });
        await this.auditLaunchWorkflowEvent({ event_type: 'EMERGENCY_STOP_TRIGGERED', actor, metadata: { reason } });
        return state;
    }

    async rollbackMarketplaceLaunch({ actor, reason }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const state = await this.launchControlService.rollbackLaunch({ reason, actor });
        await this.auditLaunchWorkflowEvent({ event_type: 'LAUNCH_ROLLED_BACK', actor, metadata: { reason } });
        return state;
    }

    async getLaunchWorkflowTimeline(actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        return this.launchControlService._mockEvents || [];
    }

    async auditLaunchWorkflowEvent(event) {
        if (this.launchControlService.recordLaunchEvent) {
            await this.launchControlService.recordLaunchEvent(event);
        }
    }
}

module.exports = MarketplaceLaunchWorkflowService;
