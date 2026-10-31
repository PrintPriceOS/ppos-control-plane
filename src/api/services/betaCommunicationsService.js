const crypto = require('crypto');

class BetaCommunicationsService {
    constructor() {
        this._mockTickets = [];
        this._mockEvents = [];
        this.forbiddenClaims = [
            'guaranteed delivery',
            'certified',
            'print-ready',
            'pdf/x certified',
            'pdf/a certified',
            'fully compliant',
            'production-ready'
        ];
    }

    _assertNoForbiddenClaims(text) {
        const lowerText = text.toLowerCase();
        for (const claim of this.forbiddenClaims) {
            if (lowerText.includes(claim)) {
                throw new Error(`Message contains forbidden claim: ${claim}`);
            }
        }
    }

    async renderInviteEmail({ inviteCodeId, actor }) {
        const msg = `You have been selected for our invite-only beta. Capacity is limited. Your access code allows you to explore the platform. Please note that beta access may be paused or revoked at any time.`;
        this._assertNoForbiddenClaims(msg);
        await this.auditBetaCommunicationEvent({ event_type: 'BETA_INVITE', invite_code_id: inviteCodeId, actor });
        return { subject: 'Invite-Only Beta Access', body: msg };
    }

    async renderBetaWelcomeMessage({ betaRegistrationId, actor }) {
        const msg = `Welcome to the beta! Your access is limited and orders are subject to review. Schedule estimates are not guaranteed. Production can continue only after required checks pass.`;
        this._assertNoForbiddenClaims(msg);
        await this.auditBetaCommunicationEvent({ event_type: 'BETA_WELCOME', beta_registration_id: betaRegistrationId, actor });
        return { subject: 'Beta Activation', body: msg };
    }

    async renderBetaLimitationsMessage({ betaRegistrationId, actor }) {
        const msg = `Beta Limitations: Files and orders are subject to review. Production can continue only after required checks pass. Invite-only access. Limited capacity. Schedule estimates are not guaranteed.`;
        this._assertNoForbiddenClaims(msg);
        await this.auditBetaCommunicationEvent({ event_type: 'BETA_LIMITATIONS', beta_registration_id: betaRegistrationId, actor });
        return { subject: 'Beta Limitations Agreement', body: msg };
    }

    async renderBetaOrderStatusMessage({ betaOrderId, messageType, actor }) {
        let msg = '';
        if (messageType === 'BETA_OFFER_CREATED') msg = `Offer created. Orders subject to review.`;
        else if (messageType === 'BETA_ORDER_RECEIVED') msg = `Order received. Production can continue only after required checks pass.`;
        else if (messageType === 'BETA_FILES_REQUIRED') msg = `Files required. Files subject to preflight and approval.`;
        else if (messageType === 'BETA_REVIEW_IN_PROGRESS') msg = `Order under review. Schedule estimates are not guaranteed.`;
        else if (messageType === 'BETA_ACTION_REQUIRED') msg = `Action required. Your order is paused.`;
        else if (messageType === 'BETA_PAUSED') msg = `Your beta access or order is temporarily paused.`;
        else if (messageType === 'BETA_ROLLBACK_NOTICE') msg = `The beta program has been rolled back. Action suspended.`;
        else if (messageType === 'BETA_EMERGENCY_STOP_NOTICE') msg = `Emergency stop active. The beta marketplace is currently halted.`;
        else if (messageType === 'BETA_COMPLETED') msg = `Beta order completed.`;
        else msg = `Status update.`;

        this._assertNoForbiddenClaims(msg);
        await this.auditBetaCommunicationEvent({ event_type: messageType, beta_order_id: betaOrderId, actor });
        return { subject: `Beta Order Update: ${messageType}`, body: msg };
    }

    async createBetaSupportTicket({ customerId, betaOrderId, payload, actor }) {
        this._assertNoForbiddenClaims(payload.message || '');
        const ticket = {
            id: `tick_${crypto.randomUUID()}`,
            customer_id: customerId,
            beta_order_id: betaOrderId,
            message: payload.message,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };
        this._mockTickets.push(ticket);
        await this.auditBetaCommunicationEvent({ event_type: 'BETA_SUPPORT_RECEIVED', ticket_id: ticket.id, actor });
        return ticket;
    }

    async routeBetaSupportTicket({ ticketId, actor }) {
        const ticket = this._mockTickets.find(t => t.id === ticketId);
        if (!ticket) throw new Error('Ticket not found');
        ticket.status = 'ROUTED';
        return ticket;
    }

    async listBetaSupportTickets(filters, actor) {
        return this._mockTickets;
    }

    async auditBetaCommunicationEvent(event) {
        this._mockEvents.push({ ...event, created_at: new Date().toISOString() });
    }
}

module.exports = BetaCommunicationsService;
