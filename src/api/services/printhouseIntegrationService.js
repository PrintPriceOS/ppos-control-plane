/**
 * src/api/services/printhouseIntegrationService.js
 * 
 * Phase 191G: Printhouse Integration Profiles Governance Service.
 * Manages configuration lifecycle (NOT_CONFIGURED, DRAFT, CONFIGURING, VALIDATING, READY, ERROR, DISABLED)
 * for API, WEBHOOK, JDF, JMF, MIS, ERP, SFTP connectors.
 * Does NOT enable live production job dispatch (production_routing remains DISABLED).
 */
const crypto = require('crypto');
const db = require('./mysqlClient');

const ALLOWED_INTEGRATION_TYPES = ['API', 'WEBHOOK', 'JDF', 'JMF', 'MIS', 'ERP', 'SFTP'];

const PROTECTED_FIELDS = [
    'tenant_id', 'printhouse_id', 'approved', 'verified', 'marketplace_enabled',
    'routing_enabled', 'production_enabled', 'credential_ciphertext', 'key_hash',
    'created_by', 'created_at', 'updated_at'
];

class PrinthouseIntegrationService {

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

    async createIntegrationProfile(tenantId, data, actor = null) {
        PrinthouseIntegrationService.validateNoProtectedFields(data);

        if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
            throw new Error('VALIDATION_ERROR: Integration profile name is required');
        }

        const type = (data.integrationType || 'API').toUpperCase();
        if (!ALLOWED_INTEGRATION_TYPES.includes(type)) {
            throw new Error(`VALIDATION_ERROR: Unsupported integrationType '${type}'. Allowed: ${ALLOWED_INTEGRATION_TYPES.join(', ')}`);
        }

        const profileId = `inprof_${crypto.randomUUID()}`;
        const siteId = data.siteId || null;
        const endpointUrl = data.endpointUrl || null;
        const settingsJson = JSON.stringify(data.settings || {});

        const query = `
            INSERT INTO printhouse_integration_profiles
            (id, tenant_id, site_id, integration_type, name, status, endpoint_url, settings_json)
            VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)
        `;

        await db.query(query, [profileId, tenantId, siteId, type, data.name.trim(), endpointUrl, settingsJson]);
        await this._recordAudit(tenantId, 'INTEGRATION_PROFILE', profileId, 'CREATED', actor, { name: data.name, type });

        return this.getIntegrationProfileById(tenantId, profileId);
    }

    async listIntegrationProfiles(tenantId, siteId = null) {
        let query = 'SELECT * FROM printhouse_integration_profiles WHERE tenant_id = ?';
        const params = [tenantId];

        if (siteId) {
            query += ' AND (site_id = ? OR site_id IS NULL)';
            params.push(siteId);
        }

        query += ' ORDER BY created_at DESC';
        const rows = await db.query(query, params);
        return rows.map(r => this._formatProfileRow(r));
    }

    async getIntegrationProfileById(tenantId, profileId) {
        const rows = await db.query('SELECT * FROM printhouse_integration_profiles WHERE id = ? AND tenant_id = ?', [profileId, tenantId]);
        if (!rows || rows.length === 0) {
            const err = new Error('NOT_FOUND: Integration profile not found');
            err.statusCode = 404;
            throw err;
        }
        return this._formatProfileRow(rows[0]);
    }

    async updateIntegrationProfile(tenantId, profileId, data, actor = null) {
        PrinthouseIntegrationService.validateNoProtectedFields(data);
        await this.getIntegrationProfileById(tenantId, profileId);

        const updates = [];
        const params = [];

        if (data.name !== undefined) {
            updates.push('name = ?');
            params.push(data.name.trim());
        }
        if (data.endpointUrl !== undefined) {
            updates.push('endpoint_url = ?');
            params.push(data.endpointUrl || null);
        }
        if (data.status !== undefined) {
            const status = String(data.status).toUpperCase();
            updates.push('status = ?');
            params.push(status);
        }
        if (data.settings !== undefined) {
            updates.push('settings_json = ?');
            params.push(JSON.stringify(data.settings || {}));
        }

        if (updates.length === 0) {
            return this.getIntegrationProfileById(tenantId, profileId);
        }

        params.push(profileId, tenantId);
        await db.query(`UPDATE printhouse_integration_profiles SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
        await this._recordAudit(tenantId, 'INTEGRATION_PROFILE', profileId, 'UPDATED', actor, data);

        return this.getIntegrationProfileById(tenantId, profileId);
    }

    async deleteIntegrationProfile(tenantId, profileId, actor = null) {
        await this.getIntegrationProfileById(tenantId, profileId);
        await db.query('UPDATE printhouse_integration_profiles SET status = "DISABLED" WHERE id = ? AND tenant_id = ?', [profileId, tenantId]);
        await this._recordAudit(tenantId, 'INTEGRATION_PROFILE', profileId, 'DISABLED', actor, {});
        return { success: true, disabledId: profileId };
    }

    async getIntegrationsCompleteness(tenantId) {
        const profiles = await this.listIntegrationProfiles(tenantId);
        const activeProfiles = profiles.filter(p => p.status !== 'DISABLED');

        // Integrations are optional for onboarding unless required by tenant workflow
        const isConfigured = activeProfiles.length > 0;
        const validatedCount = activeProfiles.filter(p => p.status === 'READY').length;

        return {
            status: isConfigured ? (validatedCount > 0 ? 'COMPLETE' : 'CONFIGURED_PENDING_TEST') : 'NOT_REQUIRED',
            totalProfilesCount: activeProfiles.length,
            validatedProfilesCount: validatedCount,
            productionRoutingEnabled: false, // EXPLICIT SAFETY MARKER
            nonBindingNote: 'Integration configuration readiness allows testing connectivity. Production job dispatch routing remains DISABLED.'
        };
    }

    _formatProfileRow(r) {
        let settings = {};
        try { settings = typeof r.settings_json === 'string' ? JSON.parse(r.settings_json) : (r.settings_json || {}); } catch (e) {}

        return {
            id: r.id,
            tenantId: r.tenant_id,
            siteId: r.site_id,
            integrationType: r.integration_type,
            name: r.name,
            status: r.status,
            endpointUrl: r.endpoint_url,
            settings,
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

module.exports = new PrinthouseIntegrationService();
