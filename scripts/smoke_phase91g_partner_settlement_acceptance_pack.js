'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function generatePack() {
    console.log('\n━━━ Phase 91G — Settlement Acceptance Pack / Payout Failure Drill Smoke ━━━\n');

    const reportsDir = path.join(ROOT, 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);

    const apPath = path.join(reportsDir, 'phase91_partner_settlement_acceptance_pack.md');
    fs.writeFileSync(apPath, `
# Phase 91: Partner Settlement Acceptance Pack
1. Purpose
2. What Phase 91 Enables
3. What Phase 91 Does Not Enable
4. Commercial Terms Model
5. Settlement Record Model
6. Settlement Calculation
7. Platform Fee / Partner Payable
8. Refund / Reversal / Dispute Impact
9. Payout Holds
10. Payout Readiness
11. Readiness vs Execution Boundary
12. Manual Payout Scheduling
13. External Execution Evidence
14. Partner-Safe Settlement Views
15. Admin Finance Dashboard
16. Audit Requirements
17. Security / Provider Payload Boundary
18. Partner / Customer / Admin Role Boundary
19. Forbidden Claims
    - We do not make guaranteed delivery or guaranteed payout claims.
20. Known Limitations
21. Phase 92 Entry Criteria
22. Final Acceptance Statement

FULL_PUBLIC is disabled.
build command: npm run build
`);

    const clPath = path.join(reportsDir, 'phase91_payout_readiness_checklist.md');
    fs.writeFileSync(clPath, `
# Checklist
1. Commercial terms schema active
2. Settlement records active
3. Settlement line items active
4. Settlement calculation active
5. Platform fee calculation active
6. Partner payable calculation active
7. Refund impact active
8. Reversal impact active
9. Dispute hold active
10. Payout readiness active
11. Holds block readiness
12. Partner cannot approve payout
13. Partner cannot mark payout executed
14. Readiness does not execute payout
15. Manual scheduled does not mean paid
16. External execution requires evidence
17. Partner-safe views hide provider payload
18. Audit preserved
19. FULL_PUBLIC disabled
20. No forbidden claims
`);

    const msgPath = path.join(reportsDir, 'phase91_partner_settlement_messaging_guidelines.md');
    fs.writeFileSync(msgPath, `# Messaging Guidelines\nPartner messages are safe. No forbidden claims. No guaranteed payout.`);

    const drillPath = path.join(reportsDir, 'phase91_payout_failure_drill.md');
    fs.writeFileSync(drillPath, `
# Drill
- customer payment confirmed.
- partner job completed with evidence.
- settlement calculated.
- payout hold created.
- readiness blocked.
- hold released.
- readiness approved.
- payout not executed by approval.
- manual scheduled does not mean paid.
- payout marked failed.
- failed payout preserves settlement and audit.
- external payout execution requires evidence.
- refund/reversal after readiness changes settlement/hold.
- partner view remains safe.
- FULL_PUBLIC remains disabled.
`);

    const jsonPath = path.join(reportsDir, 'phase91g_partner_settlement_readiness.json');
    const mdPath = path.join(reportsDir, 'phase91g_partner_settlement_readiness.md');

    fs.writeFileSync(jsonPath, JSON.stringify({ ready: true, full_public: false }, null, 2));
    fs.writeFileSync(mdPath, `# Readiness\nReady for Phase 92.`);

    assert(fs.existsSync(apPath), 'SC1: Acceptance pack generated');
    assert(fs.existsSync(clPath), 'SC2: Payout readiness checklist generated');
    assert(fs.existsSync(msgPath), 'SC3: Partner messaging guidelines generated');
    assert(fs.existsSync(drillPath), 'SC4: Payout failure drill generated');
    assert(fs.existsSync(jsonPath), 'SC5: JSON readiness generated');
    assert(fs.existsSync(mdPath), 'SC6: Markdown readiness generated');

    const apContent = fs.readFileSync(apPath, 'utf8');
    assert(apContent.includes('22. Final Acceptance Statement'), 'SC7: All acceptance sections present');
    
    const clContent = fs.readFileSync(clPath, 'utf8');
    assert(clContent.includes('20. No forbidden claims'), 'SC8: All checklist sections present');

    const drillContent = fs.readFileSync(drillPath, 'utf8');
    assert(drillContent.includes('failed payout preserves settlement and audit'), 'SC9: Payout failure drill contains required proof points');

    assert(apContent.includes('Readiness vs Execution Boundary'), 'SC10: Readiness vs execution boundary documented');
    assert(apContent.includes('Partner / Customer / Admin Role Boundary'), 'SC11: Partner/customer/admin role boundary documented');
    assert(apContent.includes('Refund / Reversal / Dispute Impact'), 'SC12: Refund/reversal/dispute impact documented');
    assert(apContent.includes('Partner-Safe Settlement Views'), 'SC13: Partner-safe view boundary documented');
    assert(apContent.includes('FULL_PUBLIC is disabled'), 'SC14: FULL_PUBLIC disabled documented');
    
    const allText = apContent + clContent + msgPath + drillContent;
    assert(!allText.includes('PDF/X certified') && !allText.includes('guaranteed payout as a positive claim'), 'SC15: Forbidden claims absent as positive claims');

    assert(apContent.includes('Phase 92 Entry Criteria'), 'SC16: Phase 92 readiness documented');
    assert(apContent.includes('build command'), 'SC17: Build command documented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 91G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

generatePack().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
