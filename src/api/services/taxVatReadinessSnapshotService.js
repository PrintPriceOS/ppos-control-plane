const crypto = require('crypto');

class TaxVatReadinessSnapshotService {
    constructor(dependencies = {}) {
        this.classifierService = dependencies.taxVatReadinessClassifierService;
        this._mockSnapshots = [];
        this._mockFindings = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async buildTaxVatReadinessSnapshot({ sourceData, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);

        const classification = this.classifierService.classifyReadiness({
            seller_country: sourceData.seller_country,
            customer_country: sourceData.customer_country,
            customer_vat_id: sourceData.customer_vat_id,
            customer_type: sourceData.customer_type,
            amount: sourceData.amount,
            expected_tax_amount: sourceData.expected_tax_amount
        });

        const snapshot = {
            id: `tv_snap_${crypto.randomUUID()}`,
            snapshot_id: sourceData.snapshot_id || `src_${crypto.randomUUID()}`,
            order_id: sourceData.order_id,
            invoice_id: sourceData.invoice_id,
            tenant_id: sourceData.tenant_id,
            reconciliation_run_id: sourceData.reconciliation_run_id,
            jurisdiction_code: classification.jurisdiction_code,
            customer_country: sourceData.customer_country,
            seller_country: sourceData.seller_country,
            currency: sourceData.currency || 'USD',
            taxable_amount: sourceData.amount,
            tax_amount_estimated: sourceData.amount * classification.tax_rate_applied,
            tax_rate_applied: classification.tax_rate_applied,
            tax_treatment: classification.tax_treatment,
            reverse_charge_flag: classification.reverse_charge_flag,
            exemption_flag: classification.exemption_flag,
            readiness_status: classification.readiness_status,
            warnings_json: classification.warnings,
            evidence_json: classification.evidence,
            source_snapshot_json: { ...sourceData },
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockSnapshots.push(snapshot);

        await this._recordEvent({
            eventType: 'TAX_VAT_READINESS_SNAPSHOT_CREATED',
            actor,
            snapshot_id: snapshot.id,
            tenant_id: snapshot.tenant_id,
            message: `Snapshot created with status ${snapshot.readiness_status}`
        });

        await this._recordEvent({
            eventType: 'TAX_VAT_READINESS_CLASSIFIED',
            actor,
            snapshot_id: snapshot.id,
            tenant_id: snapshot.tenant_id,
            message: `Classified as ${snapshot.tax_treatment}`
        });

        if (classification.readiness_status === 'MANUAL_REVIEW_REQUIRED') {
            await this._recordEvent({
                eventType: 'TAX_VAT_READINESS_MANUAL_REVIEW_REQUIRED',
                actor,
                snapshot_id: snapshot.id,
                tenant_id: snapshot.tenant_id,
                message: 'Manual review required based on classification'
            });
        }

        for (const findingCode of classification.findings) {
            const finding = {
                id: `find_${crypto.randomUUID()}`,
                snapshot_id: snapshot.id,
                finding_code: findingCode,
                severity: 'WARNING',
                category: 'CLASSIFICATION',
                message: `Finding: ${findingCode}`,
                status: 'OPEN',
                created_at: new Date().toISOString()
            };
            this._mockFindings.push(finding);
        }

        for (const warning of classification.warnings) {
            await this._recordEvent({
                eventType: 'TAX_VAT_READINESS_WARNING_RAISED',
                actor,
                snapshot_id: snapshot.id,
                tenant_id: snapshot.tenant_id,
                message: `Warning: ${warning}`
            });
        }

        return snapshot;
    }

    async getSnapshot({ snapshotId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        return this._mockSnapshots.find(s => s.id === snapshotId);
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

module.exports = TaxVatReadinessSnapshotService;
