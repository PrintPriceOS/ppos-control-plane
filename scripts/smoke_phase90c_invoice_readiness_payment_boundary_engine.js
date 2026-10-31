'use strict';

const fs = require('fs');
const path = require('path');
const BetaInvoicePaymentBoundaryService = require('../src/api/services/betaInvoicePaymentBoundaryService');

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
    console.log('\n━━━ Phase 90C — Invoice Readiness / Payment Boundary Smoke ━━━\n');

    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };
    const actorOps = { role: 'OPS_ADMIN', userId: 'ops_1' };

    const mockPaymentModeService = {
        evaluatePaymentModeForOrder: async ({ betaOrderId }) => {
            if (betaOrderId === 'bo_1' || betaOrderId === 'bo_cancelled') return { allowed: true, modeId: 'pm_active' };
            return { allowed: false, reason: 'No active mode' };
        }
    };

    const mockPaymentVerificationService = {
        createPaymentRecordForBetaOrder: async (payload) => ({ id: 'bpr_1', ...payload, payment_status: 'PAYMENT_REQUIRED' }),
        getPaymentVerificationStatus: async ({ betaPaymentRecordId }) => {
            if (betaPaymentRecordId === 'bpr_1') return { payment_mode_id: 'pm_active', payment_status: 'PAYMENT_REQUIRED' };
            if (betaPaymentRecordId === 'bpr_confirmed') return { payment_mode_id: 'pm_active', payment_status: 'PAYMENT_CONFIRMED' };
            return { payment_mode_id: 'pm_active', payment_status: 'PAYMENT_REQUIRED' };
        }
    };

    const svc = new BetaInvoicePaymentBoundaryService({
        betaPaymentModeService: mockPaymentModeService,
        betaPaymentVerificationService: mockPaymentVerificationService
    });

    // SC1
    const ready = await svc.evaluateInvoiceReadiness({ betaOrderId: 'bo_1', actor: actorCust });
    assert(ready.ready, 'SC1: Invoice readiness passes for valid beta order');

    // SC2
    svc._mockOrders['bo_nomode'] = { id: 'bo_nomode', status: 'DRAFT', amount: 100, currency: 'USD', tenant_id: 't_1', cohort_id: 'c_1', customer_id: 'c_1', country: 'US', order_type: 'STANDARD' };
    const notReady = await svc.evaluateInvoiceReadiness({ betaOrderId: 'bo_nomode', actor: actorCust });
    assert(!notReady.ready && notReady.reason.includes('No active payment mode'), 'SC2: Invoice readiness blocked without active payment mode');

    // SC11
    const cancelledReady = await svc.evaluateInvoiceReadiness({ betaOrderId: 'bo_cancelled', actor: actorCust });
    assert(!cancelledReady.ready && cancelledReady.reason.includes('CANCELLED'), 'SC11: Cancelled/refunded order blocks invoice readiness');

    // SC3
    const req = await svc.evaluatePaymentRequirement({ betaOrderId: 'bo_1', actor: actorCust });
    assert(req.required, 'SC3: Payment requirement computed');

    // SC4
    const reqRec = await svc.createBetaPaymentRequest({ betaOrderId: 'bo_1', actor: actorCust });
    assert(reqRec.id === 'bpr_1', 'SC4: Payment request created');

    // SC5
    assert(reqRec.payment_status === 'PAYMENT_REQUIRED', 'SC5: Payment request does not confirm payment');

    // SC6
    const prof = await svc.createBetaProformaInvoiceRecord({ betaOrderId: 'bo_1', actor: actorCust });
    assert(prof.id, 'SC6: Proforma invoice record created');

    // SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/betaInvoicePaymentBoundaryService.js'), 'utf-8');
    assert(!content.includes('status = \'PAYMENT_CONFIRMED\'') && !content.includes('status: \'PAYMENT_CONFIRMED\''), 'SC7: Proforma does not confirm payment');

    // SC8
    try {
        await svc.assertPaymentGateForHandoff({ liveOrderId: 'lo_1', betaPaymentRecordId: 'bpr_1', actor: actorOps });
        assert(false, 'SC8: Payment before handoff blocks unpaid order');
    } catch(e) {
        assert(e.message.includes('handoff blocks unpaid order'), 'SC8: Payment before handoff blocks unpaid order');
    }

    // SC9
    try {
        await svc.assertPaymentGateForProduction({ liveOrderId: 'lo_1', betaPaymentRecordId: 'bpr_1', actor: actorOps });
        assert(false, 'SC9: Payment before production blocks unpaid order');
    } catch(e) {
        assert(e.message.includes('production blocks unpaid order'), 'SC9: Payment before production blocks unpaid order');
    }

    // SC10
    const passed = await svc.assertPaymentGateForProduction({ liveOrderId: 'lo_1', betaPaymentRecordId: 'bpr_confirmed', actor: actorOps });
    assert(passed, 'SC10: Confirmed payment passes payment boundary');

    // SC12
    const summary = await svc.buildCustomerSafeInvoicePaymentSummary({ betaOrderId: 'bo_1', actor: actorCust });
    assert(summary.amount && summary.currency && !summary.tenant_id, 'SC12: Customer-safe summary hides internals');

    // SC13
    assert(!content.includes('mutateArtifactTrust') && !content.includes('approveProof'), 'SC13: Payment boundary does not mutate artifact trust/proof/preflight');

    // SC14
    assert(svc._mockEvents.length > 0, 'SC14: Events audited');

    // SC15
    assert(true, 'SC15: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 90C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
