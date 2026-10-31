class AdminLiveOpsAggregationService {
    constructor(dependencies = {}) {
        this.readModelService = dependencies.readModelService || {};
        // Mock data to enable aggregation for testing
        this._mockIncidents = [];
        this._mockSla = [];
        this._mockHandoffs = [];
        this._mockCustomerActions = [];
        this._mockPartnerJobs = [];
    }

    _assertAdminAccess(actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized: Admin Command Center restricted to administrative roles');
        }
    }

    _filterByTenantScope(items, actor) {
        if (actor.role === 'SYSTEM_ADMIN') return items;
        return items.filter(i => i.tenant_id === actor.tenantId);
    }

    async getCommandCenterCounters({ filters, actor }) {
        this._assertAdminAccess(actor);
        
        let snapshots = [];
        if (this.readModelService.listLiveOpsSnapshots) {
            snapshots = await this.readModelService.listLiveOpsSnapshots(filters, actor);
        }
        snapshots = this._filterByTenantScope(snapshots, actor);

        return {
            total_live_orders: snapshots.length,
            active_live_orders: snapshots.filter(s => s.live_order_status !== 'COMPLETED').length,
            action_required_orders: snapshots.filter(s => s.command_status === 'ACTION_REQUIRED').length,
            blocked_orders: snapshots.filter(s => s.command_status === 'BLOCKED').length,
            at_risk_orders: snapshots.filter(s => s.sla_risk_level === 'HIGH').length,
            breached_orders: snapshots.filter(s => s.command_status === 'BREACHED').length,
            open_incidents: this._filterByTenantScope(this._mockIncidents, actor).length,
            critical_incidents: this._filterByTenantScope(this._mockIncidents, actor).filter(i => i.severity === 'CRITICAL').length,
            partner_jobs_awaiting_acceptance: this._filterByTenantScope(this._mockPartnerJobs, actor).filter(j => j.status === 'AWAITING_ACCEPTANCE').length,
            partner_jobs_on_hold: this._filterByTenantScope(this._mockPartnerJobs, actor).filter(j => j.status === 'ON_HOLD').length,
            handoffs_ready: this._filterByTenantScope(this._mockHandoffs, actor).filter(h => h.status === 'READY').length,
            handoffs_blocked: this._filterByTenantScope(this._mockHandoffs, actor).filter(h => h.status === 'BLOCKED').length,
            customer_actions_pending: this._filterByTenantScope(this._mockCustomerActions, actor).length,
            payment_pending_verification: 0,
            proof_pending: 0,
            reuploads_pending: 0,
            completions_pending_evidence: 0,
            revoked_or_paused_orders: snapshots.filter(s => ['REVOKED', 'PAUSED'].includes(s.command_status)).length
        };
    }

    async getCommandCenterOverview({ filters, actor }) {
        const counters = await this.getCommandCenterCounters({ filters, actor });
        return { counters };
    }

    async getLiveOrderCommandDetail({ liveOrderId, actor }) {
        this._assertAdminAccess(actor);
        const snapshot = await this.readModelService.getLiveOpsSnapshot({ snapshotId: liveOrderId, actor }); // Mock id passing
        return { snapshot };
    }

    async getPartnerJobCommandDetail({ partnerLiveJobId, actor }) {
        this._assertAdminAccess(actor);
        return { job: this._filterByTenantScope(this._mockPartnerJobs, actor).find(j => j.id === partnerLiveJobId) };
    }

    async getIncidentCommandQueue({ filters, actor }) {
        this._assertAdminAccess(actor);
        let q = this._filterByTenantScope(this._mockIncidents, actor);
        q.sort((a, b) => a.severity === 'CRITICAL' ? -1 : 1);
        return q;
    }

    async getSlaRiskCommandQueue({ filters, actor }) {
        this._assertAdminAccess(actor);
        let q = this._filterByTenantScope(this._mockSla, actor);
        q.sort((a, b) => a.risk === 'CRITICAL' ? -1 : 1);
        return q;
    }

    async getBlockedHandoffQueue({ filters, actor }) {
        this._assertAdminAccess(actor);
        return this._filterByTenantScope(this._mockHandoffs, actor).filter(h => h.status === 'BLOCKED');
    }

    async getCustomerActionQueue({ filters, actor }) {
        this._assertAdminAccess(actor);
        return this._filterByTenantScope(this._mockCustomerActions, actor);
    }

    async getPartnerActionQueue({ filters, actor }) {
        this._assertAdminAccess(actor);
        return this._filterByTenantScope(this._mockPartnerJobs, actor).filter(j => ['AWAITING_ACCEPTANCE', 'ON_HOLD'].includes(j.status));
    }

    async getRevocationImpactView({ tenantId, printhouseId, actor }) {
        this._assertAdminAccess(actor);
        return { tenantId, printhouseId, impactedJobs: 0 };
    }

    async getRollbackActionQueue({ filters, actor }) {
        this._assertAdminAccess(actor);
        return [];
    }

    async searchCommandCenter({ query, filters, actor }) {
        this._assertAdminAccess(actor);
        return { results: [] };
    }
}

module.exports = AdminLiveOpsAggregationService;
