/**
 * src/api/services/marketplaceProductionWorkOrderService.js
 * 
 * Phase 38.6 — Production Start / Work Order Execution Gate Service
 */

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('marketplace-production-work-order');

function safeParseJson(str, fallback = {}) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

function checkFeatureFlag() {
    if (process.env.PPOS_ENABLE_PHASE38_WORK_ORDER_EXECUTION !== 'true') {
        throw new Error('PHASE38_WORK_ORDER_EXECUTION_DISABLED');
    }
}

/**
 * Evaluates whether an order is eligible for the production work order.
 */
async function evaluateWorkOrderEligibility(orderId, options = {}) {
    logger.info({ event: 'PRODUCTION_WORK_ORDER_EVALUATING', orderId });

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});
    const dispatchPackage = metadata.dispatch_package;

    const blockers = [];
    const warnings = [];

    // Check if cancelled
    const isCancelled = order.status === 'PRODUCTION_CANCELLED' || 
                        (metadata.production_work_order && metadata.production_work_order.status === 'PRODUCTION_CANCELLED');

    if (isCancelled) {
        blockers.push('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    // Allowed statuses
    const allowedStatuses = ['MACHINE_ASSIGNED', 'WORK_ORDER_CREATED', 'PRODUCTION_STARTED', 'PRODUCTION_PAUSED', 'PRODUCTION_CANCELLED'];
    if (!allowedStatuses.includes(order.status)) {
        blockers.push('INVALID_ORDER_STATUS_FOR_WORK_ORDER');
    }

    // Dispatch package validation
    if (!dispatchPackage) {
        blockers.push('HANDOFF_PACKAGE_NOT_FOUND');
    } else if (dispatchPackage.status !== 'PRINTHOUSE_ACCEPTED') {
        blockers.push('DISPATCH_PACKAGE_NOT_ACCEPTED');
    }

    // Manifest details
    const manifest = dispatchPackage?.manifest || {};
    const invoice = manifest.invoice || {};
    const payment = manifest.payment || {};
    const productionUnlock = metadata.production_unlock || {};
    const productionDecision = metadata.production_decision || {};
    const productionQueue = metadata.production_queue || {};

    if (invoice.status !== 'ISSUED') {
        blockers.push('INVOICE_NOT_ISSUED');
    }
    if (payment.status !== 'PAYMENT_CONFIRMED') {
        blockers.push('PAYMENT_NOT_CONFIRMED');
    }
    if (productionUnlock.status !== 'PRODUCTION_UNLOCKED') {
        blockers.push('PRODUCTION_NOT_UNLOCKED');
    }
    if (productionDecision.decision !== 'PRODUCTION_ACCEPTED') {
        blockers.push('PRODUCTION_DECISION_NOT_ACCEPTED');
    }

    // Queue status: must be MACHINE_ASSIGNED to start, unless we have already created the work order
    const isAlreadyStartedOrCreated = ['WORK_ORDER_CREATED', 'PRODUCTION_STARTED', 'PRODUCTION_PAUSED', 'PRODUCTION_CANCELLED'].includes(order.status);
    if (!isAlreadyStartedOrCreated) {
        if (productionQueue.status !== 'MACHINE_ASSIGNED') {
            blockers.push('PRODUCTION_QUEUE_NOT_ASSIGNED');
        }
    }

    // Machine Assignment
    const machineAssignment = productionQueue.machineAssignment || {};
    const activeMachineId = options.machineId || machineAssignment.machineId || (metadata.production_work_order && metadata.production_work_order.machineId);

    if (!isAlreadyStartedOrCreated) {
        if (machineAssignment.assignmentStatus !== 'ASSIGNED' || !activeMachineId) {
            blockers.push('MACHINE_NOT_ASSIGNED');
        }
    }

    // Warnings: Download audit check
    const events = await mysqlClient.query(
        'SELECT type FROM marketplace_order_events WHERE order_id = ? AND type = "PRINTHOUSE_FILE_DOWNLOAD_COMPLETED"',
        [orderId]
    );
    const hasDownloadCompleted = events && events.length > 0;
    if (!hasDownloadCompleted) {
        warnings.push('FILE_ACCESS_NOT_VERIFIED_BY_AUDIT');
    }

    // Warnings: Active Machine Profile check
    if (activeMachineId) {
        const machines = await mysqlClient.query(
            'SELECT id, status FROM print_node_machine_profiles WHERE id = ?',
            [activeMachineId]
        );
        if (!machines || machines.length === 0 || machines[0].status !== 'ACTIVE') {
            warnings.push('MACHINE_REGISTRY_NOT_VERIFIED');
        }
    } else {
        warnings.push('MACHINE_REGISTRY_NOT_VERIFIED');
    }

    return {
        ok: true,
        orderId,
        eligible: blockers.length === 0,
        blockers,
        warnings,
        orderStatus: order.status,
        machineId: activeMachineId || null,
        metadata: {
            dispatchPackageStatus: dispatchPackage?.status || null,
            invoiceStatus: invoice.status || null,
            paymentStatus: payment.status || null,
            productionUnlockStatus: productionUnlock.status || null,
            productionDecision: productionDecision.decision || null,
            productionQueueStatus: productionQueue.status || null,
            isCancelled
        }
    };
}

/**
 * Creates the production work order (transitions status to WORK_ORDER_CREATED).
 */
async function createProductionWorkOrder(orderId, payload = {}, options = {}) {
    checkFeatureFlag();
    logger.info({ event: 'CREATING_PRODUCTION_WORK_ORDER', orderId, payload });

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    if (order.status === 'PRODUCTION_CANCELLED' || (metadata.production_work_order && metadata.production_work_order.status === 'PRODUCTION_CANCELLED')) {
        throw new Error('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    if (['WORK_ORDER_CREATED', 'PRODUCTION_STARTED', 'PRODUCTION_PAUSED'].includes(order.status) && metadata.production_work_order) {
        return {
            ok: true,
            idempotent: true,
            productionWorkOrder: metadata.production_work_order,
            status: order.status
        };
    }

    const evalResult = await evaluateWorkOrderEligibility(orderId, options);
    if (!evalResult.eligible) {
        throw new Error('PRODUCTION_WORK_ORDER_CREATION_BLOCKED');
    }

    const createdAt = new Date().toISOString();
    const createdBy = options.operatorId || 'SYSTEM';
    const workOrderId = `wo_${orderId.replace('ord_', '')}_${Date.now()}`;

    const production_work_order = {
        phase: '38.6',
        status: 'WORK_ORDER_CREATED',
        workOrderId,
        machineId: evalResult.machineId,
        createdAt,
        createdBy,
        start: null,
        pauseHistory: [],
        resumeHistory: [],
        cancel: null
    };

    metadata.production_work_order = production_work_order;

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "WORK_ORDER_CREATED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_WORK_ORDER_CREATED',
            actorId: createdBy,
            payload: {
                phase: '38.6',
                status: 'WORK_ORDER_CREATED',
                workOrderId,
                machineId: evalResult.machineId,
                createdAt,
                createdBy
            }
        });
    }

    return {
        ok: true,
        productionWorkOrder: production_work_order,
        status: 'WORK_ORDER_CREATED'
    };
}

