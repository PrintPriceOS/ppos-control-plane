'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsReadinessAggregatorService = require('../src/api/services/financialOperationsReadinessAggregatorService');
const FinancialOperationsReviewService = require('../src/api/services/financialOperationsReviewService');

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
    console.log('\n━━━ Phase 95D — FinOps Review Workflow Smoke ━━━\n');

    const aggSvc = new FinancialOperationsReadinessAggregatorService();
    const revSvc = new FinancialOperationsReviewService({ financialOperationsReadinessAggregatorService: aggSvc });
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const cleanRecon = { run_id: 'r_1', mismatch_count: 0 };
    const cleanTax = { id: 'tax_1', readiness_status: 'READY' };
    const cleanInv = { invoice_id: 'inv_1', lifecycle_status: 'FINALIZED', tenant_id: 't_1' };
    const cleanCN = { credit_note_id: 'cn_1', lifecycle_status: 'FINALIZED' };
    
    const run = await aggSvc.aggregateReadiness({ reconciliationSnapshot: cleanRecon, taxSnapshot: cleanTax, invoice: cleanInv, creditNotes: [cleanCN], exportStatus: 'READY', actor: actorAdmin });

    // SC1
    await revSvc.executeReviewAction({ runId: run.readiness_run_id, actionType: 'MARK_NEEDS_ACCOUNTANT_REVIEW', actor: actorAdmin });
    assert(run.readiness_status === 'ACCOUNTANT_REVIEW_REQUIRED', 'SC1: Manual review actions update only readiness/review layer');

    // SC2
    await revSvc.executeReviewAction({ runId: run.readiness_run_id, actionType: 'RESOLVE_FINDING', payload: { finding_id: 'f_1' }, actor: actorAdmin });
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_REVIEW_ACTION_RESOLVE_FINDING'), 'SC2: Findings can be resolved');

    // SC3
    await revSvc.executeReviewAction({ runId: run.readiness_run_id, actionType: 'DISMISS_WARNING', payload: { warning_index: 0, reason: 'False positive' }, actor: actorAdmin });
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_REVIEW_ACTION_DISMISS_WARNING'), 'SC3: Warnings can be dismissed with reason');

    // SC4
    await revSvc.executeReviewAction({ runId: run.readiness_run_id, actionType: 'ACKNOWLEDGE_BLOCKER', payload: { blocker_index: 0, reason: 'Known issue, fixing soon' }, actor: actorAdmin });
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_REVIEW_ACTION_ACKNOWLEDGE_BLOCKER'), 'SC4: Blockers can be acknowledged');

    // SC5
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsReviewService.js'), 'utf-8');
    assert(!content.includes('UPDATE invoices') && !content.includes('UPDATE orders'), 'SC5: No source objects mutate');

    // SC6
    const timeline = await revSvc.getAuditTimeline(run.readiness_run_id, actorAdmin);
    assert(timeline.length >= 5, 'SC6: Audit events exist for review actions');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 95D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
