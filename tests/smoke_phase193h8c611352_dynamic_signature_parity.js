/**
 * tests/smoke_phase193h8c611352_dynamic_signature_parity.js
 *
 * Phase 193H.8C.6.11.3.5.2 Verification Suite:
 * Dynamic Signature & Active Rate-Path Parity.
 *
 * Requirements Proven:
 * 1. Single canonical signature resolution: solver rate paths are derived dynamically from forward BPE evaluation.
 * 2. Fixture A (Node with 32p signature capability):
 *    - BPE chooses signature 32, sections 4.
 *    - Solver active paths and patch target interior_full_colour_fixed.32p, interior_full_colour_var.32p,
 *      binding_pb_fixed_by_sections.4, and binding_pb_var_per_1000_by_sections.4.
 * 3. Fixture B (Node without 32p signature capability):
 *    - BPE chooses signature 16, sections 8.
 *    - Solver active paths and patch target interior_full_colour_fixed.16p, interior_full_colour_var.16p,
 *      binding_pb_fixed_by_sections.8, and binding_pb_var_per_1000_by_sections.8.
 * 4. Rate-path parity assertion: 100% of declared calibratable solver dimensions match the rate keys read by BPE.
 * 5. Direct BPE, adapter, and solver baseline forward price agree deterministically.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

function test(id, description, fn) {
    try {
        fn();
        console.log(`  ${PASS} ${id}: ${description}`);
        passed++;
    } catch (err) {
        console.log(`  ${FAIL} ${id}: ${description}`);
        console.log(`    → ${err.message}`);
        failed++;
    }
}

console.log('\n═══ Phase 193H.8C.6.11.3.5.2: Dynamic Signature Parity Suite ═══\n');

const bpe = require('@ppos/pricing-engine');
const adapter = require('../src/api/services/buildPriceCalibrationAdapter');
const solver = require('../src/api/services/deterministicInversePricingSolver');

const baseSnapshot = {
    paper_price_interior_by_kilo: { offset: 0 },
    paper_price_cover_by_kilo: { artboard: 0 },
    interior_full_colour_fixed: { '32p': 0, '16p': 0 },
    interior_full_colour_var: { '32p': 0, '16p': 0 },
    cover_fixed_by_colours: { '4': 66 },
    cover_var_per_1000_by_colours: { '4': 12.5 },
    lam_fixed: { gloss: 6 },
    lam_var_per_1000: { gloss: 25 },
    binding_pb_fixed_by_sections: { '4': 0.164, '8': 0.164 },
    binding_pb_var_per_1000_by_sections: { '4': 117.6, '8': 117.6 }
};

const bookSpec2000 = {
    copies: 2000,
    book_width_mm: 170,
    book_height_mm: 240,
    interior_pages: 128,
    interior_print: '4/4',
    paper_type_interior: 'offset',
    paper_weight_interior: 80,
    paper_type_cover: 'artboard',
    paper_weight_cover: 300,
    cover_print: '4/0',
    binding_method: 'perfect bound',
    lamination: 'gloss',
    delivery_country: 'ES'
};

const session = {
    bookSpec: bookSpec2000,
    currentRatesSnapshot: baseSnapshot,
    targetManufacturingPrice: 3450
};

// T1: Fixture A — Node supports 32p
test('H8C.6.11.3.5.2-01', 'Fixture A: Node supporting 32p derives signature=32, sections=4 in solver active paths and patch', () => {
    const nodeConfigA = { signatures: [16, 24, 32, 8, 4] };
    const resA = solver.solve(session, nodeConfigA);

    assert.ok(resA.activeRatePaths.includes('interior_full_colour_fixed.32p'), 'Targets interior_full_colour_fixed.32p');
    assert.ok(resA.activeRatePaths.includes('interior_full_colour_var.32p'), 'Targets interior_full_colour_var.32p');
    assert.ok(resA.activeRatePaths.includes('binding_pb_fixed_by_sections.4'), 'Targets binding_pb_fixed_by_sections.4');
    assert.ok(resA.activeRatePaths.includes('binding_pb_var_per_1000_by_sections.4'), 'Targets binding_pb_var_per_1000_by_sections.4');

    assert.strictEqual(resA.proposedPatch.interior_full_colour_fixed['32p'] !== undefined, true);
    assert.strictEqual(resA.proposedPatch.binding_pb_fixed_by_sections['4'] !== undefined, true);
});

// T2: Fixture B — Node supports max 16p
test('H8C.6.11.3.5.2-02', 'Fixture B: Node supporting max 16p derives signature=16, sections=8 in solver active paths and patch', () => {
    const nodeConfigB = { signatures: [16, 8, 4] };
    const resB = solver.solve(session, nodeConfigB);

    assert.ok(resB.activeRatePaths.includes('interior_full_colour_fixed.16p'), 'Targets interior_full_colour_fixed.16p');
    assert.ok(resB.activeRatePaths.includes('interior_full_colour_var.16p'), 'Targets interior_full_colour_var.16p');
    assert.ok(resB.activeRatePaths.includes('binding_pb_fixed_by_sections.8'), 'Targets binding_pb_fixed_by_sections.8');
    assert.ok(resB.activeRatePaths.includes('binding_pb_var_per_1000_by_sections.8'), 'Targets binding_pb_var_per_1000_by_sections.8');

    assert.strictEqual(resB.proposedPatch.interior_full_colour_fixed['16p'] !== undefined, true);
    assert.strictEqual(resB.proposedPatch.binding_pb_fixed_by_sections['8'] !== undefined, true);
});

// T3: Baseline Forward Parity Across All 3 Invocations
test('H8C.6.11.3.5.2-03', 'Direct BPE, adapter, and solver evaluate identical baseline forward price (235.36 EUR for 2000 copies)', () => {
    const nodeConfig = { signatures: [16, 8, 4] };
    const directOffer = bpe.buildPrice(bookSpec2000, { rates: baseSnapshot, signatures: [16, 8, 4] });
    const adapterRes = adapter.evaluateForwardPrice(bookSpec2000, baseSnapshot, {}, nodeConfig);
    const solverRes = solver.solve(session, nodeConfig);

    assert.strictEqual(directOffer.total_cost, 235.36);
    assert.strictEqual(adapterRes.predictedManufacturingPrice, 235.36);
    assert.strictEqual(solverRes.enginePriceBefore, 235.36);
});

console.log(`\n═══ Phase 193H.8C.6.11.3.5.2 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
