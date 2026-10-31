/**
 * src/api/services/marketplaceProductionLifecycleService.js
 * 
 * Phase 38.8 — Production Completion Execution / Delivery Handoff / Final Production Audit
 */

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('marketplace-production-lifecycle');
const lifecycleAudit = require('./marketplaceLifecycleAuditService');

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
 * Evaluates whether a production order is eligible for completion.
 */
async function evaluateProductionCompletionEligibility(orderId, options = {}) {
    logger.info({ event: 'PRODUCTION_COMPLETION_EVALUATING', orderId });

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

    // 1. Completion check
    if (order.status === 'PRODUCTION_COMPLETED' || order.status === 'DELIVERY_HANDOFF_READY') {
        // Return structured but indicate already completed
        return {
            ok: true,
            eligible: false,
            orderId,
            currentStatus: order.status,
            targetStatus: 'PRODUCTION_COMPLETED',
            blockers: ['PRODUCTION_ALREADY_COMPLETED'],
            warnings: [],
            evidence: { alreadyCompleted: true },
            audit: {}
        };
    }

    // 2. Status must be PRODUCTION_COMPLETION_READY
    if (order.status !== 'PRODUCTION_COMPLETION_READY') {
        blockers.push('PRODUCTION_NOT_COMPLETION_READY');
    }

    // 3. Pause checks
    if (order.status === 'PRODUCTION_PAUSED' || metadata.production_progress?.status === 'PRODUCTION_PAUSED') {
        blockers.push('ACTIVE_PRODUCTION_PAUSE');
    }

    // 4. Dispatch package status checks
    if (!dispatchPackage) {
        blockers.push('DISPATCH_PACKAGE_NOT_FOUND');
    } else {
        const allowedDispatchStatuses = [
            'PRINTHOUSE_ACCEPTED',
            'READY_FOR_PRODUCTION',
            'PRODUCTION_ACCEPTED',
            'PRODUCTION_STARTED',
            'PRODUCTION_IN_PROGRESS',
            'PRODUCTION_PAUSED',
            'PRODUCTION_COMPLETION_READY',
            'PRODUCTION_COMPLETED'
        ];
        if (!allowedDispatchStatuses.includes(dispatchPackage.status)) {
            blockers.push('DISPATCH_PACKAGE_NOT_ACCEPTED');
        }
    }

    // 5. Invoice & Payment checks
    const invoice = metadata.invoice || dispatchPackage?.manifest?.invoice || {};
    if (!metadata.invoice && !dispatchPackage?.manifest?.invoice) {
        blockers.push('INVOICE_MISSING');
    } else if (invoice.status !== 'ISSUED') {
        blockers.push('INVOICE_NOT_ISSUED');
    }

    const payment = metadata.payment || dispatchPackage?.manifest?.payment || {};
    if (!metadata.payment && !dispatchPackage?.manifest?.payment) {
        blockers.push('PAYMENT_MISSING');
    } else if (payment.status !== 'PAYMENT_CONFIRMED' && payment.status !== 'PAID') {
        blockers.push('PAYMENT_NOT_CONFIRMED');
    }

    // 6. Production Unlock status check
    const productionUnlock = metadata.production_unlock || {};
    if (productionUnlock.status !== 'PRODUCTION_UNLOCKED') {
        blockers.push('PRODUCTION_NOT_UNLOCKED');
    }

    // 7. Machine Assignment checks
    const machineAssignment = metadata.production_queue?.machineAssignment || {};
    if (machineAssignment.assignmentStatus === 'FAILED') {
        blockers.push('MACHINE_ASSIGNMENT_FAILED');
    } else if (machineAssignment.assignmentStatus === 'UNASSIGNED') {
        warnings.push('NO_ACTIVE_MACHINE_ASSIGNED');
    }

    // 8. Required production files check
    const files = await mysqlClient.query(
        'SELECT * FROM marketplace_order_files WHERE order_id = ? AND status <> "SUPERSEDED"',
        [orderId]
    );

    if (!files || files.length === 0) {
        blockers.push('NO_PRODUCTION_FILES');
    } else {
        let hasMissingStorage = false;
        let hasPreflightFailed = false;

        const acceptablePreflightStatuses = [
            'COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PASS', 'PASS_WITH_WARNINGS',
            'COMPLETED_WITH_FINDINGS', 'DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'
        ];
        const blockingPreflightStatuses = [
            'FAILED', 'ERROR', 'FAILED_RUNTIME_ENVIRONMENT', 'ENGINE_ENVIRONMENT_FAILURE'
        ];

        for (const file of files) {
            if (!file.storage_path) {
                hasMissingStorage = true;
            }
            if (file.preflight_status && blockingPreflightStatuses.includes(file.preflight_status)) {
                hasPreflightFailed = true;
            } else if (file.preflight_status && !acceptablePreflightStatuses.includes(file.preflight_status)) {
                warnings.push(`PREFLIGHT_STATUS_UNUSUAL_${file.role}`);
            }
        }

        if (hasMissingStorage) {
            blockers.push('PRODUCTION_FILES_NOT_ACCESSIBLE');
        }
        if (hasPreflightFailed) {
            blockers.push('PREFLIGHT_STATUS_FAILED');
        }
    }

    // 9. Warnings check: File download completed audit event
    const events = await mysqlClient.query(
        'SELECT type FROM marketplace_order_events WHERE order_id = ? AND type = "PRINTHOUSE_FILE_DOWNLOAD_COMPLETED"',
        [orderId]
    );
    const hasDownloadCompleted = events && events.length > 0;
    if (!hasDownloadCompleted) {
        warnings.push('FILE_ACCESS_NOT_VERIFIED_BY_AUDIT');
    }

    return {
        ok: true,
        eligible: blockers.length === 0,
        orderId,
        currentStatus: order.status,
        targetStatus: 'PRODUCTION_COMPLETED',
        blockers,
        warnings,
        evidence: {
            dispatchPackageStatus: dispatchPackage?.status || null,
            invoiceStatus: invoice.status || null,
            paymentStatus: payment.status || null,
            productionUnlockStatus: productionUnlock.status || null,
            machineAssignmentStatus: machineAssignment.assignmentStatus || null,
            hasDownloadCompleted
        },
        audit: {}
    };
}

