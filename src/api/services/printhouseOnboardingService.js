/**
 * src/api/services/printhouseOnboardingService.js
 * 
 * Manages Company Profile and Production Sites CRUD against canonical database tables
 * (tenants & printer_nodes) with strict field allowlisting and tenant isolation.
 */
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const auditLogger = require('./auditLoggerService');
const { isValidIso2Country, normalizeIso2Country } = require('../../lib/countryCatalog');

class PrinthouseOnboardingService {
    /**
     * Fetch Company Profile data from canonical `tenants` row.
     */
    async getCompanyProfile(tenantId) {
        const [tenant] = await db.query(
            'SELECT id, name, type, status, plan, metadata_json, created_at FROM tenants WHERE id = ?',
            [tenantId]
        );

        if (!tenant) {
            throw new Error('ONBOARDING_PROFILE_NOT_FOUND');
        }

        let metadata = {};
        try {
            metadata = typeof tenant.metadata_json === 'string'
                ? JSON.parse(tenant.metadata_json)
                : (tenant.metadata_json || {});
        } catch (e) {}

        return {
            tenantId: tenant.id,
            companyName: tenant.name,
            legalName: metadata.legal_name || tenant.name,
            tradingName: metadata.trading_name || tenant.name,
            country: metadata.country || 'ES',
            city: metadata.city || '',
            address: metadata.address || '',
            postalCode: metadata.postal_code || '',
            phone: metadata.phone || '',
            website: metadata.website || '',
            contactName: metadata.contact_name || '',
            taxId: metadata.tax_id || '',
            companyRegistrationId: metadata.company_registration_id || '',
            updatedAt: tenant.updated_at || tenant.created_at
        };
    }
    /**
     * Update Company Profile canonical data with strict allowlisting.
     */
    async updateCompanyProfile(tenantId, payload, actorContext) {
        // Strict allowlist: forbidden to edit tenant ownership, approval, plan, status
        const {
            companyName,
            legalName,
            tradingName,
            country,
            city,
            address,
            postalCode,
            phone,
            website,
            contactName,
            taxId,
            companyRegistrationId
        } = payload || {};

        if (country !== undefined && country !== null && country !== '') {
            if (!isValidIso2Country(country)) {
                const err = new Error(`Invalid country code '${country}'. Must be a valid ISO 3166-1 alpha-2 code.`);
                err.code = 'INVALID_COUNTRY_CODE';
                err.statusCode = 400;
                throw err;
            }
        }

        const [tenant] = await db.query('SELECT metadata_json FROM tenants WHERE id = ?', [tenantId]);
        if (!tenant) throw new Error('ONBOARDING_PROFILE_NOT_FOUND');

        let metadata = {};
        try {
            metadata = typeof tenant.metadata_json === 'string'
                ? JSON.parse(tenant.metadata_json)
                : (tenant.metadata_json || {});
        } catch (e) {}

        const updatedName = (companyName || legalName || tradingName || '').trim();

        if (legalName !== undefined) metadata.legal_name = String(legalName).trim();
        if (tradingName !== undefined) metadata.trading_name = String(tradingName).trim();
        if (country !== undefined) {
            metadata.country = country ? normalizeIso2Country(country) : '';
        }
        if (city !== undefined) metadata.city = String(city).trim();
        if (address !== undefined) metadata.address = String(address).trim();
        if (postalCode !== undefined) metadata.postal_code = String(postalCode).trim();
        if (phone !== undefined) metadata.phone = String(phone).trim();
        if (website !== undefined) metadata.website = String(website).trim();
        if (contactName !== undefined) metadata.contact_name = String(contactName).trim();
        if (taxId !== undefined) metadata.tax_id = String(taxId).trim();
        if (companyRegistrationId !== undefined) metadata.company_registration_id = String(companyRegistrationId).trim();

        metadata.company_profile_completed = true;

        await db.query(
            'UPDATE tenants SET name = COALESCE(NULLIF(?, ""), name), metadata_json = ? WHERE id = ?',
            [updatedName, JSON.stringify(metadata), tenantId]
        );

        auditLogger.log({
            type: 'PRINTHOUSE_COMPANY_PROFILE_UPDATED',
            tenantId,
            userId: actorContext?.userId || 'system',
            status: 'SUCCESS',
            metadata: { updatedFields: Object.keys(payload || {}) }
        }).catch(() => {});

        return this.getCompanyProfile(tenantId);
    }

    /**
     * List canonical production sites (`printer_nodes`) for tenant.
     */
    async getProductionSites(tenantId) {
        const rows = await db.query(
            `SELECT id, name, country, city, email, phone, website, status, marketplace_enabled, region, created_at 
             FROM printer_nodes 
             WHERE tenant_id = ? AND status != 'DELETED' 
             ORDER BY created_at ASC`,
            [tenantId]
        );

        return (rows || []).map((row, idx) => ({
            siteId: row.id,
            siteName: row.name,
            siteCode: row.region || `SITE-${idx + 1}`,
            country: row.country,
            city: row.city,
            email: row.email,
            phone: row.phone,
            website: row.website,
            timezone: row.region || 'Europe/Madrid',
            isPrimary: idx === 0,
            status: row.status,
            createdAt: row.created_at
        }));
    }

