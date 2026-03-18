/**
 * Optimization Autonomy Admin Routes
 * Phase 13 — Controlled Autonomy Expansion
 */

const express = require('express');
const router = express.Router();

let eligibility, lifecycleManager, policy, adjuster;
try {
    eligibility = require('../../../../../ppos-preflight-service/src/services/autonomyEligibility');
    lifecycleManager = require('../../../../../ppos-preflight-service/src/services/strategyLifecycleManager');
    policy = require('../../../../../ppos-preflight-service/src/services/autonomyPolicy');
    adjuster = require('../../../../../ppos-preflight-service/src/services/confidenceAdjuster');
} catch (e) {
    console.warn('[DEGRADED-MODE] Autonomy Admin routes using sharedMocks:', e.message);
    const mocks = require('../services/sharedMocks');
    mocks.markUsed();
    eligibility = mocks.autonomyEligibility;
    lifecycleManager = mocks.strategyLifecycleManager;
    policy = mocks.autonomyPolicy;
    adjuster = mocks.confidenceAdjuster;
}

router.get('/status', (req, res) => {
    try {
        const strategies = ['CONCURRENCY_TUNE', 'RETRY_TUNE', 'ROUTING_SHIFT', 'COST_OPTIMIZATION'];
        const tracking = strategies.map(strategy => {
            const ev = eligibility.determineEligibility(strategy, {}, 'global', 'none');
            const state = lifecycleManager.getLifecycleState(strategy);
            return {
                strategyType: strategy,
                currentState: state,
                isEligible: ev.eligible,
                reason: ev.reason,
                metrics: ev.metrics
            };
        });

        res.json({ ok: true, status: tracking });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/policy', (req, res) => {
    try {
        res.json({ ok: true, policy: policy.config });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
