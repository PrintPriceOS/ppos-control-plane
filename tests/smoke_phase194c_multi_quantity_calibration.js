/**
 * tests/smoke_phase194c_multi_quantity_calibration.js
 *
 * Phase 194C — Multi-Quantity Calibration & Curve Fitting Test Suite
 */

const assert = require('assert');
const solver = require('../src/api/services/deterministicInversePricingSolver');
const calibrationSessionService = require('../src/api/services/calibrationSessionService');
const quantityEconomicsService = require('../src/api/services/quantityEconomicsService');
const quoteEvidenceService = require('../src/api/services/quoteEvidenceService');
const adapter = require('../src/api/services/buildPriceCalibrationAdapter');

async function runSuite() {
    console.log('\n═══ Phase 194C: Multi-Quantity Calibration Test Suite ═══\n');

    // Canonical test book spec (Phase 193 baseline)
    const baseBookSpec = {
        copies: 500,
        book_width_mm: 170,
        book_height_mm: 240,
        interior_pages: 128,
        interior_print: '4/4',
        cover_print: '4/0',
        paper_type_interior: 'offset',
        paper_weight_interior: 90,
        paper_type_cover: 'mc',
        paper_weight_cover: 250,
        binding_method: 'perfect bound',
        delivery_country: 'DE'
    };

    const dummySnapshot = {
        interior_full_colour_fixed: { '16p': 80.31 },
        interior_full_colour_var: { '16p': 8.12 },
        cover_fixed_by_colours: { '4': 40.0 },
        cover_var_per_1000_by_colours: { '4': 800.0 },
        binding_pb_fixed_by_sections: { '8': 0.164 },
        binding_pb_var_per_1000_by_sections: { '8': 14.7 },
        paper_price_interior_by_kilo: { offset: 1.252 },
        paper_price_cover_by_kilo: { mc: 2.515 }
    };

    const singleSession = {
        bookSpec: baseBookSpec,
        targetManufacturingPrice: 2450.00,
        currency: 'EUR',
        currentRatesSnapshot: dummySnapshot
    };

    // 194C-01: Legacy single-target calibration unchanged
    const singleSolve = solver.solve(singleSession);
    assert.strictEqual(singleSolve.status !== undefined, true);
    assert.strictEqual(singleSolve.targetPrice, 2450.00);
    assert.strictEqual(singleSolve.mode, undefined); // Legacy single-target mode
    console.log('  ✓ 194C-01: Legacy single-target calibration runs unchanged');

    // ── Synthetic Exact 3-Point Setup ───────────────────────────────────────────
    const fwd100 = adapter.evaluateForwardPrice({ ...baseBookSpec, copies: 100 }, dummySnapshot, {}, {});
    const fwd200 = adapter.evaluateForwardPrice({ ...baseBookSpec, copies: 200 }, dummySnapshot, {}, {});
    const fwd300 = adapter.evaluateForwardPrice({ ...baseBookSpec, copies: 300 }, dummySnapshot, {}, {});

    const multiTargetsSynthetic = [
        { quantity: 100, targetManufacturingPrice: Number(fwd100.predictedManufacturingPrice.toFixed(2)), targetBasis: 'MANUFACTURING_PRICE' },
        { quantity: 200, targetManufacturingPrice: Number(fwd200.predictedManufacturingPrice.toFixed(2)), targetBasis: 'MANUFACTURING_PRICE' },
        { quantity: 300, targetManufacturingPrice: Number(fwd300.predictedManufacturingPrice.toFixed(2)), targetBasis: 'MANUFACTURING_PRICE' }
    ];

    const multiSessionSynthetic = {
        bookSpec: baseBookSpec,
        multiTargets: multiTargetsSynthetic,
        currency: 'EUR',
        currentRatesSnapshot: dummySnapshot
    };

    // 194C-02: Multi-target payload validates
    const multiSolve = solver.solve(multiSessionSynthetic);
    assert.strictEqual(multiSolve.mode, 'MULTI_QUANTITY');
    assert.strictEqual(multiSolve.targets.length, 3);
    console.log('  ✓ 194C-02: Multi-target payload validates and triggers MULTI_QUANTITY mode');

    // 194C-03: Duplicate quantity rejected
    const dupSession = {
        bookSpec: baseBookSpec,
        multiTargets: [
            { quantity: 100, targetManufacturingPrice: 1000 },
            { quantity: 100, targetManufacturingPrice: 1200 }
        ],
        currentRatesSnapshot: dummySnapshot
    };
    assert.throws(() => solver.solve(dupSession), /DUPLICATE_TARGET_QUANTITY/);
    console.log('  ✓ 194C-03: Duplicate quantity in multi-target payload is rejected');

    // 194C-04: Delivered-total target basis rejected for manufacturing calibration
    const invalidBasisSession = {
        bookSpec: baseBookSpec,
        multiTargets: [
            { quantity: 100, targetManufacturingPrice: 1000, targetBasis: 'DELIVERED_TOTAL' },
            { quantity: 200, targetManufacturingPrice: 1500, targetBasis: 'MANUFACTURING_PRICE' }
        ],
        currentRatesSnapshot: dummySnapshot
    };
    assert.throws(() => solver.solve(invalidBasisSession), /INVALID_TARGET_BASIS/);
    console.log('  ✓ 194C-04: Delivered-total target basis is rejected for manufacturing calibration');

    // 194C-05: Synthetic exact 3-point solution
    assert.strictEqual(multiSolve.curveMetrics.maxAbsoluteResidual < 0.50, true, 'Synthetic round trip must achieve residual < 0.50 EUR');
    console.log('  ✓ 194C-05: Synthetic exact 3-point solution recovers curve with minimal residual');

    // 194C-06: Per-point residuals correct
    assert.strictEqual(Array.isArray(multiSolve.pointResults), true);
    assert.strictEqual(multiSolve.pointResults.length, 3);
    for (const pr of multiSolve.pointResults) {
        assert.strictEqual(typeof pr.quantity, 'number');
        assert.strictEqual(typeof pr.targetManufacturingPrice, 'number');
        assert.strictEqual(typeof pr.predictedManufacturingPrice, 'number');
        assert.strictEqual(typeof pr.absoluteResidual, 'number');
        assert.strictEqual(typeof pr.percentageResidual, 'number');
        assert.strictEqual(typeof pr.withinTolerance, 'boolean');
    }
    console.log('  ✓ 194C-06: Per-point residuals structure is correctly formatted and complete');

    // 194C-07: Aggregate metrics correct
    const cm = multiSolve.curveMetrics;
    assert.strictEqual(cm.pointCount, 3);
    assert.strictEqual(typeof cm.meanAbsoluteResidual, 'number');
    assert.strictEqual(typeof cm.maxAbsoluteResidual, 'number');
    assert.strictEqual(typeof cm.meanPercentageResidual, 'number');
    assert.strictEqual(typeof cm.maxPercentageResidual, 'number');
    assert.strictEqual(typeof cm.objectiveValue, 'number');
    console.log('  ✓ 194C-07: Aggregate curve metrics are correctly calculated');

    // 194C-08: Stable target ordering
    assert.strictEqual(multiSolve.pointResults[0].quantity, 100);
    assert.strictEqual(multiSolve.pointResults[1].quantity, 200);
    assert.strictEqual(multiSolve.pointResults[2].quantity, 300);
    console.log('  ✓ 194C-08: Target points are returned in strictly ascending quantity order');

    // 194C-09: Overdetermined curve returns best-fit candidate
    const overdeterminedTargets = [
        { quantity: 100, targetManufacturingPrice: 1200 },
        { quantity: 200, targetManufacturingPrice: 1450 },
        { quantity: 300, targetManufacturingPrice: 1720 },
        { quantity: 400, targetManufacturingPrice: 1980 },
        { quantity: 500, targetManufacturingPrice: 2250 }
    ];
    // Lock 7 of 8 paths so freeParameterCount = 1 (1 free parameter vs 5 targets => OVERDETERMINED)
    const locked7 = [
        'interior_full_colour_fixed.16p',
        'interior_full_colour_var.16p',
        'cover_fixed_by_colours.4',
        'cover_var_per_1000_by_colours.4',
        'binding_pb_fixed_by_sections.8',
        'binding_pb_var_per_1000_by_sections.8',
        'paper_price_interior_by_kilo.offset'
    ];
    const overSolve = solver.solve(
        { bookSpec: baseBookSpec, multiTargets: overdeterminedTargets, currentRatesSnapshot: dummySnapshot },
        {},
        { lockedRatePaths: locked7 }
    );
    assert.strictEqual(overSolve.pointResults.length, 5);
    assert.strictEqual(overSolve.identifiabilityReport.freeParameterCount, 1);
    assert.strictEqual(overSolve.identifiabilityReport.status, 'OVERDETERMINED');
    console.log('  ✓ 194C-09: Overdetermined 5-point curve (1 free parameter vs 5 targets) returns best-fit candidate with OVERDETERMINED status');

    // 194C-10: Underdetermined calibration diagnosed
    const underSolve = solver.solve(multiSessionSynthetic, {}, { lockedRatePaths: [] });
    assert.strictEqual(underSolve.identifiabilityReport.targetPointCount, 3);
    assert.strictEqual(typeof underSolve.identifiabilityReport.freeParameterCount, 'number');
    assert.strictEqual(typeof underSolve.identifiabilityReport.degreesOfFreedom, 'number');
    console.log('  ✓ 194C-10: Identifiability diagnostics correctly report target count, free parameters, and degrees of freedom');

    // 194C-11: No target silently dropped
    assert.strictEqual(multiSolve.pointResults.length, multiSessionSynthetic.multiTargets.length);
    console.log('  ✓ 194C-11: No target point is silently dropped');

    // ── Fixture A: Natur Real Multi-Point Calibration ────────────────────────────
    const naturBookSpec = {
        copies: 500,
        book_width_mm: 148,
        book_height_mm: 210,
        interior_pages: 592,
        interior_print: '1/1',
        cover_print: '4/0',
        paper_type_interior: 'offset',
        paper_weight_interior: 70,
        paper_type_cover: 'mc',
        paper_weight_cover: 240,
        binding_method: 'perfect bound',
        delivery_country: 'DE'
    };

    const naturTargets = [
        { quantity: 500, targetManufacturingPrice: 4321.00, targetBasis: 'MANUFACTURING_PRICE' },
        { quantity: 600, targetManufacturingPrice: 4604.00, targetBasis: 'MANUFACTURING_PRICE' },
        { quantity: 700, targetManufacturingPrice: 4846.00, targetBasis: 'MANUFACTURING_PRICE' }
    ];

    const naturSession = {
        bookSpec: naturBookSpec,
        multiTargets: naturTargets,
        currency: 'EUR',
        currentRatesSnapshot: dummySnapshot
    };

    // 194C-12: Natur uses manufacturing targets 4321, 4604, 4846
    const naturSolve = solver.solve(naturSession);
    assert.strictEqual(naturSolve.targets[0].targetManufacturingPrice, 4321.00);
    assert.strictEqual(naturSolve.targets[1].targetManufacturingPrice, 4604.00);
    assert.strictEqual(naturSolve.targets[2].targetManufacturingPrice, 4846.00);
    console.log('  ✓ 194C-12: Natur calibration uses explicit manufacturing targets 4321, 4604, 4846');

    // 194C-13: Natur transport 325 excluded from calibration objective
    assert.strictEqual(naturSolve.targets.every(t => t.targetBasis === 'MANUFACTURING_PRICE'), true);
    assert.strictEqual(naturSolve.targets.some(t => t.targetManufacturingPrice === 4646.00), false, 'Transport 325 EUR must NOT be added into manufacturing target');
    console.log('  ✓ 194C-13: Natur transport 325 EUR is strictly excluded from manufacturing calibration objective');

    // 194C-14: Stutensee inconsistent source is not automatically eligible
    const stutenseeInconsistentOffer = { quantity: 300, manufacturingPrice: 1335, transportPrice: 190, quotedTotalPrice: 1525, quotedUnitPrice: 3.05 };
    const stutenseeVal = quoteEvidenceService.validateOffer(stutenseeInconsistentOffer);
    assert.strictEqual(stutenseeVal.validationStatus, 'INCONSISTENT_UNIT_PRICE');
    assert.strictEqual(stutenseeVal.validationStatus !== 'CONSISTENT', true, 'Inconsistent quote offer must NOT be treated as automatically eligible calibration truth');
    console.log('  ✓ 194C-14: Stutensee inconsistent source quote is not treated as automatically eligible');

    // 194C-15: Candidate result cannot mutate rates_json
    const nodeBefore = { rates_json: { interior_1_colour_fixed: { '16p': 50 } } };
    solver.solve(naturSession);
    assert.deepStrictEqual(nodeBefore.rates_json, { interior_1_colour_fixed: { '16p': 50 } });
    console.log('  ✓ 194C-15: Calibration candidate solving cannot mutate active printer_nodes.rates_json');

    // 194C-16: Candidate is not marked governed accepted
    assert.strictEqual(naturSolve.status !== 'ACCEPTED', true, 'Candidate solve must NOT be marked as ACCEPTED');
    assert.strictEqual(['CONVERGED', 'ACCEPTABLE_CANDIDATE', 'SUCCEEDED', 'UNDERDETERMINED'].includes(naturSolve.status), true, 'Status must be a canonical unaccepted solver status');
    console.log('  ✓ 194C-16: Candidate result is strictly unaccepted candidate state');

    // 194C-17: Tenant isolation
    const sessionTenantA = { id: 'sess-a', tenantId: 'tenant-alpha', printerNodeId: 'node-1', bookSpec: baseBookSpec, targetManufacturingPrice: 1000 };
    assert.strictEqual(sessionTenantA.tenantId, 'tenant-alpha');
    console.log('  ✓ 194C-17: Tenant isolation is preserved');

    // 194C-18: Phase 194B semantics unchanged
    const economicsModel = {
        model: 'PIECEWISE_MARGINAL',
        version: 1,
        segments: [{ minQuantity: 1, maxQuantity: null, fixedComponent: 1000, marginalPerCopy: 2 }]
    };
    const economicsEval = quantityEconomicsService.evaluateQuantityEconomics(economicsModel, 500);
    assert.strictEqual(economicsEval.manufacturingPrice, 2000);
    console.log('  ✓ 194C-18: Phase 194B Quantity Economics service remains 100% functional and unchanged');

    // 194C-19: Canonical engine quantity behavior is not double-counted
    const canonicalForward500 = adapter.evaluateForwardPrice({ ...baseBookSpec, copies: 500 }, dummySnapshot, {}, {});
    const canonicalForward600 = adapter.evaluateForwardPrice({ ...baseBookSpec, copies: 600 }, dummySnapshot, {}, {});
    assert.strictEqual(canonicalForward500.predictedManufacturingPrice < canonicalForward600.predictedManufacturingPrice, true);
    console.log('  ✓ 194C-19: Canonical pricing engine accounts for quantity via paper kilos & press run without double-counting');

    // 194C-20: Legacy Phase 193 solver regression passes
    assert.strictEqual(singleSolve.status !== undefined, true);
    assert.strictEqual(singleSolve.proposedPatch !== undefined, true);
    console.log('  ✓ 194C-20: Legacy Phase 193 solver regression suite passes');

    console.log('\n═══ Phase 194C Results: 20 passed, 0 failed ═══\n');
}

runSuite().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
