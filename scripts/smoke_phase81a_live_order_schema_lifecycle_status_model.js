'use strict';

const fs = require('fs');
const path = require('path');
const LiveOrderLifecycleService = require('../src/api/services/liveOrderLifecycleService');

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
    console.log('\n━━━ Phase 81A — Live Order Schema / Lifecycle Status Model Smoke ━━━\n');

    // SC1
    const migrationPath = path.join(ROOT, 'migrations', '021_phase81_live_order_operations_limited_commercial_pilot.sql');
    assert(fs.existsSync(migrationPath), 'SC1: Migration file exists');
    
    // Check if new columns are present in migration
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');
    assert(migrationContent.includes('live_order_number'), 'SC1.1: live_order_number column exists');
    assert(migrationContent.includes('source_channel'), 'SC1.2: source_channel column exists');
    assert(migrationContent.includes('rollback_status'), 'SC1.3: rollback_status column exists');

    const adminActor = { userId: 'u1', role: 'SYSTEM_ADMIN' };

    // SC2 & SC3
    const mockEnablementSvc = {
        getLiveEnablement: async ({ tenantId }) => {
            if (tenantId === 't_active') {
                return { id: 'e1', enablement_status: 'ACTIVE', live_production_enabled: true, live_scope: 'LIMITED_LIVE' };
            }
            return { id: 'e2', enablement_status: 'PAUSED', live_production_enabled: false };
        }
    };

    const lifecycleSvc = new LiveOrderLifecycleService({ liveProductionEnablementService: mockEnablementSvc });

    const validPayload = { liveScope: 'LIMITED_LIVE', liveOrderNumber: 'LO-123', orderType: 'BOOK_PRINT' };
    const order = await lifecycleSvc.createLiveOrder({ tenantId: 't_active', printhouseId: 'ph1', sourceOrderId: 'so1', payload: validPayload, actor: adminActor });
    assert(order.live_order_status === 'LIVE_INTAKE_CREATED', 'SC2: Live order created in LIVE_INTAKE_CREATED');

    try {
        await lifecycleSvc.createLiveOrder({ tenantId: 't_inactive', printhouseId: 'ph1', sourceOrderId: 'so1', payload: validPayload, actor: adminActor });
        assert(false, 'SC3: Live order creation blocked without active live enablement');
    } catch (err) {
        assert(err.message.includes('BLOCKED'), 'SC3: Live order creation blocked without active live enablement');
    }

    // SC4
    try {
        await lifecycleSvc.createLiveOrder({ tenantId: 't_active', printhouseId: 'ph1', sourceOrderId: 'so1', payload: { ...validPayload, liveScope: 'FULL_LIVE' }, actor: adminActor });
        assert(false, 'SC4: Live order creation blocked outside live scope');
    } catch (err) {
        assert(err.message.includes('Scope mismatch'), 'SC4: Live order creation blocked outside live scope');
    }

    // SC5 & SC6
    const transitioned = await lifecycleSvc.transitionLiveOrder({ liveOrderId: order.id, nextStatus: 'FILES_REQUIRED', reason: 'Moving to files', actor: adminActor });
    assert(transitioned.live_order_status === 'FILES_REQUIRED', 'SC5: Status transition recorded');

    // SC10
    try {
        await lifecycleSvc.transitionLiveOrder({ liveOrderId: order.id, nextStatus: 'LIVE_QUEUED', reason: 'Skip to queue', actor: adminActor });
        assert(false, 'SC6 & SC10: Transition to LIVE_QUEUED blocked without required gates');
    } catch (err) {
        assert(err.message.includes('ILLEGAL_TRANSITION'), 'SC6 & SC10: Transition to LIVE_QUEUED blocked without required gates');
    }

    // SC11
    try {
        await lifecycleSvc.transitionLiveOrder({ liveOrderId: order.id, nextStatus: 'LIVE_COMPLETED', reason: 'Finish', actor: adminActor });
        assert(false, 'SC11: Transition to LIVE_COMPLETED blocked without final audit');
    } catch (err) {
        assert(err.message.includes('ILLEGAL_TRANSITION'), 'SC11: Transition to LIVE_COMPLETED blocked without final audit');
    }

    // SC7
    const snapshot = await lifecycleSvc.createGateSnapshot({ liveOrderId: order.id, gateName: 'FILE_UPLOAD', gateStatus: 'PASSED', snapshot: { files: 2 } });
    assert(snapshot.gate_status === 'PASSED', 'SC7: Gate snapshot created');

    // SC8 & SC9
    const customerSafe = await lifecycleSvc.buildCustomerSafeLiveOrderSnapshot({ liveOrderId: order.id });
    assert(customerSafe._internal === undefined, 'SC8: Customer-safe snapshot sanitized');

    const operatorSnap = await lifecycleSvc.buildOperatorLiveOrderSnapshot({ liveOrderId: order.id, actor: adminActor });
    assert(operatorSnap._internal !== undefined, 'SC9: Operator snapshot contains internal details');

    // SC12
    try {
        await lifecycleSvc.recordLiveOrderEvent({ tenantId: null, liveOrderId: order.id, eventType: 'TEST', actor: adminActor });
        assert(false, 'SC12: Events are tenant-scoped');
    } catch (err) {
        assert(err.message.includes('Tenant scoping is mandatory'), 'SC12: Events are tenant-scoped');
    }

    // SC13
    const routesContent = fs.existsSync(path.join(ROOT, 'src/api/routes/marketplacePublic.js')) ? fs.readFileSync(path.join(ROOT, 'src/api/routes/marketplacePublic.js'), 'utf8') : '';
    assert(!routesContent.includes('live_orders'), 'SC13: No public marketplace launch side effect in public routes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 81A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