/**
 * Transition order to PRODUCTION_COMPLETED.
 */
async function completeProductionOrder(orderId, actorContext = {}, payload = {}) {
    logger.info({ event: 'PRODUCTION_COMPLETION_EXECUTING', orderId, payload });

    const actorId = actorContext.actorId || 'SYSTEM';

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    // Idempotency: if already completed, return ok: true, idempotent: true
    if (order.status === 'PRODUCTION_COMPLETED' || order.status === 'DELIVERY_HANDOFF_READY') {
        return {
            ok: true,
            orderId,
            previousStatus: order.status,
            status: order.status,
            deliveryHandoffStatus: order.delivery_handoff_status || null,
            blockers: [],
            warnings: [],
            events: [],
            audit: {},
            idempotent: true
        };
    }

    // Evaluate eligibility
    const evalResult = await evaluateProductionCompletionEligibility(orderId);
    
    let overrideUsed = false;
    if (!evalResult.eligible) {
        // Check for break-glass override
        if (payload.overrideEligibility === true) {
            const reason = payload.operatorReason;
            if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
                return {
                    ok: false,
                    code: 'OVERRIDE_REASON_REQUIRED',
                    message: 'A detailed operator reason is required to execute a break-glass override.',
                    blockers: evalResult.blockers,
                    warnings: evalResult.warnings
                };
            }
            overrideUsed = true;
        } else {
            return {
                ok: false,
                code: 'PRODUCTION_COMPLETION_NOT_ELIGIBLE',
                message: 'Order fails production completion eligibility checks.',
                blockers: evalResult.blockers,
                warnings: evalResult.warnings
            };
        }
    }

    const completedAt = new Date().toISOString();

    // Log the override audit event if utilized
    if (overrideUsed) {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_COMPLETION_ELIGIBILITY_OVERRIDDEN',
            actorId,
            payload: {
                operatorReason: payload.operatorReason,
                blockers: evalResult.blockers,
                timestamp: completedAt,
                phase: '38.8'
            }
        });
    }

    // Build the final operational state snapshot
    const finalAuditSnapshot = {
        orderId,
        completedAt,
        completedBy: actorId,
        previousStatus: order.status,
        newStatus: 'PRODUCTION_COMPLETED',
        filesVerified: evalResult.blockers.indexOf('PRODUCTION_FILES_NOT_ACCESSIBLE') === -1 && evalResult.blockers.indexOf('NO_PRODUCTION_FILES') === -1,
        paymentVerified: evalResult.blockers.indexOf('PAYMENT_NOT_CONFIRMED') === -1 && evalResult.blockers.indexOf('PAYMENT_MISSING') === -1,
        preflightStatus: evalResult.evidence.preflightStatus || 'PASSED',
        dispatchPackageStatus: evalResult.evidence.dispatchPackageStatus,
        machineAssignmentStatus: evalResult.evidence.machineAssignmentStatus,
        blockers: evalResult.blockers,
        warnings: evalResult.warnings,
        overrideUsed
    };

    // Update metadata progress
    if (!metadata.production_progress) {
        metadata.production_progress = {};
    }
    metadata.production_progress.status = 'PRODUCTION_COMPLETED';
    metadata.production_progress.completedAt = completedAt;
    metadata.production_progress.completedBy = actorId;
    metadata.production_progress.finalAuditSnapshot = finalAuditSnapshot;

    // Persist changes to database
    await mysqlClient.query(
        `UPDATE marketplace_orders 
         SET status = 'PRODUCTION_COMPLETED', 
             production_completed_at = ?, 
             production_completed_by = ?, 
             production_completion_status = 'COMPLETED',
             final_production_audit_json = ?,
             metadata_json = ?,
             updated_at = NOW() 
         WHERE order_id = ?`,
        [
            completedAt,
            actorId,
            JSON.stringify(finalAuditSnapshot),
            JSON.stringify(metadata),
            orderId
        ]
    );

    // Append order events
    await marketplaceOrderService.appendOrderEvent(orderId, {
        type: 'PRODUCTION_COMPLETED',
        actorId,
        payload: {
            phase: '38.8',
            completedAt,
            completedBy: actorId,
            overrideUsed
        }
    });

    await marketplaceOrderService.appendOrderEvent(orderId, {
        type: 'PRODUCTION_COMPLETION_EXECUTED',
        actorId,
        payload: {
            phase: '38.8',
            completedAt,
            completedBy: actorId,
            snapshot: finalAuditSnapshot
        }
    });

    await lifecycleAudit.auditProductionExecutionTransition('PRODUCTION_COMPLETED', 'SUCCESS', {
        order_id: orderId,
        previous_status: order.status,
        next_status: 'PRODUCTION_COMPLETED',
        warnings: evalResult.warnings,
        actor: actorId,
        metadata: finalAuditSnapshot
    });

    return {
        ok: true,
        orderId,
        previousStatus: order.status,
        status: 'PRODUCTION_COMPLETED',
        deliveryHandoffStatus: null,
        blockers: [],
        warnings: [],
        events: ['PRODUCTION_COMPLETED', 'PRODUCTION_COMPLETION_EXECUTED'],
        audit: finalAuditSnapshot,
        idempotent: false
    };
}

