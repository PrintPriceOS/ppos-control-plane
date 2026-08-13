/**
 * src/api/services/printhouseShippingRegionService.js
 * 
 * Phase 191G: Printhouse Shipping Regions & Delivery Methods Governance Service.
 * Manages tenant/site-scoped shipping regions, supported countries, postal rules,
 * delivery methods, and configuration completeness auditing.
 */
const crypto = require('crypto');
const db = require('./mysqlClient');

const PROTECTED_FIELDS = [
    'tenant_id', 'printhouse_id', 'approved', 'verified', 'marketplace_enabled',
    'routing_enabled', 'production_enabled', 'carrier_contract_id',
    'platform_shipping_margin', 'platform_commission', 'credential_hash',
    'created_by', 'created_at', 'updated_at'
];

class PrinthouseShippingRegionService {

    static validateNoProtectedFields(payload) {
        if (!payload || typeof payload !== 'object') return;
        for (const field of PROTECTED_FIELDS) {
            if (field in payload) {
                const err = new Error(`FIELD_NOT_EDITABLE: Mutation of protected field '${field}' is strictly forbidden.`);
                err.code = 'FIELD_NOT_EDITABLE';
                err.statusCode = 400;
                throw err;
            }
        }
    }

    async createShippingRegion(tenantId, siteId, data, actor = null) {
        PrinthouseShippingRegionService.validateNoProtectedFields(data);

        if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
            throw new Error('VALIDATION_ERROR: Region name is required');
        }

        const regionId = `sreg_${crypto.randomUUID()}`;
        const code = (data.code || data.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')).slice(0, 64);
        const countriesJson = JSON.stringify(Array.isArray(data.countries) ? data.countries : []);
        const postalRulesJson = JSON.stringify(Array.isArray(data.postalRules) ? data.postalRules : []);
        const stdDays = Number.isInteger(data.standardTransitDays) ? data.standardTransitDays : 3;
        const expDays = Number.isInteger(data.expeditedTransitDays) ? data.expeditedTransitDays : 1;
        const pickupAvail = Boolean(data.pickupAvailable);
        const handlingDays = Number.isInteger(data.handlingDays) ? data.handlingDays : 1;

        const query = `
            INSERT INTO printhouse_shipping_regions 
            (id, tenant_id, site_id, name, code, enabled, countries_json, postal_rules_json, standard_transit_days, expedited_transit_days, pickup_available, handling_days, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `;

        await db.query(query, [
            regionId, tenantId, siteId, data.name.trim(), code,
            data.enabled !== false, countriesJson, postalRulesJson,
            stdDays, expDays, pickupAvail, handlingDays
        ]);

        await this._recordAudit(tenantId, 'SHIPPING_REGION', regionId, 'CREATED', actor, { name: data.name, code });

        return this.getShippingRegionById(tenantId, regionId);
    }

    async listShippingRegions(tenantId, siteId = null) {
        let query = 'SELECT * FROM printhouse_shipping_regions WHERE tenant_id = ?';
        const params = [tenantId];

        if (siteId) {
            query += ' AND site_id = ?';
            params.push(siteId);
        }

        query += ' ORDER BY created_at DESC';

        const rows = await db.query(query, params);
        return rows.map(r => this._formatRegionRow(r));
    }

    async getShippingRegionById(tenantId, regionId) {
        const rows = await db.query('SELECT * FROM printhouse_shipping_regions WHERE id = ? AND tenant_id = ?', [regionId, tenantId]);
        if (!rows || rows.length === 0) {
            const err = new Error('NOT_FOUND: Shipping region not found');
            err.statusCode = 404;
            throw err;
        }
        return this._formatRegionRow(rows[0]);
    }

