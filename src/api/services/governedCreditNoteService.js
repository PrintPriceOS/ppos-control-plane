const crypto = require('crypto');

class GovernedCreditNoteService {
    constructor(dependencies = {}) {
        this.invoiceLifecycleService = dependencies.governedInvoiceLifecycleService;
        this._mockCreditNotes = [];
        this._mockLinks = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async buildGovernedCreditNote({ invoiceId, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const invoice = await this.invoiceLifecycleService.getInvoice(invoiceId, actor);

        if (!['READY_FOR_REVIEW', 'MANUAL_REVIEW_REQUIRED', 'READY_TO_FINALIZE', 'FINALIZED'].includes(invoice.lifecycle_status)) {
            throw new Error('Invoice must be reviewable or finalized to create a credit note');
        }

        const validReasons = ['CUSTOMER_REFUND', 'ORDER_CANCELLED', 'PRICE_ADJUSTMENT', 'TAX_ADJUSTMENT_REVIEW', 'DUPLICATE_INVOICE', 'MANUAL_CORRECTION'];
        if (!validReasons.includes(payload.reason_code)) {
            throw new Error('Invalid reason_code');
        }

        const creditNote = {
            id: `gov_cn_${crypto.randomUUID()}`,
            credit_note_id: `cn_${crypto.randomUUID()}`,
            invoice_id: invoiceId,
            order_id: invoice.order_id,
            tenant_id: invoice.tenant_id,
            lifecycle_status: 'DRAFT',
            currency: invoice.currency,
            subtotal_amount: payload.subtotal_amount || 0,
            tax_amount: payload.tax_amount || 0,
            total_amount: (payload.subtotal_amount || 0) + (payload.tax_amount || 0),
            reason_code: payload.reason_code,
            reason_note: payload.reason_note,
            source_invoice_snapshot_json: { ...invoice },
            metadata_json: { note: 'Governed credit note lifecycle only' },
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockCreditNotes.push(creditNote);

        await this._recordEvent({
            eventType: 'GOVERNED_CREDIT_NOTE_DRAFT_CREATED',
            actor,
            credit_note_id: creditNote.credit_note_id,
            invoice_id: invoiceId,
            tenant_id: creditNote.tenant_id,
            message: `Governed credit note draft created for reason ${creditNote.reason_code}`
        });

        return creditNote;
    }

    async linkCreditNoteToInvoice({ creditNoteId, invoiceId, amountApplied, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const creditNote = this._mockCreditNotes.find(cn => cn.credit_note_id === creditNoteId);
        if (!creditNote) throw new Error('Credit note not found');

        const link = {
            id: `link_${crypto.randomUUID()}`,
            invoice_id: invoiceId,
            credit_note_id: creditNoteId,
            link_type: 'MANUAL_APPLICATION',
            amount_applied: amountApplied,
            currency: creditNote.currency,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockLinks.push(link);

        await this._recordEvent({
            eventType: 'GOVERNED_CREDIT_NOTE_LINKED_TO_INVOICE',
            actor,
            credit_note_id: creditNoteId,
            invoice_id: invoiceId,
            tenant_id: creditNote.tenant_id,
            message: `Credit note linked to invoice for amount ${amountApplied}`
        });

        return link;
    }

    async finalizeCreditNote({ creditNoteId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const creditNote = this._mockCreditNotes.find(cn => cn.credit_note_id === creditNoteId);
        if (!creditNote) throw new Error('Credit note not found');

        creditNote.lifecycle_status = 'FINALIZED';
        creditNote.finalized_at = new Date().toISOString();
        creditNote.finalized_by = actor.userId;

        await this._recordEvent({
            eventType: 'GOVERNED_CREDIT_NOTE_FINALIZED_MANUALLY',
            actor,
            credit_note_id: creditNoteId,
            invoice_id: creditNote.invoice_id,
            tenant_id: creditNote.tenant_id,
            message: 'Credit note finalized manually'
        });

        return creditNote;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            invoice_id: event.invoice_id,
            credit_note_id: event.credit_note_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = GovernedCreditNoteService;
