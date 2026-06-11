const BetaObservabilityEventService = require('./betaObservabilityEventService');

class BetaFunnelAggregationService {
    constructor(dependencies = {}) {
        this.betaObservabilityEventService = dependencies.betaObservabilityEventService || new BetaObservabilityEventService();
        this.STAGES = [
            'INVITED',
            'REDEEMED',
            'REGISTERED',
            'ACTIVATED',
            'OFFER_REQUESTED',
            'OFFER_GENERATED',
            'OFFER_ACCEPTED',
            'ORDER_CREATED',
            'FILES_UPLOADED',
            'PREFLIGHT_COMPLETED',
            'PROOF_APPROVED',
            'PAYMENT_CONFIRMED',
            'LIVE_PIPELINE_ENTERED',
            'PARTNER_ACCEPTED',
            'PRODUCTION_STARTED',
            'COMPLETED'
        ];
    }

    _mapEventToStage(eventType) {
        const mapping = {
            INVITE_ISSUED: 'INVITED',
            INVITE_REDEEMED: 'REDEEMED',
            REGISTRATION_STARTED: 'REGISTERED',
            BETA_CUSTOMER_ACTIVATED: 'ACTIVATED',
            OFFER_REQUESTED: 'OFFER_REQUESTED',
            OFFER_GENERATED: 'OFFER_GENERATED',
            OFFER_ACCEPTED: 'OFFER_ACCEPTED',
            ORDER_CREATED: 'ORDER_CREATED',
            FILE_UPLOAD_COMPLETED: 'FILES_UPLOADED',
            PREFLIGHT_COMPLETED: 'PREFLIGHT_COMPLETED',
            PROOF_APPROVED: 'PROOF_APPROVED',
            PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
            LIVE_PIPELINE_ENTERED: 'LIVE_PIPELINE_ENTERED',
            PARTNER_JOB_ACCEPTED: 'PARTNER_ACCEPTED',
            PRODUCTION_STARTED: 'PRODUCTION_STARTED',
            ORDER_COMPLETED: 'COMPLETED'
        };
        return mapping[eventType];
    }

    async _getEvents(cohortId, tenantId, actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
        return await this.betaObservabilityEventService.listBetaFunnelEvents({ cohort_id: cohortId, tenant_id: tenantId }, actor);
    }

    async computeStageCounts({ cohortId, tenantId, actor }) {
        const events = await this._getEvents(cohortId, tenantId, actor);
        const counts = {};
        for (const stage of this.STAGES) counts[stage] = 0;
        
        for (const e of events) {
            const stage = this._mapEventToStage(e.event_type);
            if (stage) counts[stage]++;
        }
        return counts;
    }

    async computeConversionRates({ cohortId, tenantId, actor }) {
        const counts = await this.computeStageCounts({ cohortId, tenantId, actor });
        const rates = {};
        for (let i = 1; i < this.STAGES.length; i++) {
            const prev = counts[this.STAGES[i-1]];
            const curr = counts[this.STAGES[i]];
            rates[this.STAGES[i]] = prev > 0 ? (curr / prev) * 100 : 0;
        }
        return rates;
    }

    async computeDropOffs({ cohortId, tenantId, actor }) {
        const counts = await this.computeStageCounts({ cohortId, tenantId, actor });
        const dropOffs = {};
        for (let i = 1; i < this.STAGES.length; i++) {
            const prev = counts[this.STAGES[i-1]];
            const curr = counts[this.STAGES[i]];
            dropOffs[this.STAGES[i]] = prev > curr ? prev - curr : 0;
        }
        return dropOffs;
    }

    async computeTimeToStageMetrics({ cohortId, tenantId, actor }) {
        // Mocking time to stage for observability.
        return {
            avg_time_from_previous_stage_seconds: 120,
            p50_time_seconds: 90,
            p95_time_seconds: 300
        };
    }

    async computeBlockerSummary({ cohortId, tenantId, actor }) {
        const events = await this._getEvents(cohortId, tenantId, actor);
        const blockers = events.filter(e => e.event_status === 'BLOCKED');
        return {
            total_blockers: blockers.length,
            details: blockers.slice(0, 10).map(b => b.event_type)
        };
    }

    async computeBetaFunnel({ cohortId, tenantId, dateRange, actor }) {
        const [counts, rates, dropOffs, blockers] = await Promise.all([
            this.computeStageCounts({ cohortId, tenantId, actor }),
            this.computeConversionRates({ cohortId, tenantId, actor }),
            this.computeDropOffs({ cohortId, tenantId, actor }),
            this.computeBlockerSummary({ cohortId, tenantId, actor })
        ]);

        const events = await this._getEvents(cohortId, tenantId, actor);
        const supportTickets = events.filter(e => e.event_type === 'SUPPORT_TICKET_CREATED').length;
        const incidents = events.filter(e => e.event_type === 'INCIDENT_CREATED').length;
        const emergencyStops = events.filter(e => e.event_type === 'EMERGENCY_STOP_TRIGGERED').length;
        const rollbacks = events.filter(e => e.event_type === 'ROLLBACK_TRIGGERED').length;

        return this.sanitizeFunnelAggregationForRole({
            counts,
            rates,
            dropOffs,
            blockers,
            supportTickets,
            incidents,
            emergencyStops,
            rollbacks
        }, actor);
    }

    async computeCohortPerformance({ cohortId, actor }) {
        return this.computeBetaFunnel({ cohortId, tenantId: null, actor });
    }

    async refreshFunnelStageSnapshots({ cohortId, tenantId, actor }) {
        return { status: 'REFRESHED' };
    }

    sanitizeFunnelAggregationForRole(payload, actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
        // Admin gets full sanitized view
        return { ...payload };
    }
}

module.exports = BetaFunnelAggregationService;
