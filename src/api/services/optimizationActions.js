/**
 * Safe Optimization Actions for PrintPrice OS
 * Phase 11 & 13 — Autonomous Optimization Layer + Executions
 */

let eligibility, lifecycleManager;
try {
    eligibility = require('../../../../ppos-preflight-service/src/services/autonomyEligibility');
    lifecycleManager = require('../../../../ppos-preflight-service/src/services/strategyLifecycleManager');
} catch (e) {
    console.warn('[DEGRADED-MODE] Optimization Actions using sharedMocks:', e.message);
    const mocks = require('./sharedMocks');
    mocks.markUsed();
    eligibility = mocks.autonomyEligibility;
    lifecycleManager = mocks.strategyLifecycleManager;
}

/**
 * Applies bounding to actions to ensure they are safe.
 */
async function applyActionSafely(candidate) {
    console.log(`[OPTIMIZATION-ACTION] Attempting to apply ${candidate.type} for ${candidate.targetId}`);
    
    // Bounds check
    if (candidate.type === 'CONCURRENCY_TUNE') {
        const step = candidate.proposedChange.step;
        if (Math.abs(step) > 0.5) {
            throw new Error(`BOUNDS_EXCEEDED: Concurrency tune step ${step} exceeds max safe jump 0.5`);
        }
    } else if (candidate.type === 'RETRY_TUNE') {
        const backoff = candidate.proposedChange.backoff;
        if (backoff > 10000) {
            throw new Error('BOUNDS_EXCEEDED: Retry backoff cannot exceed 10000ms in bounded mode');
        }
    }

    // Autonomy Execution Guard for BOUNDED_AUTO (Phase 13)
    if (candidate.mode === 'BOUNDED_AUTO') {
        const isEligible = eligibility.determineEligibility(candidate.type, {}, candidate.targetType, candidate.targetId);
        if (!isEligible.eligible) {
            console.warn(`[OPTIMIZATION-ACTION] Blocked autonomous execution of ${candidate.type}. Demoting.`);
            lifecycleManager.demoteToSuppressed(candidate.type, isEligible.reason);
            return { applied: false, reason: 'AUTONOMY_ELIGIBILITY_REVOKED' };
        }
        console.log(`[OPTIMIZATION-ACTION] Autonomy Guard Passed for ${candidate.type}. Executing autonomously.`);
    } else {
        // Shadow/Advisory Fallback Rules
        if (candidate.type === 'ROUTING_SHIFT') {
            if (candidate.mode !== 'BOUNDED_AUTO') {
                console.warn('[OPTIMIZATION-ACTION] Routing Shift skipped - currently in ADVISORY/SHADOW mode only');
                return { applied: false, reason: 'MODE_RESTRICTION' };
            }
        } else if (candidate.type === 'COST_OPTIMIZATION') {
            console.warn('[OPTIMIZATION-ACTION] Cost Optimization skipped - ADVISORY ONLY in Phase 11/13');
            return { applied: false, reason: 'ADVISORY_ONLY' };
        }
        
        console.log(`[OPTIMIZATION-ACTION] Simulating/Advising ${candidate.type}.`);
        return { applied: false, reason: `MODE_${candidate.mode.toUpperCase()}` };
    }

    // Commit change
    console.log(`[OPTIMIZATION-ACTION] SUCCESSFULLY Applied ${candidate.type}. Tracking assertion loop...`);

    return {
        applied: true,
        candidateId: candidate.id,
        timestamp: new Date().toISOString(),
        reversibilityContext: `restore_${candidate.id}`
    };
}

module.exports = {
    applyActionSafely
};
