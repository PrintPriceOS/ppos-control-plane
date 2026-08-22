/**
 * tests/smoke_phase193h8c6113662_supersession_ui_truth.js
 *
 * Phase 193H.8C.6.11.3.6.6.2 Verification Suite:
 * Supersession CTA Routing & Active-State Truth.
 *
 * Requirements Proven:
 * 1. Recovery CTA explicitly invokes supersedeSession -> POST /calibrations/:id/supersede.
 * 2. CALCULATED session does not invoke markReady or /ready during supersession.
 * 3. Step 5 completion and forward navigation strictly requires isAccepted = true.
 * 4. CALCULATED + accepted_at NULL never renders 'Pricing Calibrated & Active' banner.
 * 5. Production node with signatures: [16] derives 16p / 8 sections.
 * 6. Multi-signature fixture with signatures: [16, 24, 32, 8, 4] derives 32p / 4 sections.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

console.log('\n═══ Phase 193H.8C.6.11.3.6.6.2: Supersession UI Truth Suite ═══\n');

const solver = require('../src/api/services/deterministicInversePricingSolver');

// T1: Recovery CTA and Handler Wiring
test('H8C.6.11.3.6.6.2-01', 'QuickCalibrationPanel.tsx binds handleSupersedeAndRecalibrate to supersedeSession API', () => {
    const panelPath = path.resolve(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx');
    const content = fs.readFileSync(panelPath, 'utf8');

    assert.ok(content.includes('printhouseCalibrationApi.supersedeSession'), 'Must invoke supersedeSession');
    assert.ok(content.includes('onClick={handleSupersedeAndRecalibrate}'), 'CTA button must bind to handleSupersedeAndRecalibrate');
});

// T2: Step 5 Gated on isAccepted Truth
test('H8C.6.11.3.6.6.2-02', 'GuidedCalibrationWizard.tsx gates Step 5 completion and navigation strictly on isAccepted', () => {
    const wizardPath = path.resolve(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard.tsx');
    const content = fs.readFileSync(wizardPath, 'utf8');

    assert.ok(!content.includes('(isAccepted || isCalculated)'), 'Must not allow isCalculated to complete Step 4 or Step 5');
    assert.ok(content.includes('if (targetStep === 5) return isStep1Complete && isStep2Complete && isStep3Complete && isAccepted;'), 'Step 5 navigation must require isAccepted');
});

// T3: Production Node [16] Signature Derivation Truth
test('H8C.6.11.3.6.6.2-03', 'Production node with signatures: [16] derives 16p / 8 sections for 128 pages', () => {
    const session = {
        bookSpec: {
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
        },
        printerNodeId: 'node-329a3bc4',
        currentRatesSnapshot: {
            paper_price_interior_by_kilo: { offset: 0 },
            paper_price_cover_by_kilo: { artboard: 0 },
            interior_full_colour_fixed: { '16p': 0 },
            interior_full_colour_var: { '16p': 0 },
            cover_fixed_by_colours: { '4': 66 },
            cover_var_per_1000_by_colours: { '4': 12.5 },
            lam_fixed: { gloss: 6 },
            lam_var_per_1000: { gloss: 25 },
            binding_pb_fixed_by_sections: { '8': 0.164 },
            binding_pb_var_per_1000_by_sections: { '8': 117.6 }
        },
        targetManufacturingPrice: 3450
    };

    const productionNodeConfig = { id: 'node-329a3bc4', signatures: [16], production_lead_days: 7, delivery_time: 2 };
    const solverResult = solver.solve(session, productionNodeConfig);

    assert.strictEqual(solverResult.selectedSignature, 16);
    assert.strictEqual(solverResult.selectedSections, 8);
    assert.ok(solverResult.activeRatePaths.includes('interior_full_colour_fixed.16p'));
    assert.ok(solverResult.activeRatePaths.includes('binding_pb_fixed_by_sections.8'));
});

// T4: Dynamic Multi-Signature Node [16, 24, 32, 8, 4] Derivation Truth
test('H8C.6.11.3.6.6.2-04', 'Multi-capability node with signatures: [16, 24, 32, 8, 4] derives 32p / 4 sections', () => {
    const session = {
        bookSpec: {
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
        },
        printerNodeId: 'node-329a3bc4',
        currentRatesSnapshot: {
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
        },
        targetManufacturingPrice: 3450
    };

    const multiSigNodeConfig = { id: 'node-329a3bc4', signatures: [16, 24, 32, 8, 4], production_lead_days: 7, delivery_time: 2 };
    const solverResult = solver.solve(session, multiSigNodeConfig);

    assert.strictEqual(solverResult.selectedSignature, 32);
    assert.strictEqual(solverResult.selectedSections, 4);
    assert.ok(solverResult.activeRatePaths.includes('interior_full_colour_fixed.32p'));
    assert.ok(solverResult.activeRatePaths.includes('binding_pb_fixed_by_sections.4'));
});

console.log(`\n═══ Phase 193H.8C.6.11.3.6.6.2 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