/**
 * Gets production work order status.
 */
async function getProductionWorkOrderStatus(orderId, options = {}) {
    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    return {
        ok: true,
        orderId,
        orderStatus: order.status,
        productionWorkOrder: metadata.production_work_order || null
    };
}

/**
 * Starts the production work order.
 */
async function startProductionWorkOrder(orderId, payload = {}, options = {}) {
    checkFeatureFlag();
    logger.info({ event: 'STARTING_PRODUCTION_WORK_ORDER', orderId, payload });

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    if (order.status === 'PRODUCTION_CANCELLED' || (metadata.production_work_order && metadata.production_work_order.status === 'PRODUCTION_CANCELLED')) {
        throw new Error('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    if (!metadata.production_work_order) {
        throw new Error('PRODUCTION_WORK_ORDER_NOT_FOUND');
    }

    if (order.status === 'PRODUCTION_STARTED' && metadata.production_work_order.status === 'PRODUCTION_STARTED') {
        return {
            ok: true,
            idempotent: true,
            productionWorkOrder: metadata.production_work_order,
            status: order.status
        };
    }

    if (metadata.production_work_order.status !== 'WORK_ORDER_CREATED') {
        throw new Error('INVALID_WORK_ORDER_STATUS');
    }

    const startedAt = new Date().toISOString();
    const startedBy = options.operatorId || 'SYSTEM';

    metadata.production_work_order.status = 'PRODUCTION_STARTED';
    metadata.production_work_order.start = {
        startedAt,
        startedBy,
        shiftId: payload.shiftId || null,
        batchReference: payload.batchReference || null,
        operatorNote: payload.operatorNote || null,
        estimatedCompletionAt: payload.estimatedCompletionAt || null
    };

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_STARTED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_WORK_ORDER_STARTED',
            actorId: startedBy,
            payload: {
                phase: '38.6',
                status: 'PRODUCTION_STARTED',
                startedAt,
                startedBy,
                shiftId: payload.shiftId || null,
                batchReference: payload.batchReference || null,
                estimatedCompletionAt: payload.estimatedCompletionAt || null
            }
        });
    }

    return {
        ok: true,
        productionWorkOrder: metadata.production_work_order,
        status: 'PRODUCTION_STARTED'
    };
}

