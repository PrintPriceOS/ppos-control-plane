const crypto = require('crypto');

class FinancialReconciliationLedgerService {
    constructor() {
        this._mockRuns = [];
        this._mockSnapshots = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createReconciliationRun({ scope, filters, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const run = {
            id: `run_${crypto.randomUUID()}`,
            tenant_id: filters.tenantId || 'global',
            run_status: 'DRAFT',
            run_scope: scope,
            currency: filters.currency || 'USD',
            total_customer_payments: 0,
            total_refunds: 0,
            total_reversals: 0,
            total_partner_payables: 0,
            total_platform_fees: 0,
            total_payout_ready: 0,
            total_payout_executed_external: 0,
            total_unresolved_holds: 0,
            mismatch_count: 0,
            warning_count: 0,
            blocking_count: 0,
            created_by: actor.userId,
            created_by_role: actor.role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        this._mockRuns.push(run);
        
        await this.recordFinancialReconciliationEvent({
            reconciliationRunId: run.id,
            tenantId: run.tenant_id,
            eventType: 'RECONCILIATION_RUN_CREATED',
            actorUserId: actor.userId,
            actorRole: actor.role,
            message: 'Reconciliation run created'
        });

        return run;
    }

    async startReconciliationRun({ reconciliationRunId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const run = this._mockRuns.find(r => r.id === reconciliationRunId);
        if (!run) throw new Error('Run not found');

        run.run_status = 'RUNNING';
        run.updated_at = new Date().toISOString();

        await this.recordFinancialReconciliationEvent({
            reconciliationRunId: run.id,
            tenantId: run.tenant_id,
            eventType: 'RECONCILIATION_STARTED',
            actorUserId: actor.userId,
            actorRole: actor.role,
            message: 'Reconciliation run started'
        });

        return run;
    }

    async createLedgerSnapshot({ reconciliationRunId, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const run = this._mockRuns.find(r => r.id === reconciliationRunId);
        if (!run) throw new Error('Run not found');
        if (run.tenant_id !== 'global' && payload.tenant_id !== run.tenant_id) {
            throw new Error('Cross-tenant access blocked');
        }

        const snapshot = {
            id: `snap_${crypto.randomUUID()}`,
            reconciliation_run_id: reconciliationRunId,
            tenant_id: payload.tenant_id,
            snapshot_type: payload.snapshot_type,
            amount: payload.amount,
            currency: payload.currency,
            ledger_status: payload.ledger_status,
            safe_source_hash: crypto.createHash('sha256').update(JSON.stringify(payload.source_json || {})).digest('hex'),
            created_at: new Date().toISOString()
        };

        this._mockSnapshots.push(snapshot);

        await this.recordFinancialReconciliationEvent({
            reconciliationRunId: run.id,
            tenantId: snapshot.tenant_id,
            eventType: 'LEDGER_SNAPSHOT_CREATED',
            actorUserId: actor.userId,
            actorRole: actor.role,
            message: `Snapshot created for ${snapshot.snapshot_type}`
        });

        return snapshot;
    }

    async buildLedgerSnapshotsForRun({ reconciliationRunId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        return this._mockSnapshots.filter(s => s.reconciliation_run_id === reconciliationRunId);
    }

    async getReconciliationRun({ reconciliationRunId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        return this._mockRuns.find(r => r.id === reconciliationRunId);
    }

    async listReconciliationRuns(filters, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        return this._mockRuns;
    }

    async recordFinancialReconciliationEvent(event) {
        const ev = { ...event, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        this._mockEvents.push(ev);
        return ev;
    }

    async sanitizeLedgerSnapshotForRole(snapshot, actor) {
        const safeSnapshot = { ...snapshot };
        // Exclude raw provider payloads unconditionally to fulfill safety requirement
        delete safeSnapshot.source_json;
        return safeSnapshot;
    }
}

module.exports = FinancialReconciliationLedgerService;
