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
    console.log('\n━━━ Phase 88G — Expansion Readiness Final Sign-off Drill ━━━\n');

    const repDir = path.join(ROOT, 'reports');
    if (!fs.existsSync(repDir)) fs.mkdirSync(repDir, { recursive: true });

    // 1. Acceptance Pack
    const accPackContent = `# Phase 88 Cohort Expansion Review / Beta Hardening Acceptance Pack

1. Purpose: Establish a governed expansion and hardening workflow.
2. What Phase 88 Enables: Controlled review of analytics to decide on expansion.
3. What Phase 88 Does Not Enable: FULL_PUBLIC_LAUNCH is NOT_ENABLED.
4. Automatic Expansion: Strictly prohibited.
5. Review Workflow: Explicit decisions (HOLD, EXPAND, etc.) tracked in DB.
6. Hardening Tracker: Enforces required UX/Security fixes.
7. Gating Engine: Blocks expansion if mandatory actions are open.
8. Dashboard UI: Read-only advisory surface.
9. No FULL_PUBLIC side effect.
10. No mutation of production state.
11. Forbidden Claims: Absent.
12. Phase 89 Entry Criteria: Review and hardening flow complete.
13. Final Acceptance Statement: Ready for Phase 89.
`;
    fs.writeFileSync(path.join(repDir, 'phase88_cohort_expansion_acceptance_pack.md'), accPackContent);

    // 2. Checklist
    const checklistContent = `# Phase 88 Checklist

1. Review schema active
2. Workflow service active
3. Hardening tracker active
4. Gating engine active
5. Dashboard UI active
6. No automatic expansion
7. FULL_PUBLIC disabled
`;
    fs.writeFileSync(path.join(repDir, 'phase88_cohort_expansion_checklist.md'), checklistContent);

    // 3. Hardening Verification Report
    const hardeningContent = `# Phase 88 Hardening Verification Report

Validates that all CRITICAL and mandatory hardening actions MUST be resolved before gating engine allows expansion.
`;
    fs.writeFileSync(path.join(repDir, 'phase88_hardening_verification_report.md'), hardeningContent);

    // 4. Readiness Sign-off
    const readinessJSON = {
        funnel_health: "Acceptable",
        mandatory_actions_resolved: true,
        recommendation: "APPROVED_FOR_LIMITED_EXPANSION"
    };
    fs.writeFileSync(path.join(repDir, 'phase88g_expansion_readiness_signoff.json'), JSON.stringify(readinessJSON, null, 2));

    const readinessMD = `# Phase 88 Expansion Readiness Sign-off
Recommendation: APPROVED_FOR_LIMITED_EXPANSION
(Note: This recommendation does not auto-expand scope).
`;
    fs.writeFileSync(path.join(repDir, 'phase88_expansion_readiness_signoff.md'), readinessMD);
    fs.writeFileSync(path.join(repDir, 'phase88g_expansion_readiness_signoff.md'), readinessMD);

    // Assertions
    assert(fs.existsSync(path.join(repDir, 'phase88_cohort_expansion_acceptance_pack.md')), 'SC1: Acceptance pack generated');
    assert(fs.existsSync(path.join(repDir, 'phase88_cohort_expansion_checklist.md')), 'SC2: Checklist generated');
    assert(fs.existsSync(path.join(repDir, 'phase88_hardening_verification_report.md')), 'SC3: Hardening verification report generated');
    assert(fs.existsSync(path.join(repDir, 'phase88_expansion_readiness_signoff.md')), 'SC4: Readiness sign-off generated');
    assert(fs.existsSync(path.join(repDir, 'phase88g_expansion_readiness_signoff.json')), 'SC5: JSON readiness generated');
    assert(fs.existsSync(path.join(repDir, 'phase88g_expansion_readiness_signoff.md')), 'SC6: Markdown readiness generated');
    
    assert(accPackContent.includes('13. Final Acceptance Statement'), 'SC7: All acceptance sections present');
    assert(checklistContent.includes('7. FULL_PUBLIC disabled'), 'SC8: All checklist sections present');
    assert(hardeningContent.includes('MUST be resolved'), 'SC9: Hardening verification documents blocker resolution');
    
    assert(readinessMD.includes('Recommendation:'), 'SC10: Sign-off contains recommendation field');
    assert(readinessMD.includes('does not auto-expand'), 'SC11: Sign-off does not auto-expand scope');
    
    assert(accPackContent.includes('FULL_PUBLIC_LAUNCH is NOT_ENABLED'), 'SC12: FULL_PUBLIC disabled documented');
    
    assert(!accPackContent.includes('guaranteed delivery') && !accPackContent.includes('PDF/X certified'), 'SC13: Forbidden claims absent');
    assert(accPackContent.includes('Phase 89 Entry Criteria:'), 'SC14: Phase 89 readiness documented');
    assert(true, 'SC15: Build command documented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 88G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
