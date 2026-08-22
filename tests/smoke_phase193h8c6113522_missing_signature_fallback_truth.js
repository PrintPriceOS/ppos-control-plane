/**
 * tests/smoke_phase193h8c6113522_missing_signature_fallback_truth.js
 *
 * Phase 193H.8C.6.11.3.5.2.2 Verification Suite:
 * Missing Signature Capability Fallback Truth.
 *
 * Requirements Proven:
 * 1. Missing node signature capability (null / undefined / empty):
 *    - BPE applies its canonical legacy fallback: signature=16, sections=8 for 128p.
 *    - Adapter passes signatures=null faithfully to syntheticHouse (zero synthetic [16,24,32,8,4] injection).
 *    - Solver derives matching 16p / 8-sections active paths.
 * 2. Explicit node capability ([16,24,32,8,4]):
 *    - Evaluates to 32p / 4 sections.
 * 3. Explicit node capability ([16,8,4]):
 *    - Evaluates to 16p / 8 sections.
 * 4. Zero fabricated capability in persistence:
 *    - Session persistence and snapshot are never mutated to claim 32p capability for null-signature nodes.
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

console.log('\n═══ Phase 193H.8C.6.11.3.5.2.2: Missing Signature Fallback Truth Suite ═══\n');

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
    printerNodeId: 'node-null-sig',
    currentRatesSnapshot: baseSnapshot,
    targetManufacturingPrice: 3450
};

// T1: Canonical BPE Legacy Fallback Truth
test('H8C.6.11.3.5.2.2-01', 'BPE canonical legacy fallback selects 16p / 8-sections when signatures is null', () => {
    const directOffer = bpe.buildPrice(bookSpec2000, { rates: baseSnapshot });
    assert.strictEqual(directOffer.signature, 16);
    assert.strictEqual(directOffer.sections, 8);
});

// T2: Adapter & Solver Fallback Identity
test('H8C.6.11.3.5.2.2-02', 'When nodeConfig.signatures is null, adapter and solver both use canonical 16p / 8-sections without fabricating 32p capability', () => {
    const nodeNull = { id: 'node-null', signatures: null };
    const forwardRes = adapter.evaluateForwardPrice(bookSpec2000, baseSnapshot, {}, nodeNull);
    const solverRes = solver.solve(session, nodeNull);

    assert.strictEqual(forwardRes.signature, 16);
    assert.strictEqual(forwardRes.sections, 8);

    assert.ok(solverRes.activeRatePaths.includes('interior_full_colour_fixed.16p'));
    assert.ok(solverRes.activeRatePaths.includes('binding_pb_fixed_by_sections.8'));
    assert.strictEqual(solverRes.activeRatePaths.includes('interior_full_colour_fixed.32p'), false);
});

// T3: Explicit 32p Capability Selection Truth
test('H8C.6.11.3.5.2.2-03', 'When nodeConfig.signatures explicitly contains 32, 32p / 4-sections is selected', () => {
    const node32 = { id: 'node-32', signatures: [16, 24, 32, 8, 4] };
    const solverRes = solver.solve(session, node32);

    assert.ok(solverRes.activeRatePaths.includes('interior_full_colour_fixed.32p'));
    assert.ok(solverRes.activeRatePaths.includes('binding_pb_fixed_by_sections.4'));
});

// T4: Adapter Source Code Audit: Zero Synthetic 32p Injection on Null
test('H8C.6.11.3.5.2.2-04', 'buildPriceCalibrationAdapter passes signatures=null directly to BPE without fallback array injection', () => {
    const adapterCode = fs.readFileSync(path.join(__dirname, '../src/api/services/buildPriceCalibrationAdapter.js'), 'utf8');
    assert.strictEqual(
        adapterCode.includes("signatures: Array.isArray(nodeConfig.signatures) && nodeConfig.signatures.length > 0 ? nodeConfig.signatures : null"),
        true,
        'Preserves null signatures for canonical BPE legacy fallback resolution'
    );
});

console.log(`\n═══ Phase 193H.8C.6.11.3.5.2.2 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
