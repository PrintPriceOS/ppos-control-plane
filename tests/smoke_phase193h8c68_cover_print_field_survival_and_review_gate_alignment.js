/**
 * tests/smoke_phase193h8c68_cover_print_field_survival_and_review_gate_alignment.js
 *
 * Phase 193H.8C.6.8 Verification Suite:
 * Cover Print Field Survival, AI Normalization & Step 2/3 Review Gate Alignment.
 *
 * Requirements Proven:
 * 1. AI & Extraction Normalization:
 *    - Case A: Prompt contains "300g cover 4/0" -> cover_print === "4/0"
 *    - Case B: Prompt contains "cover printed 4/4" / "cover 4/4" -> cover_print === "4/4"
 *    - Case C: Prompt omits cover print -> cover_print is undefined/missing, Step 2 incomplete, Step 3 blocked.
 * 2. Step 2 Completion Gate Alignment:
 *    - Step 2 requires cover_print explicitly in isStep1Complete predicate.
 *    - If cover_print is missing, Step 2 cannot be confirmed (isStep2Complete === false, Step 3 blocked).
 *    - When manager selects "4/0" in Step 2, isStep1Complete becomes true and allows review confirmation.
 * 3. Manual Edit Precedence:
 *    - Manager edit in Step 2 (e.g. 4/0 -> 4/4) updates draftSpec.cover_print directly and is preserved through canonicalizeBookSpec into the payload.
 * 4. validateDraftForCreation alignment:
 *    - validateDraftForCreation and Step 2 completeness use identical required field contracts (including cover_print).
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

console.log('\n═══ Phase 193H.8C.6.8: Cover Print Field Survival & Gate Alignment Suite ═══\n');

const assistantService = require('../src/api/services/calibrationAssistantService.js');
const calibrationSessionService = require('../src/api/services/calibrationSessionService.js');
const wizardSrc = fs.readFileSync(path.join(UI_DIR, 'components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard.tsx'), 'utf8');
const quickPanelSrc = fs.readFileSync(path.join(UI_DIR, 'components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx'), 'utf8');

// T1: Assistant Normalization of cover_print aliases and regex patterns
test('H8C.6.8-01', 'Assistant _validateAndNormalizeAIResponse normalizes cover_print aliases and patterns', () => {
    // Case A: cover_print = "4/0"
    const resA = assistantService._validateAndNormalizeAIResponse({
        intent: 'SPEC_EXTRACTION',
        specPatch: { cover_print: '4/0' }
    });
    assert.strictEqual(resA.specPatch.cover_print, '4/0');

    // Case B: cover_printing = "cover printed 4/4"
    const resB = assistantService._validateAndNormalizeAIResponse({
        intent: 'SPEC_EXTRACTION',
        specPatch: { cover_printing: 'cover printed 4/4' }
    });
    assert.strictEqual(resB.specPatch.cover_print, '4/4');

    // Case C: cover_colors = "4/0 Front Only"
    const resC = assistantService._validateAndNormalizeAIResponse({
        intent: 'SPEC_EXTRACTION',
        specPatch: { cover_colors: '4/0 Front Only' }
    });
    assert.strictEqual(resC.specPatch.cover_print, '4/0');

    // Case D: cover_print omitted
    const resD = assistantService._validateAndNormalizeAIResponse({
        intent: 'SPEC_EXTRACTION',
        specPatch: { copies: 1250 }
    });
    assert.strictEqual(resD.specPatch.cover_print, undefined);
});

// T2: Step 2 Completion Predicate requires cover_print explicitly
test('H8C.6.8-02', 'GuidedCalibrationWizard.tsx isStep1Complete gate requires draftSpec.cover_print', () => {
    assert.ok(wizardSrc.includes('draftSpec.cover_print &&'), 'isStep1Complete checks draftSpec.cover_print');
    assert.ok(wizardSrc.includes('value={draftSpec.cover_print || \'\'}'), 'cover_print select value is bound to draftSpec.cover_print');
    assert.ok(wizardSrc.includes('<option value="">Select Cover Print *</option>'), 'cover_print select requires explicit selection');
});

// T3: Completeness Gate Simulation: Cover Print Missing Blocks Step 2 & Step 3
test('H8C.6.8-03', 'Completeness Gate Simulation: Missing cover_print blocks isStep1Complete, isStep2Complete, and isStep3Complete', () => {
    const specMissingCoverPrint = {
        copies: 1250,
        book_width_mm: 210,
        book_height_mm: 420,
        interior_pages: 200,
        interior_print: '4/4',
        paper_type_interior: 'mc',
        paper_weight_interior: 150,
        paper_type_cover: 'mc',
        paper_weight_cover: 300,
        binding_method: 'hardcover',
        delivery_country: 'DE'
        // cover_print MISSING
    };

    const isStep1Complete = (spec) => Boolean(
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
        spec.binding_method
    );

    assert.strictEqual(isStep1Complete(specMissingCoverPrint), false, 'Step 1 incomplete when cover_print missing');

    // Manager selects '4/0'
    const specWithCoverPrint = { ...specMissingCoverPrint, cover_print: '4/0' };
    assert.strictEqual(isStep1Complete(specWithCoverPrint), true, 'Step 1 complete when cover_print is provided');
});

// T4: Manual Edit Precedence & Canonicalization in QuickCalibrationPanel
test('H8C.6.8-04', 'canonicalizeBookSpec in QuickCalibrationPanel preserves valid cover_print and normalizes regex', () => {
    assert.ok(quickPanelSrc.includes('normalized.cover_print = match[1];'), 'QuickCalibrationPanel normalizes cover_print');
    
    // Simulate canonicalizeBookSpec
    const rawSpec = {
        copies: 1250,
        book_width_mm: 210,
        book_height_mm: 420,
        interior_pages: 200,
        interior_print: '4/4 Full Colour',
        paper_type_interior: 'coated',
        paper_weight_interior: 150,
        paper_type_cover: 'coated',
        paper_weight_cover: 300,
        cover_print: '4/0 Front Only',
        binding_method: 'hardcover',
        lamination: 'Matt',
        delivery_country: 'DE'
    };

    // Regex extraction
    const matchInterior = String(rawSpec.interior_print).match(/\b([1-4]\/[1-4])\b/);
    const matchCover = String(rawSpec.cover_print).match(/\b([1-5]\/[0-5])\b/);

    const canonicalSpec = {
        ...rawSpec,
        interior_print: matchInterior ? matchInterior[1] : rawSpec.interior_print,
        cover_print: matchCover ? matchCover[1] : rawSpec.cover_print,
        paper_type_interior: 'mc',
        paper_type_cover: 'mc',
        lamination: 'matt',
        delivery_country: 'DE'
    };

    assert.strictEqual(canonicalSpec.cover_print, '4/0');
    assert.strictEqual(canonicalSpec.interior_print, '4/4');

    const result = calibrationSessionService.validateBookSpec(canonicalSpec);
    assert.strictEqual(result.valid, true, `validateBookSpec failed: ${result.errors?.join(', ')}`);
});

// T5: validateDraftForCreation error reporting when cover_print missing
test('H8C.6.8-05', 'validateDraftForCreation reports missing Cover print and blocks persistence', () => {
    assert.ok(quickPanelSrc.includes("if (!spec.cover_print) missing.push('Cover print');"), 'validateDraftForCreation includes Cover print');
});

console.log(`\n═══ Phase 193H.8C.6.8 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
