'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProductionActivationReviewService = require('../src/api/services/financialOperationsProductionActivationReviewService');

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

async function runSmoke() {
    console.log('\n━━━ Phase 100B — Production Activation Review Aggregator Smoke ━━━\n');

    const svc = new FinancialOperationsProductionActivationReviewService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const cleanSource = {
        tenantId: 't1',
        readinessValidated: true,
        releaseGatesValidated: true,
        pilotModeValidated: true,
        partnerSandboxValidated: true,
        productionHardeningValidated: true,
        fullPublicEnabled: false,
        productionActivationEnabled: false,
        liveProviderConnectivityEnabled: false,
        livePaymentEnabled: false,
        liveRefundEnabled: false,
        livePayoutEnabled: false,
        externalInvoiceEnabled: false,
        taxFilingEnabled: false,
        mutationDisabled: true,
        auditTimelineComplete: true,
        rollbackPathDocumented: true,
        incidentResponseReady: true,
        observabilityReady: true,
        manualApprovalsPresent: true
    };

    // SC1
    const run1 = await svc.aggregateReview({ sourceData: cleanSource, actor: actorAdmin });
    assert(run1.review_status === 'READY_FOR_GO_NO_GO_REVIEW', 'SC1: Clean Phase 95–99 stack becomes READY_FOR_GO_NO_GO_REVIEW');

    // SC2
    const sourcePublic = { ...cleanSource, fullPublicEnabled: true };
    const runPublic = await svc.aggregateReview({ sourceData: sourcePublic, actor: actorAdmin });
    assert(runPublic.review_status.includes('BLOCKED_BY_SECURITY'), 'SC2: FULL_PUBLIC enabled blocks review');
    assert(runPublic.blockers.includes('FULL_PUBLIC enabled'), 'SC2: FULL_PUBLIC explicitly blocked');

    // SC3
    const sourceAct = { ...cleanSource, productionActivationEnabled: true };
    const runAct = await svc.aggregateReview({ sourceData: sourceAct, actor: actorAdmin });
    assert(runAct.review_status.includes('BLOCKED_BY_SECURITY') && runAct.blockers.includes('Production activation enabled'), 'SC3: Production activation enabled blocks review');

    // SC4
    const sourceLive = { ...cleanSource, liveProviderConnectivityEnabled: true };
    const runLive = await svc.aggregateReview({ sourceData: sourceLive, actor: actorAdmin });
    assert(runLive.review_status.includes('BLOCKED_BY_SECURITY') && runLive.blockers.includes('Live provider connectivity enabled'), 'SC4: Live provider connectivity enabled blocks review');

    // SC5
    const sourceHard = { ...cleanSource, productionHardeningValidated: false };
    const runHard = await svc.aggregateReview({ sourceData: sourceHard, actor: actorAdmin });
    assert(runHard.review_status === 'BLOCKED_BY_OPERATIONAL_READINESS' && runHard.blockers.includes('Missing Phase 99 production hardening evidence'), 'SC5: Missing Phase 99 hardening blocks review');

    // SC6
    const sourceAudit = { ...cleanSource, auditTimelineComplete: false };
    const runAudit = await svc.aggregateReview({ sourceData: sourceAudit, actor: actorAdmin });
    assert(runAudit.review_status === 'BLOCKED_BY_AUDIT_GAPS', 'SC6: Missing audit timeline blocks review');

    // SC7
    const sourceRollback = { ...cleanSource, rollbackPathDocumented: false };
    const runRollback = await svc.aggregateReview({ sourceData: sourceRollback, actor: actorAdmin });
    assert(runRollback.review_status === 'BLOCKED_BY_ROLLBACK', 'SC7: Missing rollback path blocks review');

    // SC8
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProductionActivationReviewService.js'), 'utf-8');
    assert(!content.includes('UPDATE orders') && !content.includes('UPDATE payments'), 'SC8: Source objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 100B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
