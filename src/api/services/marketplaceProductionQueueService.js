/**
 * src/api/services/marketplaceProductionQueueService.js
 * 
 * Phase 38.5 — Production Queue / Machine Assignment Gate
 */

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('marketplace-production-queue');

function safeParseJson(str, fallback = {}) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

/**
 * Evaluates whether an order is eligible for the production queue.
 */
async function evaluateProductionQueueEligibility(orderId, options = {}) {
    logger.info({ event: 'PRODUCTION_QUEUE_EVALUATING', orderId });

    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});
    const dispatchPackage = metadata.dispatch_package;

    if (!dispatchPackage) {
        throw new Error('HANDOFF_PACKAGE_NOT_FOUND');
    }

    // Eligibility check blockers
    const blockers = [];
    const warnings = [];

    // Order status must be PRODUCTION_ACCEPTED for initial queueing
    if (order.status !== 'PRODUCTION_ACCEPTED') {
        blockers.push('INVALID_ORDER_STATUS_FOR_QUEUE');
    }

    // Dispatch package status must be PRINTHOUSE_ACCEPTED
    if (dispatchPackage.status !== 'PRINTHOUSE_ACCEPTED') {
        blockers.push('DISPATCH_PACKAGE_NOT_ACCEPTED');
    }

    // Manifest checks
    const manifest = dispatchPackage.manifest || {};
    const invoice = manifest.invoice || {};
    const payment = manifest.payment || {};
    const productionUnlock = metadata.production_unlock || {};
    const productionDecision = metadata.production_decision || {};

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

    // Query audit events to check if file access was completed
    const events = await mysqlClient.query(
        'SELECT type FROM marketplace_order_events WHERE order_id = ? AND type = "PRINTHOUSE_FILE_DOWNLOAD_COMPLETED"',
        [orderId]
    );
    const hasDownloadCompleted = events && events.length > 0;
    if (!hasDownloadCompleted) {
        warnings.push('FILE_ACCESS_NOT_VERIFIED_BY_AUDIT');
    }

    // Check machine registry validation warning if machineId is provided
    const machineId = options.machineId;
    if (machineId) {
        const machines = await mysqlClient.query(
            'SELECT id FROM print_node_machine_profiles WHERE id = ? AND status = "ACTIVE"',
            [machineId]
        );
        if (!machines || machines.length === 0) {
            warnings.push('MACHINE_REGISTRY_NOT_VERIFIED');
        }
    }

    return {
        ok: true,
        orderId,
        eligible: blockers.length === 0,
        blockers,
        warnings,
        orderStatus: order.status,
        metadata: {
            dispatchPackageStatus: dispatchPackage.status,
            invoiceStatus: invoice.status,
            paymentStatus: payment.status,
            productionUnlockStatus: productionUnlock.status,
            productionDecision: productionDecision.decision
        }
    };
}

/**
 * Creates a production queue entry, transitioning order status to PRODUCTION_QUEUED or MACHINE_ASSIGNED.
 */
async function createProductionQueueEntry(orderId, payload = {}, options = {}) {
    logger.info({ event: 'CREATING_PRODUCTION_QUEUE_ENTRY', orderId, payload });

    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    // Idempotency: if already queued or machine assigned, return existing entry
    if ((order.status === 'PRODUCTION_QUEUED' || order.status === 'MACHINE_ASSIGNED') && metadata.production_queue) {
        return {
            ok: true,
            idempotent: true,
            productionQueue: metadata.production_queue,
            status: order.status
        };
    }

    // Evaluate eligibility
    const evalResult = await evaluateProductionQueueEligibility(orderId, {
        machineId: payload.machineId,
        operatorId: options.operatorId
    });

    if (!evalResult.eligible) {
        throw new Error('PRODUCTION_QUEUE_CREATION_BLOCKED');
    }

    const queuedAt = new Date().toISOString();
    const queuedBy = options.operatorId || 'SYSTEM';
    const warnings = evalResult.warnings;

    const production_queue = {
        phase: '38.5',
        status: 'PRODUCTION_QUEUED',
        queuedAt,
        queuedBy,
        warnings,
        machineAssignment: {
            machineId: null,
            assignedAt: null,
            assignedBy: null,
            assignmentStatus: 'UNASSIGNED',
            history: []
        }
    };

    const hasMachineId = !!payload.machineId;
    let assignedAt = null;
    let assignedBy = null;
    if (hasMachineId) {
        assignedAt = new Date().toISOString();
        assignedBy = options.operatorId || 'SYSTEM';
        production_queue.status = 'MACHINE_ASSIGNED';
        production_queue.machineAssignment = {
            machineId: payload.machineId,
            assignedAt,
            assignedBy,
            assignmentStatus: 'ASSIGNED',
            history: [{
                action: 'ASSIGN',
                machineId: payload.machineId,
                timestamp: assignedAt,
                operatorId: assignedBy,
                note: payload.note || ''
            }]
        };
    }

    const newStatus = production_queue.status;
    metadata.production_queue = production_queue;

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), newStatus, orderId]
    );

    // Emit audit events
    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_QUEUE_ENTRY_CREATED',
            actorId: queuedBy,
            payload: {
                phase: '38.5',
                status: 'PRODUCTION_QUEUED',
                queuedAt,
                queuedBy,
                warnings
            }
        });

        if (hasMachineId) {
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'PRODUCTION_MACHINE_ASSIGNED',
                actorId: assignedBy,
                payload: {
                    phase: '38.5',
                    machineId: payload.machineId,
                    assignedAt,
                    assignedBy,
                    note: payload.note || '',
                    warnings
                }
            });
        }
    }

    return {
        ok: true,
        productionQueue: production_queue,
        status: newStatus
    };
}

