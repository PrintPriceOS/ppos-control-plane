/**
 * Optimization Evaluator for PrintPrice OS
 * Phase 11 — Autonomous Optimization Layer
 */

/**
 * Compares proposed optimizing candidates with actual outcomes.
 */
function evaluateOutcome(candidate, currentMetrics) {
    let verdict = 'NEUTRAL';
    let matchedExpectation = false;
    let rollbackRecommended = false;

    // Parse target delta
    const actualDelta = currentMetrics[candidate.expectedBenefit.metric] || 0;
    const targetDelta = parseFloat(candidate.expectedBenefit.expectedDelta) || -10;

    // Check improvement direction (- is better for latency/cost, + is better for throughput)
    const lessIsBetter = String(candidate.expectedBenefit.expectedDelta).startsWith('-');

    if (lessIsBetter) {
        if (actualDelta <= targetDelta) {
            verdict = 'IMPROVED';
            matchedExpectation = true;
        } else if (actualDelta > targetDelta && actualDelta < 0) {
            verdict = 'IMPROVED';
        } else if (actualDelta > 0) {
            verdict = 'REGRESSED';
            rollbackRecommended = true;
        }
    } else {
        if (actualDelta >= targetDelta) {
            verdict = 'IMPROVED';
            matchedExpectation = true;
        } else if (actualDelta < targetDelta && actualDelta > 0) {
            verdict = 'IMPROVED';
        } else if (actualDelta < 0) {
            verdict = 'REGRESSED';
            rollbackRecommended = true;
        }
    }

    // Unsafe override
    if (currentMetrics.guardrailsTriggered > 0 || currentMetrics.failureRate > 5) {
        verdict = 'UNSAFE';
        rollbackRecommended = true;
        matchedExpectation = false;
    }

    return {
        candidateId: candidate.id,
        verdict,
        outcomeMetrics: currentMetrics,
        matchedExpectation,
        rollbackRecommended,
        summary: `Evaluated ${candidate.type} for ${candidate.targetId}. Verdict: ${verdict}.`
    };
}

module.exports = {
    evaluateOutcome
};
