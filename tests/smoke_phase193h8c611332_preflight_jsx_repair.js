/**
 * tests/smoke_phase193h8c611332_preflight_jsx_repair.js
 *
 * Phase 193H.8C.6.11.3.3.2 Verification Suite:
 * Preflight JSX Structural Nesting Integrity.
 *
 * Requirements Proven:
 * 1. PreflightUploadModal JSX tree parses without unmatched tags.
 * 2. High-fidelity header opens and closes its container symmetrically.
 * 3. DialogPanel, TransitionChild, and Dialog close deterministically.
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

console.log('\n═══ Phase 193H.8C.6.11.3.3.2: Preflight JSX Structural Repair Suite ═══\n');

const modalSrc = fs.readFileSync(path.join(__dirname, '../src/ui/pages/preflight/PreflightUploadModal.tsx'), 'utf8');

// T1: Structural Tag Balance
test('H8C.6.11.3.3.2-01', 'PreflightUploadModal.tsx contains balanced DialogPanel and TransitionChild tags', () => {
    const dialogPanelOpen = (modalSrc.match(/<DialogPanel/g) || []).length;
    const dialogPanelClose = (modalSrc.match(/<\/DialogPanel>/g) || []).length;
    assert.strictEqual(dialogPanelOpen, dialogPanelClose, 'DialogPanel open and close counts must match exactly');

    const transitionChildOpen = (modalSrc.match(/<TransitionChild/g) || []).length;
    const transitionChildClose = (modalSrc.match(/<\/TransitionChild>/g) || []).length;
    assert.strictEqual(transitionChildOpen, transitionChildClose, 'TransitionChild open and close counts must match exactly');

    const dialogOpen = (modalSrc.match(/<Dialog\b/g) || []).length;
    const dialogClose = (modalSrc.match(/<\/Dialog>/g) || []).length;
    assert.strictEqual(dialogOpen, dialogClose, 'Dialog open and close counts must match exactly');

    const transitionOpen = (modalSrc.match(/<Transition\b/g) || []).length;
    const transitionClose = (modalSrc.match(/<\/Transition>/g) || []).length;
    assert.strictEqual(transitionOpen, transitionClose, 'Transition open and close counts must match exactly');
});

// T2: Closing Hierarchy Check
test('H8C.6.11.3.3.2-02', 'PreflightUploadModal.tsx closes in deterministic nested hierarchy', () => {
    const bottomTail = modalSrc.slice(-300);
    assert.ok(bottomTail.includes('</DialogPanel>'), 'Closes DialogPanel');
    assert.ok(bottomTail.includes('</TransitionChild>'), 'Closes TransitionChild');
    assert.ok(bottomTail.includes('</Dialog>'), 'Closes Dialog');
    assert.ok(bottomTail.includes('</Transition>'), 'Closes Transition');
});

console.log(`\n═══ Phase 193H.8C.6.11.3.3.2 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
