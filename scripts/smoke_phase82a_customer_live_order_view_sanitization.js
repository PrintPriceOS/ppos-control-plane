'use strict';

const fs = require('fs');
const path = require('path');
const CustomerLiveOrderViewService = require('../src/api/services/customerLiveOrderViewService');

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

async function runSmoke() {
    console.log('\n━━━ Phase 82A — Customer Live Order View Model / Sanitization Service Smoke ━━━\n');

    // Mock lifecycle service
    const mockOrder = {
        id: 'order_1',
        tenant_id: 'tenant_A',
        customer_id: 'cust_1',
        live_order_number: 'LO-123',
        live_order_status: 'FILES_REQUIRED',
        operator_snapshot_json: '{"machineId": "m1", "riskScore": 95}',
        governance_snapshot_json: '{"policy": "strict"}'
    };

    const lifecycleSvc = {
        getLiveOrder: async ({ liveOrderId }) => {
            if (liveOrderId === 'order_1') return mockOrder;
            if (liveOrderId === 'order_B') return { ...mockOrder, tenant_id: 'tenant_B' };
            if (liveOrderId === 'order_2') return { ...mockOrder, customer_id: 'cust_2' };
            return null;
        },
        recordLiveOrderEvent: async () => {} // Mock audit
    };

    const viewSvc = new CustomerLiveOrderViewService({ liveOrderLifecycleService: lifecycleSvc });

    // SC1
    const actor1 = { userId: 'cust_1', role: 'CUSTOMER', tenantId: 'tenant_A' };
    const view1 = await viewSvc.buildCustomerLiveOrderView({ liveOrderId: 'order_1', actor: actor1 });
    assert(view1.live_order_id === 'order_1', 'SC1: Customer view created for own order');

    // SC2
    try {
        await viewSvc.buildCustomerLiveOrderView({ liveOrderId: 'order_2', actor: actor1 });
        assert(false, 'SC2: Cross-customer access blocked');
    } catch (err) {
        assert(err.message.includes('cross-customer'), 'SC2: Cross-customer access blocked');
    }

    // SC3
    try {
        await viewSvc.buildCustomerLiveOrderView({ liveOrderId: 'order_B', actor: actor1 });
        assert(false, 'SC3: Cross-tenant access blocked');
    } catch (err) {
        assert(err.message.includes('cross-tenant'), 'SC3: Cross-tenant access blocked');
    }

    // SC4
    assert(viewSvc.mapInternalStatusToCustomerStatus({ liveOrderStatus: 'LIVE_IN_PRODUCTION' }) === 'IN_PRODUCTION', 'SC4: Internal live status maps to safe customer status');

    // SC5
    let actions = await viewSvc.buildCustomerNextActions({ liveOrderId: 'order_1', actor: actor1 }); // mockOrder status = FILES_REQUIRED -> FILES_NEEDED
    assert(actions[0].action === 'UPLOAD_FILES', 'SC7: Reupload blocker maps to safe next action');

    // SC5 (Proof)
    mockOrder.live_order_status = 'PROOF_REVIEW_REQUIRED';
    viewSvc.mapInternalStatusToCustomerStatus = () => 'PROOF_REVIEW_REQUIRED'; // override for test
    actions = await viewSvc.buildCustomerNextActions({ liveOrderId: 'order_1', actor: actor1 });
    assert(actions[0].action === 'APPROVE_PROOF', 'SC5: Proof blocker maps to safe next action');

    // SC6 (Payment)
    viewSvc.mapInternalStatusToCustomerStatus = () => 'PAYMENT_REQUIRED';
    actions = await viewSvc.buildCustomerNextActions({ liveOrderId: 'order_1', actor: actor1 });
    assert(actions[0].action === 'CONFIRM_PAYMENT_REFERENCE', 'SC6: Payment blocker maps to safe next action');

    // Restore mapInternalStatusToCustomerStatus
    viewSvc.mapInternalStatusToCustomerStatus = CustomerLiveOrderViewService.prototype.mapInternalStatusToCustomerStatus;

    // SC8
    const safeIncident = viewSvc.sanitizeIncidentForCustomer({ id: 'inc1', status: 'OPEN', internal_trace: 'NullPointerException' });
    assert(safeIncident.internal_trace === undefined && safeIncident.customer_message.includes('technical review'), 'SC8: Incident details sanitized');

    // SC9
    const safePreflight = viewSvc.sanitizePreflightSummaryForCustomer({ status: 'FAILED', raw_rules: {}, issues: [{ page: 1, internal_id: 'i1' }] });
    assert(safePreflight.raw_rules === undefined && safePreflight.issues[0].internal_id === undefined, 'SC9: Preflight summary sanitized');

    // SC10
    const events = [
        { id: 'e1', created_at: '2023', event_type: 'LIVE_MACHINE_ASSIGNED' },
        { id: 'e2', created_at: '2023', event_type: 'MACHINE_COMPATIBILITY_PASSED' }
    ];
    const safeTimeline = viewSvc.sanitizeTimelineForCustomer(events);
    assert(safeTimeline.length === 2 && safeTimeline[0].message.includes('scheduled') && safeTimeline[1].message.includes('review step'), 'SC10: Timeline sanitized translating internals');

    // SC11, SC12, SC13
    const viewPayloadStr = JSON.stringify(view1);
    assert(!viewPayloadStr.includes('operator_snapshot_json'), 'SC11: Operator snapshot hidden');
    assert(!viewPayloadStr.includes('m1'), 'SC12: Machine internals hidden');
    assert(!viewPayloadStr.includes('governance_snapshot_json'), 'SC13: Raw governance JSON hidden');

    // SC14
    const mappedStatuses = [
        'LIVE_INTAKE_CREATED', 'FILES_REQUIRED', 'FILES_UPLOADED', 'PREFLIGHT_REQUIRED', 
        'PREFLIGHT_RUNNING', 'PREFLIGHT_COMPLETED', 'READY_FOR_LIVE_QUEUE', 'LIVE_QUEUED', 
        'LIVE_ASSIGNED_TO_MACHINE', 'LIVE_IN_PRODUCTION', 'LIVE_PAUSED', 'LIVE_BLOCKED', 
        'LIVE_HANDOFF_READY', 'LIVE_HANDOFF_SENT', 'LIVE_COMPLETED', 'LIVE_CANCELLED', 'LIVE_REVOKED'
    ];
    const forbiddenStatuses = ['CERTIFIED', 'PRINT_READY', 'PDFX_CERTIFIED', 'PDFA_CERTIFIED', 'GUARANTEED_DELIVERY', 'MACHINE_ASSIGNED_INTERNAL', 'LIVE_APPROVED_INTERNAL'];
    
    let emitsForbidden = false;
    for (const st of mappedStatuses) {
        const mapped = viewSvc.mapInternalStatusToCustomerStatus({ liveOrderStatus: st });
        if (forbiddenStatuses.includes(mapped)) emitsForbidden = true;
    }
    assert(!emitsForbidden, 'SC14: Forbidden customer status not emitted');

    // SC15
    const forbiddenWording = ['guaranteed delivery', 'certified', 'print-ready'];
    let hasForbiddenWord = false;
    forbiddenWording.forEach(word => {
        if (viewPayloadStr.toLowerCase().includes(word)) hasForbiddenWord = true;
    });
    assert(!hasForbiddenWord, 'SC15: No forbidden wording');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 82A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
