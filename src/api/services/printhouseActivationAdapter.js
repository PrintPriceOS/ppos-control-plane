/**
 * src/api/services/printhouseActivationAdapter.js
 * 
 * Phase 192 Canonical Capability Verification Adapter.
 * Provides fail-closed, single-source-of-truth verification for runtime capability grants:
 *   - MARKETPLACE_VISIBLE
 *   - LIVE_QUOTING_ALLOWED
 *   - JOB_ROUTING_ALLOWED
 *   - PRODUCTION_DISPATCH_ALLOWED
 * 
 * Enforces Phase 191H activation governance. Never infers authorization from legacy `status = ACTIVE`.
 */
const db = require('./mysqlClient');
const killSwitchService = require('./runtimeKillSwitchService');

const SUPPORTED_CAPABILITIES = [
    'MARKETPLACE_VISIBLE',
    'LIVE_QUOTING_ALLOWED',
    'JOB_ROUTING_ALLOWED',
    'PRODUCTION_DISPATCH_ALLOWED'
];

class PrinthouseActivationAdapter {

    /**
     * Retrieves active effective capabilities for a given tenant/site.
     * Effective Capability = Activation Grant AND NOT Suspended AND NOT Kill Switched.
     */
    async getCapabilities({ tenantId, siteId = null }) {
        if (!tenantId) {
            const err = new Error('PRINTHOUSE_CAPABILITY_CHECK_FAILED: tenantId is required');
            err.code = 'PRINTHOUSE_CAPABILITY_CHECK_FAILED';
            err.statusCode = 400;
            throw err;
        }

        try {
            const rows = await db.query(
                'SELECT * FROM printhouse_activation_grants WHERE tenant_id = ? ORDER BY granted_at DESC LIMIT 1',
                [tenantId]
            );

            if (!rows || rows.length === 0) {
                return {
                    tenantId,
                    siteId,
                    status: 'NOT_ACTIVATED',
                    capabilities: {
                        MARKETPLACE_VISIBLE: false,
                        LIVE_QUOTING_ALLOWED: false,
                        JOB_ROUTING_ALLOWED: false,
                        PRODUCTION_DISPATCH_ALLOWED: false
                    }
                };
            }

            const record = rows[0];
            const isActive = record.status === 'ACTIVE';

            const rawCapabilities = {
                MARKETPLACE_VISIBLE: Boolean(record.marketplace_visible) && isActive,
                LIVE_QUOTING_ALLOWED: Boolean(record.live_quoting_allowed) && isActive,
                JOB_ROUTING_ALLOWED: Boolean(record.job_routing_allowed) && isActive,
                PRODUCTION_DISPATCH_ALLOWED: Boolean(record.production_dispatch_allowed) && isActive
            };

            // Evaluate Kill Switches
            const effectiveCapabilities = { ...rawCapabilities };
            for (const cap of SUPPORTED_CAPABILITIES) {
                if (rawCapabilities[cap]) {
                    const ksCheck = await killSwitchService.isCapabilityKillSwitched({
                        tenantId,
                        siteId: siteId || record.site_id,
                        capability: cap
                    });
                    if (ksCheck.killSwitched) {
                        effectiveCapabilities[cap] = false;
                    }
                }
            }

            return {
                tenantId,
                siteId: siteId || record.site_id,
                grantId: record.id,
                status: record.status,
                grantedAt: record.granted_at,
                rawCapabilities,
                capabilities: effectiveCapabilities
            };
        } catch (err) {
            // Fail Closed on DB or connection errors
            return {
                tenantId,
                siteId,
                status: 'ERROR',
                error: err.message,
                capabilities: {
                    MARKETPLACE_VISIBLE: false,
                    LIVE_QUOTING_ALLOWED: false,
                    JOB_ROUTING_ALLOWED: false,
                    PRODUCTION_DISPATCH_ALLOWED: false
                }
            };
        }
    }

    /**
     * Checks if a specific capability is granted. Returns boolean.
     */
    async hasCapability({ tenantId, siteId = null, capability }) {
        if (!SUPPORTED_CAPABILITIES.includes(capability)) {
            const err = new Error(`PRINTHOUSE_CAPABILITY_STATE_INVALID: Unsupported capability '${capability}'`);
            err.code = 'PRINTHOUSE_CAPABILITY_STATE_INVALID';
            err.statusCode = 400;
            throw err;
        }

        const capData = await this.getCapabilities({ tenantId, siteId });
        return Boolean(capData.capabilities[capability]);
    }

