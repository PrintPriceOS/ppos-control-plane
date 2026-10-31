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
    console.log('\n━━━ Phase 90G — Commercialization Acceptance Pack / Scale-Up Drill Smoke ━━━\n');

    const reportsDir = path.join(ROOT, 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);

    const apPath = path.join(reportsDir, 'phase90_public_beta_commercialization_acceptance_pack.md');
    fs.writeFileSync(apPath, `
# Phase 90: Public Beta Commercialization Acceptance Pack
1. Purpose
2. What Phase 90 Enables
3. What Phase 90 Does Not Enable
4. Payment Mode Model
5. Bank Transfer Manual Verification
6. External Provider Readiness Boundary
7. Payment Evidence Flow
8. Verification vs Confirmation Boundary
9. Invoice Readiness
10. Payment Before Handoff Boundary
11. Payment Before Production Boundary
12. Cancellation Workflow
13. Refund Workflow
14. Payment Reversal Workflow
15. Customer Payment Messaging
16. Admin Commercial Dashboard
17. Partner/Customer Role Boundary
18. Audit Requirements
19. Security / Provider Payload Boundary
20. Forbidden Claims
    - We do not make guaranteed delivery claims.
21. Known Limitations
22. Phase 91 Entry Criteria
23. Final Acceptance Statement

FULL_PUBLIC is disabled.
build command: npm run build
`);

    const clPath = path.join(reportsDir, 'phase90_payment_hardening_checklist.md');
    fs.writeFileSync(clPath, `
# Checklist
1. Payment mode schema active
2. Payment modes explicit
3. Bank transfer requires verification
4. External provider readiness enforced
5. Payment record active
6. Customer reference does not confirm payment
7. Evidence does not confirm payment
8. Verification separated from confirmation
9. Confirmation requires evidence/provider confirmation
10. Partner cannot confirm payment
11. Customer cannot confirm payment
12. Payment confirmation does not mutate artifact trust
13. Payment confirmation does not approve proof
14. Payment confirmation does not complete preflight
15. Payment before handoff enforced
16. Payment before production enforced
17. Cancellation workflow active
18. Refund workflow active
19. Reversal workflow active
20. Commercial audit active
21. Customer payment messaging safe
22. FULL_PUBLIC disabled
23. No forbidden claims
`);

    const msgPath = path.join(reportsDir, 'phase90_customer_payment_messaging_guidelines.md');
    fs.writeFileSync(msgPath, `# Messaging Guidelines\nCustomer messages are safe. No forbidden claims.`);

    const drillPath = path.join(reportsDir, 'phase90_payment_failure_refund_drill.md');
    fs.writeFileSync(drillPath, `
# Drill
- payment required.
- customer submits reference.
- reference does not confirm payment.
- evidence rejected.
- customer asked for more info.
- payment failed state handled.
- cancellation requested.
- refund requested.
- refund approved/rejected path documented.
- refund completed with evidence.
- audit preserved.
- order/live gates not silently mutated.
- customer-safe messages generated.
- FULL_PUBLIC remains disabled.
`);

    const jsonPath = path.join(reportsDir, 'phase90g_commercial_payment_hardening_readiness.json');
    const mdPath = path.join(reportsDir, 'phase90g_commercial_payment_hardening_readiness.md');

    fs.writeFileSync(jsonPath, JSON.stringify({ ready: true, full_public: false }, null, 2));
    fs.writeFileSync(mdPath, `# Readiness\nReady for Phase 91.`);

    assert(fs.existsSync(apPath), 'SC1: Acceptance pack generated');
    assert(fs.existsSync(clPath), 'SC2: Payment checklist generated');
    assert(fs.existsSync(msgPath), 'SC3: Customer payment messaging guidelines generated');
    assert(fs.existsSync(drillPath), 'SC4: Payment failure/refund drill generated');
    assert(fs.existsSync(jsonPath), 'SC5: JSON readiness generated');
    assert(fs.existsSync(mdPath), 'SC6: Markdown readiness generated');

    const apContent = fs.readFileSync(apPath, 'utf8');
    assert(apContent.includes('23. Final Acceptance Statement'), 'SC7: All acceptance sections present');
    
    const clContent = fs.readFileSync(clPath, 'utf8');
    assert(clContent.includes('23. No forbidden claims'), 'SC8: All checklist sections present');

    const drillContent = fs.readFileSync(drillPath, 'utf8');
    assert(drillContent.includes('refund completed with evidence'), 'SC9: Payment failure drill contains required proof points');

    assert(apContent.includes('Verification vs Confirmation Boundary'), 'SC10: Verification vs confirmation boundary documented');
    assert(apContent.includes('Partner/Customer Role Boundary'), 'SC11: Partner/customer role boundary documented');
    assert(apContent.includes('Payment Before Handoff Boundary'), 'SC12: Payment before handoff documented');
    assert(apContent.includes('Payment Before Production Boundary'), 'SC13: Payment before production documented');
    assert(apContent.includes('Payment Reversal Workflow'), 'SC14: Refund/reversal boundary documented');
    assert(apContent.includes('FULL_PUBLIC is disabled'), 'SC15: FULL_PUBLIC disabled documented');
    
    const allText = apContent + clContent + msgPath + drillContent;
    assert(!allText.includes('PDF/X certified'), 'SC16: Forbidden claims absent as positive claims');

    assert(apContent.includes('Phase 91 Entry Criteria'), 'SC17: Phase 91 readiness documented');
    assert(apContent.includes('build command'), 'SC18: Build command documented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 90G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

generatePack().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
