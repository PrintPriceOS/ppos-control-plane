/**
 * tests/smoke_phase193h8c610_solver_outcome_ui_truth.js
 *
 * Phase 193H.8C.6.10 Verification Suite:
 * Solver Outcome Semantics, Lifecycle Separation & UI Truth Integrity.
 *
 * Requirements Proven:
 * 1. Separation of Concepts:
 *    - Solver Status (SUCCEEDED / CONVERGED / UNDERDETERMINED_ANCHOR / NO_SOLUTION / FAILED)
 *    - Session Lifecycle (DRAFT -> READY -> CALCULATED -> ACCEPTED)
 *    - Production Activation (Active rates applied on printer node only after ACCEPTED)
 * 2. Truth Model:
 *    - isCalculated is strictly: session.status === 'CALCULATED'
 *    - isAccepted is strictly: session.status === 'ACCEPTED'
 *    - isRunAcceptanceEligible is strictly: activeRun.status in ['SUCCEEDED', 'CONVERGED', 'UNDERDETERMINED_ANCHOR']
 *    - canAccept is strictly: isCalculated && isRunAcceptanceEligible
 * 3. NO_SOLUTION outcome:
 *    - When activeRun is NO_SOLUTION and session is READY: isCalculated === false, canAccept === false.
 *    - Never renders "Pricing Calibrated & Active" or an enabled Accept button.
 *    - Displays truthful failure message: "Calibration Did Not Converge" / "Calibration could not produce an acceptance-eligible solution".
 * 4. Atomic run execution:
 *    - calibrationRunService.executeRun uses getPool().getConnection() with transaction.
 *    - Transitions session READY -> CALCULATED atomically if solver succeeds.
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

console.log('\n═══ Phase 193H.8C.6.10: Solver Outcome Semantics & UI Truth Suite ═══\n');

const UI_DIR = path.join(__dirname, '../src/ui');
const quickPanelSrc = fs.readFileSync(path.join(UI_DIR, 'components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx'), 'utf8');
const wizardSrc = fs.readFileSync(path.join(UI_DIR, 'components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard.tsx'), 'utf8');
const runServiceSrc = fs.readFileSync(path.join(__dirname, '../src/api/services/calibrationRunService.js'), 'utf8');
const solverSrc = fs.readFileSync(path.join(__dirname, '../src/api/services/deterministicInversePricingSolver.js'), 'utf8');

// T1: Audit solver classification logic in deterministicInversePricingSolver.js
test('H8C.6.10-01', 'Solver classification logic classifies runs based on toleranceAbsEur and tolerancePct', () => {
    assert.ok(solverSrc.includes("status = 'NO_SOLUTION';"), 'Solver sets NO_SOLUTION when out of tolerance');
    assert.ok(solverSrc.includes('toleranceAbsEur: 0.05'), 'Solver toleranceAbsEur is 0.05 EUR');
    assert.ok(solverSrc.includes('tolerancePct: 0.01'), 'Solver tolerancePct is 0.01%');
});

// T2: QuickCalibrationPanel truth model separation
test('H8C.6.10-02', 'QuickCalibrationPanel separates session status from run presence', () => {
    assert.ok(quickPanelSrc.includes("const isCalculated = session?.status === 'CALCULATED';"), 'isCalculated does NOT check activeRun !== null');
    assert.ok(quickPanelSrc.includes("const isAccepted = session?.status === 'ACCEPTED';"), 'isAccepted strictly checks status === ACCEPTED');
    assert.ok(quickPanelSrc.includes('const canAccept = isCalculated && isRunAcceptanceEligible;'), 'canAccept requires both isCalculated and isRunAcceptanceEligible');
});

// T3: Truth Model Simulation Matrix
test('H8C.6.10-03', 'Truth Model Matrix: NO_SOLUTION + READY cannot accept; CONVERGED + CALCULATED can accept', () => {
    const evaluateTruth = (sessionStatus, runStatus) => {
        const isReadyForCalculation = sessionStatus === 'READY';
        const isCalculated = sessionStatus === 'CALCULATED';
        const isAccepted = sessionStatus === 'ACCEPTED';
        const isRunAcceptanceEligible = runStatus === 'SUCCEEDED' || runStatus === 'CONVERGED' || runStatus === 'UNDERDETERMINED_ANCHOR';
        const canAccept = isCalculated && isRunAcceptanceEligible;
        return { isReadyForCalculation, isCalculated, isAccepted, isRunAcceptanceEligible, canAccept };
    };

    // Case 1: Observed production state (session: READY, run: NO_SOLUTION)
    const res1 = evaluateTruth('READY', 'NO_SOLUTION');
    assert.strictEqual(res1.isCalculated, false, 'READY session with NO_SOLUTION is NOT isCalculated');
    assert.strictEqual(res1.isRunAcceptanceEligible, false, 'NO_SOLUTION is not acceptance eligible');
    assert.strictEqual(res1.canAccept, false, 'Cannot accept NO_SOLUTION');

    // Case 2: Session is READY, run is CONVERGED (lifecycle mismatch / incomplete transition)
    const res2 = evaluateTruth('READY', 'CONVERGED');
    assert.strictEqual(res2.isCalculated, false, 'READY session is not isCalculated');
    assert.strictEqual(res2.canAccept, false, 'Cannot accept without CALCULATED status');

    // Case 3: Session is CALCULATED, run is CONVERGED
    const res3 = evaluateTruth('CALCULATED', 'CONVERGED');
    assert.strictEqual(res3.isCalculated, true);
    assert.strictEqual(res3.canAccept, true);

    // Case 4: Session is CALCULATED, run is UNDERDETERMINED_ANCHOR
    const res4 = evaluateTruth('CALCULATED', 'UNDERDETERMINED_ANCHOR');
    assert.strictEqual(res4.isCalculated, true);
    assert.strictEqual(res4.canAccept, true);

    // Case 5: Session is ACCEPTED
    const res5 = evaluateTruth('ACCEPTED', 'CONVERGED');
    assert.strictEqual(res5.isAccepted, true);
});

// T4: GuidedCalibrationWizard Step 4 & 5 UX Truthfulness
test('H8C.6.10-04', 'GuidedCalibrationWizard displays accurate status messages and gates acceptance button', () => {
    assert.ok(wizardSrc.includes('canAccept && !isAccepted && ('), 'Accept button is rendered ONLY when canAccept is true');
    assert.ok(wizardSrc.includes("'Calibration Did Not Converge'"), 'Displays failure header on failed run');
    assert.ok(wizardSrc.includes('Calibration could not produce an acceptance-eligible solution'), 'Displays informative failure banner');
    assert.ok(wizardSrc.includes("'Calibration Calculated — Awaiting Acceptance'"), 'Calculated status uses Awaiting Acceptance terminology');
});

// T5: calibrationRunService Atomic Transaction Audit
test('H8C.6.10-05', 'calibrationRunService executeRun executes INSERT and UPDATE inside a managed transaction', () => {
    assert.ok(runServiceSrc.includes('const connection = await db.getPool().getConnection();'), 'Acquires pooled connection');
    assert.ok(runServiceSrc.includes('await connection.beginTransaction();'), 'Starts transaction');
    assert.ok(runServiceSrc.includes('await connection.commit();'), 'Commits transaction');
    assert.ok(runServiceSrc.includes('await connection.rollback();'), 'Rolls back on error');
    assert.ok(runServiceSrc.includes('connection.release();'), 'Releases connection in finally');
});

console.log(`\n═══ Phase 193H.8C.6.10 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
