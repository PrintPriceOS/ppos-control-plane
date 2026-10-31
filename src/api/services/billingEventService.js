/**
 * src/api/services/billingEventService.js
 * 
 * Billing Events and Overage Policy Service.
 */
'use strict';

const db = require('./mysqlClient');
const logger = require('./logger').child('billing-events');

class BillingEventService {

    async createBillingEvent(payload) {
        const {
            tenant_id,
            period_key,
            event_type,
            plan_code = null,
            metric = null,
            quantity = 0,
            included_quantity = 0,
            overage_quantity = 0,
            unit_price_cents = 0,
            amount_cents = 0,
            currency = 'EUR',
            status = 'RECORDED',
            metadata_json = null
        } = payload;

        if (!tenant_id || !period_key || !event_type) {
            throw new Error('MISSING_PARAMETERS: tenant_id, period_key, and event_type are required');
        }

        const metadataStr = metadata_json ? (typeof metadata_json === 'string' ? metadata_json : JSON.stringify(metadata_json)) : null;

        const insertRes = await db.query(`
            INSERT INTO billing_events (
                tenant_id, period_key, event_type, plan_code, metric, quantity,
                included_quantity, overage_quantity, unit_price_cents, amount_cents,
                currency, status, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            tenant_id, period_key, event_type, plan_code, metric, quantity,
            included_quantity, overage_quantity, unit_price_cents, amount_cents,
            currency, status, metadataStr
        ]);

        const event = { id: insertRes.insertId, ...payload };
        await this.auditBillingEvent(event);
        return event;
    }

    async recordIncludedUsage({ tenantId, metric, quantity, periodKey }) {
        let planCode = 'FREE';
        try {
            const entRows = await db.query('SELECT plan_code FROM tenant_commercial_entitlements WHERE tenant_id = ?', [tenantId]);
            if (entRows.length > 0) planCode = entRows[0].plan_code;
        } catch (e) {}

        return await this.createBillingEvent({
            tenant_id: tenantId,
            period_key: periodKey,
            event_type: 'INCLUDED_USAGE',
            plan_code: planCode,
            metric,
            quantity,
            amount_cents: 0
        });
    }

    async recordOverage({ tenantId, metric, quantity, includedQuantity, unitPriceCents, currency = 'EUR', periodKey }) {
        let planCode = 'FREE';
        try {
            const entRows = await db.query('SELECT plan_code FROM tenant_commercial_entitlements WHERE tenant_id = ?', [tenantId]);
            if (entRows.length > 0) planCode = entRows[0].plan_code;
        } catch (e) {}

        const overage_quantity = Math.max(0, quantity - includedQuantity);
        const amount_cents = overage_quantity * unitPriceCents;

        return await this.createBillingEvent({
            tenant_id: tenantId,
            period_key: periodKey,
            event_type: 'OVERAGE_RECORDED',
            plan_code: planCode,
            metric,
            quantity,
            included_quantity: includedQuantity,
            overage_quantity,
            unit_price_cents: unitPriceCents,
            amount_cents,
            currency
        });
    }

    async recordLimitWarning({ tenantId, metric, currentUsage, limit, periodKey }) {
        let planCode = 'FREE';
        try {
            const entRows = await db.query('SELECT plan_code FROM tenant_commercial_entitlements WHERE tenant_id = ?', [tenantId]);
            if (entRows.length > 0) planCode = entRows[0].plan_code;
        } catch (e) {}

        return await this.createBillingEvent({
            tenant_id: tenantId,
            period_key: periodKey,
            event_type: 'LIMIT_WARNING',
            plan_code: planCode,
            metric,
            quantity: currentUsage,
            metadata_json: { limit }
        });
    }

    async recordHardLimitBlock({ tenantId, metric, currentUsage, limit, periodKey }) {
        let planCode = 'FREE';
        try {
            const entRows = await db.query('SELECT plan_code FROM tenant_commercial_entitlements WHERE tenant_id = ?', [tenantId]);
            if (entRows.length > 0) planCode = entRows[0].plan_code;
        } catch (e) {}

        return await this.createBillingEvent({
            tenant_id: tenantId,
            period_key: periodKey,
            event_type: 'HARD_LIMIT_BLOCK',
            plan_code: planCode,
            metric,
            quantity: currentUsage,
            metadata_json: { limit }
        });
    }

    async getTenantBillingEvents({ tenantId, periodKey }) {
        return await db.query(
            'SELECT * FROM billing_events WHERE tenant_id = ? AND period_key = ? ORDER BY created_at DESC',
            [tenantId, periodKey]
        );
    }

    async summarizeTenantBillingPeriod({ tenantId, periodKey }) {
        const events = await this.getTenantBillingEvents({ tenantId, periodKey });

        let total_overage_cents = 0;
        let total_adjustment_cents = 0;
        let currency = 'EUR';

        for (const ev of events) {
            if (ev.currency) currency = ev.currency;

            if (ev.event_type === 'OVERAGE_RECORDED') {
                total_overage_cents += Number(ev.amount_cents || 0);
            } else if (ev.event_type === 'MANUAL_ADJUSTMENT' || ev.event_type === 'MANUAL_CREDIT') {
                total_adjustment_cents += Number(ev.amount_cents || 0);
            }
        }

        const grand_total_cents = Math.max(0, total_overage_cents + total_adjustment_cents);

        return {
            tenantId,
            periodKey,
            total_overage_cents,
            total_adjustment_cents,
            grand_total_cents,
            currency,
            events_count: events.length,
            events: events.map(e => ({
                id: e.id,
                event_type: e.event_type,
                metric: e.metric,
                amount_cents: e.amount_cents,
                currency: e.currency,
                created_at: e.created_at
            }))
        };
    }

    async applyManualAdjustment({ tenantId, amountCents, currency = 'EUR', reason, actor = {} }) {
        if (!tenantId || amountCents === undefined || !reason) {
            throw new Error('MISSING_PARAMETERS: tenantId, amountCents, and reason are required');
        }

        // Strict role verification: only Super and Ops admins can apply adjustments
        if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'OPS_ADMIN') {
            throw new Error('UNAUTHORIZED: Only administrators can apply manual adjustments');
        }

        let planCode = 'FREE';
        try {
            const entRows = await db.query('SELECT plan_code FROM tenant_commercial_entitlements WHERE tenant_id = ?', [tenantId]);
            if (entRows.length > 0) planCode = entRows[0].plan_code;
        } catch (e) {}

        const nextMonth = new Date();
        const y = nextMonth.getFullYear();
        const m = String(nextMonth.getMonth() + 1).padStart(2, '0');
        const periodKey = `${y}-${m}`;

        return await this.createBillingEvent({
            tenant_id: tenantId,
            period_key: periodKey,
            event_type: 'MANUAL_ADJUSTMENT',
            plan_code: planCode,
            amount_cents: amountCents,
            currency,
            metadata_json: {
                reason,
                actor_user_id: actor.userId,
                actor_role: actor.role
            }
        });
    }

    async auditBillingEvent(event) {
        logger.debug({ event: 'billing_event_created', ...event });
    }
}

module.exports = new BillingEventService();
