const crypto = require('crypto');

class TaxVatReadinessReviewService {
    constructor(dependencies = {}) {
        this.snapshotService = dependencies.taxVatReadinessSnapshotService;
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async executeReviewAction({ snapshotId, actionType, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const snapshot = await this.snapshotService.getSnapshot({ snapshotId, actor });
        if (!snapshot) throw new Error('Snapshot not found');

        let message = '';

        switch (actionType) {
            case 'MARK_REVIEWED':
                snapshot.readiness_status = 'REVIEWED';
                message = 'Snapshot marked as reviewed';
                break;
            case 'MARK_NEEDS_ACCOUNTANT_REVIEW':
                snapshot.readiness_status = 'ACCOUNTANT_REVIEW_REQUIRED';
                message = 'Snapshot flagged for accountant review';
                break;
            case 'OVERRIDE_TAX_TREATMENT_FOR_EXPORT_ONLY':
                if (!payload || !payload.new_treatment) throw new Error('Missing new_treatment payload');
                snapshot.tax_treatment = payload.new_treatment;
                snapshot.readiness_status = 'REVIEWED_WITH_OVERRIDE';
                message = `Tax treatment overridden to ${payload.new_treatment} for export readiness only`;
                break;
            case 'ADD_REVIEW_NOTE':
                if (!payload || !payload.note) throw new Error('Missing note payload');
                message = `Review note added: ${payload.note}`;
                break;
            case 'DISMISS_WARNING':
                if (!payload || !payload.warning_index === undefined || !payload.reason) throw new Error('Missing warning_index or reason');
                message = `Warning dismissed: ${payload.reason}`;
                break;
            case 'RESOLVE_FINDING':
                if (!payload || !payload.finding_id) throw new Error('Missing finding_id');
                const finding = this.snapshotService._mockFindings.find(f => f.id === payload.finding_id);
                if (finding) {
                    finding.status = 'RESOLVED';
                    finding.resolved_at = new Date().toISOString();
                    finding.resolved_by = actor.userId;
                    message = `Finding ${payload.finding_id} resolved`;
                } else {
                    throw new Error('Finding not found');
                }
                break;
            default:
                throw new Error('Invalid actionType');
        }

        await this._recordEvent({
            eventType: `TAX_VAT_REVIEW_ACTION_${actionType}`,
            actor,
            snapshot_id: snapshot.id,
            tenant_id: snapshot.tenant_id,
            message
        });

        return snapshot;
    }

    async getAuditTimeline({ snapshotId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const evs = this.snapshotService._mockEvents.filter(e => e.snapshot_id === snapshotId).concat(
            this._mockEvents.filter(e => e.snapshot_id === snapshotId)
        );
        return evs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            snapshot_id: event.snapshot_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = TaxVatReadinessReviewService;