    /**
     * Enforces capability presence. Throws fail-closed error if not granted or kill switched.
     */
    async requireCapability({ tenantId, siteId = null, capability }) {
        if (!SUPPORTED_CAPABILITIES.includes(capability)) {
            const err = new Error(`PRINTHOUSE_CAPABILITY_STATE_INVALID: Unsupported capability '${capability}'`);
            err.code = 'PRINTHOUSE_CAPABILITY_STATE_INVALID';
            err.statusCode = 400;
            throw err;
        }

        const capData = await this.getCapabilities({ tenantId, siteId });

        if (capData.status === 'SUSPENDED') {
            const err = new Error(`PRINTHOUSE_SUSPENDED: Printhouse tenant '${tenantId}' activation has been suspended by governance.`);
            err.code = 'PRINTHOUSE_SUSPENDED';
            err.statusCode = 403;
            throw err;
        }

        // Check if kill switched explicitly
        const ksCheck = await killSwitchService.isCapabilityKillSwitched({
            tenantId,
            siteId,
            capability
        });

        if (ksCheck.killSwitched) {
            const err = new Error(`RUNTIME_KILL_SWITCH_ACTIVE: Capability '${capability}' is currently disabled by an emergency kill switch (${ksCheck.scope} scope: ${ksCheck.reasonCode}).`);
            err.code = 'RUNTIME_KILL_SWITCH_ACTIVE';
            err.statusCode = 403;
            err.details = { tenantId, siteId, capability, scope: ksCheck.scope, reasonCode: ksCheck.reasonCode };
            throw err;
        }

        if (!capData.capabilities[capability]) {
            const err = new Error(`PRINTHOUSE_CAPABILITY_NOT_GRANTED: Runtime capability '${capability}' is not granted for tenant '${tenantId}'.`);
            err.code = 'PRINTHOUSE_CAPABILITY_NOT_GRANTED';
            err.statusCode = 403;
            err.details = { tenantId, siteId, capability, status: capData.status };
            throw err;
        }

        return capData;
    }

    /**
     * Governed Helper for Bulk Set Queries.
     * Returns list of tenant IDs holding an active grant for the specified capability.
     */
    async getEligibleTenantIds({ capability = 'MARKETPLACE_VISIBLE' }) {
        if (!SUPPORTED_CAPABILITIES.includes(capability)) {
            throw new Error(`PRINTHOUSE_CAPABILITY_STATE_INVALID: Unsupported capability '${capability}'`);
        }

        const colMap = {
            'MARKETPLACE_VISIBLE': 'marketplace_visible',
            'LIVE_QUOTING_ALLOWED': 'live_quoting_allowed',
            'JOB_ROUTING_ALLOWED': 'job_routing_allowed',
            'PRODUCTION_DISPATCH_ALLOWED': 'production_dispatch_allowed'
        };

        const col = colMap[capability];
        try {
            const rows = await db.query(
                `SELECT tenant_id FROM printhouse_activation_grants WHERE ${col} = 1 AND status = 'ACTIVE'`
            );
            return (rows || []).map(r => r.tenant_id);
        } catch (err) {
            return [];
        }
    }

    /**
     * Canonical Bulk Grant Filter SQL Snippet Generator.
     * Provides single-source-of-truth SQL condition for JOINs on printhouse_activation_grants.
     */
    getCanonicalBulkFilterSql(grantTableAlias = 'g', capability = 'MARKETPLACE_VISIBLE') {
        const colMap = {
            'MARKETPLACE_VISIBLE': 'marketplace_visible',
            'LIVE_QUOTING_ALLOWED': 'live_quoting_allowed',
            'JOB_ROUTING_ALLOWED': 'job_routing_allowed',
            'PRODUCTION_DISPATCH_ALLOWED': 'production_dispatch_allowed'
        };
        const col = colMap[capability] || 'marketplace_visible';
        return `${grantTableAlias}.${col} = 1 AND ${grantTableAlias}.status = 'ACTIVE'`;
    }
}

module.exports = new PrinthouseActivationAdapter();
