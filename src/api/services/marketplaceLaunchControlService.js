class MarketplaceLaunchControlService {
    constructor() {
        this._mockControl = {
            id: 'lc_1',
            launch_status: 'NOT_STARTED',
            public_marketplace_launch_enabled: false,
            public_intake_enabled: false,
            launch_scope: 'INTERNAL_ONLY',
            active_cohort_id: null
        };
        this._mockCohorts = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized: Role ${actor.role} lacks permission for launch control`);
        }
    }

    async getLaunchControlState(actor) {
        return { ...this._mockControl };
    }

    async createOrUpdateLaunchControl({ payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        Object.assign(this._mockControl, payload);
        return { ...this._mockControl };
    }

    async createLaunchCohort({ payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const cohort = {
            id: `coh_${Date.now()}`,
            cohort_name: payload.cohort_name,
            cohort_status: 'DRAFT',
            cohort_type: payload.cohort_type || 'INTERNAL',
            allowed_tenant_ids_json: payload.allowed_tenant_ids_json || null,
            allowed_printhouse_ids_json: payload.allowed_printhouse_ids_json || null,
            allowed_order_types_json: payload.allowed_order_types_json || null
        };
        this._mockCohorts.push(cohort);
        await this.recordLaunchEvent({ event_type: 'COHORT_CREATED', cohort_id: cohort.id, actor });
        return cohort;
    }

    async updateLaunchCohort({ cohortId, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const cohort = this._mockCohorts.find(c => c.id === cohortId);
        if (!cohort) throw new Error('Cohort not found');
        Object.assign(cohort, payload);
        return cohort;
    }

    async activateLaunchCohort({ cohortId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const cohort = this._mockCohorts.find(c => c.id === cohortId);
        if (!cohort) throw new Error('Cohort not found');
        cohort.cohort_status = 'ACTIVE';
        await this.recordLaunchEvent({ event_type: 'COHORT_ACTIVATED', cohort_id: cohortId, actor });
        return cohort;
    }

    async pauseLaunchCohort({ cohortId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const cohort = this._mockCohorts.find(c => c.id === cohortId);
        if (cohort) cohort.cohort_status = 'PAUSED';
        await this.recordLaunchEvent({ event_type: 'COHORT_PAUSED', cohort_id: cohortId, actor, metadata_json: { reason } });
        return cohort;
    }

    async closeLaunchCohort({ cohortId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const cohort = this._mockCohorts.find(c => c.id === cohortId);
        if (cohort) cohort.cohort_status = 'CLOSED';
        await this.recordLaunchEvent({ event_type: 'COHORT_CLOSED', cohort_id: cohortId, actor, metadata_json: { reason } });
        return cohort;
    }

    async requestLaunchReview({ actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        this._mockControl.launch_status = 'READINESS_REVIEW';
        await this.recordLaunchEvent({ event_type: 'LAUNCH_REVIEW_REQUESTED', actor });
        return { ...this._mockControl };
    }

    async approveLaunch({ approvalPayload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        this._mockControl.launch_status = 'APPROVED';
        this._mockControl.approval_snapshot_json = approvalPayload;
        await this.recordLaunchEvent({ event_type: 'LAUNCH_APPROVED', actor });
        return { ...this._mockControl };
    }

    async activateLimitedPublicRollout({ cohortId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        if (this._mockControl.launch_status !== 'APPROVED') throw new Error('Launch must be APPROVED first');
        const cohort = this._mockCohorts.find(c => c.id === cohortId);
        if (!cohort || cohort.cohort_status !== 'ACTIVE') throw new Error('Active cohort required');
        
        this._mockControl.launch_status = 'LIMITED_PUBLIC_ROLLOUT';
        this._mockControl.active_cohort_id = cohortId;
        this._mockControl.public_marketplace_launch_enabled = true;
        this._mockControl.public_intake_enabled = true;
        this._mockControl.launch_scope = 'LIMITED_PUBLIC';
        
        await this.recordLaunchEvent({ event_type: 'LAUNCH_ACTIVATED', cohort_id: cohortId, actor });
        return { ...this._mockControl };
    }

    async pauseLaunch({ reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        this._mockControl.launch_status = 'PAUSED';
        this._mockControl.public_intake_enabled = false;
        await this.recordLaunchEvent({ event_type: 'LAUNCH_PAUSED', actor, metadata_json: { reason } });
        return { ...this._mockControl };
    }

    async resumeLaunch({ actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        this._mockControl.launch_status = 'LIMITED_PUBLIC_ROLLOUT';
        this._mockControl.public_intake_enabled = true;
        await this.recordLaunchEvent({ event_type: 'LAUNCH_RESUMED', actor });
        return { ...this._mockControl };
    }

    async triggerEmergencyStop({ reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        this._mockControl.launch_status = 'EMERGENCY_STOP';
        this._mockControl.public_marketplace_launch_enabled = false;
        this._mockControl.public_intake_enabled = false;
        this._mockControl.public_offer_generation_enabled = false;
        this._mockControl.public_customer_registration_enabled = false;
        this._mockControl.public_payment_enabled = false;
        this._mockControl.public_file_upload_enabled = false;
        this._mockControl.public_partner_fulfillment_enabled = false;
        await this.recordLaunchEvent({ event_type: 'EMERGENCY_STOP_TRIGGERED', actor, metadata_json: { reason } });
        return { ...this._mockControl };
    }

    async rollbackLaunch({ reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        this._mockControl.launch_status = 'ROLLED_BACK';
        this._mockControl.public_marketplace_launch_enabled = false;
        this._mockControl.public_intake_enabled = false;
        this._mockControl.active_cohort_id = null;
        await this.recordLaunchEvent({ event_type: 'LAUNCH_ROLLED_BACK', actor, metadata_json: { reason } });
        return { ...this._mockControl };
    }

    async recordLaunchEvent(event) {
        this._mockEvents.push({ ...event, created_at: new Date().toISOString() });
    }

    async buildLaunchControlSnapshot(actor) {
        return { control: this._mockControl, cohorts: this._mockCohorts };
    }
}

module.exports = MarketplaceLaunchControlService;