    async updateShippingRegion(tenantId, regionId, data, actor = null) {
        PrinthouseShippingRegionService.validateNoProtectedFields(data);
        await this.getShippingRegionById(tenantId, regionId);

        const updates = [];
        const params = [];

        if (data.name !== undefined) {
            updates.push('name = ?');
            params.push(data.name.trim());
        }
        if (data.enabled !== undefined) {
            updates.push('enabled = ?');
            params.push(Boolean(data.enabled));
        }
        if (data.countries !== undefined) {
            updates.push('countries_json = ?');
            params.push(JSON.stringify(Array.isArray(data.countries) ? data.countries : []));
        }
        if (data.postalRules !== undefined) {
            updates.push('postal_rules_json = ?');
            params.push(JSON.stringify(Array.isArray(data.postalRules) ? data.postalRules : []));
        }
        if (data.standardTransitDays !== undefined) {
            updates.push('standard_transit_days = ?');
            params.push(Number(data.standardTransitDays));
        }
        if (data.expeditedTransitDays !== undefined) {
            updates.push('expedited_transit_days = ?');
            params.push(Number(data.expeditedTransitDays));
        }
        if (data.pickupAvailable !== undefined) {
            updates.push('pickup_available = ?');
            params.push(Boolean(data.pickupAvailable));
        }
        if (data.handlingDays !== undefined) {
            updates.push('handling_days = ?');
            params.push(Number(data.handlingDays));
        }

        if (updates.length === 0) {
            return this.getShippingRegionById(tenantId, regionId);
        }

        params.push(regionId, tenantId);
        await db.query(`UPDATE printhouse_shipping_regions SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);

        await this._recordAudit(tenantId, 'SHIPPING_REGION', regionId, 'UPDATED', actor, data);

        return this.getShippingRegionById(tenantId, regionId);
    }

    async archiveShippingRegion(tenantId, regionId, actor = null) {
        await this.getShippingRegionById(tenantId, regionId);
        await db.query('UPDATE printhouse_shipping_regions SET status = "ARCHIVED", enabled = FALSE WHERE id = ? AND tenant_id = ?', [regionId, tenantId]);
        await this._recordAudit(tenantId, 'SHIPPING_REGION', regionId, 'ARCHIVED', actor, {});
        return { success: true, archivedId: regionId };
    }

    async addDeliveryMethod(tenantId, siteId, regionId, data, actor = null) {
        PrinthouseShippingRegionService.validateNoProtectedFields(data);
        await this.getShippingRegionById(tenantId, regionId);

        if (!data.name || !data.carrierName) {
            throw new Error('VALIDATION_ERROR: Delivery method name and carrierName are required');
        }

        const methodId = `dmeth_${crypto.randomUUID()}`;
        const code = (data.code || data.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')).slice(0, 64);
        const serviceLevel = data.serviceLevel || 'STANDARD';
        const minDays = Number.isInteger(data.transitDaysMin) ? data.transitDaysMin : 1;
        const maxDays = Number.isInteger(data.transitDaysMax) ? data.transitDaysMax : 5;

        const query = `
            INSERT INTO printhouse_delivery_methods
            (id, tenant_id, site_id, shipping_region_id, code, name, carrier_name, service_level, transit_days_min, transit_days_max, cost_rule_id, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.query(query, [
            methodId, tenantId, siteId, regionId, code, data.name.trim(),
            data.carrierName.trim(), serviceLevel, minDays, maxDays,
            data.costRuleId || null, data.enabled !== false
        ]);

        await this._recordAudit(tenantId, 'DELIVERY_METHOD', methodId, 'CREATED', actor, { name: data.name, carrierName: data.carrierName });

        return this.listDeliveryMethods(tenantId, siteId, regionId);
    }

    async listDeliveryMethods(tenantId, siteId = null, regionId = null) {
        let query = 'SELECT * FROM printhouse_delivery_methods WHERE tenant_id = ?';
        const params = [tenantId];

        if (siteId) {
            query += ' AND site_id = ?';
            params.push(siteId);
        }
        if (regionId) {
            query += ' AND shipping_region_id = ?';
            params.push(regionId);
        }

        query += ' ORDER BY created_at DESC';

        const rows = await db.query(query, params);
        return rows.map(r => ({
            id: r.id,
            tenantId: r.tenant_id,
            siteId: r.site_id,
            shippingRegionId: r.shipping_region_id,
            code: r.code,
            name: r.name,
            carrierName: r.carrier_name,
            serviceLevel: r.service_level,
            transitDaysMin: r.transit_days_min,
            transitDaysMax: r.transit_days_max,
            costRuleId: r.cost_rule_id,
            enabled: Boolean(r.enabled),
            createdAt: r.created_at
        }));
    }

    async getShippingCompleteness(tenantId, siteId = null) {
        const regions = await this.listShippingRegions(tenantId, siteId);
        const methods = await this.listDeliveryMethods(tenantId, siteId);

        const activeRegions = regions.filter(r => r.enabled && r.status === 'ACTIVE');
        const activeMethods = methods.filter(m => m.enabled);

        const isComplete = activeRegions.length > 0 && activeMethods.length > 0;
        const blockingReasons = [];

        if (activeRegions.length === 0) blockingReasons.push('ADD_SHIPPING_REGION');
        if (activeMethods.length === 0) blockingReasons.push('ADD_DELIVERY_METHOD');

        return {
            status: isComplete ? 'COMPLETE' : 'INCOMPLETE',
            activeRegionsCount: activeRegions.length,
            activeDeliveryMethodsCount: activeMethods.length,
            blockingReasons,
            nonBindingNote: 'Shipping configuration represents operational delivery bounds. Live rate quoting requires Phase 191H governance.'
        };
    }

    _formatRegionRow(r) {
        let countries = [];
        let postalRules = [];
        try { countries = typeof r.countries_json === 'string' ? JSON.parse(r.countries_json) : (r.countries_json || []); } catch (e) {}
        try { postalRules = typeof r.postal_rules_json === 'string' ? JSON.parse(r.postal_rules_json) : (r.postal_rules_json || []); } catch (e) {}

        return {
            id: r.id,
            tenantId: r.tenant_id,
            siteId: r.site_id,
            name: r.name,
            code: r.code,
            enabled: Boolean(r.enabled),
            countries,
            postalRules,
            standardTransitDays: r.standard_transit_days,
            expeditedTransitDays: r.expedited_transit_days,
            pickupAvailable: Boolean(r.pickup_available),
            handlingDays: r.handling_days,
            status: r.status,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        };
    }

    async _recordAudit(tenantId, entityType, entityId, action, actor, changes) {
        const auditId = `shaud_${crypto.randomUUID()}`;
        const query = `
            INSERT INTO printhouse_shipping_integration_audits
            (id, tenant_id, entity_type, entity_id, action, actor_json, changes_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await db.query(query, [
            auditId, tenantId, entityType, entityId, action,
            JSON.stringify(actor || { role: 'SYSTEM' }),
            JSON.stringify(changes || {})
        ]);
    }
}

module.exports = new PrinthouseShippingRegionService();
