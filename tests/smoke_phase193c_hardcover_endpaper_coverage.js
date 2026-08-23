/**
 * tests/smoke_phase193c_hardcover_endpaper_coverage.js
 *
 * Phase 6.13.2.5A.1 Test Suite:
 * Hardcover & Endpapers Calibration Coverage, Adapter Defaults, and Fail-Closed Zero-Anchor Governance.
 */
const assert = require('assert');
const path = require('path');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ${PASS} ${name}`);
        passed++;
    } catch (err) {
        console.log(`  ${FAIL} ${name}`);
        console.log(`    → ${err.message}`);
        failed++;
    }
}

console.log('\n═══ Phase 193C: Hardcover & Endpaper Calibration Coverage Suite ═══\n');

const adapter = require('../src/api/services/buildPriceCalibrationAdapter');
const solver = require('../src/api/services/deterministicInversePricingSolver');

// Test A: Adapter hardcover defaults
test('A: Hardcover without explicit endpaper fields resolves to standard, 4/0, offset, 115gsm', () => {
    const bookSpec = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        paper_type_interior: 'offset',
        paper_type_cover: 'mc',
        interior_print: '4/4',
        cover_print: '4/0',
        delivery_country: 'ES'
    };
    const adapted = adapter.adaptBookSpec(bookSpec);
    assert.strictEqual(adapted.bindingCode, 'hc');
    assert.strictEqual(adapted.endpapers, 'standard');
    assert.strictEqual(adapted.endpapersPrint, '4/0');
    assert.strictEqual(adapted.paperTypeEndpaper, 'offset');
    assert.strictEqual(adapted.paperWeightEndpapers, 115);
});

// Test B: Active path extraction — standard HC
test('B: Standard hardcover (4/0, offset) activates exactly the expected endpaper & HC paths', () => {
    const bookSpec = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        paper_type_interior: 'offset',
        paper_type_cover: 'mc',
        interior_print: '4/4',
        cover_print: '4/0',
        delivery_country: 'ES'
    };
    const paths = solver.extractActiveRatePaths(bookSpec, { signatureSize: 16, sectionsCount: 12 });
    assert.ok(paths.includes('binding_hc_fixed_by_sections.12'), 'Must include binding_hc_fixed_by_sections.12');
    assert.ok(paths.includes('binding_hc_var_per_1000_by_sections.12'), 'Must include binding_hc_var_per_1000_by_sections.12');
    assert.ok(paths.includes('endpaper_fixed_by_colours.4'), 'Must include endpaper_fixed_by_colours.4');
    assert.ok(paths.includes('endpaper_var_per_1000_by_colours.4'), 'Must include endpaper_var_per_1000_by_colours.4');
    assert.ok(paths.includes('paper_endpapers_fixed_by_colours.full'), 'Must include paper_endpapers_fixed_by_colours.full');
    assert.ok(paths.includes('paper_endpapers_var_per_1000_by_colours.full'), 'Must include paper_endpapers_var_per_1000_by_colours.full');
    assert.ok(paths.includes('paper_price_endpaper_by_kilo.offset'), 'Must include paper_price_endpaper_by_kilo.offset');
});

// Test C: No endpapers
test('C: Explicit endpapers = "none" does NOT activate endpaper paths', () => {
    const bookSpec = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        endpapers: 'none',
        delivery_country: 'ES'
    };
    const paths = solver.extractActiveRatePaths(bookSpec, { signatureSize: 16, sectionsCount: 12 });
    assert.ok(!paths.some(p => p.startsWith('endpaper_')), 'Must NOT include endpaper print paths');
    assert.ok(!paths.some(p => p.startsWith('paper_endpapers_')), 'Must NOT include paper endpapers waste paths');
    assert.ok(!paths.some(p => p.startsWith('paper_price_endpaper_')), 'Must NOT include paper_price_endpaper paths');
});

// Test D: Printed vs unprinted endpapers
test('D: Printed 1/0 vs unprinted 0/0 endpapers produce different active path sets', () => {
    const spec10 = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        endpapers: 'standard',
        endpapers_print: '1/0',
        delivery_country: 'ES'
    };
    const paths10 = solver.extractActiveRatePaths(spec10, { signatureSize: 16, sectionsCount: 12 });
    assert.ok(paths10.includes('endpaper_fixed_by_colours.1'));
    assert.ok(paths10.includes('paper_endpapers_fixed_by_colours.two'));

    const spec00 = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        endpapers: 'standard',
        endpapers_print: '0/0',
        delivery_country: 'ES'
    };
    const paths00 = solver.extractActiveRatePaths(spec00, { signatureSize: 16, sectionsCount: 12 });
    assert.ok(!paths00.some(p => p.startsWith('endpaper_fixed_by_colours')));
    assert.ok(paths00.includes('paper_endpapers_fixed_by_colours.one'));
});

// Test E: Reverse-side print handling
test('E: Reverse-side print (e.g. 4/1) includes both front and reverse endpaper color paths', () => {
    const spec41 = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        endpapers: 'standard',
        endpapers_print: '4/1',
        delivery_country: 'ES'
    };
    const paths41 = solver.extractActiveRatePaths(spec41, { signatureSize: 16, sectionsCount: 12 });
    assert.ok(paths41.includes('endpaper_fixed_by_colours.4'));
    assert.ok(paths41.includes('endpaper_var_per_1000_by_colours.4'));
    assert.ok(paths41.includes('endpaper_fixed_by_colours.1'));
    assert.ok(paths41.includes('endpaper_var_per_1000_by_colours.1'));
    assert.ok(paths41.includes('paper_endpapers_fixed_by_colours.full'));
});

// Test F: Endpaper zero-anchor fail closed
test('F: Active calibratable endpaper leaf with explicit zero and no prior FAILS CLOSED with UNQUALIFIED_ZERO_ANCHOR', () => {
    const bookSpec = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        interior_print: '4/4',
        cover_print: '4/0',
        paper_type_interior: 'offset',
        paper_type_cover: 'mc',
        delivery_country: 'ES'
    };
    const snapshotWithZeroEndpapers = {
        interior_full_colour_fixed: { '16p': 100 },
        interior_full_colour_var: { '16p': 10 },
        cover_fixed_by_colours: { '4': 50 },
        cover_var_per_1000_by_colours: { '4': 15 },
        binding_hc_fixed_by_sections: { '12': 1.25 },
        binding_hc_var_per_1000_by_sections: { '12': 0.5 },
        paper_price_interior_by_kilo: { offset: 2.0 },
        paper_price_cover_by_kilo: { mc: 3.0 },
        // Endpapers zero
        endpaper_fixed_by_colours: { '4': 0 },
        endpaper_var_per_1000_by_colours: { '4': 0 },
        paper_endpapers_fixed_by_colours: { full: 0 },
        paper_endpapers_var_per_1000_by_colours: { full: 0 },
        paper_price_endpaper_by_kilo: { offset: 0 }
    };

    const session = {
        bookSpec,
        currentRatesSnapshot: snapshotWithZeroEndpapers,
        targetManufacturingPrice: 1500.00
    };

    assert.throws(
        () => solver.solve(session, { signatures: [16] }),
        err => {
            assert.strictEqual(err.code, 'UNQUALIFIED_ZERO_ANCHOR');
            assert.ok(err.ratePath.startsWith('endpaper_') || err.ratePath.startsWith('paper_endpapers_') || err.ratePath.startsWith('paper_price_endpaper_'));
            return true;
        }
    );
});

// Test G: HC binding variable zero fail closed
test('G: HC binding variable zero is NOT promoted to 14.7 (PB prior) and FAILS CLOSED with UNQUALIFIED_ZERO_ANCHOR', () => {
    const bookSpec = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        interior_print: '4/4',
        cover_print: '4/0',
        paper_type_interior: 'offset',
        paper_type_cover: 'mc',
        endpapers: 'none', // isolate binding
        delivery_country: 'ES'
    };
    const snapshotWithZeroHcVar = {
        interior_full_colour_fixed: { '16p': 100 },
        interior_full_colour_var: { '16p': 10 },
        cover_fixed_by_colours: { '4': 50 },
        cover_var_per_1000_by_colours: { '4': 15 },
        binding_hc_fixed_by_sections: { '12': 1.25 },
        binding_hc_var_per_1000_by_sections: { '12': 0 }, // ZERO
        paper_price_interior_by_kilo: { offset: 2.0 },
        paper_price_cover_by_kilo: { mc: 3.0 }
    };

    const session = {
        bookSpec,
        currentRatesSnapshot: snapshotWithZeroHcVar,
        targetManufacturingPrice: 1500.00
    };

    assert.throws(
        () => solver.solve(session, { signatures: [16] }),
        err => {
            assert.strictEqual(err.code, 'UNQUALIFIED_ZERO_ANCHOR');
            assert.strictEqual(err.ratePath, 'binding_hc_var_per_1000_by_sections.12');
            return true;
        }
    );
});

// Test J: Locked zero preservation
test('J: Historically locked zero rate is preserved exactly (no prior injected, no failure, omitted from patch)', () => {
    const bookSpec = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        interior_print: '4/4',
        cover_print: '4/0',
        paper_type_interior: 'offset',
        paper_type_cover: 'mc',
        delivery_country: 'ES'
    };
    const snapshot = {
        interior_full_colour_fixed: { '16p': 100 },
        interior_full_colour_var: { '16p': 10 },
        cover_fixed_by_colours: { '4': 50 },
        cover_var_per_1000_by_colours: { '4': 15 },
        binding_hc_fixed_by_sections: { '12': 1.25 },
        binding_hc_var_per_1000_by_sections: { '12': 0.5 },
        paper_price_interior_by_kilo: { offset: 2.0 },
        paper_price_cover_by_kilo: { mc: 3.0 },
        // Endpapers locked with zero
        endpaper_fixed_by_colours: { '4': 0 },
        endpaper_var_per_1000_by_colours: { '4': 0 },
        paper_endpapers_fixed_by_colours: { full: 5.0 },
        paper_endpapers_var_per_1000_by_colours: { full: 10.0 },
        paper_price_endpaper_by_kilo: { offset: 1.5 }
    };

    const lockedRatePaths = [
        'endpaper_fixed_by_colours.4',
        'endpaper_var_per_1000_by_colours.4'
    ];

    const session = {
        bookSpec,
        currentRatesSnapshot: snapshot,
        targetManufacturingPrice: 1500.00
    };

    const solution = solver.solve(session, { signatures: [16] }, { lockedRatePaths });
    assert.ok(solution.status === 'SUCCEEDED' || solution.status === 'ACCEPTABLE_CANDIDATE');
    assert.ok(!solution.proposedPatch.endpaper_fixed_by_colours, 'Locked path must be omitted from proposedPatch');
    assert.ok(!solution.proposedPatch.endpaper_var_per_1000_by_colours, 'Locked path must be omitted from proposedPatch');
});

// Test L: Patch construction emits endpaper leaves when calibratable
test('L: buildPatchFromActiveRates constructs correct nested endpaper paths', () => {
    const bookSpec = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'hardcover',
        interior_print: '4/4',
        cover_print: '4/0',
        paper_type_interior: 'offset',
        paper_type_cover: 'mc',
        endpapers: 'standard',
        endpapers_print: '4/0',
        delivery_country: 'ES'
    };
    const activeRates = {
        interior_full_colour_fixed: 110,
        interior_full_colour_var: 12,
        cover_fixed_by_colours: 55,
        cover_var_per_1000_by_colours: 16,
        binding_hc_fixed_by_sections: 1.30,
        binding_hc_var_per_1000_by_sections: 0.60,
        paper_price_interior_by_kilo: 2.10,
        paper_price_cover_by_kilo: 3.10,
        'endpaper_fixed_by_colours.4': 25.0,
        'endpaper_var_per_1000_by_colours.4': 6.0,
        paper_endpapers_fixed_by_colours: 8.5,
        paper_endpapers_var_per_1000_by_colours: 14.0,
        paper_price_endpaper_by_kilo: 1.80
    };
    const patch = solver.buildPatchFromActiveRates(bookSpec, activeRates, { signatureSize: 16, sectionsCount: 12 });
    assert.strictEqual(patch.endpaper_fixed_by_colours['4'], 25.0);
    assert.strictEqual(patch.endpaper_var_per_1000_by_colours['4'], 6.0);
    assert.strictEqual(patch.paper_endpapers_fixed_by_colours.full, 8.5);
    assert.strictEqual(patch.paper_endpapers_var_per_1000_by_colours.full, 14.0);
    assert.strictEqual(patch.paper_price_endpaper_by_kilo.offset, 1.80);
});

console.log(`\n═══ Hardcover Endpaper Coverage Suite Results: ${passed} passed, ${failed} failed ═══\n`);

if (failed > 0) {
    process.exit(1);
}
