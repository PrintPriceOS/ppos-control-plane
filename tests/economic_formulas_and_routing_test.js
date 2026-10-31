const assert = require('assert');
const pricingIntelligenceService = require('../src/api/services/pricingIntelligenceService');
const industrialEconomics = require('../src/api/services/economics/IndustrialEconomicService');
const economicRoutingService = require('../src/api/services/economicRoutingService');

let currentTestCase = null;
let currentMinCost = 0;

// Mock dependencies for routing and economics since we don't have a live DB
industrialEconomics.estimateProductionCost = async (nodeId, jobData) => {
    // We will just throw typed errors here to test how routing handles them
    if (currentTestCase === 'missing_rates_json') {
        const err = new Error("No rate card found for node"); err.code = "PRICING_INCOMPLETE"; throw err;
    }
    if (currentTestCase === 'empty_rates_json') {
        const err = new Error("Missing mandatory field: operationalMinimumCost"); err.code = "PRICING_INCOMPLETE"; throw err;
    }
    if (currentTestCase === 'unsupported_version') {
        const err = new Error("Unsupported rate card version"); err.code = "UNSUPPORTED_VERSION"; throw err;
    }
    if (currentTestCase === 'expired_card') {
        const err = new Error("Rate card has expired"); err.code = "RATE_CARD_EXPIRED"; throw err;
    }
    if (currentTestCase === 'future_card') {
        const err = new Error("Rate card is not yet effective"); err.code = "RATE_CARD_FUTURE"; throw err;
    }
    if (currentTestCase === 'currency_mismatch') {
        const err = new Error("Currency mismatch"); err.code = "CURRENCY_MISMATCH"; throw err;
    }
    if (currentTestCase === 'missing_relevant_capability') {
        const err = new Error("Missing required capability pricing: interior"); err.code = "UNSUPPORTED_CAPABILITY"; throw err;
    }
    if (currentTestCase === 'negative_rate') {
        // Assume negative rate is caught in parsing
        const err = new Error("Rate cannot be negative"); err.code = "INVALID_RATE_CARD"; throw err;
    }
    
    // Default success case
    return {
        operationalCost: Math.max(100, currentMinCost || 0),
        rateCardCurrency: 'EUR',
        rateCardSchemaVersion: 1,
        rateCardRevision: 1,
        rateCardChecksum: 'mock_checksum'
    };
};

const machineRegistry = require('../src/api/services/machineRegistryService');
machineRegistry.findMatchingMachines = async () => ({
    matched: [{ id: 'm1', node_id: 'n1' }],
    rejected: []
});

pricingIntelligenceService.resolvePricingProfile = async () => ({
    id: 'p1',
    platform_markup_pct: 5,
    dynamic_routing_premium: 2,
    target_margin_pct: 20,
    minimum_job_fee: 0
});

async function runTests() {
    console.log("=== Running Economic Regression Tests (Phase 190.2) ===");
    let passed = 0;
    let failed = 0;

    async function runTest(name, fn) {
        try {
            await fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (e) {
            console.error(`✗ ${name} - FAILED`);
            console.error(e.stack);
            failed++;
        }
    }

    // --- FORMULA TESTS ---
    await runTest("Formula: 100 / 5 / 2 / 20 = 133.8750 raw and 133.88 final", () => {
        const profile = { platform_markup_pct: 5, dynamic_routing_premium: 2, target_margin_pct: 20, minimum_job_fee: 0 };
        const result = pricingIntelligenceService.applyCommercialStrategy(100, profile);
        assert.strictEqual(result.finalSuggestedPriceRaw, "133.8750");
        assert.strictEqual(result.finalSuggestedPrice, "133.88");
    });

    await runTest("Formula: Minimum selling price constraint (Commercial minimum applies)", () => {
        const result = pricingIntelligenceService.applyCommercialStrategy(10, {
            platform_markup_pct: 0, target_margin_pct: 0, dynamic_routing_premium: 0, minimum_job_fee: 150
        });
        assert.strictEqual(result.finalSuggestedPrice, "150.00");
    });

    await runTest("Formula: Target margin >= 100 rejected", () => {
        assert.throws(() => {
            pricingIntelligenceService.applyCommercialStrategy(100, { target_margin_pct: 100 });
        }, /Target margin must be less than 100%/);
    });

    await runTest("Formula: Target margin 99.99 is handled", () => {
        const result = pricingIntelligenceService.applyCommercialStrategy(100, {
            platform_markup_pct: 0, target_margin_pct: 99.99, dynamic_routing_premium: 0, minimum_job_fee: 0
        });
        // 100 / (1 - 0.9999) = 100 / 0.0001 = 1000000
        assert.strictEqual(result.finalSuggestedPriceRaw, "1000000.0000");
        assert.strictEqual(result.finalSuggestedPrice, "1000000.00");
    });

    // --- ELIGIBILITY & ROUTING TESTS ---
    const testRoutingError = async (testCase, expectedErrorCode) => {
        currentTestCase = testCase;
        const res = await economicRoutingService.evaluateCandidates({});
        assert.strictEqual(res.candidates.length, 0, "Should have 0 eligible candidates");
        assert.strictEqual(res.rejectedCandidates.length, 1, "Should have 1 rejected candidate");
        assert.strictEqual(res.rejectedCandidates[0].reason, expectedErrorCode, `Reason should be ${expectedErrorCode}`);
        assert.ok(!res.rejectedCandidates[0].details.includes("100.00"), "Should not leak pricing details");
    };

    await runTest("Routing: missing rates_json fails", () => testRoutingError('missing_rates_json', 'PRICING_INCOMPLETE'));
    await runTest("Routing: empty rates_json fails", () => testRoutingError('empty_rates_json', 'PRICING_INCOMPLETE'));
    await runTest("Routing: unsupported version fails", () => testRoutingError('unsupported_version', 'UNSUPPORTED_VERSION'));
    await runTest("Routing: expired card fails", () => testRoutingError('expired_card', 'RATE_CARD_EXPIRED'));
    await runTest("Routing: future card fails", () => testRoutingError('future_card', 'RATE_CARD_FUTURE'));
    await runTest("Routing: currency mismatch fails", () => testRoutingError('currency_mismatch', 'CURRENCY_MISMATCH'));
    await runTest("Routing: missing relevant capability fails", () => testRoutingError('missing_relevant_capability', 'UNSUPPORTED_CAPABILITY'));
    await runTest("Routing: negative values fail", () => testRoutingError('negative_rate', 'INVALID_RATE_CARD'));
    
    await runTest("Routing: missing irrelevant capability remains eligible", async () => {
        currentTestCase = 'missing_irrelevant_capability';
        const res = await economicRoutingService.evaluateCandidates({});
        assert.strictEqual(res.candidates.length, 1, "Should have 1 eligible candidate");
        assert.strictEqual(res.candidates[0].estimatedCost, 133.875, "Should calculate correct cost");
    });

    await runTest("Routing: operational minimum applies", async () => {
        currentTestCase = 'operational_minimum';
        currentMinCost = 500;
        const res = await economicRoutingService.evaluateCandidates({});
        // cost = max(100, 500) = 500
        // commercial price = 500 * 1.05 * 1.02 / 0.8 = 669.375
        assert.strictEqual(res.candidates[0].estimatedCost, 669.375);
    });

    console.log(`\nTests completed. Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
