/**
 * src/api/services/policyEngine.js
 * 
 * Safe local adapter/stub for Policy Engine.
 * Exposes evaluateTechnicalRules to prevent contract breakages in legacy report service.
 */

class PolicyEngineAdapter {
    /**
     * Fallback rules evaluation.
     * @param {object} analysisResults 
     * @param {object} policyObj 
     * @returns {array}
     */
    evaluateTechnicalRules(analysisResults, policyObj) {
        console.log('[POLICY-ENGINE-ADAPTER] Running fallback evaluateTechnicalRules');
        // Return empty technical findings or basic sanity rules if needed
        return [];
    }
}

module.exports = new PolicyEngineAdapter();
