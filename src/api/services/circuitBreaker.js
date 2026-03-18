/**
 * Circuit Breaker System for PrintPrice OS
 * Phase 10 — Batch C (Autonomous Guardrails)
 */

const db = require('./db');
const auditService = require('./auditService');

// In-memory state
let cb_state = 'CLOSED';
let last_fault_at = null;
let fault_count = 0;
let recovery_count = 0;

const THRESHOLDS = {
    FAIL_RATE_OPEN: 0.7,
    RECOVERY_LIMIT: 5,
    OPEN_TIMEOUT_MS: 30000
};

/**
 * Gets the current status of the circuit breaker.
 */
async function getStatus() {
    if (cb_state === 'OPEN' && last_fault_at && (Date.now() - last_fault_at > THRESHOLDS.OPEN_TIMEOUT_MS)) {
        cb_state = 'HALF_OPEN';
        recovery_count = 0;
        await auditService.logCircuitBreaker('HALF_OPEN', 'Timeout expired, entering recovery mode');
    }

    return {
        state: cb_state,
        faultCount: fault_count,
        recoveryCount: recovery_count,
        lastFaultAt: last_fault_at,
        timestamp: new Date().toISOString()
    };
}

/**
 * Evaluates real-time signals and updates state.
 */
async function evaluate(signals) {
    const { failureRate, queueDepth } = signals;
    const prevState = cb_state;

    if (cb_state === 'CLOSED') {
        if (failureRate > THRESHOLDS.FAIL_RATE_OPEN || queueDepth > 500) {
            cb_state = 'OPEN';
            last_fault_at = Date.now();
            fault_count++;
            await auditService.logCircuitBreaker('OPEN', `High failure rate: ${(failureRate * 100).toFixed(1)}%`);
        }
    } else if (cb_state === 'HALF_OPEN') {
        if (failureRate > 0.2) {
            cb_state = 'OPEN';
            last_fault_at = Date.now();
            await auditService.logCircuitBreaker('OPEN', 'Failure detected in half-open state, re-opening');
        } else if (failureRate < 0.05) {
            recovery_count++;
            if (recovery_count >= THRESHOLDS.RECOVERY_LIMIT) {
                cb_state = 'CLOSED';
                fault_count = 0;
                await auditService.logCircuitBreaker('CLOSED', 'System stabilized, back to normal');
            }
        }
    }

    return getStatus();
}

/**
 * Resets the circuit breaker manually.
 */
async function manualReset() {
    cb_state = 'CLOSED';
    fault_count = 0;
    recovery_count = 0;
    last_fault_at = null;
    return getStatus();
}

module.exports = {
    getStatus,
    evaluate,
    manualReset
};
