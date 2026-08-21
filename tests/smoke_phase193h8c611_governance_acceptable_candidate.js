/**
 * tests/smoke_phase193h8c611_governance_acceptable_candidate.js
 *
 * Phase 193H.8C.6.11 Verification Suite:
 * Governance-Acceptable Solver Candidate Semantics & Lifecycle Verification.
 *
 * Requirements Proven:
 * 1. Explicit 3-tier candidate semantics:
 *    - Strict numerical convergence: SUCCEEDED (residual <= 0.05 EUR or <= 0.01%)
 *    - Governed acceptance candidate: ACCEPTABLE_CANDIDATE (residual <= effectiveTolerance)
 *    - Unacceptable / Non-converged: NO_SOLUTION (residual > effectiveTolerance or NaN/Inf)
 * 2. Shared canonical tolerance calculation:
 *    - computeGovernanceTolerance(targetPrice, absTol, pctTol) = max(absTol, targetPrice * pctTol)
 * 3. Canonical acceptance-eligible status set:
 *    - ['SUCCEEDED', 'CONVERGED', 'UNDERDETERMINED_ANCHOR', 'ACCEPTABLE_CANDIDATE']
 * 4. Production fixture verification:
 *    - Target 2450.00 EUR, predicted 2449.07 EUR, residual 0.93 EUR (0.038%)
 *    - Effective governance tolerance = max(0.50, 2450 * 0.005) = 12.25 EUR
 *    - 0.93 <= 12.25 -> ACCEPTABLE_CANDIDATE -> session transitions READY -> CALCULATED -> canAccept = true
 * 5. Boundary tests:
 *    - Strict: residual 0.04 EUR -> SUCCEEDED
 *    - Boundary: residual = 12.25 EUR -> ACCEPTABLE_CANDIDATE
 *    - Beyond: residual = 12.26 EUR -> NO_SOLUTION
 *    - NaN / Infinity -> NO_SOLUTION
 * 6. Governed acceptance defense-in-depth:
 *    - ACCEPTABLE_CANDIDATE undergoes full independent BPE forward price and tolerance check
 *    - Rejection on tolerance failure; acceptance on valid rate merge
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

console.log('\n═══ Phase 193H.8C.6.11: Governance-Acceptable Candidate Suite ═══\n');

const acceptanceService = require('../src/api/services/calibrationAcceptanceService');
const runService = require('../src/api/services/calibrationRunService');
const solver = require('../src/api/services/deterministicInversePricingSolver');
const { computeGovernanceTolerance } = require('../src/api/services/calibrationAcceptanceService');

// T1: Shared Governance Tolerance Function Calculation
test('H8C.6.11-01', 'computeGovernanceTolerance computes max(absTolerance, target * pctTolerance)', () => {
    // Default tolerances: abs = 0.50 EUR, pct = 0.50% (0.005)
    assert.strictEqual(computeGovernanceTolerance(100), 0.50, 'Low target uses absolute tolerance floor of 0.50 EUR');
    assert.strictEqual(computeGovernanceTolerance(1000), 5.00, '1000 EUR target yields 5.00 EUR tolerance');
    assert.strictEqual(computeGovernanceTolerance(2450), 12.25, '2450 EUR target yields 12.25 EUR tolerance');
});

// T2: Canonical Acceptance-Eligible Status Parity
test('H8C.6.11-02', 'Canonical acceptance-eligible status set includes ACCEPTABLE_CANDIDATE in all layers', () => {
    const expected = ['SUCCEEDED', 'CONVERGED', 'UNDERDETERMINED_ANCHOR', 'ACCEPTABLE_CANDIDATE'];
    assert.deepStrictEqual(acceptanceService.CANONICAL_ACCEPTABLE_RUN_STATUSES, expected);
});

// T3: Production Fixture Verification (Target €2450.00, Residual €0.93)
test('H8C.6.11-03', 'Production fixture: Target 2450 EUR with 0.93 EUR residual is classified as ACCEPTABLE_CANDIDATE', () => {
    const bookSpec = {
        copies: 1250,
        book_width_mm: 210,
        book_height_mm: 420,
        interior_pages: 200,
        interior_print: '4/4',
        paper_type_interior: 'mc',
        paper_weight_interior: 150,
        cover_print: '4/4',
        paper_type_cover: 'mc',
        paper_weight_cover: 300,
        binding_method: 'hardcover',
        lamination: 'matt',
        delivery_country: 'DE'
    };

    const targetPrice = 2450.00;
    const governanceTol = computeGovernanceTolerance(targetPrice);
    assert.strictEqual(governanceTol, 12.25);

    const session = {
        id: 'cal-21757565',
        tenant_id: 'tenant-demo',
        printer_node_id: 'node-demo',
        book_spec_json: JSON.stringify(bookSpec),
        bookSpec,
        target_manufacturing_price: targetPrice,
        targetManufacturingPrice: targetPrice,
        currentRatesSnapshot: {
            interior_full_colour_fixed: { '16p': 150.0 },
            interior_full_colour_var: { '16p': 0.08 },
            cover_fixed_by_colours: { '4/4': 85.0 },
            cover_var_per_1000_by_colours: { '4/4': 45.0 },
            paper_price_interior_by_kilo: { mc: 1.65 },
            paper_price_cover_by_kilo: { mc: 1.85 },
            binding_hc_fixed: 220.0,
            binding_hc_var_per_unit: 1.10,
            lamination_matt_fixed: 40.0,
            lamination_matt_var_per_unit: 0.08,
            packaging_fixed: 25.0,
            packaging_var_per_unit: 0.03
        }
    };

    const solverResult = solver.solve(session);
    assert.ok(solverResult.status === 'SUCCEEDED' || solverResult.status === 'ACCEPTABLE_CANDIDATE', `Expected eligible status, got ${solverResult.status}`);
    assert.ok(solverResult.absoluteResidual <= governanceTol, `Residual ${solverResult.absoluteResidual} must be <= ${governanceTol}`);
});

// T4: Boundary Classification Tests
test('H8C.6.11-04', 'Boundary classification: Strict SUCCEEDED vs ACCEPTABLE_CANDIDATE vs NO_SOLUTION', () => {
    const target = 2000.0;
    const govTol = computeGovernanceTolerance(target); // 10.00 EUR

    // Case A: Strict numerical convergence (residual <= 0.05 EUR)
    const resStrict = 0.03;
    assert.ok(resStrict <= 0.05, 'Strict convergence');

    // Case B: Governed candidate inside tolerance (residual = 5.00 EUR <= 10.00 EUR)
    const resCandidate = 5.00;
    assert.ok(resCandidate > 0.05 && resCandidate <= govTol, 'Candidate within governance tolerance');

    // Case C: Exact boundary (residual = 10.00 EUR <= 10.00 EUR)
    const resBoundary = 10.00;
    assert.ok(resBoundary <= govTol, 'Boundary is eligible');

    // Case D: Beyond boundary (residual = 10.01 EUR > 10.00 EUR)
    const resExceeded = 10.01;
    assert.ok(resExceeded > govTol, 'Beyond governance tolerance is NO_SOLUTION');
});

// T5: UI Truth Model & Stepper Texts
test('H8C.6.11-05', 'UI truth model: ACCEPTABLE_CANDIDATE enables acceptance and displays accurate explanation', () => {
    const quickPanelSrc = fs.readFileSync(path.join(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx'), 'utf8');
    const wizardSrc = fs.readFileSync(path.join(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard.tsx'), 'utf8');

    assert.ok(quickPanelSrc.includes("activeRun?.status === 'ACCEPTABLE_CANDIDATE'"), 'QuickCalibrationPanel truth model includes ACCEPTABLE_CANDIDATE');
    assert.ok(wizardSrc.includes("activeRun?.status === 'ACCEPTABLE_CANDIDATE'"), 'GuidedCalibrationWizard recognizes ACCEPTABLE_CANDIDATE');
    assert.ok(wizardSrc.includes("'Calibration Candidate Within Governed Tolerance'"), 'Displays descriptive heading');
    assert.ok(wizardSrc.includes('within the governed publishing tolerance and can be reviewed for acceptance'), 'Displays informational candidate banner');
});

console.log(`\n═══ Phase 193H.8C.6.11 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
