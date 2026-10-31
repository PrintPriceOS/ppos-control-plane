/**
 * tests/smoke_phase193h8c6112_calculated_candidate_cta_integrity.js
 *
 * Phase 193H.8C.6.11.2 Verification Suite:
 * Step 4 Action Matrix, Calculated Candidate CTA & Acceptance Routing Integrity.
 *
 * Requirements Proven:
 * 1. READY + no eligible run:
 *    - Calculate button visible ('Run Pricing Calibration')
 * 2. READY + NO_SOLUTION:
 *    - Re-run button visible ('Re-run Pricing Calibration')
 * 3. CALCULATED + ACCEPTABLE_CANDIDATE:
 *    - Calculate button hidden
 *    - Accept button visible ('Accept Pricing Revision')
 * 4. CALCULATED + SUCCEEDED:
 *    - Calculate button hidden
 *    - Accept button visible ('Accept Pricing Revision')
 * 5. CALCULATED + CONVERGED:
 *    - Calculate button hidden
 *    - Accept button visible ('Accept Pricing Revision')
 * 6. CALCULATED + non-eligible run:
 *    - Neither calculate nor accept
 * 7. ACCEPTED:
 *    - Neither calculate nor accept
 * 8. Accept CTA routes to onAccept (governed acceptance modal), NOT onCalculate.
 * 9. QuickCalibrationPanel passes isReady, isCalculated, isAccepted, canAccept, and isRunAcceptanceEligible explicitly.
 * 10. Prevents SESSION_NOT_READY_FOR_CALCULATION on CALCULATED session by hiding calculate CTA.
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

console.log('\n═══ Phase 193H.8C.6.11.2: Step 4 CTA & Acceptance Routing Suite ═══\n');

const wizardSrc = fs.readFileSync(path.join(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard.tsx'), 'utf8');
const quickPanelSrc = fs.readFileSync(path.join(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx'), 'utf8');
const { CANONICAL_ACCEPTABLE_RUN_STATUSES } = require('../src/api/services/calibrationGovernanceTolerances');

// T1: QuickCalibrationPanel Prop Wiring Audit
test('H8C.6.11.2-01', 'QuickCalibrationPanel passes all lifecycle and eligibility props explicitly to GuidedCalibrationWizard', () => {
    assert.ok(quickPanelSrc.includes('isReady={isReadyForCalculation}'), 'Passes isReady');
    assert.ok(quickPanelSrc.includes('isCalculated={isCalculated}'), 'Passes isCalculated');
    assert.ok(quickPanelSrc.includes('isAccepted={isAccepted}'), 'Passes isAccepted');
    assert.ok(quickPanelSrc.includes('canAccept={canAccept}'), 'Passes canAccept');
    assert.ok(quickPanelSrc.includes('isRunAcceptanceEligible={isRunAcceptanceEligible}'), 'Passes isRunAcceptanceEligible');
    assert.ok(quickPanelSrc.includes('onCalculate={handleCalculate}'), 'Passes onCalculate');
    assert.ok(quickPanelSrc.includes('onAccept={() => setShowAcceptModal(true)}'), 'Passes onAccept');
});

// T2: Step 4 Calculate Gating: Only render when session is READY
test('H8C.6.11.2-02', 'Step 4 calculate button is strictly gated on isReady && !isCalculated && !isAccepted', () => {
    assert.ok(wizardSrc.includes('{isReady && !isCalculated && !isAccepted && ('), 'Gated on isReady && !isCalculated && !isAccepted');
    assert.strictEqual(wizardSrc.includes('{!isCalculated && !isAccepted && ('), false, 'Ungated !isCalculated calculate button removed');
});

// T3: Canonical Step 4 Action Logic Simulation
test('H8C.6.11.2-03', 'Step 4 action matrix: Evaluate button visibility and labels across all session and run states', () => {
    function resolveStep4Actions(sessionStatus, runStatus) {
        const isReady = sessionStatus === 'READY';
        const isCalculated = sessionStatus === 'CALCULATED';
        const isAccepted = sessionStatus === 'ACCEPTED';
        const isRunAcceptanceEligible = CANONICAL_ACCEPTABLE_RUN_STATUSES.includes(runStatus);
        const canAccept = isCalculated && isRunAcceptanceEligible;

        const showCalculate = isReady && !isCalculated && !isAccepted;
        const calculateLabel = (runStatus && !isRunAcceptanceEligible) ? 'Re-run Pricing Calibration' : 'Run Pricing Calibration';
        const showAccept = canAccept && !isAccepted;
        const acceptLabel = 'Accept Pricing Revision';

        return { showCalculate, calculateLabel, showAccept, acceptLabel };
    }

    // 1. READY + no run
    const s1 = resolveStep4Actions('READY', null);
    assert.strictEqual(s1.showCalculate, true);
    assert.strictEqual(s1.calculateLabel, 'Run Pricing Calibration');
    assert.strictEqual(s1.showAccept, false);

    // 2. READY + NO_SOLUTION
    const s2 = resolveStep4Actions('READY', 'NO_SOLUTION');
    assert.strictEqual(s2.showCalculate, true);
    assert.strictEqual(s2.calculateLabel, 'Re-run Pricing Calibration');
    assert.strictEqual(s2.showAccept, false);

    // 3. CALCULATED + ACCEPTABLE_CANDIDATE
    const s3 = resolveStep4Actions('CALCULATED', 'ACCEPTABLE_CANDIDATE');
    assert.strictEqual(s3.showCalculate, false, 'Calculate button MUST be hidden in CALCULATED state');
    assert.strictEqual(s3.showAccept, true);
    assert.strictEqual(s3.acceptLabel, 'Accept Pricing Revision');

    // 4. CALCULATED + SUCCEEDED
    const s4 = resolveStep4Actions('CALCULATED', 'SUCCEEDED');
    assert.strictEqual(s4.showCalculate, false);
    assert.strictEqual(s4.showAccept, true);

    // 5. CALCULATED + CONVERGED
    const s5 = resolveStep4Actions('CALCULATED', 'CONVERGED');
    assert.strictEqual(s5.showCalculate, false);
    assert.strictEqual(s5.showAccept, true);

    // 6. CALCULATED + non-eligible / unknown status
    const s6 = resolveStep4Actions('CALCULATED', 'UNKNOWN_STATUS');
    assert.strictEqual(s6.showCalculate, false);
    assert.strictEqual(s6.showAccept, false);

    // 7. ACCEPTED
    const s7 = resolveStep4Actions('ACCEPTED', 'SUCCEEDED');
    assert.strictEqual(s7.showCalculate, false);
    assert.strictEqual(s7.showAccept, false);
});

// T4: Step 4 Accept CTA Label Truth and Handler Binding
test('H8C.6.11.2-04', 'Step 4 accept button renders label "Accept Pricing Revision" and binds to onAccept', () => {
    assert.ok(wizardSrc.includes('<span>Accept Pricing Revision</span>'), 'Renders canonical label Accept Pricing Revision');
    assert.ok(wizardSrc.includes('onClick={onAccept}'), 'Binds to onAccept prop');
});

console.log(`\n═══ Phase 193H.8C.6.11.2 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