/**
 * Pauses the production work order.
 */
async function pauseProductionWorkOrder(orderId, payload = {}, options = {}) {
    checkFeatureFlag();
    logger.info({ event: 'PAUSING_PRODUCTION_WORK_ORDER', orderId, payload });

    if (!payload.reason) {
        throw new Error('PAUSE_REASON_REQUIRED');
    }

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    if (order.status === 'PRODUCTION_CANCELLED' || (metadata.production_work_order && metadata.production_work_order.status === 'PRODUCTION_CANCELLED')) {
        throw new Error('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    if (!metadata.production_work_order) {
        throw new Error('PRODUCTION_WORK_ORDER_NOT_FOUND');
    }

    if (order.status === 'PRODUCTION_PAUSED' && metadata.production_work_order.status === 'PRODUCTION_PAUSED') {
        return {
            ok: true,
            idempotent: true,
            productionWorkOrder: metadata.production_work_order,
            status: order.status
        };
    }

    if (metadata.production_work_order.status !== 'PRODUCTION_STARTED') {
        throw new Error('INVALID_WORK_ORDER_STATUS');
    }

    const pausedAt = new Date().toISOString();
    const pausedBy = options.operatorId || 'SYSTEM';

    metadata.production_work_order.status = 'PRODUCTION_PAUSED';
    if (!metadata.production_work_order.pauseHistory) {
        metadata.production_work_order.pauseHistory = [];
    }
    metadata.production_work_order.pauseHistory.push({
        pausedAt,
        pausedBy,
        reason: payload.reason,
        note: payload.note || null
    });

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_PAUSED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_WORK_ORDER_PAUSED',
            actorId: pausedBy,
            payload: {
                phase: '38.6',
                status: 'PRODUCTION_PAUSED',
                pausedAt,
                pausedBy,
                reason: payload.reason,
                note: payload.note || null
            }
        });
    }

    return {
        ok: true,
        productionWorkOrder: metadata.production_work_order,
        status: 'PRODUCTION_PAUSED'
    };
}

/**
 * Resumes the production work order.
 */
