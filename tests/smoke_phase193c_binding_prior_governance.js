/**
 * tests/smoke_phase193c_binding_prior_governance.js
 *
 * Phase 6.13.2.5A.1 Test Suite:
 * Binding-Prior Governance, Cross-Family Prior Isolation & Zero-Anchor Protection.
 */
const assert = require('assert');

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

console.log('\n═══ Phase 193C: Binding-Prior Governance Suite ═══\n');

const solver = require('../src/api/services/deterministicInversePricingSolver');

// Test H: Documented PB prior behavior still works
test('H: Documented PB prior behavior promotes missing/zero PB rates with governed priors', () => {
    const pbSpec = {
        copies: 500,
        interior_pages: 192,
        binding_method: 'perfect bound',
        interior_print: '1/1',
        cover_print: '4/0',
        paper_type_interior: 'offset',
        paper_type_cover: 'mc',
        delivery_country: 'ES'
    };
    const sparseSnapshot = {
        interior_one_colour_fixed: { '16p': 80.0 },
        interior_one_colour_var: { '16p': 8.0 },
        cover_fixed_by_colours: { '4': 40.0 },
        cover_var_per_1000_by_colours: { '4': 25.0 },
        paper_price_interior_by_kilo: { offset: 1.25 },
        paper_price_cover_by_kilo: { mc: 2.50 }
        // binding_pb is missing
    };

    const session = {
        bookSpec: pbSpec,
        currentRatesSnapshot: sparseSnapshot,
        targetManufacturingPrice: 1200.00
    };

    const solution = solver.solve(session, { signatures: [16] });
    assert.ok(solution.status === 'SUCCEEDED' || solution.status === 'ACCEPTABLE_CANDIDATE');
    assert.ok(solution.identifiabilityReport.priorsInjected.some(p => p.path.includes('binding_pb_fixed_by_sections')));
    assert.ok(solution.identifiabilityReport.priorsInjected.some(p => p.path.includes('binding_pb_var_per_1000_by_sections')));
});

// Test I: Cross-family prior isolation (hc, ss, ts, wo, sp must NOT inherit PB priors)
const nonPbFamilies = [
    { method: 'hardcover', code: 'hc' },
    { method: 'saddle stitch', code: 'ss' },
    { method: 'thread sewn', code: 'ts' },
    { method: 'wire-o', code: 'wo' },
    { method: 'spiral', code: 'sp' }
];

nonPbFamilies.forEach(({ method, code }) => {
    test(`I: ${method} (${code}) zero variable binding does NOT inherit PB prior and fails closed`, () => {
        const spec = {
            copies: 500,
            interior_pages: 192,
            binding_method: method,
            interior_print: '1/1',
            cover_print: '4/0',
            paper_type_interior: 'offset',
            paper_type_cover: 'mc',
            endpapers: 'none',
            delivery_country: 'ES'
        };
        const snapshot = {
            interior_one_colour_fixed: { '16p': 80.0 },
            interior_one_colour_var: { '16p': 8.0 },
            cover_fixed_by_colours: { '4': 40.0 },
            cover_var_per_1000_by_colours: { '4': 25.0 },
            paper_price_interior_by_kilo: { offset: 1.25 },
            paper_price_cover_by_kilo: { mc: 2.50 },
            [`binding_${code}_fixed_by_sections`]: { '12': 1.25 },
            [`binding_${code}_var_per_1000_by_sections`]: { '12': 0 } // Explicit zero without governed prior
        };

        const session = {
            bookSpec: spec,
            currentRatesSnapshot: snapshot,
            targetManufacturingPrice: 1200.00
        };

        assert.throws(
            () => solver.solve(session, { signatures: [16] }),
            err => {
                assert.strictEqual(err.code, 'UNQUALIFIED_ZERO_ANCHOR');
                assert.strictEqual(err.ratePath, `binding_${code}_var_per_1000_by_sections.12`);
                return true;
            }
        );
    });
});

console.log(`\n═══ Binding Prior Governance Suite Results: ${passed} passed, ${failed} failed ═══\n`);

if (failed > 0) {
    process.exit(1);
}
