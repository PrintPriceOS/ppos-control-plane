/**
 * tests/smoke_phase193c_inverse_solver.js
 *
 * Phase 193C — Deterministic Inverse Pricing Solver & Calibration Runs Test Suite.
 *
 * Validates:
 * 1. Migration 147 DDL schema integrity and constraints.
 * 2. Pure in-memory forward adapter isolation (snapshot not mutated).
 * 3. Exact synthetic round-trip solver resolution.
 * 4. Deterministic repeatability (same inputs -> identical residuals and candidates).
 * 5. Bounded coordinate search and monotonic convergence.
 * 6. Prior-anchored solution provenance (explicit underdetermined notice).
 * 7. Impossible targets / boundary handling -> NO_SOLUTION status.
 * 8. Route wiring and safety guarantees (no /accept, strict auth, no DB mutation).
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

// ── Test Fixtures ───────────────────────────────────────────────────────────

const VALID_BOOK_SPEC = {
    copies: 500,
    interior_pages: 256,
    cover_pages: 4,
    book_width_mm: 170,
    book_height_mm: 240,
    orientation: 'portrait',
    interior_print: '4/4',
    cover_print: '4/0',
    paper_type_interior: 'offset',
    paper_weight_interior: 80,
    paper_type_cover: 'mc',
    paper_weight_cover: 300,
    binding_method: 'perfect bound',
    lamination: 'matt',
    uv_varnish: false,
    endpapers: false,
    delivery_country: 'ES'
};

const BASELINE_SNAPSHOT = {
    interior_full_colour_fixed: { '16p': 120.0 },
    interior_full_colour_var: { '16p': 18.0 },
    cover_fixed_by_colours: { '4': 66.0 },
    cover_var_per_1000_by_colours: { '4': 1250.0 },
    binding_pb_fixed_by_sections: { '16': 0.164 },
    binding_pb_var_per_1000_by_sections: { '16': 14.7 },
    lam_fixed: { matt: 6.0 },
    lam_var_per_1000: { matt: 25.0 },
    paper_price_interior_by_kilo: { offset: 1.252 },
    paper_price_cover_by_kilo: { mc: 2.515 },
    transport_costs: { es: 0.95 }
};

// ── 1. Migration 147 Schema Tests ───────────────────────────────────────────

console.log('\n═══ Phase 193C: Migration 147 Schema Validation ═══\n');

const migrationPath = path.join(__dirname, '../migrations/147_phase193c_calibration_runs.sql');

test('C0a', 'Migration file exists at prefix 147', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration 147 file not found');
});

test('C0b', 'Migration creates printhouse_pricing_calibration_runs table', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS printhouse_pricing_calibration_runs'));
});

test('C0c', 'Migration contains foreign key to calibration sessions', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('FOREIGN KEY (calibration_session_id) REFERENCES printhouse_pricing_calibration_sessions(id)'));
});

test('C0d', 'Migration does NOT contain activation or marketplace publish columns', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(!sql.includes('marketplace_active'));
    assert.ok(!sql.includes('publish_to_marketplace'));
});

// ── 2. Forward Adapter Isolation & Transformation Tests ─────────────────────

console.log('\n═══ Phase 193C: Forward Pricing Adapter Validation ═══\n');

const adapterPath = path.join(__dirname, '../src/api/services/buildPriceCalibrationAdapter.js');
const adapter = require(adapterPath);

test('C1', 'Physical taxonomy is correctly adapted to internal forward calculation params', () => {
    const adapted = adapter.adaptBookSpec(VALID_BOOK_SPEC);
    assert.strictEqual(adapted.interiorColorKey, 'full');
    assert.strictEqual(adapted.coverColorKey, '4');
    assert.strictEqual(adapted.bindingCode, 'pb');
    assert.strictEqual(adapted.sectionsCount, 16);
    assert.strictEqual(adapted.deliveryCountry, 'es');
});

test('C1b', 'Canonical BPE reuse: Adapter strictly requires @ppos/pricing-engine without duplicate formulas or sibling fallbacks', () => {
    const adapterSource = fs.readFileSync(adapterPath, 'utf8');
    assert.ok(
        adapterSource.includes("require('@ppos/pricing-engine')"),
        'Adapter must require canonical @ppos/pricing-engine'
    );
    assert.ok(
        !adapterSource.includes('function sheetsInterior') &&
        !adapterSource.includes('function sheetsCover') &&
        !adapterSource.includes('function bindingCost'),
        'Adapter must NOT duplicate BPE calculation functions'
    );
    assert.ok(
        !adapterSource.includes('ppos-pricing-engine-main') &&
        !adapterSource.includes('.git') &&
        !adapterSource.includes('refs/heads'),
        'Adapter must NOT contain sibling path or runtime .git fallbacks'
    );
});

test('C1c', 'Parity: Adapter forward price matches direct canonical buildPrice calculation', () => {
    const directBpe = require('@ppos/pricing-engine');
    const bpeParams = {
        copies: VALID_BOOK_SPEC.copies,
        interior_pages: VALID_BOOK_SPEC.interior_pages,
        cover_pages: VALID_BOOK_SPEC.cover_pages,
        book_width_mm: VALID_BOOK_SPEC.book_width_mm,
        book_height_mm: VALID_BOOK_SPEC.book_height_mm,
        paper_weight_interior: VALID_BOOK_SPEC.paper_weight_interior,
        paper_weight_cover: VALID_BOOK_SPEC.paper_weight_cover,
        paper_type_interior: VALID_BOOK_SPEC.paper_type_interior,
        paper_type_cover: VALID_BOOK_SPEC.paper_type_cover,
        interior_print: VALID_BOOK_SPEC.interior_print,
        cover_print: VALID_BOOK_SPEC.cover_print,
        binding_method: VALID_BOOK_SPEC.binding_method,
        finishing_options: 'matt lamination',
        uv_varnish: false,
        delivery_country: VALID_BOOK_SPEC.delivery_country
    };
    const syntheticHouse = {
        id: 'parity-test-node',
        signatures: [16],
        rates: BASELINE_SNAPSHOT
    };

    const directOffer = directBpe.buildPrice(bpeParams, syntheticHouse);
    const adapterResult = adapter.evaluateForwardPrice(VALID_BOOK_SPEC, BASELINE_SNAPSHOT, {}, syntheticHouse);

    assert.strictEqual(adapterResult.totalPredictedPrice, directOffer.total_cost);
    assert.strictEqual(adapterResult.signature, directOffer.signature);
    assert.strictEqual(adapterResult.sections, directOffer.sections);
});

test('C1d', 'Provenance: Adapter binds to immutable git-pinned BPE metadata', () => {
    assert.strictEqual(adapter.enginePackage, '@ppos/pricing-engine');
    assert.strictEqual(adapter.engineVersion, '1.0.0');
    assert.strictEqual(adapter.engineCommit, '8d324290d64b5bf17325ff1098db7ebb5f646b5d');
    assert.strictEqual(adapter.engineSource, 'git-pinned');
});

test('C2', 'Evaluating forward price does NOT mutate input rates snapshot', () => {
    const snapshotCopy = JSON.parse(JSON.stringify(BASELINE_SNAPSHOT));
    const candidatePatch = { interior_full_colour_fixed: { '16p': 999.0 } };
    
    adapter.evaluateForwardPrice(VALID_BOOK_SPEC, BASELINE_SNAPSHOT, candidatePatch);
    
    assert.deepStrictEqual(BASELINE_SNAPSHOT, snapshotCopy, 'Snapshot must remain bit-for-bit identical');
});

test('C3', 'Forward pricing produces deterministic price and lines decomposition', () => {
    const res1 = adapter.evaluateForwardPrice(VALID_BOOK_SPEC, BASELINE_SNAPSHOT, {});
    const res2 = adapter.evaluateForwardPrice(VALID_BOOK_SPEC, BASELINE_SNAPSHOT, {});
    
    assert.strictEqual(res1.predictedManufacturingPrice, res2.predictedManufacturingPrice);
    assert.strictEqual(res1.predictedTransportPrice, res2.predictedTransportPrice);
    assert.ok(res1.predictedManufacturingPrice > 0);
    assert.ok(res1.lines.length >= 5);
});

// ── 3. Deterministic Inverse Solver Engine Tests ─────────────────────────────

console.log('\n═══ Phase 193C: Deterministic Inverse Solver Validation ═══\n');

const solverPath = path.join(__dirname, '../src/api/services/deterministicInversePricingSolver.js');
const solver = require(solverPath);

test('C4', 'Extracts correct active rate paths for given book spec (manufacturing only, transport excluded)', () => {
    const paths = solver.extractActiveRatePaths(VALID_BOOK_SPEC);
    assert.ok(paths.includes('interior_full_colour_fixed.16p'));
    assert.ok(paths.includes('binding_pb_fixed_by_sections.16'));
    assert.ok(paths.includes('lam_fixed.matt'));
    assert.ok(!paths.some(p => p.startsWith('transport_costs')), 'Transport must NOT be in active manufacturing paths');
});

test('C5', 'Synthetic round-trip: Known scaled target recovers exact target with residual < 0.05 EUR', () => {
    // 1. Compute target price at 1.5x scale
    const scaledActive = {};
    for (const [k, v] of Object.entries(BASELINE_SNAPSHOT)) {
        scaledActive[k] = typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    }
    scaledActive.interior_full_colour_fixed['16p'] = 180.0;
    scaledActive.interior_full_colour_var['16p'] = 27.0;

    const baselineForward = adapter.evaluateForwardPrice(VALID_BOOK_SPEC, BASELINE_SNAPSHOT, {});
    const targetMfgPrice = Number((baselineForward.predictedManufacturingPrice * 1.35).toFixed(2));

    const session = {
        bookSpec: VALID_BOOK_SPEC,
        currentRatesSnapshot: BASELINE_SNAPSHOT,
        targetManufacturingPrice: targetMfgPrice,
        transportPricePerKg: 1.15
    };

    const solution = solver.solve(session);

    assert.strictEqual(solution.status, 'SUCCEEDED');
    assert.ok(solution.absoluteResidual <= 0.05, `Absolute residual ${solution.absoluteResidual} must be <= 0.05`);
    assert.ok(solution.evaluationsCount <= 50, `Evaluation count ${solution.evaluationsCount} must be bounded`);
    assert.strictEqual(solution.identifiabilityReport.classification, 'PRIOR_ANCHORED_CANDIDATE');
    assert.strictEqual(solution.identifiabilityReport.transportCalibration, 'EXTERNAL_REFERENCE_ONLY');
});

test('C6', 'Determinism guarantee: Two consecutive solves return identical candidate and residuals', () => {
    const session = {
        bookSpec: VALID_BOOK_SPEC,
        currentRatesSnapshot: BASELINE_SNAPSHOT,
        targetManufacturingPrice: 3500.0,
        transportPricePerKg: 0.95
    };

    const solveA = solver.solve(session);
    const solveB = solver.solve(session);

    assert.strictEqual(solveA.enginePriceAfter, solveB.enginePriceAfter);
    assert.strictEqual(solveA.absoluteResidual, solveB.absoluteResidual);
    assert.strictEqual(solveA.evaluationsCount, solveB.evaluationsCount);
    assert.deepStrictEqual(solveA.proposedPatch, solveB.proposedPatch);
});

test('C7', 'Single-job identifiability report explicitly states underdetermined anchor notice', () => {
    const session = {
        bookSpec: VALID_BOOK_SPEC,
        currentRatesSnapshot: BASELINE_SNAPSHOT,
        targetManufacturingPrice: 3200.0
    };

    const solution = solver.solve(session);
    assert.ok(solution.identifiabilityReport.notice.includes('prior-anchored'));
    assert.strictEqual(solution.identifiabilityReport.degreesOfFreedom, 'UNDERDETERMINED_SINGLE_JOB');
});

test('C8', 'Impossible negative/excessive target returns NO_SOLUTION or bounded failure safely', () => {
    const session = {
        bookSpec: VALID_BOOK_SPEC,
        currentRatesSnapshot: BASELINE_SNAPSHOT,
        targetManufacturingPrice: 99999999.0 // Impossible bound
    };

    const solution = solver.solve(session);
    assert.strictEqual(solution.status, 'NO_SOLUTION');
    assert.ok(solution.warnings.length > 0);
});

test('C8b', 'Transport decoupling: transportPricePerKg never appears in proposedPatch and does NOT alter manufacturing alpha', () => {
    const sessionA = {
        bookSpec: VALID_BOOK_SPEC,
        currentRatesSnapshot: BASELINE_SNAPSHOT,
        targetManufacturingPrice: 3000.0,
        transportPricePerKg: 0.95
    };
    const sessionB = {
        bookSpec: VALID_BOOK_SPEC,
        currentRatesSnapshot: BASELINE_SNAPSHOT,
        targetManufacturingPrice: 3000.0,
        transportPricePerKg: 999.99 // Extreme transport change
    };

    const solveA = solver.solve(sessionA);
    const solveB = solver.solve(sessionB);

    assert.deepStrictEqual(solveA.proposedPatch, solveB.proposedPatch, 'Manufacturing patch must be 100% identical regardless of transport rate');
    assert.strictEqual(solveA.enginePriceAfter, solveB.enginePriceAfter);
    assert.strictEqual(solveA.proposedPatch.transport_costs, undefined, 'transport_costs must NEVER appear in proposedPatch');
});

test('C8c', 'Missing active manufacturing rate with safe prior records prior provenance', () => {
    const sparseSnapshot = {
        cover_fixed_by_colours: { '4': 66.0 },
        paper_price_interior_by_kilo: { offset: 1.252 },
        paper_price_cover_by_kilo: { mc: 2.515 }
    }; // Missing interior fixed/var rates

    const session = {
        bookSpec: VALID_BOOK_SPEC,
        currentRatesSnapshot: sparseSnapshot,
        targetManufacturingPrice: 2800.0
    };

    const solution = solver.solve(session);
    assert.ok(solution.identifiabilityReport.priorsInjected.length > 0);
    assert.ok(solution.identifiabilityReport.priorsInjected.some(p => p.path.includes('interior_full_colour_fixed')));
});

test('C8d', 'Unsupported transport country does NOT fall back to arbitrary non-zero transport in canonical engine', () => {
    const bookSpecUnknownCountry = {
        ...VALID_BOOK_SPEC,
        delivery_country: 'ZZ' // Non-existent ISO code
    };
    const forwardResult = adapter.evaluateForwardPrice(bookSpecUnknownCountry, BASELINE_SNAPSHOT, {});
    assert.strictEqual(forwardResult.predictedTransportPrice, 0.0, 'Unknown transport country must produce 0 transport without breaking manufacturing price');
    assert.ok(forwardResult.predictedManufacturingPrice > 0, 'Manufacturing price must remain calculated');
});
test('C8e', 'Incremental calibration locks previously established active paths and calibrates only novel paths', () => {
    const incrementalBookSpec = {
        copies: 500,
        interior_pages: 320,
        cover_pages: 4,
        book_width_mm: 148,
        book_height_mm: 210,
        orientation: 'portrait',
        interior_print: '2/2',
        cover_print: '4/0',
        paper_type_interior: 'lux',
        paper_weight_interior: 80,
        paper_type_cover: 'offset',
        paper_weight_cover: 120,
        binding_method: 'thread sewn',
        uv_varnish: true,
        delivery_country: 'ES'
    };

    const incrementalSnapshot = {
        ...JSON.parse(JSON.stringify(BASELINE_SNAPSHOT)),
        interior_two_colour_fixed: { '16p': 0 },
        interior_two_colour_var: { '16p': 0 },
        binding_ts_fixed_by_sections: { '20': 59.85 },
        binding_ts_var_per_1000_by_sections: { '20': 210.12 },
        paper_price_interior_by_kilo: {
            ...BASELINE_SNAPSHOT.paper_price_interior_by_kilo,
            lux: 0
        },
        paper_price_cover_by_kilo: {
            ...BASELINE_SNAPSHOT.paper_price_cover_by_kilo,
            offset: 0
        },
        uv_varnish: { fixed: 0, var: 0 }
    };

    const session = {
        bookSpec: incrementalBookSpec,
        currentRatesSnapshot: incrementalSnapshot,
        targetManufacturingPrice: 1802.84
    };

    const lockedRatePaths = [
        'cover_fixed_by_colours.4',
        'cover_var_per_1000_by_colours.4'
    ];

    const solution = solver.solve(
        session,
        { signatures: [16] },
        { lockedRatePaths }
    );

    assert.deepStrictEqual(
        solution.lockedRatePaths,
        lockedRatePaths.sort(),
        'Expected the two historically established cover paths to remain locked'
    );

    assert.strictEqual(
        solution.calibratableRatePaths.length,
        8,
        'Expected exactly 8 novel C-prime rate paths'
    );

    assert.ok(
        !solution.proposedPatch.cover_fixed_by_colours,
        'Locked cover_fixed_by_colours.4 must not appear in proposedPatch'
    );

    assert.ok(
        !solution.proposedPatch.cover_var_per_1000_by_colours,
        'Locked cover_var_per_1000_by_colours.4 must not appear in proposedPatch'
    );

    assert.ok(
        solution.absoluteResidual <= 1802.84 * 0.005,
        `Residual ${solution.absoluteResidual} must remain within governance tolerance`
    );
});
// ── 4. Route Wiring & API Contract Tests ─────────────────────────────────────

console.log('\n═══ Phase 193C: Route Wiring Validation ═══\n');

const routesPath = path.join(__dirname, '../src/api/routes/printhouseOnboardingRoutes.js');
const routesSource = fs.readFileSync(routesPath, 'utf8');

test('C9a', 'Routes file requires calibrationRunService', () => {
    assert.ok(routesSource.includes("require('../services/calibrationRunService')"));
});

test('C9b', 'POST /pricing/calibrations/:id/calculate endpoint exists', () => {
    assert.ok(routesSource.includes("router.post('/pricing/calibrations/:id/calculate'"));
});

test('C9c', 'GET /pricing/calibrations/:id/runs endpoint exists', () => {
    assert.ok(routesSource.includes("router.get('/pricing/calibrations/:id/runs'"));
});

test('C9d', 'GET /pricing/calibrations/:id/runs/:runId endpoint exists', () => {
    assert.ok(routesSource.includes("router.get('/pricing/calibrations/:id/runs/:runId'"));
});

test('C9e', 'No unmanaged /activate endpoint exists (Phase 193D governance boundary)', () => {
    assert.ok(!routesSource.includes('/pricing/calibrations/:id/activate'), 'Must NOT have unmanaged /activate route');
    assert.ok(!routesSource.includes('/pricing/calibrations/activate'));
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n═══ Phase 193C Results: ${passed} passed, ${failed} failed ═══\n`);

if (failed > 0) {
    process.exit(1);
}
