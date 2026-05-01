/**
 * Optimization Autonomy Admin Routes
 * Phase 13 — Controlled Autonomy Expansion
 */

const express = require('express');
const router = express.Router();

let eligibility = null, lifecycleManager = null, policy = null, adjuster = null;
try {
    eligibility = require('../upstream/src/services/autonomyEligibility');
    lifecycleManager = require('../upstream/src/services/strategyLifecycleManager');
    policy = require('../upstream/src/services/autonomyPolicy');
    adjuster = require('../upstream/src/services/confidenceAdjuster');
} catch (e) {
    console.error('[CORE-ROUTING] Autonomy services unavailable:', e.message);
}

router.get('/status', (req, res) => {
    try {
        const strategies = ['CONCURRENCY_TUNE', 'RETRY_TUNE', 'ROUTING_SHIFT', 'COST_OPTIMIZATION'];
        const tracking = strategies.map(strategy => {
            if (!eligibility || !lifecycleManager) {
                return {
                    strategyType: strategy,
                    currentState: 'OFFLINE',
                    isEligible: false,
                    reason: 'Core autonomy services unavailable',
                    metrics: {}
                };
            }
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

        res.json({ ok: true, status: tracking, degraded: !eligibility });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/policy', (req, res) => {
    try {
        res.json({ ok: true, policy: policy ? policy.config : {}, degraded: !policy });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
