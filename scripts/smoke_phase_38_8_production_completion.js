/**
 * scripts/smoke_phase_38_8_production_completion.js
 * 
 * Phase 38.8 — Integration Verification Smoke Script
 */

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('========================================================');
console.log('PPOS CONTROL PLANE — PHASE 38.8 SMOKE TEST');
console.log('========================================================\n');

// 1. Feature Flag & Token Bootstrap Check
const bypassToken = process.env.PPOS_CONTROL_TOKEN;
if (!bypassToken) {
    console.warn('⚠️ WARNING: PPOS_CONTROL_TOKEN not set in environment.');
} else {
    console.log('🔑 Authorization Token bootstrap verified.');
}

// 2. Safe Mutation Mode check
const allowMutation = process.env.PHASE_38_8_ALLOW_MUTATION === 'true';
console.log(`🔒 Safe Mutation Mode: ${allowMutation ? 'MUTATION_ALLOWED' : 'MOCK_ONLY'}`);

// 3. Static Code Assertions
console.log('\n--- Running Static File Assertions ---');
const serviceFilePath = path.join(__dirname, '../src/api/services/marketplaceProductionLifecycleService.js');
const routesFilePath = path.join(__dirname, '../src/api/routes/adminMarketplaceOrders.js');
const clientApiFilePath = path.join(__dirname, '../src/ui/lib/adminApi.ts');

assert(fs.existsSync(serviceFilePath), 'marketplaceProductionLifecycleService.js exists');
assert(fs.existsSync(routesFilePath), 'adminMarketplaceOrders.js exists');
assert(fs.existsSync(clientApiFilePath), 'adminApi.ts exists');

const serviceCode = fs.readFileSync(serviceFilePath, 'utf8');
const routesCode = fs.readFileSync(routesFilePath, 'utf8');
const clientApiCode = fs.readFileSync(clientApiFilePath, 'utf8');

// Assert Service Exports
assert(serviceCode.includes('evaluateProductionCompletionEligibility'), 'Service exports evaluateProductionCompletionEligibility');
assert(serviceCode.includes('completeProductionOrder'), 'Service exports completeProductionOrder');
assert(serviceCode.includes('evaluateDeliveryHandoffReadiness'), 'Service exports evaluateDeliveryHandoffReadiness');
assert(serviceCode.includes('prepareDeliveryHandoff'), 'Service exports prepareDeliveryHandoff');

// Assert Route Registrations
assert(routesCode.includes('/production/completion-eligibility'), 'Routes register /production/completion-eligibility');
assert(routesCode.includes('/production/complete'), 'Routes register /production/complete');
assert(routesCode.includes('/delivery/handoff-readiness'), 'Routes register /delivery/handoff-readiness');
assert(routesCode.includes('/delivery/prepare-handoff'), 'Routes register /delivery/prepare-handoff');

// Assert Client API functions
assert(clientApiCode.includes('evaluateProductionCompletionEligibility'), 'Client API exports evaluateProductionCompletionEligibility');
assert(clientApiCode.includes('completeProductionOrder'), 'Client API exports completeProductionOrder');
assert(clientApiCode.includes('evaluateDeliveryHandoffReadiness'), 'Client API exports evaluateDeliveryHandoffReadiness');
assert(clientApiCode.includes('prepareDeliveryHandoff'), 'Client API exports prepareDeliveryHandoff');

console.log('✅ Static assertions completed successfully.');

// Setup Mock DB environment for testing business logic
const mysqlClient = require('../src/api/services/mysqlClient');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');

let mockOrders = [];
let queryLog = [];
let eventLog = [];

