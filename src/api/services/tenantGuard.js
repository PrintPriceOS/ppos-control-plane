/**
 * src/api/services/tenantGuard.js
 * 
 * Gatekeeper service to resolve and verify active Tenant capabilities
 * based on selected subscription plans and B2B integration levels.
 */

class TenantGuard {
    /**
     * Resolves feature flags for a given tenant context.
     * @param {Object} tenant - Tenant record containing 'plan' and 'metadata_json'
     * @returns {Object} Map of active capabilities
     */
    resolveFeatures(tenant) {
        if (!tenant) {
            return {
                DASHBOARD_ACCESS: false,
                API_ACCESS: false,
                AUTO_ROUTING: false,
                AI_MOCKUPS: false,
                AI_CHAT: false
            };
        }

        const plan = String(tenant.plan || '').toUpperCase();
        let metadata = {};
        try {
            metadata = typeof tenant.metadata_json === 'string'
                ? JSON.parse(tenant.metadata_json)
                : (tenant.metadata_json || {});
        } catch (e) {
            // Graceful recovery from malformed JSON
        }

        const qualification = metadata.qualification || {};
        const integrationLevel = String(qualification.integrationLevel || '').toUpperCase();

        // 1. Establish defaults based on subscription plan
        let capabilities = {
            DASHBOARD_ACCESS: true,
            API_ACCESS: false,
            AUTO_ROUTING: false,
            AI_MOCKUPS: false,
            AI_CHAT: false
        };

        if (plan === 'ENTERPRISE') {
            capabilities.API_ACCESS = true;
            capabilities.AUTO_ROUTING = true;
            capabilities.AI_MOCKUPS = true;
            capabilities.AI_CHAT = true;
        } else if (plan === 'GROWTH') {
            capabilities.API_ACCESS = true;
            capabilities.AI_MOCKUPS = true;
            capabilities.AI_CHAT = true;
        } else {
            // STARTER / TRIAL
            capabilities.AI_MOCKUPS = true; // Limited evaluative mockups
        }

        // 2. Apply explicit overrides from onboarding integrationLevel if specified
        // This ensures retrocompatibility or manual contract upgrades
        if (integrationLevel === 'API-READY' || integrationLevel === 'INTEGRATED') {
            capabilities.API_ACCESS = true;
        } else if (integrationLevel === 'FULLY AUTOMATED ROUTING' || integrationLevel === 'ORCHESTRATED') {
            capabilities.API_ACCESS = true;
            capabilities.AUTO_ROUTING = true;
        } else if (integrationLevel === 'DASHBOARD ONLY' || integrationLevel === 'MANUAL') {
            capabilities.API_ACCESS = false;
            capabilities.AUTO_ROUTING = false;
        }

        return capabilities;
    }

    /**
     * Checks if a tenant has a specific capability.
     * @param {Object} tenant - Tenant record
     * @param {string} feature - Feature name
     * @returns {boolean}
     */
    hasFeature(tenant, feature) {
        const features = this.resolveFeatures(tenant);
        return !!features[feature.toUpperCase()];
    }
}

module.exports = new TenantGuard();
