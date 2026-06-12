const crypto = require('crypto');

class GovernedInvoiceBuilderService {
    constructor() {
        this._mockEvents = [];
        this._mockInvoices = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async buildGovernedInvoice({ orderData, taxSnapshot, reconciliationSnapshot, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);

        const invoiceId = `inv_${crypto.randomUUID()}`;
        const warnings = [];
        let status = 'DRAFT';

        if (!taxSnapshot) {
            status = 'MANUAL_REVIEW_REQUIRED';
            warnings.push('Missing tax/VAT readiness snapshot. Cannot determine tax treatment.');
        } else if (taxSnapshot.readiness_status !== 'READY' && taxSnapshot.readiness_status !== 'REVIEWED' && taxSnapshot.readiness_status !== 'REVIEWED_WITH_OVERRIDE') {
            status = 'MANUAL_REVIEW_REQUIRED';
            warnings.push(`Tax readiness is ${taxSnapshot.readiness_status}. Manual review required.`);
        }

        if (reconciliationSnapshot && reconciliationSnapshot.mismatch_count > 0) {
            status = 'MANUAL_REVIEW_REQUIRED';
            warnings.push('Reconciliation mismatch present. Invoice requires review.');
        }

        if (taxSnapshot && orderData.currency !== taxSnapshot.currency) {
            status = 'MANUAL_REVIEW_REQUIRED';
            warnings.push('Currency mismatch between order and tax snapshot.');
        }

        const taxAmount = taxSnapshot ? taxSnapshot.tax_amount_estimated : 0;
        const subtotalAmount = orderData.amount || 0;
        const totalAmount = subtotalAmount + taxAmount;

        const invoice = {
            id: `gov_inv_${crypto.randomUUID()}`,
            invoice_id: invoiceId,
            order_id: orderData.order_id,
            tenant_id: orderData.tenant_id,
            customer_id: orderData.customer_id,
            seller_tenant_id: orderData.seller_tenant_id,
            reconciliation_run_id: reconciliationSnapshot ? reconciliationSnapshot.run_id : null,
            tax_vat_snapshot_id: taxSnapshot ? taxSnapshot.id : null,
            invoice_type: 'STANDARD',
            lifecycle_status: status,
            currency: orderData.currency,
            subtotal_amount: subtotalAmount,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            source_snapshot_json: { ...orderData },
            tax_readiness_snapshot_json: taxSnapshot ? { ...taxSnapshot } : null,
            reconciliation_snapshot_json: reconciliationSnapshot ? { ...reconciliationSnapshot } : null,
            metadata_json: { note: 'Governed invoice lifecycle/readiness only' },
            warnings,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockInvoices.push(invoice);

        await this._recordEvent({
            eventType: 'GOVERNED_INVOICE_DRAFT_CREATED',
            actor,
            invoice_id: invoice.invoice_id,
            tenant_id: invoice.tenant_id,
            message: `Governed invoice draft created with status ${status}`
        });

        if (status === 'MANUAL_REVIEW_REQUIRED') {
            await this._recordEvent({
                eventType: 'GOVERNED_INVOICE_MANUAL_REVIEW_REQUIRED',
                actor,
                invoice_id: invoice.invoice_id,
                tenant_id: invoice.tenant_id,
                message: 'Invoice requires manual review due to warnings'
            });
        } else if (status === 'READY_FOR_REVIEW') {
             await this._recordEvent({
                eventType: 'GOVERNED_INVOICE_READY_FOR_REVIEW',
                actor,
                invoice_id: invoice.invoice_id,
                tenant_id: invoice.tenant_id,
                message: 'Invoice marked ready for review'
            });
        }

        for (const warning of warnings) {
            await this._recordEvent({
                eventType: 'GOVERNED_INVOICE_WARNING_RAISED',
                actor,
                invoice_id: invoice.invoice_id,
                tenant_id: invoice.tenant_id,
                message: warning
            });
        }

        return invoice;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            invoice_id: event.invoice_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = GovernedInvoiceBuilderService;
