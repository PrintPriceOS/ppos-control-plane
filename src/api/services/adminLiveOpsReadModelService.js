class AdminLiveOpsReadModelService {
    constructor() {
        this._mockDb = {
            snapshots: [],
            events: []
        };
    }

    async buildLiveOpsSnapshot({ liveOrderId, actor }) {
        // Mock aggregation of different states
        const snapshot = {
            id: `snap_${Date.now()}`,
            tenant_id: actor.tenantId,
            live_order_id: liveOrderId,
            partner_live_job_id: null,
            live_order_status: 'PROCESSING',
            partner_job_status: null,
            sla_risk_level: 'LOW',
            incident_summary_json: { criticalCount: 0, openCount: 0 },
            gate_summary_json: { allPassed: true, hardBlocker: false },
            customer_action_summary_json: { pendingAction: false },
            live_enablement_status: 'ACTIVE',
            created_at: new Date().toISOString()
        };

        snapshot.command_status = this.computeCommandStatus(snapshot);
        snapshot.command_actions_json = this.computeAllowedCommandActions(snapshot, actor);

        this._mockDb.snapshots.push(snapshot);
        return snapshot;
    }

    async refreshLiveOpsSnapshot({ liveOrderId, actor }) {
        const idx = this._mockDb.snapshots.findIndex(s => s.live_order_id === liveOrderId);
        if (idx !== -1) {
            this._mockDb.snapshots[idx].command_status = this.computeCommandStatus(this._mockDb.snapshots[idx]);
            return this._mockDb.snapshots[idx];
        }
        return await this.buildLiveOpsSnapshot({ liveOrderId, actor });
    }

    async listLiveOpsSnapshots(filters = {}, actor) {
        return this._mockDb.snapshots.filter(s => {
            if (actor.role !== 'SYSTEM_ADMIN' && s.tenant_id !== actor.tenantId) return false;
            return true;
        }).map(s => this.sanitizeCommandSnapshotForRole(s, actor));
    }

    async getLiveOpsSnapshot({ snapshotId, actor }) {
        const snap = this._mockDb.snapshots.find(s => s.id === snapshotId);
        if (!snap) throw new Error('Snapshot not found');
        if (actor.role !== 'SYSTEM_ADMIN' && snap.tenant_id !== actor.tenantId) throw new Error('Unauthorized cross-tenant access');
        return this.sanitizeCommandSnapshotForRole(snap, actor);
    }

    computeCommandStatus(snapshot) {
        if (snapshot.incident_summary_json?.criticalCount > 0) return 'INCIDENT_OPEN';
        if (snapshot.sla_risk_level === 'CRITICAL') return 'BREACHED'; // Mock mapping breached
        if (snapshot.gate_summary_json?.hardBlocker) return 'BLOCKED';
        if (snapshot.customer_action_summary_json?.pendingAction) return 'ACTION_REQUIRED';
        if (snapshot.live_enablement_status === 'PAUSED') return 'PAUSED';
        if (snapshot.live_enablement_status === 'REVOKED') return 'REVOKED';
        if (snapshot.partner_job_status === 'ON_HOLD') return 'ATTENTION_REQUIRED';
        if (snapshot.live_order_status === 'COMPLETED') return 'COMPLETED';
        return 'NORMAL';
    }

    computeAllowedCommandActions(snapshot, actor) {
        return ['PAUSE', 'ESCALATE', 'VIEW_TIMELINE'];
    }

    async buildGateSummary({ liveOrderId, actor }) { return { allPassed: true }; }
    async buildIncidentSummary({ liveOrderId, partnerLiveJobId, actor }) { return { criticalCount: 0 }; }
    async buildPartnerSummary({ partnerLiveJobId, actor }) { return { status: 'UNKNOWN' }; }
    async buildCustomerActionSummary({ liveOrderId, actor }) { return { pendingAction: false }; }
    async buildHandoffSummary({ liveOrderId, actor }) { return { ready: true }; }
    async buildRollbackSummary({ liveOrderId, actor }) { return { rollbackCount: 0 }; }

    sanitizeCommandSnapshotForRole(snapshot, actor) {
        const safe = { ...snapshot };
        // Role based redactions
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN'].includes(actor.role)) {
            // Further scrubbing for lower roles
            delete safe.rollback_summary_json;
        }
        return safe;
    }

    async recordCommandEvent(event) {
        this._mockDb.events.push({
            id: `evt_${Date.now()}`,
            ...event,
            created_at: new Date().toISOString()
        });
    }
}

module.exports = AdminLiveOpsReadModelService;