// Intercept queries
mysqlClient.query = async (sql, params) => {
    queryLog.push({ sql, params });

    // SELECT status, metadata_json, ... FROM marketplace_orders WHERE order_id = ?
    if (sql.includes('FROM marketplace_orders')) {
        const orderId = params[0];
        const order = mockOrders.find(o => o.order_id === orderId);
        return order ? [order] : [];
    }

    // SELECT * FROM marketplace_order_files WHERE order_id = ? AND status <> "SUPERSEDED"
    if (sql.includes('FROM marketplace_order_files')) {
        const orderId = params[0];
        const order = mockOrders.find(o => o.order_id === orderId);
        return (order && order.files) ? order.files : [];
    }

    // SELECT type FROM marketplace_order_events WHERE order_id = ? AND type = "PRINTHOUSE_FILE_DOWNLOAD_COMPLETED"
    if (sql.includes('FROM marketplace_order_events')) {
        const orderId = params[0];
        const orderEvents = eventLog.filter(e => e.orderId === orderId);
        if (sql.includes('PRINTHOUSE_FILE_DOWNLOAD_COMPLETED')) {
            const hasDownload = orderEvents.some(e => e.event.type === 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED');
            return hasDownload ? [{ type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' }] : [];
        }
        if (sql.includes('"PRODUCTION_COMPLETED"')) {
            const matches = orderEvents.filter(e => e.event.type === 'PRODUCTION_COMPLETED' || e.event.type === 'PRODUCTION_COMPLETION_EXECUTED');
            return matches.map(m => ({ type: m.event.type }));
        }
        return orderEvents.map(m => ({ type: m.event.type }));
    }

    // UPDATE marketplace_orders SET status = 'PRODUCTION_COMPLETED' ...
    if (sql.includes('UPDATE marketplace_orders')) {
        // Last param is order_id
        const orderId = params[params.length - 1];
        
        // Strict Mutation Bypass Check: block mutating non-mock order if not enabled
        if (orderId !== 'smoke-order-38-8' && !allowMutation) {
            throw new Error(`MUTATION_BLOCKED: Attempted to mutate real order ID "${orderId}" but PHASE_38_8_ALLOW_MUTATION is false.`);
        }

        const order = mockOrders.find(o => o.order_id === orderId);
        if (order) {
            if (sql.includes('PRODUCTION_COMPLETED')) {
                order.status = 'PRODUCTION_COMPLETED';
                order.production_completed_at = params[0];
                order.production_completed_by = params[1];
                order.production_completion_status = 'COMPLETED';
                order.final_production_audit_json = params[2];
                order.metadata_json = params[3];
            } else if (sql.includes('DELIVERY_HANDOFF_READY')) {
                order.status = 'DELIVERY_HANDOFF_READY';
                order.delivery_handoff_status = 'DELIVERY_HANDOFF_READY';
                order.delivery_handoff_ready_at = params[0];
                order.delivery_handoff_ready_by = params[1];
                order.metadata_json = params[2];
            }
        }
        return { affectedRows: 1 };
    }
    return [];
};

marketplaceOrderService.appendOrderEvent = async (orderId, event) => {
    // Strict Mutation Bypass Check: block appending events to non-mock order if not enabled
    if (orderId !== 'smoke-order-38-8' && !allowMutation) {
        throw new Error(`MUTATION_BLOCKED: Attempted to append event to real order ID "${orderId}" but PHASE_38_8_ALLOW_MUTATION is false.`);
    }

    eventLog.push({ orderId, event });
    return { ok: true };
};

// Require lifecycle service
const service = require('../src/api/services/marketplaceProductionLifecycleService');

function buildMockOrder(id, status, metadataExtra = {}, files = [], customer = {}) {
    const baseMetadata = {
        dispatch_package: {
            status: 'PRINTHOUSE_ACCEPTED',
            manifest: {
                invoice: { status: 'ISSUED' },
                payment: { status: 'PAYMENT_CONFIRMED' }
            }
        },
        production_unlock: { status: 'PRODUCTION_UNLOCKED' },
        production_queue: {
            status: 'MACHINE_ASSIGNED',
            machineAssignment: {
                machineId: 'machine_smoke_001',
                assignmentStatus: 'ASSIGNED'
            }
        },
        ...metadataExtra
    };
    return {
        order_id: id,
        status: status,
        metadata_json: JSON.stringify(baseMetadata),
        customer_json: JSON.stringify(customer),
        files: files
    };
}

async function runBusinessLogicSmokeTests() {
    console.log('\n--- Running Business Logic & State Transition Checks ---');

    // 1. Completion Eligibility - Success Case
    mockOrders = [];
    eventLog = [];
    
    const healthyFiles = [
        { file_id: 'f1', role: 'INTERIOR_PDF', storage_path: '/path/int.pdf', preflight_status: 'COMPLETED', status: 'ACTIVE' },
        { file_id: 'f2', role: 'COVER_PDF', storage_path: '/path/cov.pdf', preflight_status: 'COMPLETED', status: 'ACTIVE' }
    ];
    
    mockOrders.push(buildMockOrder('smoke-order-38-8', 'PRODUCTION_COMPLETION_READY', {}, healthyFiles));
    // Add file download event
    eventLog.push({ orderId: 'smoke-order-38-8', event: { type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' } });

    let compEligibility = await service.evaluateProductionCompletionEligibility('smoke-order-38-8');
    assert.equal(compEligibility.ok, true, 'Eligibility evaluation succeeds');
    assert.equal(compEligibility.eligible, true, 'Is eligible for completion');
    assert.equal(compEligibility.blockers.length, 0, 'No blockers');
    assert.equal(compEligibility.warnings.length, 0, 'No warnings');
    console.log('✅ Success Completion Eligibility check passed.');

    // 2. Complete Production Order - Success Case (and Event Logging / Audit Snapshot creation)
    let compResult = await service.completeProductionOrder('smoke-order-38-8', { actorId: 'op_test_1' });
    assert.equal(compResult.ok, true, 'Complete production execution succeeds');
    assert.equal(compResult.status, 'PRODUCTION_COMPLETED', 'Status updated to PRODUCTION_COMPLETED');
    assert.equal(mockOrders[0].status, 'PRODUCTION_COMPLETED', 'DB status updated');
    
    const finalAudit = compResult.audit;
    assert.equal(finalAudit.newStatus, 'PRODUCTION_COMPLETED');
    assert.equal(finalAudit.completedBy, 'op_test_1');
    assert.equal(finalAudit.filesVerified, true, 'Files verified in audit snapshot');
    assert.equal(finalAudit.paymentVerified, true, 'Payment verified in audit snapshot');
    
    assert(eventLog.some(e => e.orderId === 'smoke-order-38-8' && e.event.type === 'PRODUCTION_COMPLETED'), 'PRODUCTION_COMPLETED event logged');
    assert(eventLog.some(e => e.orderId === 'smoke-order-38-8' && e.event.type === 'PRODUCTION_COMPLETION_EXECUTED'), 'PRODUCTION_COMPLETION_EXECUTED event logged');
    console.log('✅ Complete Production execution check passed.');

    // 3. Complete Production Order - Idempotency Check
    let compIdempotent = await service.completeProductionOrder('smoke-order-38-8', { actorId: 'op_test_1' });
    assert.equal(compIdempotent.ok, true, 'Idempotent call succeeds');
    assert.equal(compIdempotent.idempotent, true, 'Indicates idempotency bypass');
    console.log('✅ Idempotency for completion checked.');

    // 4. Delivery Handoff Eligibility - Success Case
    const mockCustomer = {
        shippingAddress: {
            street: '123 Test St',
            city: 'Testville',
            country: 'Testland'
        }
    };
    mockOrders[0].customer_json = JSON.stringify(mockCustomer);
    
    let handoffEligibility = await service.evaluateDeliveryHandoffReadiness('smoke-order-38-8');
    assert.equal(handoffEligibility.ok, true, 'Handoff evaluation succeeds');
    assert.equal(handoffEligibility.eligible, true, 'Is eligible for delivery handoff');
    console.log('✅ Handoff eligibility check passed.');

    // 5. Prepare Delivery Handoff - Success Case
    let handoffResult = await service.prepareDeliveryHandoff('smoke-order-38-8', { actorId: 'op_test_1' });
    assert.equal(handoffResult.ok, true, 'Prepare handoff execution succeeds');
    assert.equal(handoffResult.status, 'DELIVERY_HANDOFF_READY', 'Status updated to DELIVERY_HANDOFF_READY');
    assert.equal(handoffResult.deliveryHandoffStatus, 'DELIVERY_HANDOFF_READY', 'Handoff status updated');
    assert.equal(mockOrders[0].status, 'DELIVERY_HANDOFF_READY', 'DB status updated');
    assert(eventLog.some(e => e.orderId === 'smoke-order-38-8' && e.event.type === 'DELIVERY_HANDOFF_READY'), 'DELIVERY_HANDOFF_READY event logged');
    console.log('✅ Prepare delivery handoff execution check passed.');

    // 6. Prepare Delivery Handoff - Idempotency Check
    let handoffIdempotent = await service.prepareDeliveryHandoff('smoke-order-38-8', { actorId: 'op_test_1' });
    assert.equal(handoffIdempotent.ok, true, 'Idempotent call succeeds');
    assert.equal(handoffIdempotent.idempotent, true, 'Indicates idempotency bypass');
    console.log('✅ Idempotency for handoff checked.');

    // 7. Break-glass override checks
    console.log('\n--- Checking Break-Glass Eligibility Override Logic ---');
    mockOrders = [];
    eventLog = [];
    
    // Create a blocked order (unlocked is pending)
    mockOrders.push(buildMockOrder('smoke-order-38-8', 'PRODUCTION_COMPLETION_READY', {
        production_unlock: { status: 'PENDING' }
    }, healthyFiles));

    let blockEligibility = await service.evaluateProductionCompletionEligibility('smoke-order-38-8');
    assert.equal(blockEligibility.eligible, false, 'Should be blocked');
    assert(blockEligibility.blockers.includes('PRODUCTION_NOT_UNLOCKED'), 'Contains expected blocker');

    // Executing completion without override fails
    let failExec = await service.completeProductionOrder('smoke-order-38-8', { actorId: 'op_test_2' });
    assert.equal(failExec.ok, false, 'Fails execution');
    assert.equal(failExec.code, 'PRODUCTION_COMPLETION_NOT_ELIGIBLE');

    // Executing completion with override but no reason fails
    let failOverride = await service.completeProductionOrder('smoke-order-38-8', { actorId: 'op_test_2' }, { overrideEligibility: true });
    assert.equal(failOverride.ok, false);
    assert.equal(failOverride.code, 'OVERRIDE_REASON_REQUIRED');

    // Executing completion with override and valid reason succeeds
    let successOverride = await service.completeProductionOrder('smoke-order-38-8', { actorId: 'op_test_2' }, { overrideEligibility: true, operatorReason: 'Critical maintenance bypass' });
    assert.equal(successOverride.ok, true, 'Override execution succeeds');
    assert.equal(successOverride.status, 'PRODUCTION_COMPLETED');
    assert.equal(successOverride.audit.overrideUsed, true, 'Audit records override usage');
    assert(eventLog.some(e => e.orderId === 'smoke-order-38-8' && e.event.type === 'PRODUCTION_COMPLETION_ELIGIBILITY_OVERRIDDEN'), 'Eligibility overridden audit event logged');
    
    const overrideEvent = eventLog.find(e => e.orderId === 'smoke-order-38-8' && e.event.type === 'PRODUCTION_COMPLETION_ELIGIBILITY_OVERRIDDEN');
    assert.equal(overrideEvent.event.payload.operatorReason, 'Critical maintenance bypass');
    assert.equal(overrideEvent.event.actorId, 'op_test_2');
    console.log('✅ Break-glass override validation checks passed.');

    // 8. Safe Mode Mutation Bypass Check
    console.log('\n--- Checking Safe Mode Mutation Safeguards ---');
    mockOrders = [];
    eventLog = [];
    
    // Create an order with real production order ID
    const realOrder = buildMockOrder('ord_999999', 'PRODUCTION_COMPLETION_READY', {}, healthyFiles);
    mockOrders.push(realOrder);
    
    // Call completeProductionOrder on real order ID without the env bypass
    await assert.rejects(
        service.completeProductionOrder('ord_999999', { actorId: 'op_test_3' }),
        /MUTATION_BLOCKED: Attempted to (mutate real order|append event to real order)/,
        'Should block mutation of real order IDs by default'
    );
    console.log('✅ Safe mode mutation safeguard blocks mutation of real order ID.');

    console.log('\n========================================================');
    console.log('STATUS: READY');
    console.log('BLOCKERS: NONE');
    console.log('========================================================');
}

runBusinessLogicSmokeTests().catch(err => {
    console.error('\n❌ Smoke Test failed:', err);
    process.exit(1);
});
