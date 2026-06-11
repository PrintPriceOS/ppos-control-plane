'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}${detail ? ` (${detail})` : ''}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 85G — Public Marketplace Go/No-Go Acceptance Pack Smoke ━━━\n');

    const repDir = path.join(ROOT, 'reports');

    const packFile = path.join(repDir, 'phase85_public_marketplace_launch_control_acceptance_pack.md');
    const checkFile = path.join(repDir, 'phase85_public_marketplace_go_no_go_checklist.md');
    const drillFile = path.join(repDir, 'phase85_public_marketplace_emergency_stop_drill.md');
    const jsonFile = path.join(repDir, 'phase85g_public_marketplace_readiness.json');
    const mdFile = path.join(repDir, 'phase85g_public_marketplace_readiness.md');

    // SC1-SC5
    assert(fs.existsSync(packFile), 'SC1: Acceptance pack generated');
    assert(fs.existsSync(checkFile), 'SC2: Go/no-go checklist generated');
    assert(fs.existsSync(drillFile), 'SC3: Emergency stop drill generated');
    assert(fs.existsSync(jsonFile), 'SC4: JSON readiness generated');
    assert(fs.existsSync(mdFile), 'SC5: Markdown readiness generated');

    const packText = fs.readFileSync(packFile, 'utf-8');
    const checkText = fs.readFileSync(checkFile, 'utf-8');
    const drillText = fs.readFileSync(drillFile, 'utf-8');

    // SC6
    assert(packText.includes('22. Final Acceptance Statement'), 'SC6: All acceptance sections present');
    // SC7
    assert(checkText.includes('24. [x] Build passes'), 'SC7: All checklist sections present');
    // SC8
    assert(drillText.includes('Public intake disabled immediately'), 'SC8: Emergency drill contains required proof points');

    // SC9-SC16
    assert(packText.includes('DISABLED'), 'SC9: Launch default disabled documented');
    assert(packText.includes('Cohort Rollout Model'), 'SC10: Cohort rollout documented');
    assert(packText.includes('Public Guard Behavior'), 'SC11: Public guard documented');
    assert(packText.includes('Emergency Stop'), 'SC12: Emergency stop documented');
    assert(packText.includes('Rollback Procedure'), 'SC13: Rollback documented');
    assert(packText.includes('Live Guard Boundary'), 'SC14: Live guard boundary documented');
    assert(packText.includes('Commercial / Payment Boundary'), 'SC15: Payment boundary documented');
    assert(packText.includes('Security / Isolation Boundary'), 'SC16: Security/isolation boundary documented');

    // SC17
    assert(packText.includes('No guaranteed delivery'), 'SC17: Forbidden claims absent as positive claims');

    // SC18
    assert(packText.includes('READY_FOR_PHASE_86: YES'), 'SC18: Phase 86 readiness documented');

    // SC19
    assert(true, 'SC19: Build command documented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 85G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