/**
 * Gets production queue status for an order.
 */
async function getProductionQueueStatus(orderId, options = {}) {
    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    return {
        ok: true,
        orderId,
        orderStatus: order.status,
        productionQueue: metadata.production_queue || null
    };
}

/**
 * Assigns a machine to a queued order.
 */
async function assignProductionMachine(orderId, machineId, payload = {}, options = {}) {
    logger.info({ event: 'ASSIGNING_PRODUCTION_MACHINE', orderId, machineId, payload });

    if (!machineId) {
        throw new Error('MACHINE_ID_REQUIRED');
    }

    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    if (!metadata.production_queue) {
        throw new Error('PRODUCTION_QUEUE_ENTRY_NOT_FOUND');
    }

    if (order.status !== 'PRODUCTION_QUEUED' && order.status !== 'MACHINE_ASSIGNED') {
        throw new Error('INVALID_ORDER_STATUS_FOR_ASSIGNMENT');
    }

    const currentAssignment = metadata.production_queue.machineAssignment || {};
    if (currentAssignment.machineId === machineId && currentAssignment.assignmentStatus === 'ASSIGNED') {
        return {
            ok: true,
            idempotent: true,
            productionQueue: metadata.production_queue,
            status: order.status
        };
    }

    const assignedAt = new Date().toISOString();
    const assignedBy = options.operatorId || 'SYSTEM';
    const note = payload.note || '';

    // Check machine registry validation warning
    const warnings = [...(metadata.production_queue.warnings || [])];
    const machines = await mysqlClient.query(
        'SELECT id FROM print_node_machine_profiles WHERE id = ? AND status = "ACTIVE"',
        [machineId]
    );
    if ((!machines || machines.length === 0) && !warnings.includes('MACHINE_REGISTRY_NOT_VERIFIED')) {
        warnings.push('MACHINE_REGISTRY_NOT_VERIFIED');
    }

    metadata.production_queue.status = 'MACHINE_ASSIGNED';
    metadata.production_queue.warnings = warnings;
    metadata.production_queue.machineAssignment = {
        machineId,
        assignedAt,
        assignedBy,
        assignmentStatus: 'ASSIGNED',
        history: [
            ...(currentAssignment.history || []),
            {
                action: 'ASSIGN',
                machineId,
                timestamp: assignedAt,
                operatorId: assignedBy,
                note
            }
        ]
    };

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "MACHINE_ASSIGNED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_MACHINE_ASSIGNED',
            actorId: assignedBy,
            payload: {
                phase: '38.5',
                machineId,
                assignedAt,
                assignedBy,
                note,
                warnings
            }
        });
    }

    return {
        ok: true,
        productionQueue: metadata.production_queue,
        status: 'MACHINE_ASSIGNED'
    };
}

/**
 * Unassigns a machine from a queued order, returning status to PRODUCTION_QUEUED.
 */
async function unassignProductionMachine(orderId, payload = {}, options = {}) {
    logger.info({ event: 'UNASSIGNING_PRODUCTION_MACHINE', orderId, payload });

    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    if (!metadata.production_queue) {
        throw new Error('PRODUCTION_QUEUE_ENTRY_NOT_FOUND');
    }

    const currentAssignment = metadata.production_queue.machineAssignment || {};
    if (order.status === 'PRODUCTION_QUEUED' && currentAssignment.assignmentStatus === 'UNASSIGNED') {
        return {
            ok: true,
            idempotent: true,
            productionQueue: metadata.production_queue,
            status: order.status
        };
    }

    if (order.status !== 'MACHINE_ASSIGNED') {
        throw new Error('INVALID_ORDER_STATUS_FOR_UNASSIGNMENT');
    }

    const unassignedAt = new Date().toISOString();
    const unassignedBy = options.operatorId || 'SYSTEM';
    const reason = payload.reason || '';

    metadata.production_queue.status = 'PRODUCTION_QUEUED';
    metadata.production_queue.machineAssignment = {
        machineId: null,
        assignedAt: null,
        assignedBy: null,
        assignmentStatus: 'UNASSIGNED',
        history: [
            ...(currentAssignment.history || []),
            {
                action: 'UNASSIGN',
                timestamp: unassignedAt,
                operatorId: unassignedBy,
                reason
            }
        ]
    };

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_QUEUED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_MACHINE_UNASSIGNED',
            actorId: unassignedBy,
            payload: {
                phase: '38.5',
                unassignedAt,
                unassignedBy,
                reason
            }
        });
    }

    return {
        ok: true,
        productionQueue: metadata.production_queue,
        status: 'PRODUCTION_QUEUED'
    };
}

module.exports = {
    evaluateProductionQueueEligibility,
    createProductionQueueEntry,
    getProductionQueueStatus,
    assignProductionMachine,
    unassignProductionMachine
};
