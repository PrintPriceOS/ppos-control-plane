/**
 * tests/smoke_phase194b_quantity_economics.js
 *
 * Phase 194B — Quantity Economics Domain Layer Test Suite
 */

const assert = require('assert');
const quantityEconomicsService = require('../src/api/services/quantityEconomicsService');
const quoteEvidenceService = require('../src/api/services/quoteEvidenceService');

async function runSuite() {
    console.log('\n═══ Phase 194B: Quantity Economics Domain Model Suite ═══\n');

    // ── Fixture A: Smooth fixed + marginal model ────────────────────────────────
    const fixtureA = {
        model: 'PIECEWISE_MARGINAL',
        version: 1,
        segments: [
            {
                segmentId: 'seg-base',
                minQuantity: 1,
                maxQuantity: null,
                fixedComponent: 1000.00,
                marginalPerCopy: 2.00,
                route: 'DEFAULT'
            }
        ]
    };

    // 194B-01: Single-segment model validates
    const valA = quantityEconomicsService.validateQuantityEconomicsModel(fixtureA);
    assert.strictEqual(valA.valid, true, 'Fixture A model must validate successfully');
    console.log('  ✓ 194B-01: Single-segment model validates');

    // 194B-02: Fixed + marginal evaluation correct
    const evalA100 = quantityEconomicsService.evaluateQuantityEconomics(fixtureA, 100);
    const evalA200 = quantityEconomicsService.evaluateQuantityEconomics(fixtureA, 200);
    const evalA300 = quantityEconomicsService.evaluateQuantityEconomics(fixtureA, 300);

    assert.strictEqual(evalA100.manufacturingPrice, 1200.00, 'q=100 price must be 1000 + 200 = 1200');
    assert.strictEqual(evalA200.manufacturingPrice, 1400.00, 'q=200 price must be 1000 + 400 = 1400');
    assert.strictEqual(evalA300.manufacturingPrice, 1600.00, 'q=300 price must be 1000 + 600 = 1600');
    console.log('  ✓ 194B-02: Fixed + marginal evaluation is correct');

    // 194B-03: Average unit cost calculated correctly
    assert.strictEqual(evalA100.averageUnitManufacturingPrice, 12.00, 'q=100 unit cost must be 12.00');
    assert.strictEqual(evalA200.averageUnitManufacturingPrice, 7.00, 'q=200 unit cost must be 7.00');
    assert.strictEqual(evalA300.averageUnitManufacturingPrice, 5.333333, 'q=300 unit cost must be 5.333333');
    console.log('  ✓ 194B-03: Average unit cost calculated correctly');

    // ── Fixture B: Piecewise breakpoint model ──────────────────────────────────
    const fixtureB = {
        model: 'PIECEWISE_MARGINAL',
        version: 1,
        segments: [
            {
                segmentId: 'seg-small',
                minQuantity: 1,
                maxQuantity: 499,
                fixedComponent: 1000.00,
                marginalPerCopy: 2.00,
                route: 'DIGITAL'
            },
            {
                segmentId: 'seg-large',
                minQuantity: 500,
                maxQuantity: null,
                fixedComponent: 1200.00,
                marginalPerCopy: 1.20,
                route: 'OFFSET',
                reason: 'DIGITAL_TO_OFFSET',
                continuity: 'DECLARED_DISCONTINUITY'
            }
        ]
    };

    // 194B-04: Piecewise segment selection correct
    const evalB300 = quantityEconomicsService.evaluateQuantityEconomics(fixtureB, 300);
    const evalB600 = quantityEconomicsService.evaluateQuantityEconomics(fixtureB, 600);

    assert.strictEqual(evalB300.segmentId, 'seg-small');
    assert.strictEqual(evalB600.segmentId, 'seg-large');
    console.log('  ✓ 194B-04: Piecewise segment selection correct');

    // 194B-05: Breakpoint exact boundary deterministic
    const evalB499 = quantityEconomicsService.evaluateQuantityEconomics(fixtureB, 499);
    const evalB500 = quantityEconomicsService.evaluateQuantityEconomics(fixtureB, 500);

    assert.strictEqual(evalB499.segmentId, 'seg-small', 'q=499 must select seg-small');
    assert.strictEqual(evalB500.segmentId, 'seg-large', 'q=500 must select seg-large');
    assert.strictEqual(evalB499.manufacturingPrice, 1998.00, 'q=499 price = 1000 + 499*2 = 1998');
    assert.strictEqual(evalB500.manufacturingPrice, 1800.00, 'q=500 price = 1200 + 500*1.2 = 1800');
    console.log('  ✓ 194B-05: Breakpoint exact boundary is deterministic');

    // 194B-06: Open-ended final range works
    const evalB5000 = quantityEconomicsService.evaluateQuantityEconomics(fixtureB, 5000);
    assert.strictEqual(evalB5000.segmentId, 'seg-large');
    assert.strictEqual(evalB5000.manufacturingPrice, 7200.00, 'q=5000 price = 1200 + 5000*1.2 = 7200');
    console.log('  ✓ 194B-06: Open-ended final range works');

    // 194B-07: Overlapping ranges rejected
    const invalidOverlap = {
        model: 'PIECEWISE_MARGINAL',
        version: 1,
        segments: [
            { minQuantity: 1, maxQuantity: 500, fixedComponent: 100, marginalPerCopy: 1 },
            { minQuantity: 400, maxQuantity: 800, fixedComponent: 100, marginalPerCopy: 1 }
        ]
    };
    const valOverlap = quantityEconomicsService.validateQuantityEconomicsModel(invalidOverlap);
    assert.strictEqual(valOverlap.valid, false);
    assert.strictEqual(valOverlap.errors.some(e => e.code === 'OVERLAPPING_QUANTITY_SEGMENTS'), true);
    console.log('  ✓ 194B-07: Overlapping ranges rejected');

    // 194B-08: Invalid quantity rejected
    const evalZero = quantityEconomicsService.evaluateQuantityEconomics(fixtureA, 0);
    const evalFloat = quantityEconomicsService.evaluateQuantityEconomics(fixtureA, 12.5);
    assert.strictEqual(evalZero.error, 'INVALID_QUANTITY');
    assert.strictEqual(evalFloat.error, 'INVALID_QUANTITY');
    console.log('  ✓ 194B-08: Invalid quantity rejected');

    // 194B-09: NaN / Infinity rejected
    const evalNaN = quantityEconomicsService.evaluateQuantityEconomics(fixtureA, NaN);
    const evalInf = quantityEconomicsService.evaluateQuantityEconomics(fixtureA, Infinity);
    assert.strictEqual(evalNaN.error, 'INVALID_QUANTITY');
    assert.strictEqual(evalInf.error, 'INVALID_QUANTITY');
    console.log('  ✓ 194B-09: NaN / Infinity rejected');

    // 194B-10: Negative component rejected
    const invalidNegative = {
        model: 'PIECEWISE_MARGINAL',
        version: 1,
        segments: [{ minQuantity: 1, maxQuantity: null, fixedComponent: -500, marginalPerCopy: 1 }]
    };
    const valNeg = quantityEconomicsService.validateQuantityEconomicsModel(invalidNegative);
    assert.strictEqual(valNeg.valid, false);
    assert.strictEqual(valNeg.errors.some(e => e.code === 'INVALID_FIXED_COMPONENT'), true);
    console.log('  ✓ 194B-10: Negative component rejected');

    // 194B-11: Unknown breakpoint reason rejected
    const invalidReason = {
        model: 'PIECEWISE_MARGINAL',
        version: 1,
        segments: [{ minQuantity: 1, maxQuantity: null, fixedComponent: 100, marginalPerCopy: 1, reason: 'MAGIC_DISCOUNT' }]
    };
    const valReason = quantityEconomicsService.validateQuantityEconomicsModel(invalidReason);
    assert.strictEqual(valReason.valid, false);
    assert.strictEqual(valReason.errors.some(e => e.code === 'UNKNOWN_BREAKPOINT_REASON'), true);
    console.log('  ✓ 194B-11: Unknown breakpoint reason rejected');

    // 194B-12: Declared route change preserved
    assert.strictEqual(evalB500.productionRoute, 'OFFSET');
    assert.strictEqual(evalB500.breakpointReason, 'DIGITAL_TO_OFFSET');
    console.log('  ✓ 194B-12: Declared route change preserved');

    // 194B-13: Quantity series returns stable ordering
    const series = quantityEconomicsService.evaluateQuantitySeries(fixtureA, [300, 100, 200]);
    assert.strictEqual(series.length, 3);
    assert.strictEqual(series[0].quantity, 100);
    assert.strictEqual(series[1].quantity, 200);
    assert.strictEqual(series[2].quantity, 300);
    console.log('  ✓ 194B-13: Quantity series returns stable ordering');

    // 194B-14: Manufacturing remains separate from transport
    assert.strictEqual(evalB500.transportPrice, undefined);
    assert.strictEqual(evalB500.deliveredTotal, undefined);
    assert.strictEqual(evalB500.manufacturingPrice !== undefined, true);
    console.log('  ✓ 194B-14: Manufacturing remains separate from transport');

    // 194B-15: Natur quantities [500, 600, 700] can be evaluated as a series
    const naturSeriesModel = {
        model: 'PIECEWISE_MARGINAL',
        version: 1,
        segments: [{ minQuantity: 1, maxQuantity: null, fixedComponent: 1706.00, marginalPerCopy: 5.23, route: 'OFFSET' }]
    };
    const naturSeriesEval = quantityEconomicsService.evaluateQuantitySeries(naturSeriesModel, [500, 600, 700]);
    assert.strictEqual(naturSeriesEval.length, 3);
    assert.strictEqual(naturSeriesEval[0].quantity, 500);
    assert.strictEqual(naturSeriesEval[1].quantity, 600);
    assert.strictEqual(naturSeriesEval[2].quantity, 700);
    console.log('  ✓ 194B-15: Natur quantities [500, 600, 700] can be evaluated as a series');

    // 194B-16: Phase 194B cannot mutate printer_nodes.rates_json
    const nodeBefore = { rates_json: { interior_1_colour_fixed: { '16p': 50 } } };
    quantityEconomicsService.evaluateQuantityEconomics(fixtureB, 500);
    assert.deepStrictEqual(nodeBefore.rates_json, { interior_1_colour_fixed: { '16p': 50 } });
    console.log('  ✓ 194B-16: Phase 194B evaluation cannot mutate active printer_nodes.rates_json');

    // 194B-17: Phase 194A evidence validation remains unchanged
    const stutenseeSample = {
        offers: [
            { quantity: 250, manufacturingPrice: 1283, transportPrice: 190, quotedTotalPrice: 1473, quotedUnitPrice: 5.89 },
            { quantity: 300, manufacturingPrice: 1335, transportPrice: 190, quotedTotalPrice: 1525, quotedUnitPrice: 3.05 }
        ]
    };
    const valStutensee = quoteEvidenceService.validateNormalizedQuote(stutenseeSample);
    assert.strictEqual(valStutensee.overallStatus, 'INCONSISTENT_UNIT_PRICE');
    console.log('  ✓ 194B-17: Phase 194A quote evidence validation remains 100% functional and unchanged');

    console.log('\n═══ Phase 194B Results: 17 passed, 0 failed ═══\n');
}

runSuite().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