    /**
     * Create or complete initial placeholder Production Site (`printer_node`).
     */
    async createProductionSite(tenantId, payload, actorContext) {
        const { siteName, siteCode, country, city, phone, website, timezone } = payload || {};

        if (!siteName || !country || !city) {
            throw new Error('SITE_VALIDATION_FAILED: siteName, country, and city are required.');
        }

        // Check if tenant has an existing activation DRAFT placeholder site
        const [draftNode] = await db.query(
            'SELECT id, country FROM printer_nodes WHERE tenant_id = ? AND (status = "DRAFT" OR country = "Pending Setup") LIMIT 1',
            [tenantId]
        ).catch(() => []);

        if (draftNode) {
            // Complete the placeholder site node instead of duplicating
            await db.query(
                `UPDATE printer_nodes 
                 SET name = ?, country = ?, city = ?, phone = ?, website = ?, region = ?, status = 'CONFIGURING' 
                 WHERE id = ? AND tenant_id = ?`,
                [siteName, country, city, phone || null, website || null, timezone || 'Europe/Madrid', draftNode.id, tenantId]
            );

            auditLogger.log({
                type: 'PRINTHOUSE_SITE_UPDATED',
                tenantId,
                userId: actorContext?.userId || 'system',
                status: 'SUCCESS',
                metadata: { siteId: draftNode.id, action: 'COMPLETED_PLACEHOLDER' }
            }).catch(() => {});

            return (await this.getProductionSites(tenantId)).find(s => s.siteId === draftNode.id);
        }

        // Create a new production site node
        const siteId = `node-${uuidv4().substring(0, 8)}`;
        const email = `site-${siteId}@local.printhouse`;

        await db.query(
            `INSERT INTO printer_nodes 
             (id, tenant_id, name, country, city, email, phone, website, status, marketplace_enabled, region) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIGURING', false, ?)`,
            [siteId, tenantId, siteName, country, city, email, phone || null, website || null, timezone || 'Europe/Madrid']
        );

        auditLogger.log({
            type: 'PRINTHOUSE_SITE_CREATED',
            tenantId,
            userId: actorContext?.userId || 'system',
            status: 'SUCCESS',
            metadata: { siteId, siteName }
        }).catch(() => {});

        return (await this.getProductionSites(tenantId)).find(s => s.siteId === siteId);
    }

    /**
     * Update an existing production site node with tenant isolation.
     */
    async updateProductionSite(tenantId, siteId, payload, actorContext) {
        const [node] = await db.query(
            'SELECT id FROM printer_nodes WHERE id = ? AND tenant_id = ? AND status != "DELETED"',
            [siteId, tenantId]
        );

        if (!node) {
            throw new Error('SITE_NOT_FOUND');
        }

        const { siteName, country, city, phone, website, timezone } = payload || {};

        await db.query(
            `UPDATE printer_nodes 
             SET name = COALESCE(NULLIF(?, ""), name),
                 country = COALESCE(NULLIF(?, ""), country),
                 city = COALESCE(NULLIF(?, ""), city),
                 phone = COALESCE(?, phone),
                 website = COALESCE(?, website),
                 region = COALESCE(?, region)
             WHERE id = ? AND tenant_id = ?`,
            [siteName, country, city, phone, website, timezone, siteId, tenantId]
        );

        auditLogger.log({
            type: 'PRINTHOUSE_SITE_UPDATED',
            tenantId,
            userId: actorContext?.userId || 'system',
            status: 'SUCCESS',
            metadata: { siteId }
        }).catch(() => {});

        return (await this.getProductionSites(tenantId)).find(s => s.siteId === siteId);
    }

    /**
     * Archive/delete an unused draft site.
     */
    async deleteProductionSite(tenantId, siteId, actorContext) {
        const sites = await this.getProductionSites(tenantId);
        if (sites.length <= 1) {
            throw new Error('SITE_CANNOT_BE_ARCHIVED: At least one production site must be maintained.');
        }

        const [node] = await db.query(
            'SELECT id FROM printer_nodes WHERE id = ? AND tenant_id = ? AND status != "DELETED"',
            [siteId, tenantId]
        );

        if (!node) {
            throw new Error('SITE_NOT_FOUND');
        }

        await db.query(
            'UPDATE printer_nodes SET status = "DELETED" WHERE id = ? AND tenant_id = ?',
            [siteId, tenantId]
        );

        auditLogger.log({
            type: 'PRINTHOUSE_SITE_ARCHIVED',
            tenantId,
            userId: actorContext?.userId || 'system',
            status: 'SUCCESS',
            metadata: { siteId }
        }).catch(() => {});

        return { ok: true, archivedSiteId: siteId };
    }
}

module.exports = new PrinthouseOnboardingService();
