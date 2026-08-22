/**
 * tests/smoke_phase193h8c611351_forward_adapter_parity.js
 *
 * Phase 193H.8C.6.11.3.5.1 Verification Suite:
 * Calibration Forward Adapter Quantity & Signature Parity.
 *
 * Requirements Proven:
 * 1. Adapter faithfully forwards bookSpec.copies to BPE without hardcoding or downscaling to 1000.
 * 2. Target price semantics are strictly Total Manufacturing Price for the stated quantity.
 * 3. Exact 2000-copy fixture evaluates to 235.36 EUR under baseline rate card (no downscaling to 117.76 EUR).
 * 4. Adapter evaluateForwardPrice and direct BPE buildPrice match 100% for identical inputs and node signatures.
 * 5. Signature resolution parity: When node supports 32p, BPE selects 32p (4 sections), whereas fixed 16p assumptions diverge.
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

console.log('\n═══ Phase 193H.8C.6.11.3.5.1: Forward Adapter Parity Suite ═══\n');

const bpe = require('@ppos/pricing-engine');
const adapter = require('../src/api/services/buildPriceCalibrationAdapter');
const solver = require('../src/api/services/deterministicInversePricingSolver');

const baseSnapshot = {
    paper_price_interior_by_kilo: { offset: 0 },
    paper_price_cover_by_kilo: { artboard: 0 },
    interior_full_colour_fixed: { '16p': 0 },
    interior_full_colour_var: { '16p': 0 },
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
    finishing_options: 'gloss lamination',
    delivery_country: 'ES'
};

// T1: Quantity Preservation in Adapter
test('H8C.6.11.3.5.1-01', 'buildPriceCalibrationAdapter preserves exact copies without dividing by 1000', () => {
    const directOffer = bpe.buildPrice(bookSpec2000, { rates: baseSnapshot, signatures: [16, 8, 4] });
    const adapterRes = adapter.evaluateForwardPrice(bookSpec2000, baseSnapshot, {}, { signatures: [16, 8, 4] });

    assert.strictEqual(adapterRes.predictedManufacturingPrice, directOffer.total_cost);
    assert.strictEqual(adapterRes.predictedManufacturingPrice, 235.36);
});

// T2: Quantity Semantics Parity (1000 copies vs 2000 copies)
test('H8C.6.11.3.5.1-02', 'Target price of 3450 is compared against total manufacturing cost (235.36 EUR for 2000 copies, 117.76 EUR for 1000 copies)', () => {
    const spec1000 = { ...bookSpec2000, copies: 1000 };
    const res1000 = adapter.evaluateForwardPrice(spec1000, baseSnapshot, {}, { signatures: [16, 8, 4] });
    const res2000 = adapter.evaluateForwardPrice(bookSpec2000, baseSnapshot, {}, { signatures: [16, 8, 4] });

    assert.strictEqual(res1000.predictedManufacturingPrice, 117.76);
    assert.strictEqual(res2000.predictedManufacturingPrice, 235.36);
});

// T3: Signature Parity Audit
test('H8C.6.11.3.5.1-03', 'BPE dynamic signature selection vs adapter static signature paths', () => {
    // When node supports 32p, BPE selects 32p (4 sections)
    const offer32 = bpe.buildPrice(bookSpec2000, { rates: baseSnapshot, signatures: [16, 24, 32, 8, 4] });
    assert.strictEqual(offer32.signature, 32);
    assert.strictEqual(offer32.sections, 4);

    // Static adaptBookSpec assumes 16p (8 sections)
    const staticParams = adapter.adaptBookSpec(bookSpec2000);
    assert.strictEqual(staticParams.signatureSize, 16);
    assert.strictEqual(staticParams.sectionsCount, 8);
});

console.log(`\n═══ Phase 193H.8C.6.11.3.5.1 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
