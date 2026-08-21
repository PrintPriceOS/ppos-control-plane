/**
 * src/api/services/calibrationGovernanceTolerances.js
 *
 * Phase 193H.8C.6.11 — Pure Shared Calibration Governance Tolerances.
 *
 * Provides pure mathematical helpers and constants for calibration governance
 * without DB dependencies or circular imports between solver, run, and acceptance services.
 */

// Canonical Governance Acceptance Tolerances (Distinct from solver strict numerical convergence thresholds)
const DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE = 0.50; // 0.50 EUR
const DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT = 0.005;  // 0.50% (0.005 relative)

// Canonical Acceptance-Eligible Solver Run Statuses
const CANONICAL_ACCEPTABLE_RUN_STATUSES = Object.freeze([
    'SUCCEEDED',
    'CONVERGED',
    'UNDERDETERMINED_ANCHOR',
    'ACCEPTABLE_CANDIDATE'
]);

// All Persisted Run Statuses (DB Domain Contract)
const ALL_CANONICAL_PERSISTED_RUN_STATUSES = Object.freeze([
    'PENDING',
    'RUNNING',
    'SUCCEEDED',
    'CONVERGED',
    'UNDERDETERMINED_ANCHOR',
    'ACCEPTABLE_CANDIDATE',
    'NO_SOLUTION',
    'AMBIGUOUS',
    'FAILED'
]);

/**
 * Pure canonical helper to compute effective governance tolerance.
 * effectiveTolerance = max(absoluteTolerance, targetPrice * percentTolerance)
 *
 * @param {number} targetPrice - Target manufacturing price
 * @param {number} [absTolerance=0.50] - Absolute tolerance in EUR
 * @param {number} [pctTolerance=0.005] - Percent tolerance (e.g. 0.005 for 0.5%)
 * @returns {number} Effective tolerance rounded to 4 decimals
 */
function computeGovernanceTolerance(
    targetPrice,
    absTolerance = DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE,
    pctTolerance = DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT
) {
    const target = Number(targetPrice) || 0;
    const absTol = Number(absTolerance) || DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE;
    const pctTol = Number(pctTolerance) || DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT;
    return Number(Math.max(absTol, target * pctTol).toFixed(4));
}

module.exports = {
    DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE,
    DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT,
    CANONICAL_ACCEPTABLE_RUN_STATUSES,
    ALL_CANONICAL_PERSISTED_RUN_STATUSES,
    computeGovernanceTolerance
};
