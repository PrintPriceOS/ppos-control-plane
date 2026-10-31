/**
 * tests/smoke_phase193h8c611331_guided_wizard_hook_import.js
 *
 * Phase 193H.8C.6.11.3.3.1 Verification Suite:
 * Guided Wizard React Hook Import Integrity.
 *
 * Requirements Proven:
 * 1. GuidedCalibrationWizard imports useEffect explicitly from React.
 * 2. useEffect is not referenced without import.
 * 3. H8C.6.11.3.3 synchronization hook remains present.
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

console.log('\n═══ Phase 193H.8C.6.11.3.3.1: Guided Wizard Hook Import Suite ═══\n');

const wizardSrc = fs.readFileSync(path.join(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard.tsx'), 'utf8');

// T1: Explicit Named Import of useEffect
test('H8C.6.11.3.3.1-01', 'GuidedCalibrationWizard.tsx imports useEffect from react', () => {
    const importMatch = wizardSrc.match(/import\s+React,\s*\{([^}]+)\}\s+from\s+['"]react['"]/);
    assert.ok(importMatch, 'React import statement with named imports found');
    const namedImports = importMatch[1].split(',').map(s => s.trim());
    assert.ok(namedImports.includes('useState'), 'useState is imported');
    assert.ok(namedImports.includes('useEffect'), 'useEffect is explicitly imported');
});

// T2: Step Synchronization Hook Integrity
test('H8C.6.11.3.3.1-02', 'Step synchronization useEffect hook remains intact', () => {
    assert.ok(wizardSrc.includes('useEffect(() => {'), 'useEffect synchronization hook is present');
    assert.ok(wizardSrc.includes('}, [isAccepted, isCalculated, isReady]);'), 'Hook depends on isAccepted, isCalculated, isReady');
});

console.log(`\n═══ Phase 193H.8C.6.11.3.3.1 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
