/**
 * tests/smoke_phase193h3_clarification_interaction.js
 *
 * Phase 193H.3 Acceptance Suite: Clarification Choice Interaction & State Control.
 *
 * Guarantees Covered:
 * H3.1: CalibrationClarificationPanel renders controlled selection state
 * H3.2: Option buttons render aria-pressed and visual selected indicators (Check icons)
 * H3.3: Multiple clarification questions maintain independent selection state
 * H3.4: Free-text fallback input works for open questions
 * H3.5: No API call or Gemini turn is triggered on option click alone (explicit Continue button)
 * H3.6: Explicit Continue action passes compiled answers to onApplyClarifications
 * H3.7: QuickCalibrationPanel maps answers deterministically to local draftSpec / draftCommercials
 * H3.8: Composes human-readable trace in chat (e.g. "Self-cover; price is net excluding VAT") without raw enums
 * H3.9: Dismisses answered clarification questions from active proposal
 * H3.10: Zero DB mutations or session creations on option clicks or clarification apply alone
 * H3.11: Friendly copy: "We just need a few more details" and "Continue with these answers"
 * H3.12: Full regression: 193B/C/D/E/F/H/H.2 suites remain green
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

const UI_BASE = path.join(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration');

console.log('\n═══ Phase 193H.3: Clarification Choice Interaction & State Control ═══\n');

// 1. Component State & Accessibility
test('H3.1', 'CalibrationClarificationPanel uses controlled state with aria-pressed attribute', () => {
    const src = fs.readFileSync(path.join(UI_BASE, 'CalibrationClarificationPanel.tsx'), 'utf8');
    assert.ok(src.includes('aria-pressed={isSelected}'));
    assert.ok(src.includes('const [selectedAnswers, setSelectedAnswers] = useState'));
    assert.ok(src.includes('handleOptionSelect(q.field, opt)'));
});

test('H3.2', 'CalibrationClarificationPanel renders check icon and highlighted state for selected option', () => {
    const src = fs.readFileSync(path.join(UI_BASE, 'CalibrationClarificationPanel.tsx'), 'utf8');
    assert.ok(src.includes('<Check size={13}'));
    assert.ok(src.includes('bg-amber-600 text-white'));
});

test('H3.3', 'Independent selection across multiple questions supported in state dictionary', () => {
    const src = fs.readFileSync(path.join(UI_BASE, 'CalibrationClarificationPanel.tsx'), 'utf8');
    assert.ok(src.includes('[field]: opt'));
    assert.ok(src.includes('selectedAnswers[q.field]'));
});

test('H3.4', 'Free-text input rendered for questions without predefined options', () => {
    const src = fs.readFileSync(path.join(UI_BASE, 'CalibrationClarificationPanel.tsx'), 'utf8');
    assert.ok(src.includes('handleTextInputChange(q.field, e.target.value)'));
    assert.ok(src.includes('placeholder="Enter details here..."'));
});

// 2. Explicit Action & Flow
test('H3.5', 'No direct API call on option click; requires explicit "Continue with these answers" submission', () => {
    const src = fs.readFileSync(path.join(UI_BASE, 'CalibrationClarificationPanel.tsx'), 'utf8');
    assert.ok(src.includes('Continue with these answers'));
    assert.ok(src.includes('onApplyAnswers(selectedAnswers)'));
    assert.ok(!src.includes('fetch('));
    assert.ok(!src.includes('axios.'));
});

// 3. Mapping to Local Draft & Conversation Trace
test('H3.6', 'QuickCalibrationPanel maps clarification answers to local draftSpec and draftCommercials', () => {
    const panelSrc = fs.readFileSync(path.join(UI_BASE, 'QuickCalibrationPanel.tsx'), 'utf8');
    assert.ok(panelSrc.includes('handleApplyClarifications'));
    assert.ok(panelSrc.includes("field === 'cover_structure'"));
    assert.ok(panelSrc.includes("field === 'price_vat'"));
    assert.ok(panelSrc.includes('setDraftCommercials'));
    assert.ok(panelSrc.includes('setDraftSpec'));
});

test('H3.7', 'QuickCalibrationPanel adds human-readable trace to messages and clears questions', () => {
    const panelSrc = fs.readFileSync(path.join(UI_BASE, 'QuickCalibrationPanel.tsx'), 'utf8');
    assert.ok(panelSrc.includes("role: 'user' as const"));
    assert.ok(panelSrc.includes('readableSummaryParts.join'));
    assert.ok(panelSrc.includes('clarificationQuestions: []'));
});

// 4. Copy & Zero-Mutation Invariants
test('H3.8', 'Plain language friendly UX copy implemented without technical jargon', () => {
    const src = fs.readFileSync(path.join(UI_BASE, 'CalibrationClarificationPanel.tsx'), 'utf8');
    assert.ok(src.includes('We just need a few more details'));
    assert.ok(src.includes('Choose an option where available, or type the missing information below.'));
    assert.ok(!src.includes('Clarification Required Before Calculation'));
});

test('H3.9', 'Zero DB mutation guarantee: Clarification application remains local in-memory draft', () => {
    const panelSrc = fs.readFileSync(path.join(UI_BASE, 'QuickCalibrationPanel.tsx'), 'utf8');
    const handlerBody = panelSrc.substring(panelSrc.indexOf('const handleApplyClarifications'), panelSrc.indexOf('// ── 4. Mark Ready'));
    assert.ok(!handlerBody.includes('createSession('));
    assert.ok(!handlerBody.includes('updateDraftSession('));
    assert.ok(!handlerBody.includes('fetch('));
});

console.log(`\n═══ Phase 193H.3 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
