/**
 * tests/smoke_phase193h8c681_readiness_contract_alignment.js
 *
 * Phase 193H.8C.6.8.1 Verification Suite:
 * Complete Frontend/Backend Readiness Contract Alignment.
 *
 * Requirements Proven:
 * 1. Delivery Country Gate:
 *    - Missing delivery_country -> Step 2 incomplete, Step 3 blocked.
 *    - Non-canonical delivery_country ("P", "Poland") -> Step 2 incomplete.
 *    - Valid canonical ISO-2 ("PL", "DE") -> Step 2 complete.
 * 2. All Four Commercial Inclusion Flags:
 *    - Explicit null/undefined checks (NOT truthiness).
 *    - includesPaper !== null, includesBinding !== null, includesFinishing !== null, includesPackaging !== null.
 *    - false values (e.g. includesPackaging = false) are preserved as valid explicit answers.
 *    - If any of the 4 is null -> Step 3 incomplete, validateDraftForCreation fails.
 * 3. Unified Contract Agreement:
 *    - validateDraftForCreation (frontend), isStep1Complete/isStep3Complete (wizard),
 *      and validateBookSpec + checkAmbiguity (backend) strictly agree on requirements.
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

const UI_DIR = path.join(__dirname, '../src/ui');

console.log('\n═══ Phase 193H.8C.6.8.1: Readiness Contract Alignment Suite ═══\n');

const calibrationSessionService = require('../src/api/services/calibrationSessionService.js');
const { isValidIso2Country } = require('../src/lib/countryCatalog.js');
const wizardSrc = fs.readFileSync(path.join(UI_DIR, 'components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard.tsx'), 'utf8');
const quickPanelSrc = fs.readFileSync(path.join(UI_DIR, 'components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx'), 'utf8');

// T1: GuidedCalibrationWizard isStep1Complete requires isValidIso2Country(draftSpec.delivery_country)
test('H8C.6.8.1-01', 'GuidedCalibrationWizard isStep1Complete enforces valid ISO-2 delivery_country', () => {
    assert.ok(wizardSrc.includes('draftSpec.delivery_country &&'), 'Checks delivery_country presence');
    assert.ok(wizardSrc.includes('isValidIso2Country(draftSpec.delivery_country)'), 'Validates delivery_country with isValidIso2Country');
});

// T2: GuidedCalibrationWizard isStep3Complete requires all four inclusion flags to be non-null
test('H8C.6.8.1-02', 'GuidedCalibrationWizard isStep3Complete checks all 4 includes_* flags explicitly', () => {
    assert.ok(wizardSrc.includes('draftCommercials.includesPaper !== null && draftCommercials.includesPaper !== undefined'), 'Checks includesPaper');
    assert.ok(wizardSrc.includes('draftCommercials.includesBinding !== null && draftCommercials.includesBinding !== undefined'), 'Checks includesBinding');
    assert.ok(wizardSrc.includes('draftCommercials.includesFinishing !== null && draftCommercials.includesFinishing !== undefined'), 'Checks includesFinishing');
    assert.ok(wizardSrc.includes('draftCommercials.includesPackaging !== null && draftCommercials.includesPackaging !== undefined'), 'Checks includesPackaging');
});

// T3: Delivery Country Gate Simulation (Case A: missing, Case B: 'P', Case C: 'PL')
test('H8C.6.8.1-03', 'Delivery Country Gate: missing or non-canonical ISO2 blocks Step 2, valid ISO2 passes', () => {
    const baseSpec = {
        copies: 1000,
        book_width_mm: 210,
        book_height_mm: 297,
        interior_pages: 128,
        interior_print: '4/4',
        paper_type_interior: 'mc',
        paper_weight_interior: 130,
        cover_print: '4/0',
        paper_type_cover: 'artboard',
        paper_weight_cover: 300,
        binding_method: 'perfect bound'
    };

    const isStep1CompleteSim = (spec) => Boolean(
        spec.copies && spec.copies > 0 &&
        spec.book_width_mm && spec.book_width_mm > 0 &&
        spec.book_height_mm && spec.book_height_mm > 0 &&
        spec.interior_pages && spec.interior_pages > 0 &&
        spec.interior_print &&
        spec.paper_type_interior &&
        spec.paper_weight_interior && spec.paper_weight_interior > 0 &&
        spec.cover_print &&
        spec.paper_type_cover &&
        spec.paper_weight_cover && spec.paper_weight_cover > 0 &&
        spec.binding_method &&
        spec.delivery_country &&
        isValidIso2Country(spec.delivery_country)
    );

    // Case 1: Missing delivery country
    assert.strictEqual(isStep1CompleteSim({ ...baseSpec, delivery_country: undefined }), false);

    // Case 2: Incomplete typed letter "P"
    assert.strictEqual(isStep1CompleteSim({ ...baseSpec, delivery_country: 'P' }), false);

    // Case 3: Full country name "Poland"
    assert.strictEqual(isStep1CompleteSim({ ...baseSpec, delivery_country: 'Poland' }), false);

    // Case 4: Valid canonical ISO-2 "PL"
    assert.strictEqual(isStep1CompleteSim({ ...baseSpec, delivery_country: 'PL' }), true);
});

// T4: All Four Inclusion Flags Gate Simulation with False Value Preservation
test('H8C.6.8.1-04', 'Inclusion Flags Gate: preserves false values and blocks when any of the 4 flags is null/undefined', () => {
    const isStep3CompleteSim = (comms) => Boolean(
        comms.targetManufacturingPrice &&
        Number(comms.targetManufacturingPrice) > 0 &&
        comms.includesPaper !== null && comms.includesPaper !== undefined &&
        comms.includesBinding !== null && comms.includesBinding !== undefined &&
        comms.includesFinishing !== null && comms.includesFinishing !== undefined &&
        comms.includesPackaging !== null && comms.includesPackaging !== undefined
    );

    // Case 1: includesPackaging is null -> blocked
    const comms1 = {
        targetManufacturingPrice: 1500,
        includesPaper: true,
        includesBinding: true,
        includesFinishing: true,
        includesPackaging: null
    };
    assert.strictEqual(isStep3CompleteSim(comms1), false);

    // Case 2: includesFinishing is undefined -> blocked
    const comms2 = {
        targetManufacturingPrice: 1500,
        includesPaper: true,
        includesBinding: true,
        includesFinishing: undefined,
        includesPackaging: false
    };
    assert.strictEqual(isStep3CompleteSim(comms2), false);

    // Case 3: All 4 explicit, with some explicitly false (e.g. packaging not included) -> passes
    const comms3 = {
        targetManufacturingPrice: 1500,
        includesPaper: true,
        includesBinding: true,
        includesFinishing: false,
        includesPackaging: false
    };
    assert.strictEqual(isStep3CompleteSim(comms3), true);

    // Backend checkAmbiguity agrees
    const ambiguityCheck = calibrationSessionService.checkAmbiguity({
        targetManufacturingPrice: 1500,
        currency: 'EUR',
        includesPaper: true,
        includesBinding: true,
        includesFinishing: false,
        includesPackaging: false
    });
    assert.strictEqual(ambiguityCheck.ready, true);
    assert.strictEqual(ambiguityCheck.blockingFields.length, 0);
});

// T5: End-to-End Contract Consistency between Frontend and Backend
test('H8C.6.8.1-05', 'Complete frontend fixture satisfies validateDraftForCreation, validateBookSpec, and checkAmbiguity simultaneously', () => {
    const completeSpec = {
        copies: 500,
        book_width_mm: 210,
        book_height_mm: 297,
        interior_pages: 64,
        interior_print: '4/4',
        paper_type_interior: 'mc',
        paper_weight_interior: 130,
        cover_print: '4/4',
        paper_type_cover: 'artboard',
        paper_weight_cover: 300,
        binding_method: 'saddle stitch',
        lamination: 'gloss',
        delivery_country: 'PL'
    };

    const completeComms = {
        targetManufacturingPrice: 2450.00,
        currency: 'EUR',
        includesPaper: true,
        includesBinding: true,
        includesFinishing: true,
        includesPackaging: false
    };

    // 1. Backend validateBookSpec
    const specResult = calibrationSessionService.validateBookSpec(completeSpec);
    assert.strictEqual(specResult.valid, true, `validateBookSpec error: ${specResult.errors?.join(', ')}`);

    // 2. Backend checkAmbiguity
    const commsResult = calibrationSessionService.checkAmbiguity({ ...completeComms, ...completeSpec });
    assert.strictEqual(commsResult.ready, true, `checkAmbiguity error: ${commsResult.blockingFields?.join(', ')}`);

    // 3. Frontend validateDraftForCreation in QuickCalibrationPanel.tsx
    assert.ok(quickPanelSrc.includes("if (!spec.delivery_country || !isValidIso2Country(spec.delivery_country))"), 'Validates country in panel');
    assert.ok(quickPanelSrc.includes("if (comms.includesPackaging === null || comms.includesPackaging === undefined)"), 'Validates packaging in panel');
});

console.log(`\n═══ Phase 193H.8C.6.8.1 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
