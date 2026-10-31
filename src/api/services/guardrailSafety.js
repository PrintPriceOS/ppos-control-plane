/**
 * Guardrail Safety & Kill Switch for PrintPrice OS
 * Phase 10 — Batch C (Autonomous Guardrails)
 */

let safety_state = {
    guardrails_enabled: true,
    auto_actions_enabled: false, // Advisory mode by default
    override_reason: null,
    updated_at: new Date().toISOString()
};

/**
 * Gets the current safety state.
 */
async function getSafetyState() {
    return safety_state;
}

/**
 * Toggles a global safety flag.
 */
async function toggleFlag(flag, value, reason = 'Administrative update') {
    if (!safety_state.hasOwnProperty(flag)) {
        throw new Error(`Invalid safety flag: ${flag}`);
    }

    safety_state[flag] = !!value;
    safety_state.override_reason = reason;
    safety_state.updated_at = new Date().toISOString();

    console.log(`[GUARDRAIL-SAFETY] Flag ${flag} set to ${value}. Reason: ${reason}`);
    
    return safety_state;
}

/**
 * Checks if an auto-action is permitted based on its severity.
 */
async function isAutoActionPermitted(severity) {
    if (!safety_state.guardrails_enabled) return false;
    if (!safety_state.auto_actions_enabled) return false;

    // Safety RULE: Only LOW and MEDIUM severity can be auto-applied in Batch C.
    // HIGH and CRITICAL always require manual approval.
    if (severity === 'HIGH' || severity === 'CRITICAL') return false;

    return true;
}

module.exports = {
    getSafetyState,
    toggleFlag,
    isAutoActionPermitted
};
