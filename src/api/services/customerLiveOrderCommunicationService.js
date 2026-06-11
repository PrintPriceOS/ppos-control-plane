class CustomerLiveOrderCommunicationService {
    constructor(dependencies = {}) {
        this.liveOrderLifecycleService = dependencies.liveOrderLifecycleService || {};
        this._mockDb = {
            messages: [],
            events: []
        };
    }

    renderCustomerMessageTemplate({ templateKey, payload = {}, locale = 'en' }) {
        // Forbidden words simulation validation
        const strictValidation = (str) => {
            const forbidden = ['guaranteed delivery', 'certified', 'print-ready'];
            const lowerStr = str.toLowerCase();
            for (const word of forbidden) {
                if (lowerStr.includes(word)) throw new Error(`Forbidden wording used: ${word}`);
            }
            return str;
        };

        const templates = {
            'ORDER_RECEIVED': {
                subject: 'Your order has been received',
                body: 'We have received your order {orderNumber}. We will review the details shortly.'
            },
            'FILES_NEEDED': {
                subject: 'Action required: Upload missing files',
                body: 'Please upload the required files for order {orderNumber} so we can proceed.'
            },
            'FILE_CHECK_IN_PROGRESS': {
                subject: 'File check in progress',
                body: 'We are currently checking the files for order {orderNumber}.'
            },
            'PROOF_REVIEW_REQUIRED': {
                subject: 'Action required: Review your proof',
                body: 'A proof is ready for your review for order {orderNumber}. Please approve it to continue.'
            },
            'PAYMENT_REQUIRED': {
                subject: 'Action required: Payment',
                body: 'Please provide payment reference for order {orderNumber} to continue.'
            },
            'REUPLOAD_REQUIRED': {
                subject: 'Action required: Reupload files',
                body: 'We detected an issue during the file check for order {orderNumber}. Please reupload the files.'
            },
            'PRODUCTION_PAUSED': {
                subject: 'Production paused',
                body: 'Production for order {orderNumber} has been temporarily paused for a routine check.'
            },
            'PRODUCTION_BLOCKED': {
                subject: 'Production blocked',
                body: 'We need to resolve an issue before production can continue for order {orderNumber}.'
            },
            'HANDOFF_IN_PROGRESS': {
                subject: 'Preparing for delivery',
                body: 'Order {orderNumber} is being prepared for final handoff.'
            },
            'COMPLETED': {
                subject: 'Order completed',
                body: 'Your order {orderNumber} has been completed.'
            },
            'CANCELLATION_REQUESTED': {
                subject: 'Cancellation requested',
                body: 'We have received your cancellation request for order {orderNumber}.'
            }
        };

        const template = templates[templateKey];
        if (!template) throw new Error(`Unknown template key: ${templateKey}`);

        let body = template.body.replace('{orderNumber}', payload.live_order_number || '');
        return {
            subject: strictValidation(template.subject),
            body: strictValidation(body)
        };
    }

    async createCustomerLiveOrderMessage({ liveOrderId, messageType, channel, payload, actor, templateKey }) {
        // Enforce boundaries
        if (!actor.tenantId) throw new Error('Unauthorized');
        
        const content = templateKey ? this.renderCustomerMessageTemplate({ templateKey, payload }) : { subject: payload.subject, body: payload.body };

        const message = {
            id: `msg_${Date.now()}`,
            tenant_id: actor.tenantId,
            live_order_id: liveOrderId,
            customer_id: actor.role === 'CUSTOMER' ? actor.userId : payload.customer_id,
            message_type: messageType,
            channel: channel,
            delivery_status: 'CREATED',
            subject: content.subject,
            body: content.body,
            safe_payload_json: payload,
            created_at: new Date().toISOString()
        };

        this._mockDb.messages.push(message);

        await this.auditCustomerCommunicationEvent({
            tenantId: actor.tenantId,
            liveOrderId,
            eventType: `MESSAGE_CREATED_${messageType}`,
            actor
        });

        return message;
    }

    async queueCustomerNotification({ liveOrderId, messageId, channel, actor }) {
        const msg = this._mockDb.messages.find(m => m.id === messageId);
        if (!msg) throw new Error('Message not found');

        msg.delivery_status = 'QUEUED';
        await this.auditCustomerCommunicationEvent({
            tenantId: actor.tenantId,
            liveOrderId,
            eventType: 'MESSAGE_QUEUED',
            actor
        });
        return true;
    }

    async markCustomerMessageSent({ messageId, providerMessageId, actor }) {
        const msg = this._mockDb.messages.find(m => m.id === messageId);
        if (!msg) throw new Error('Message not found');

        msg.delivery_status = 'SENT';
        msg.sent_at = new Date().toISOString();
        
        this._mockDb.events.push({
            event_type: 'MESSAGE_SENT',
            provider_message_id: providerMessageId,
            status: 'SUCCESS'
        });

        return true;
    }

    async markCustomerMessageRead({ messageId, actor }) {
        const msg = this._mockDb.messages.find(m => m.id === messageId);
        if (!msg) throw new Error('Message not found');

        if (actor.role === 'CUSTOMER' && msg.customer_id !== actor.userId) throw new Error('Unauthorized');

        msg.delivery_status = 'READ';
        msg.read_at = new Date().toISOString();
        return true;
    }

    async listCustomerMessages({ liveOrderId, actor }) {
        if (!actor.tenantId) throw new Error('Unauthorized');
        
        return this._mockDb.messages.filter(m => {
            if (m.live_order_id !== liveOrderId) return false;
            if (m.tenant_id !== actor.tenantId) return false;
            if (actor.role === 'CUSTOMER' && m.customer_id && m.customer_id !== actor.userId) return false;
            if (m.channel === 'INTERNAL_ONLY' && actor.role === 'CUSTOMER') return false;
            return true;
        });
    }

    async buildActionRequiredMessage({ liveOrderId, actionType, actor, orderPayload }) {
        const templateMap = {
            'UPLOAD_FILES': 'FILES_NEEDED',
            'APPROVE_PROOF': 'PROOF_REVIEW_REQUIRED',
            'CONFIRM_PAYMENT_REFERENCE': 'PAYMENT_REQUIRED',
            'REUPLOAD_FILES': 'REUPLOAD_REQUIRED'
        };

        const templateKey = templateMap[actionType];
        if (!templateKey) throw new Error(`No template for action type ${actionType}`);

        return await this.createCustomerLiveOrderMessage({
            liveOrderId,
            messageType: 'ACTION_REQUIRED',
            channel: 'PORTAL',
            payload: orderPayload,
            actor,
            templateKey
        });
    }

    async auditCustomerCommunicationEvent(event) {
        if (this.liveOrderLifecycleService.recordLiveOrderEvent) {
            await this.liveOrderLifecycleService.recordLiveOrderEvent({
                tenantId: event.tenantId || 'system',
                liveOrderId: event.liveOrderId,
                eventType: event.eventType,
                actor: event.actor,
                message: event.message
            });
        }
    }
}

module.exports = CustomerLiveOrderCommunicationService;
