const crypto = require('crypto');

class PartnerCommercialTermsService {
    constructor() {
        this._mockTerms = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createPartnerCommercialTerms({ tenantId, printhouseId, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);

        const terms = {
            id: `pct_${crypto.randomUUID()}`,
            tenant_id: tenantId,
            printhouse_id: printhouseId,
            terms_status: 'DRAFT',
            currency: payload.currency || 'USD',
            settlement_model: payload.settlementModel || 'REVENUE_SHARE',
            platform_fee_type: payload.platformFeeType || 'PERCENTAGE',
            platform_fee_value: payload.platformFeeValue || 0,
            partner_share_percentage: payload.partnerSharePercentage || 100,
            minimum_payout_amount: payload.minimumPayoutAmount || 0,
            payout_delay_days: payload.payoutDelayDays || 30,
            payout_method: payload.payoutMethod || 'MANUAL_ONLY',
            internal_platform_margin_rules: payload.internalRules || null, // Mocking an internal field
            created_by: actor.userId,
            created_by_role: actor.role,
            created_at: new Date().toISOString()
        };

        this._mockTerms.push(terms);

        await this.recordPartnerSettlementEvent({
            tenantId, printhouseId, eventType: 'COMMERCIAL_TERMS_CREATED', actor, message: 'Created commercial terms'
        });

        return terms;
    }

    async activatePartnerCommercialTerms({ commercialTermsId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const terms = this._mockTerms.find(t => t.id === commercialTermsId);
        if (!terms) throw new Error('Commercial terms not found');

        terms.terms_status = 'ACTIVE';

        await this.recordPartnerSettlementEvent({
            tenantId: terms.tenant_id, printhouseId: terms.printhouse_id, eventType: 'COMMERCIAL_TERMS_ACTIVATED', actor, message: 'Activated commercial terms'
        });

        return terms;
    }

    async pausePartnerCommercialTerms({ commercialTermsId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const terms = this._mockTerms.find(t => t.id === commercialTermsId);
        if (!terms) throw new Error('Commercial terms not found');

        terms.terms_status = 'PAUSED';

        await this.recordPartnerSettlementEvent({
            tenantId: terms.tenant_id, printhouseId: terms.printhouse_id, eventType: 'COMMERCIAL_TERMS_PAUSED', actor, message: reason
        });

        return terms;
    }

    async disablePartnerCommercialTerms({ commercialTermsId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const terms = this._mockTerms.find(t => t.id === commercialTermsId);
        if (!terms) throw new Error('Commercial terms not found');

        terms.terms_status = 'DISABLED';

        await this.recordPartnerSettlementEvent({
            tenantId: terms.tenant_id, printhouseId: terms.printhouse_id, eventType: 'COMMERCIAL_TERMS_DISABLED', actor, message: reason
        });

        return terms;
    }

    async getActivePartnerCommercialTerms({ tenantId, printhouseId, actor }) {
        return this._mockTerms.find(t => t.tenant_id === tenantId && t.printhouse_id === printhouseId && t.terms_status === 'ACTIVE');
    }

    async assertPartnerCommercialTermsActive({ tenantId, printhouseId, actor }) {
        const terms = await this.getActivePartnerCommercialTerms({ tenantId, printhouseId, actor });
        if (!terms) throw new Error('Active commercial terms not found');
        return terms;
    }

    async buildPartnerSafeCommercialTermsSummary({ commercialTermsId, actor }) {
        this._assertRole(actor, ['PRINTHOUSE', 'SYSTEM_ADMIN', 'FINANCE_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const terms = this._mockTerms.find(t => t.id === commercialTermsId);
        if (!terms) throw new Error('Commercial terms not found');

        return {
            id: terms.id,
            terms_status: terms.terms_status,
            currency: terms.currency,
            settlement_model: terms.settlement_model,
            partner_share_percentage: terms.partner_share_percentage,
            payout_method: terms.payout_method
        };
    }

    async recordPartnerSettlementEvent(event) {
        const ev = {
            id: `pse_${crypto.randomUUID()}`,
            tenant_id: event.tenantId,
            printhouse_id: event.printhouseId,
            event_type: event.eventType,
            actor_user_id: event.actor.userId,
            actor_role: event.actor.role,
            message: event.message,
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = PartnerCommercialTermsService;
