const crypto = require('crypto');

class GovernedInvoiceLifecycleService {
    constructor(dependencies = {}) {
        this.builderService = dependencies.governedInvoiceBuilderService;
        this._mockEvents = [];
        this._mockVersions = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async getInvoice(invoiceId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const inv = this.builderService._mockInvoices.find(i => i.invoice_id === invoiceId);
        if (!inv) throw new Error('Invoice not found');
        return inv;
    }

    async transitionLifecycle({ invoiceId, actionType, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const invoice = await this.getInvoice(invoiceId, actor);

        let message = '';

        switch (actionType) {
            case 'MARK_READY_FOR_REVIEW':
                invoice.lifecycle_status = 'READY_FOR_REVIEW';
                message = 'Invoice marked ready for review';
                await this._recordEvent({ eventType: 'GOVERNED_INVOICE_STATUS_CHANGED', actor, invoice_id: invoiceId, tenant_id: invoice.tenant_id, message });
                break;
            case 'MARK_MANUAL_REVIEW_REQUIRED':
                invoice.lifecycle_status = 'MANUAL_REVIEW_REQUIRED';
                message = 'Invoice marked manual review required';
                await this._recordEvent({ eventType: 'GOVERNED_INVOICE_STATUS_CHANGED', actor, invoice_id: invoiceId, tenant_id: invoice.tenant_id, message });
                break;
            case 'APPROVE_FOR_FINALIZATION':
                invoice.lifecycle_status = 'READY_TO_FINALIZE';
                message = 'Invoice approved for finalization';
                await this._recordEvent({ eventType: 'GOVERNED_INVOICE_STATUS_CHANGED', actor, invoice_id: invoiceId, tenant_id: invoice.tenant_id, message });
                break;
            case 'FINALIZE_INVOICE_MANUALLY':
                invoice.lifecycle_status = 'FINALIZED';
                invoice.finalized_at = new Date().toISOString();
                invoice.finalized_by = actor.userId;
                message = 'Invoice finalized manually';
                await this._recordEvent({ eventType: 'GOVERNED_INVOICE_FINALIZED_MANUALLY', actor, invoice_id: invoiceId, tenant_id: invoice.tenant_id, message });
                break;
            case 'VOID_INVOICE':
                invoice.lifecycle_status = 'VOIDED';
                invoice.voided_at = new Date().toISOString();
                invoice.voided_by = actor.userId;
                message = 'Invoice voided';
                await this._recordEvent({ eventType: 'GOVERNED_INVOICE_VOIDED', actor, invoice_id: invoiceId, tenant_id: invoice.tenant_id, message });
                break;
            case 'ADD_REVIEW_NOTE':
                if (!payload || !payload.note) throw new Error('Missing note');
                message = `Review note added: ${payload.note}`;
                await this._recordEvent({ eventType: 'GOVERNED_INVOICE_REVIEW_NOTE_ADDED', actor, invoice_id: invoiceId, tenant_id: invoice.tenant_id, message });
                break;
            case 'CREATE_NEW_VERSION':
                if (!payload || !payload.change_reason || !payload.new_payload) throw new Error('Missing change_reason or new_payload');
                const vnum = this._mockVersions.filter(v => v.invoice_id === invoiceId).length + 1;
                const version = {
                    id: crypto.randomUUID(),
                    invoice_id: invoiceId,
                    version_number: vnum,
                    lifecycle_status: invoice.lifecycle_status,
                    change_reason: payload.change_reason,
                    created_at: new Date().toISOString()
                };
                this._mockVersions.push(version);
                
                // Update active payload
                invoice.subtotal_amount = payload.new_payload.subtotal_amount !== undefined ? payload.new_payload.subtotal_amount : invoice.subtotal_amount;
                invoice.tax_amount = payload.new_payload.tax_amount !== undefined ? payload.new_payload.tax_amount : invoice.tax_amount;
                invoice.total_amount = invoice.subtotal_amount + invoice.tax_amount;

                message = `New version created: ${payload.change_reason}`;
                await this._recordEvent({ eventType: 'GOVERNED_INVOICE_VERSION_CREATED', actor, invoice_id: invoiceId, tenant_id: invoice.tenant_id, message });
                break;
            default:
                throw new Error('Invalid actionType');
        }

        return invoice;
    }

    async getAuditTimeline(invoiceId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        const evs = this.builderService._mockEvents.filter(e => e.invoice_id === invoiceId).concat(
            this._mockEvents.filter(e => e.invoice_id === invoiceId)
        );
        return evs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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

module.exports = GovernedInvoiceLifecycleService;
