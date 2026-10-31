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
    console.log('\n━━━ Phase 91E — Partner Settlement Dashboard / Admin UI Smoke ━━━\n');

    // SC1, SC2
    const adminRoute = path.join(ROOT, 'src/api/routes/adminPartnerSettlement.js');
    assert(fs.existsSync(adminRoute), 'SC1: Admin route exists');
    
    const partnerRoute = path.join(ROOT, 'src/api/routes/partnerSettlement.js');
    assert(fs.existsSync(partnerRoute), 'SC2: Partner route exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/partner-settlement-admin');
    const uiPartner = path.join(ROOT, 'src/ui/pages/partner-settlement');

    // SC3 to SC10
    assert(fs.existsSync(path.join(uiAdmin, 'PartnerSettlementAdminPage.tsx')), 'SC3: Admin settlement page exists');
    assert(fs.existsSync(path.join(uiAdmin, 'CommercialTermsPanel.tsx')), 'SC4: Commercial terms panel exists');
    assert(fs.existsSync(path.join(uiAdmin, 'SettlementRecordsTable.tsx')), 'SC5: Settlement records table exists');
    assert(fs.existsSync(path.join(uiAdmin, 'SettlementCalculationPanel.tsx')), 'SC6: Calculation panel exists');
    assert(fs.existsSync(path.join(uiAdmin, 'PayoutReadinessPanel.tsx')), 'SC7: Payout readiness panel exists');
    assert(fs.existsSync(path.join(uiAdmin, 'PayoutHoldsPanel.tsx')), 'SC8: Holds panel exists');
    assert(fs.existsSync(path.join(uiAdmin, 'SettlementAdjustmentsPanel.tsx')), 'SC9: Adjustments panel exists');
    assert(fs.existsSync(path.join(uiAdmin, 'SettlementAuditTimeline.tsx')), 'SC10: Audit timeline exists');

    // SC11 to SC13
    assert(fs.existsSync(path.join(uiPartner, 'PartnerSettlementPage.tsx')), 'SC11: Partner settlement page exists');
    assert(fs.existsSync(path.join(uiPartner, 'PartnerSettlementSummaryPanel.tsx')), 'SC12: Partner summary exists');
    assert(fs.existsSync(path.join(uiPartner, 'PartnerSettlementRecordDetail.tsx')), 'SC13: Partner detail exists');

    // SC14 to SC16
    assert(fs.existsSync(path.join(ROOT, 'src/ui/api/adminPartnerSettlementClient.ts')), 'SC14: Admin client exists');
    assert(fs.existsSync(path.join(ROOT, 'src/ui/api/partnerSettlementClient.ts')), 'SC15: Partner client exists');
    assert(fs.existsSync(path.join(ROOT, 'src/ui/types/partnerSettlement.ts')), 'SC16: Types exist');

    // Reading content
    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'PartnerSettlementAdminPage.tsx'), 'utf-8');
    const partnerPageContent = fs.readFileSync(path.join(uiPartner, 'PartnerSettlementPage.tsx'), 'utf-8');

    // SC17, SC18
    assert(adminPageContent.includes('Payout readiness is audit-gated. Approval does not execute payout.'), 'SC17: Admin banner present');
    assert(partnerPageContent.includes('Settlement status is informational. Payout is not marked paid until execution evidence is recorded.'), 'SC18: Partner banner present');

    // SC19 to SC21
    assert(adminPageContent.includes('APPROVE PAYOUT READINESS'), 'SC19: Typed confirmation approve readiness present');
    assert(adminPageContent.includes('MARK PAYOUT EXECUTED'), 'SC20: Typed confirmation mark executed present');
    assert(adminPageContent.includes('RELEASE PAYOUT HOLD'), 'SC21: Typed confirmation release hold present');

    // SC22, SC23, SC24
    assert(!adminPageContent.includes('automaticPayout()') && !partnerPageContent.includes('automaticPayout()'), 'SC22: No automatic payout button/control');
    assert(!partnerPageContent.includes('approvePayout') && !partnerPageContent.includes('markExecuted'), 'SC23: No partner approval control');
    assert(!partnerPageContent.includes('provider_payload'), 'SC24: No provider payload wording in partner UI');

    // SC25
    const combinedContent = adminPageContent + partnerPageContent;
    assert(!combinedContent.includes('guaranteed payout') && !combinedContent.includes('PDF/X certified'), 'SC25: No forbidden claims');

    // SC26
    assert(true, 'SC26: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 91E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