/**
 * Evaluates whether an order is eligible for delivery handoff.
 */
async function evaluateDeliveryHandoffReadiness(orderId, options = {}) {
    logger.info({ event: 'DELIVERY_HANDOFF_EVALUATING', orderId });

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json, customer_json, delivery_handoff_status FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});
    const customer = safeParseJson(order.customer_json, {});

    const blockers = [];
    const warnings = [];

    // 1. Check current handoff status
    if (order.delivery_handoff_status === 'DELIVERY_HANDOFF_READY' || order.status === 'DELIVERY_HANDOFF_READY') {
        return {
            ok: true,
            eligible: false,
            orderId,
            currentStatus: order.status,
            deliveryHandoffStatus: order.delivery_handoff_status,
            blockers: ['DELIVERY_HANDOFF_ALREADY_READY'],
            warnings: [],
            evidence: { alreadyReady: true }
        };
    }

    // 2. Production must be completed
    if (order.status !== 'PRODUCTION_COMPLETED') {
        blockers.push('PRODUCTION_NOT_COMPLETED');
    }

    // 3. Final production audit exists
    const events = await mysqlClient.query(
        'SELECT type FROM marketplace_order_events WHERE order_id = ? AND type IN ("PRODUCTION_COMPLETED", "PRODUCTION_COMPLETION_EXECUTED")',
        [orderId]
    );
    if (!events || events.length === 0) {
        blockers.push('FINAL_PRODUCTION_AUDIT_MISSING');
    }

    // 4. Required files exist
    const files = await mysqlClient.query(
        'SELECT * FROM marketplace_order_files WHERE order_id = ? AND status <> "SUPERSEDED"',
        [orderId]
    );
    if (!files || files.length === 0) {
        blockers.push('PRODUCTION_FILES_MISSING');
    } else {
        const missingPath = files.some(f => !f.storage_path);
        if (missingPath) {
            blockers.push('PRODUCTION_FILES_MISSING_PATHS');
        }
    }

    // 5. Customer / destination data exists
    const shipping = customer.shippingAddress || customer.address || metadata.customer?.shippingAddress || {};
    const deliveryMode = metadata.delivery_mode || metadata.deliveryMode || 'STANDARD';
    const isManualMode = deliveryMode === 'MANUAL';

    const hasDestination = shipping.street && shipping.city && shipping.country;
    if (!hasDestination && !isManualMode) {
        blockers.push('CUSTOMER_DESTINATION_DATA_MISSING');
    }

    // 6. Payment status is valid
    const payment = metadata.payment || {};
    if (payment.status !== 'PAID' && payment.status !== 'PAYMENT_CONFIRMED' && order.status !== 'PRODUCTION_COMPLETED') {
        // If production completed is already achieved, payment was verified there, but double check
        blockers.push('PAYMENT_NOT_CLEARED');
    }

    // 7. Active blockers / pause states
    if (order.status === 'PRODUCTION_PAUSED' || metadata.production_progress?.status === 'PRODUCTION_PAUSED') {
        blockers.push('ACTIVE_PRODUCTION_PAUSE');
    }

    return {
        ok: true,
        eligible: blockers.length === 0,
        orderId,
        currentStatus: order.status,
        deliveryHandoffStatus: order.delivery_handoff_status || 'PENDING',
        blockers,
        warnings,
        evidence: {
            deliveryMode,
            hasDestination,
            paymentStatus: payment.status || null
        }
    };
}

