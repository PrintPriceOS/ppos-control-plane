const crypto = require('crypto');

class BetaObservabilityEventService {
    constructor() {
        this._mockEvents = [];
        this._mockAudits = [];
    }

    async recordBetaFunnelEvent(event) {
        const fullEvent = {
            id: `bf_${crypto.randomUUID()}`,
            event_id: event.event_id || `evt_${crypto.randomUUID()}`,
            ...event,
            pii_minimized_json: this.maskCustomerPII(event.pii_minimized_json || {}),
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(fullEvent);
        return fullEvent;
    }

    async recordBetaFunnelEventOnce(event, idempotencyKey) {
        const existing = this._mockEvents.find(e => e.idempotency_key === idempotencyKey);
        if (existing) return existing;
        const e = { ...event, idempotency_key: idempotencyKey };
        return this.recordBetaFunnelEvent(e);
    }

    async assertCanViewBetaEvent({ eventId, actor }) {
        const event = this._mockEvents.find(e => e.event_id === eventId || e.id === eventId);
        if (!event) throw new Error('Event not found');

        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            // Customer or partner can't view internal observability metrics broadly
            throw new Error('Unauthorized access to beta observability events');
        }

        await this.auditBetaObservabilityAccess({ actor, action: 'VIEW_EVENT', event_id: eventId });
        return event;
    }

    async getBetaFunnelEvent({ eventId, actor }) {
        const event = await this.assertCanViewBetaEvent({ eventId, actor });
        return this.sanitizeFunnelEventForRole(event, actor);
    }

    async listBetaFunnelEvents(filters, actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized access to beta observability events');
        }

        let filtered = this._mockEvents;
        if (filters.tenant_id) {
            filtered = filtered.filter(e => e.tenant_id === filters.tenant_id);
        }
        if (filters.cohort_id) {
            filtered = filtered.filter(e => e.cohort_id === filters.cohort_id);
        }
        
        await this.auditBetaObservabilityAccess({ actor, action: 'LIST_EVENTS', filters });

        return filtered.map(e => this.sanitizeFunnelEventForRole(e, actor));
    }

    sanitizeFunnelEventForRole(event, actor) {
        const safeEvent = { ...event };
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN'].includes(actor.role)) {
            delete safeEvent.internal_metadata_json;
        }
        return safeEvent;
    }

    buildEventCorrelationId(payload) {
        return payload.correlation_id || `corr_${crypto.randomUUID()}`;
    }

    maskCustomerPII(payload) {
        const masked = { ...payload };
        if (masked.email) {
            const parts = masked.email.split('@');
            if (parts.length === 2) {
                masked.email = `${parts[0].charAt(0)}***@${parts[1]}`;
            }
        }
        if (masked.phone) masked.phone = '***-***-****';
        if (masked.name) masked.name = `${masked.name.charAt(0)}***`;
        return masked;
    }

    async auditBetaObservabilityAccess(event) {
        this._mockAudits.push({ ...event, created_at: new Date().toISOString() });
    }
}

module.exports = BetaObservabilityEventService;
