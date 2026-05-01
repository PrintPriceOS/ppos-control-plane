const logger = require('./logger').child('optimization-actions');

let eligibility = null, lifecycleManager = null;
try {
    eligibility = require('../upstream/src/services/autonomyEligibility');
    lifecycleManager = require('../upstream/src/services/strategyLifecycleManager');
} catch (e) {
    logger.error({
        event: 'dependency_unavailable',
        message: 'Core autonomy components unavailable - execution guards restricted',
        metadata: { reason: e.message }
    });
}

/**
 * Applies bounding to actions to ensure they are safe.
 */
async function applyActionSafely(candidate) {
    logger.info({
        event: 'action_attempt',
        message: `Attempting to apply ${candidate.type} for ${candidate.targetId}`,
        metadata: { candidateId: candidate.id, type: candidate.type, mode: candidate.mode }
    });
    
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
        if (!eligibility || !lifecycleManager) {
            return { applied: false, reason: 'SERVICE_UNAVAILABLE' };
        }
        const isEligible = eligibility.determineEligibility(candidate.type, {}, candidate.targetType, candidate.targetId);
        if (!isEligible.eligible) {
            logger.warn({
                event: 'autonomy_blocked',
                message: `Blocked autonomous execution of ${candidate.type}. Demoting.`,
                metadata: { reason: isEligible.reason, candidateId: candidate.id }
            });
            lifecycleManager.demoteToSuppressed(candidate.type, isEligible.reason);
            return { applied: false, reason: 'AUTONOMY_ELIGIBILITY_REVOKED' };
        }
        logger.info({
            event: 'autonomy_passed',
            message: `Autonomy Guard Passed for ${candidate.type}. Executing autonomously.`,
            metadata: { candidateId: candidate.id }
        });
    } else {
        // Shadow/Advisory Fallback Rules
        if (candidate.type === 'ROUTING_SHIFT') {
            if (candidate.mode !== 'BOUNDED_AUTO') {
                logger.warn({
                    event: 'action_skipped',
                    message: 'Routing Shift skipped - currently in ADVISORY/SHADOW mode only',
                    metadata: { candidateId: candidate.id }
                });
                return { applied: false, reason: 'MODE_RESTRICTION' };
            }
        } else if (candidate.type === 'COST_OPTIMIZATION') {
            logger.warn({
                event: 'action_skipped',
                message: 'Cost Optimization skipped - ADVISORY ONLY in Phase 11/13',
                metadata: { candidateId: candidate.id }
            });
            return { applied: false, reason: 'ADVISORY_ONLY' };
        }
        
        logger.info({
            event: 'action_simulated',
            message: `Simulating/Advising ${candidate.type}.`,
            metadata: { candidateId: candidate.id, mode: candidate.mode }
        });
        return { applied: false, reason: `MODE_${candidate.mode.toUpperCase()}` };
    }

    // Commit change
    logger.info({
        event: 'action_success',
        message: `SUCCESSFULLY Applied ${candidate.type}. Tracking assertion loop...`,
        metadata: { candidateId: candidate.id }
    });

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
