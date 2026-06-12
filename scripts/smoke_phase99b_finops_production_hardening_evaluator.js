'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProductionHardeningService = require('../src/api/services/financialOperationsProductionHardeningService');

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
    console.log('\n━━━ Phase 99B — Production Hardening Evaluator Smoke ━━━\n');

    const svc = new FinancialOperationsProductionHardeningService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const cleanSource = {
        tenantId: 't1',
        sandboxId: 'sb1',
        fullPublicEnabled: false,
        livePaymentEnabled: false,
        liveRefundEnabled: false,
        livePayoutEnabled: false,
        externalInvoiceEnabled: false,
        taxFilingEnabled: false,
        mockProviderLocalOnly: true,
        sandboxOnly: true,
        releaseGateAudited: true,
        pilotRunsAudited: true,
        sandboxRunsAudited: true,
        rateLimitsConfigured: true,
        incidentResponseReady: true,
        rollbackPathDocumented: true,
        observabilityEventsPresent: true,
        mutationDisabled: true
    };

    // SC1
    const run1 = await svc.evaluateHardening({ sourceData: cleanSource, actor: actorAdmin });
    assert(run1.hardening_status === 'READY_FOR_PRODUCTION_READINESS_REVIEW', 'SC1: Clean sandbox/pilot/release-gate stack becomes READY_FOR_PRODUCTION_READINESS_REVIEW');

    // SC2
    const sourcePublic = { ...cleanSource, fullPublicEnabled: true };
    const runPublic = await svc.evaluateHardening({ sourceData: sourcePublic, actor: actorAdmin });
    assert(runPublic.hardening_status.includes('BLOCKED_BY_CONFIGURATION'), 'SC2: FULL_PUBLIC enabled blocks hardening');
    assert(runPublic.blockers.includes('FULL_PUBLIC enabled'), 'SC2: FULL_PUBLIC enabled explicitly blocked');

    // SC3
    const sourceExt = { ...cleanSource, mockProviderLocalOnly: false };
    const runExt = await svc.evaluateHardening({ sourceData: sourceExt, actor: actorAdmin });
    assert(runExt.blockers.includes('External execution flag enabled'), 'SC3: External execution flag enabled blocks hardening');

    // SC4
    const sourceAudit = { ...cleanSource, pilotRunsAudited: false };
    const runAudit = await svc.evaluateHardening({ sourceData: sourceAudit, actor: actorAdmin });
    assert(runAudit.hardening_status === 'BLOCKED_BY_AUDIT_GAPS', 'SC4: Missing audit timeline blocks hardening');

    // SC5
    const sourceRollback = { ...cleanSource, rollbackPathDocumented: false };
    const runRollback = await svc.evaluateHardening({ sourceData: sourceRollback, actor: actorAdmin });
    assert(runRollback.hardening_status === 'BLOCKED_BY_ROLLBACK', 'SC5: Missing rollback path blocks hardening');

    // SC6
    const sourceObs = { ...cleanSource, observabilityEventsPresent: false };
    const runObs = await svc.evaluateHardening({ sourceData: sourceObs, actor: actorAdmin });
    assert(runObs.hardening_status === 'BLOCKED_BY_OBSERVABILITY', 'SC6: Missing observability events blocks hardening');

    // SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProductionHardeningService.js'), 'utf-8');
    assert(!content.includes('UPDATE orders') && !content.includes('UPDATE payments'), 'SC7: Source objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 99B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
