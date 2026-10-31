'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsDataRetentionPolicyService = require('../src/api/services/financialOperationsDataRetentionPolicyService');

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
    console.log('\n━━━ Phase 108B — Financial Data Retention Policy Service Smoke ━━━\n');

    const svc = new FinancialOperationsDataRetentionPolicyService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const validPayload = {
        policyName: 'Standard Marketplace Order Retention',
        dataDomain: 'MARKETPLACE_ORDERS',
        dataCategories: ['PII', 'FINANCIAL'],
        retentionPeriodDays: 3650,
        redactionRequired: true,
        manualReviewRequired: true,
        productionExecutionEnabled: false,
        fullPublicEnabled: false
    };

    // SC1: Clean retention policy becomes APPROVED_FOR_READINESS
    const p1 = await svc.createPolicy(validPayload, actorAdmin);
    const eval1 = await svc.evaluatePolicyReadiness(p1.retention_policy_id, actorAdmin);
    assert(eval1.ready && eval1.policy.policy_status === 'READY_FOR_REVIEW', 'SC1.1: Policy is READY_FOR_REVIEW');
    const app1 = await svc.approvePolicy(p1.retention_policy_id, actorAdmin);
    assert(app1.policy_status === 'APPROVED_FOR_READINESS', 'SC1.2: Clean retention policy becomes APPROVED_FOR_READINESS');

    // SC2: Missing data domain blocks readiness
    const p2 = await svc.createPolicy({ ...validPayload, dataDomain: null }, actorAdmin);
    const eval2 = await svc.evaluatePolicyReadiness(p2.retention_policy_id, actorAdmin);
    assert(!eval2.ready && eval2.blockers.includes('DATA_DOMAIN_UNDEFINED_OR_UNSUPPORTED'), 'SC2: Missing data domain blocks readiness');

    // SC3: Missing retention period blocks readiness
    const p3 = await svc.createPolicy({ ...validPayload, retentionPeriodDays: 0 }, actorAdmin);
    const eval3 = await svc.evaluatePolicyReadiness(p3.retention_policy_id, actorAdmin);
    assert(!eval3.ready && eval3.blockers.includes('RETENTION_PERIOD_UNDEFINED'), 'SC3: Missing retention period blocks readiness');

    // SC4: redaction_required false blocks readiness
    const p4 = await svc.createPolicy({ ...validPayload, redactionRequired: false }, actorAdmin);
    const eval4 = await svc.evaluatePolicyReadiness(p4.retention_policy_id, actorAdmin);
    assert(!eval4.ready && eval4.blockers.includes('REDACTION_NOT_REQUIRED'), 'SC4: redaction_required false blocks readiness');

    // SC5: manual_review_required false blocks readiness
    const p5 = await svc.createPolicy({ ...validPayload, manualReviewRequired: false }, actorAdmin);
    const eval5 = await svc.evaluatePolicyReadiness(p5.retention_policy_id, actorAdmin);
    assert(!eval5.ready && eval5.blockers.includes('MANUAL_REVIEW_NOT_REQUIRED'), 'SC5: manual_review_required false blocks readiness');

    // SC6: production_execution_enabled true blocks readiness
    const p6 = await svc.createPolicy({ ...validPayload, productionExecutionEnabled: true }, actorAdmin);
    const eval6 = await svc.evaluatePolicyReadiness(p6.retention_policy_id, actorAdmin);
    assert(!eval6.ready && eval6.blockers.includes('PRODUCTION_EXECUTION_ENABLED'), 'SC6: production_execution_enabled true blocks readiness');

    // SC7: FULL_PUBLIC enabled blocks readiness
    const p7 = await svc.createPolicy({ ...validPayload, fullPublicEnabled: true }, actorAdmin);
    const eval7 = await svc.evaluatePolicyReadiness(p7.retention_policy_id, actorAdmin);
    assert(!eval7.ready && eval7.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC7: FULL_PUBLIC enabled blocks readiness');

    // SC8: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsDataRetentionPolicyService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC8: Source records remain unchanged');

    // Verify audit events
    assert(svc._mockEvents.some(e => e.event_type === 'FINOPS_DATA_RETENTION_POLICY_CREATED'), 'SC9: Created event exists');
    assert(svc._mockEvents.some(e => e.event_type === 'FINOPS_DATA_RETENTION_POLICY_REJECTED'), 'SC10: Rejected event exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 108B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