async function resumeProductionWorkOrder(orderId, payload = {}, options = {}) {
    checkFeatureFlag();
    logger.info({ event: 'RESUMING_PRODUCTION_WORK_ORDER', orderId, payload });

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    if (order.status === 'PRODUCTION_CANCELLED' || (metadata.production_work_order && metadata.production_work_order.status === 'PRODUCTION_CANCELLED')) {
        throw new Error('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    if (!metadata.production_work_order) {
        throw new Error('PRODUCTION_WORK_ORDER_NOT_FOUND');
    }

    if (order.status === 'PRODUCTION_STARTED' && metadata.production_work_order.status === 'PRODUCTION_STARTED') {
        return {
            ok: true,
            idempotent: true,
            productionWorkOrder: metadata.production_work_order,
            status: order.status
        };
    }

    if (metadata.production_work_order.status !== 'PRODUCTION_PAUSED') {
        throw new Error('INVALID_WORK_ORDER_STATUS');
    }

    const resumedAt = new Date().toISOString();
    const resumedBy = options.operatorId || 'SYSTEM';

    metadata.production_work_order.status = 'PRODUCTION_STARTED';
    if (!metadata.production_work_order.resumeHistory) {
        metadata.production_work_order.resumeHistory = [];
    }
    metadata.production_work_order.resumeHistory.push({
        resumedAt,
        resumedBy,
        note: payload.note || null
    });

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_STARTED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_WORK_ORDER_RESUMED',
            actorId: resumedBy,
            payload: {
                phase: '38.6',
                status: 'PRODUCTION_STARTED',
                resumedAt,
                resumedBy,
                note: payload.note || null
            }
        });
    }

    return {
        ok: true,
        productionWorkOrder: metadata.production_work_order,
        status: 'PRODUCTION_STARTED'
    };
}

/**
 * Cancels the production work order (transitions status to PRODUCTION_CANCELLED).
 */
async function cancelProductionWorkOrder(orderId, payload = {}, options = {}) {
    checkFeatureFlag();
    logger.info({ event: 'CANCELLING_PRODUCTION_WORK_ORDER', orderId, payload });

    if (!payload.reason) {
        throw new Error('CANCEL_REASON_REQUIRED');
    }

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    if (order.status === 'PRODUCTION_CANCELLED' || (metadata.production_work_order && metadata.production_work_order.status === 'PRODUCTION_CANCELLED')) {
        return {
            ok: true,
            idempotent: true,
            productionWorkOrder: metadata.production_work_order,
            status: 'PRODUCTION_CANCELLED'
        };
    }

    if (!metadata.production_work_order) {
        throw new Error('PRODUCTION_WORK_ORDER_NOT_FOUND');
    }

    const allowedCancelSources = ['WORK_ORDER_CREATED', 'PRODUCTION_STARTED', 'PRODUCTION_PAUSED'];
    if (!allowedCancelSources.includes(metadata.production_work_order.status)) {
        throw new Error('INVALID_WORK_ORDER_STATUS');
    }

    const cancelledAt = new Date().toISOString();
    const cancelledBy = options.operatorId || 'SYSTEM';

    metadata.production_work_order.status = 'PRODUCTION_CANCELLED';
    metadata.production_work_order.cancel = {
        cancelledAt,
        cancelledBy,
        reason: payload.reason,
        note: payload.note || null,
        commercialImpact: 'NONE',
        refundTriggered: false,
        invoiceCancelled: false
    };

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_CANCELLED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_WORK_ORDER_CANCELLED',
            actorId: cancelledBy,
            payload: {
                phase: '38.6',
                status: 'PRODUCTION_CANCELLED',
                cancelledAt,
                cancelledBy,
                reason: payload.reason,
                note: payload.note || null,
                commercialImpact: 'NONE',
                refundTriggered: false,
                invoiceCancelled: false
            }
        });
    }

    return {
        ok: true,
        productionWorkOrder: metadata.production_work_order,
        status: 'PRODUCTION_CANCELLED'
    };
}

module.exports = {
    evaluateWorkOrderEligibility,
    createProductionWorkOrder,
    getProductionWorkOrderStatus,
    startProductionWorkOrder,
    pauseProductionWorkOrder,
    resumeProductionWorkOrder,
    cancelProductionWorkOrder
};