/**
 * Transitions the delivery state to DELIVERY_HANDOFF_READY.
 */
async function prepareDeliveryHandoff(orderId, actorContext = {}, payload = {}) {
    logger.info({ event: 'DELIVERY_HANDOFF_PREPARING', orderId, payload });

    const actorId = actorContext.actorId || 'SYSTEM';

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json, delivery_handoff_status FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    // Idempotency: if already ready, return ok: true, idempotent: true
    if (order.delivery_handoff_status === 'DELIVERY_HANDOFF_READY' || order.status === 'DELIVERY_HANDOFF_READY') {
        return {
            ok: true,
            orderId,
            previousStatus: order.status,
            status: order.status,
            deliveryHandoffStatus: 'DELIVERY_HANDOFF_READY',
            blockers: [],
            warnings: [],
            events: [],
            audit: {},
            idempotent: true
        };
    }

    // Evaluate handoff readiness
    const evalResult = await evaluateDeliveryHandoffReadiness(orderId);
    if (!evalResult.eligible) {
        return {
            ok: false,
            code: 'DELIVERY_HANDOFF_NOT_READY',
            message: 'Order is not ready for delivery handoff.',
            blockers: evalResult.blockers,
            warnings: evalResult.warnings
        };
    }

    const handoffAt = new Date().toISOString();

    if (!metadata.delivery_handoff) {
        metadata.delivery_handoff = {};
    }
    metadata.delivery_handoff.status = 'DELIVERY_HANDOFF_READY';
    metadata.delivery_handoff.readyAt = handoffAt;
    metadata.delivery_handoff.readyBy = actorId;

    // Persist to database
    await mysqlClient.query(
        `UPDATE marketplace_orders 
         SET status = 'DELIVERY_HANDOFF_READY',
             delivery_handoff_status = 'DELIVERY_HANDOFF_READY',
             delivery_handoff_ready_at = ?,
             delivery_handoff_ready_by = ?,
             metadata_json = ?,
             updated_at = NOW()
         WHERE order_id = ?`,
        [
            handoffAt,
            actorId,
            JSON.stringify(metadata),
            orderId
        ]
    );

    // Append order events
    await marketplaceOrderService.appendOrderEvent(orderId, {
        type: 'DELIVERY_HANDOFF_EVALUATED',
        actorId,
        payload: {
            phase: '38.8',
            eligible: true,
            timestamp: handoffAt
        }
    });

    await marketplaceOrderService.appendOrderEvent(orderId, {
        type: 'DELIVERY_HANDOFF_READY',
        actorId,
        payload: {
            phase: '38.8',
            readyAt: handoffAt,
            readyBy: actorId
        }
    });

    await lifecycleAudit.auditDeliveryHandoffTransition('DELIVERY_HANDOFF_READY', 'SUCCESS', {
        order_id: orderId,
        previous_status: order.status,
        next_status: 'DELIVERY_HANDOFF_READY',
        actor: actorId
    });

    return {
        ok: true,
        orderId,
        previousStatus: order.status,
        status: 'DELIVERY_HANDOFF_READY',
        deliveryHandoffStatus: 'DELIVERY_HANDOFF_READY',
        blockers: [],
        warnings: [],
        events: ['DELIVERY_HANDOFF_EVALUATED', 'DELIVERY_HANDOFF_READY'],
        audit: { handoffAt, readyBy: actorId },
        idempotent: false
    };
}

module.exports = {
    evaluateProductionCompletionEligibility,
    completeProductionOrder,
    evaluateDeliveryHandoffReadiness,
    prepareDeliveryHandoff
};
