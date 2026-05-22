/**
 * src/api/services/marketplaceProductionProgressService.js
 * 
 * Phase 38.7 — Production Progress / Pause-Resume Governance / Completion Readiness Service
 */

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('marketplace-production-progress');

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
    if (process.env.PPOS_ENABLE_PHASE38_PRODUCTION_PROGRESS !== 'true') {
        throw new Error('PHASE38_PRODUCTION_PROGRESS_DISABLED');
    }
}

function getOrInitializeProductionProgress(metadata) {
    if (!metadata.production_progress) {
        const pwo = metadata.production_work_order || {};
        metadata.production_progress = {
            phase: '38.7',
            status: pwo.status || 'PRODUCTION_STARTED',
            progressPercent: 0,
            lastMilestone: null,
            updatedAt: new Date().toISOString(),
            updatedBy: 'SYSTEM',
            startedAt: pwo.start?.startedAt || pwo.createdAt || null,
            workOrderId: pwo.workOrderId || null,
            machineId: pwo.machineId || null,
            milestones: [],
            pauseHistory: [],
            resumeHistory: [],
            completionReady: null,
            warnings: []
        };
    }
    
    // Synchronize pause/resume history if present in work order but missing in progress
    if (metadata.production_work_order) {
        const pwo = metadata.production_work_order;
        if (pwo.pauseHistory && (!metadata.production_progress.pauseHistory || metadata.production_progress.pauseHistory.length === 0)) {
            metadata.production_progress.pauseHistory = [...pwo.pauseHistory];
        }
        if (pwo.resumeHistory && (!metadata.production_progress.resumeHistory || metadata.production_progress.resumeHistory.length === 0)) {
            metadata.production_progress.resumeHistory = [...pwo.resumeHistory];
        }
    }
    
    return metadata.production_progress;
}

/**
 * Gets production progress status.
 */
async function getProductionProgressStatus(orderId, options = {}) {
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
        productionProgress: metadata.production_progress || null
    };
}

/**
 * Evaluates whether an order is eligible for production progress updates.
 */
async function evaluateProductionProgressEligibility(orderId, options = {}) {
    logger.info({ event: 'PRODUCTION_PROGRESS_EVALUATING', orderId });

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

    // 1. Order status cancellations
    if (order.status === 'PRODUCTION_CANCELLED') {
        blockers.push('PRODUCTION_CANCELLED');
    }

    // 2. Work order cancellation
    if (metadata.production_work_order?.status === 'PRODUCTION_CANCELLED') {
        blockers.push('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    // 3. Allowed order statuses
    const allowedOrderStatuses = [
        'PRODUCTION_STARTED',
        'PRODUCTION_IN_PROGRESS',
        'PRODUCTION_PAUSED',
        'PRODUCTION_COMPLETION_READY'
    ];
    if (!allowedOrderStatuses.includes(order.status) && order.status !== 'PRODUCTION_CANCELLED') {
        blockers.push('INVALID_ORDER_STATUS_FOR_PROGRESS');
    }

    // 4. Work order exists checks
    const pwo = metadata.production_work_order;
    if (!pwo) {
        blockers.push('PRODUCTION_WORK_ORDER_MISSING');
    } else {
        if (pwo.phase !== '38.6') {
            blockers.push('PRODUCTION_WORK_ORDER_INVALID_PHASE');
        }
        if (!pwo.workOrderId) {
            blockers.push('PRODUCTION_WORK_ORDER_MISSING_ID');
        }
        if (!pwo.machineId) {
            blockers.push('PRODUCTION_WORK_ORDER_MISSING_MACHINE');
        }
        const allowedPwoStatuses = [
            'PRODUCTION_STARTED',
            'PRODUCTION_IN_PROGRESS',
            'PRODUCTION_PAUSED',
            'PRODUCTION_COMPLETION_READY'
        ];
        if (!allowedPwoStatuses.includes(pwo.status) && pwo.status !== 'PRODUCTION_CANCELLED') {
            blockers.push('PRODUCTION_WORK_ORDER_INVALID_STATUS');
        }
    }

    // 5. Production decision accepted
    if (!metadata.production_decision || metadata.production_decision.decision !== 'PRODUCTION_ACCEPTED') {
        blockers.push('PRODUCTION_DECISION_NOT_ACCEPTED');
    }

    // 6. Queue status must be MACHINE_ASSIGNED
    if (!metadata.production_queue || metadata.production_queue.status !== 'MACHINE_ASSIGNED') {
        blockers.push('PRODUCTION_QUEUE_NOT_ASSIGNED');
    }

    // 7. Invoice status must be ISSUED
    const invoice = metadata.invoice || dispatchPackage?.manifest?.invoice || {};
    if (!metadata.invoice && !dispatchPackage?.manifest?.invoice) {
        blockers.push('INVOICE_MISSING');
    } else if (invoice.status !== 'ISSUED') {
        blockers.push('INVOICE_NOT_ISSUED');
    }

    // 8. Payment status must be PAYMENT_CONFIRMED
    const payment = metadata.payment || dispatchPackage?.manifest?.payment || {};
    if (!metadata.payment && !dispatchPackage?.manifest?.payment) {
        blockers.push('PAYMENT_MISSING');
    } else if (payment.status !== 'PAYMENT_CONFIRMED') {
        blockers.push('PAYMENT_NOT_CONFIRMED');
    }

    // 9. Production unlock status must be PRODUCTION_UNLOCKED
    if (!metadata.production_unlock || metadata.production_unlock.status !== 'PRODUCTION_UNLOCKED') {
        blockers.push('PRODUCTION_NOT_UNLOCKED');
    }

    // 10. Dispatch package status must be PRINTHOUSE_ACCEPTED or later
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

    // Warnings check: File download completed
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
        orderId,
        eligible: blockers.length === 0,
        blockers,
        warnings,
        orderStatus: order.status
    };
}

/**
 * Records a production progress milestone.
 */
async function recordProductionProgress(orderId, payload = {}, options = {}) {
    checkFeatureFlag();
    logger.info({ event: 'RECORDING_PRODUCTION_PROGRESS', orderId, payload });

    // Load order
    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    // Cancellation checks
    if (order.status === 'PRODUCTION_CANCELLED') {
        throw new Error('PRODUCTION_CANCELLED');
    }
    if (metadata.production_work_order?.status === 'PRODUCTION_CANCELLED') {
        throw new Error('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    // Status checks
    if (order.status === 'PRODUCTION_PAUSED') {
        throw new Error('PRODUCTION_PAUSED');
    }
    if (order.status === 'PRODUCTION_COMPLETION_READY') {
        throw new Error('PRODUCTION_COMPLETION_READY');
    }
    if (!['PRODUCTION_STARTED', 'PRODUCTION_IN_PROGRESS'].includes(order.status)) {
        throw new Error('INVALID_ORDER_STATUS_FOR_PROGRESS');
    }

    // Validate payload progressPercent
    const progressPercent = payload.progressPercent;
    if (progressPercent === undefined || typeof progressPercent !== 'number' || isNaN(progressPercent) || progressPercent < 0 || progressPercent > 99) {
        throw new Error('INVALID_PROGRESS_PERCENT');
    }

    // Validate milestone
    const milestone = payload.milestone;
    if (!milestone) {
        throw new Error('MILESTONE_REQUIRED');
    }
    const allowedMilestones = [
        'MATERIALS_STAGED',
        'PLATES_PREPARED',
        'PRESS_SETUP',
        'PRINTING_STARTED',
        'PRINTING_COMPLETED',
        'BINDING_STARTED',
        'BINDING_COMPLETED',
        'PACKAGING_STARTED',
        'PACKAGING_COMPLETED',
        'CUSTOM'
    ];
    if (!allowedMilestones.includes(milestone)) {
        throw new Error('INVALID_MILESTONE');
    }
    if (milestone === 'CUSTOM' && !payload.customMilestoneLabel) {
        throw new Error('CUSTOM_MILESTONE_LABEL_REQUIRED');
    }

    // Evaluate eligibility
    const evalResult = await evaluateProductionProgressEligibility(orderId, options);
    if (!evalResult.eligible) {
        throw new Error(evalResult.blockers[0]);
    }

    const currentProgress = getOrInitializeProductionProgress(metadata);
    const previousProgressPercent = currentProgress.progressPercent;

    // Check regression
    if (progressPercent < previousProgressPercent) {
        if (payload.forceRegression !== true) {
            throw new Error('PROGRESS_REGRESSION_BLOCKED');
        }
        if (!payload.reason) {
            throw new Error('REGRESSION_REASON_REQUIRED');
        }
    }

    // Idempotency check: identical to the last recorded milestone
    if (currentProgress.milestones && currentProgress.milestones.length > 0) {
        const lastMil = currentProgress.milestones[currentProgress.milestones.length - 1];
        if (
            lastMil.milestone === milestone &&
            lastMil.progressPercent === progressPercent &&
            (lastMil.note || '') === (payload.note || '') &&
            (lastMil.customMilestoneLabel || '') === (payload.customMilestoneLabel || '')
        ) {
            return {
                ok: true,
                idempotent: true,
                productionProgress: currentProgress,
                status: order.status
            };
        }
    }

    // Construct milestone log
    const recordedAt = new Date().toISOString();
    const recordedBy = payload.recordedBy || options.operatorId || 'SYSTEM';
    const milestoneObj = {
        milestone,
        progressPercent,
        recordedAt,
        recordedBy,
        note: payload.note || ''
    };
    if (milestone === 'CUSTOM') {
        milestoneObj.customMilestoneLabel = payload.customMilestoneLabel;
    }

    currentProgress.milestones.push(milestoneObj);
    currentProgress.progressPercent = progressPercent;
    currentProgress.lastMilestone = milestone === 'CUSTOM' ? payload.customMilestoneLabel : milestone;
    currentProgress.updatedAt = recordedAt;
    currentProgress.updatedBy = recordedBy;
    currentProgress.status = 'PRODUCTION_IN_PROGRESS';

    if (metadata.production_work_order) {
        metadata.production_work_order.status = 'PRODUCTION_IN_PROGRESS';
    }

    if (payload.forceRegression === true) {
        if (!currentProgress.warnings.includes('PROGRESS_REGRESSION_FORCED')) {
            currentProgress.warnings.push('PROGRESS_REGRESSION_FORCED');
        }
    }

    // Persist
    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_IN_PROGRESS", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    // Audit Event
    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_PROGRESS_RECORDED',
            actorId: recordedBy,
            payload: {
                phase: '38.7',
                orderId,
                workOrderId: metadata.production_work_order?.workOrderId || '',
                machineId: metadata.production_work_order?.machineId || '',
                milestone,
                progressPercent,
                recordedBy,
                previousProgressPercent,
                nextStatus: 'PRODUCTION_IN_PROGRESS',
                warnings: currentProgress.warnings
            }
        });
    }

    return {
        ok: true,
        productionProgress: currentProgress,
        status: 'PRODUCTION_IN_PROGRESS'
    };
}

/**
 * Pauses production progress.
 */
async function pauseProductionProgress(orderId, payload = {}, options = {}) {
    checkFeatureFlag();
    logger.info({ event: 'PAUSING_PRODUCTION_PROGRESS', orderId, payload });

    // Validate pause reason
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

    // Cancellation checks
    if (order.status === 'PRODUCTION_CANCELLED') {
        throw new Error('PRODUCTION_CANCELLED');
    }
    if (metadata.production_work_order?.status === 'PRODUCTION_CANCELLED') {
        throw new Error('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    // If already paused, check idempotency
    if (order.status === 'PRODUCTION_PAUSED') {
        const progress = metadata.production_progress || {};
        const pauseHistory = progress.pauseHistory || [];
        const latestPause = pauseHistory[pauseHistory.length - 1] || {};
        if (latestPause.reason === payload.reason) {
            return {
                ok: true,
                idempotent: true,
                productionProgress: progress,
                status: order.status
            };
        }
    }

    // Status check
    if (!['PRODUCTION_STARTED', 'PRODUCTION_IN_PROGRESS'].includes(order.status)) {
        throw new Error('INVALID_ORDER_STATUS_FOR_PAUSE');
    }

    // Evaluate eligibility
    const evalResult = await evaluateProductionProgressEligibility(orderId, options);
    if (!evalResult.eligible) {
        throw new Error(evalResult.blockers[0]);
    }

    const currentProgress = getOrInitializeProductionProgress(metadata);
    const pausedAt = new Date().toISOString();
    const pausedBy = payload.pausedBy || options.operatorId || 'SYSTEM';

    const pauseEntry = {
        pausedAt,
        pausedBy,
        reason: payload.reason,
        note: payload.note || null
    };

    if (!metadata.production_work_order.pauseHistory) {
        metadata.production_work_order.pauseHistory = [];
    }
    metadata.production_work_order.pauseHistory.push(pauseEntry);
    metadata.production_work_order.status = 'PRODUCTION_PAUSED';

    currentProgress.pauseHistory.push(pauseEntry);
    currentProgress.status = 'PRODUCTION_PAUSED';
    currentProgress.updatedAt = pausedAt;
    currentProgress.updatedBy = pausedBy;

    // Persist
    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_PAUSED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    // Audit Event
    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_PROGRESS_PAUSED',
            actorId: pausedBy,
            payload: {
                phase: '38.7',
                orderId,
                workOrderId: metadata.production_work_order?.workOrderId || '',
                machineId: metadata.production_work_order?.machineId || '',
                pausedBy,
                reason: payload.reason,
                previousStatus: order.status,
                nextStatus: 'PRODUCTION_PAUSED'
            }
        });
    }

    return {
        ok: true,
        productionProgress: currentProgress,
        status: 'PRODUCTION_PAUSED'
    };
}

/**
 * Resumes production progress.
 */
async function resumeProductionProgress(orderId, payload = {}, options = {}) {
    checkFeatureFlag();
    logger.info({ event: 'RESUMING_PRODUCTION_PROGRESS', orderId, payload });

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    // Cancellation checks
    if (order.status === 'PRODUCTION_CANCELLED') {
        throw new Error('PRODUCTION_CANCELLED');
    }
    if (metadata.production_work_order?.status === 'PRODUCTION_CANCELLED') {
        throw new Error('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    // Idempotency check: if already in progress or started after a resume
    if (['PRODUCTION_STARTED', 'PRODUCTION_IN_PROGRESS'].includes(order.status) && metadata.production_progress?.status === 'PRODUCTION_IN_PROGRESS') {
        return {
            ok: true,
            idempotent: true,
            productionProgress: metadata.production_progress,
            status: order.status
        };
    }

    // Status check
    if (order.status !== 'PRODUCTION_PAUSED') {
        throw new Error('INVALID_ORDER_STATUS_FOR_RESUME');
    }

    // Evaluate eligibility
    const evalResult = await evaluateProductionProgressEligibility(orderId, options);
    if (!evalResult.eligible) {
        throw new Error(evalResult.blockers[0]);
    }

    const currentProgress = getOrInitializeProductionProgress(metadata);
    const resumedAt = new Date().toISOString();
    const resumedBy = payload.resumedBy || options.operatorId || 'SYSTEM';

    const resumeEntry = {
        resumedAt,
        resumedBy,
        note: payload.note || null
    };

    if (!metadata.production_work_order.resumeHistory) {
        metadata.production_work_order.resumeHistory = [];
    }
    metadata.production_work_order.resumeHistory.push(resumeEntry);
    metadata.production_work_order.status = 'PRODUCTION_IN_PROGRESS';

    currentProgress.resumeHistory.push(resumeEntry);
    currentProgress.status = 'PRODUCTION_IN_PROGRESS';
    currentProgress.updatedAt = resumedAt;
    currentProgress.updatedBy = resumedBy;

    // Persist
    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_IN_PROGRESS", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    // Audit Event
    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_PROGRESS_RESUMED',
            actorId: resumedBy,
            payload: {
                phase: '38.7',
                orderId,
                workOrderId: metadata.production_work_order?.workOrderId || '',
                machineId: metadata.production_work_order?.machineId || '',
                resumedBy,
                previousStatus: 'PRODUCTION_PAUSED',
                nextStatus: 'PRODUCTION_IN_PROGRESS'
            }
        });
    }

    return {
        ok: true,
        productionProgress: currentProgress,
        status: 'PRODUCTION_IN_PROGRESS'
    };
}

/**
 * Marks production as ready for completion review.
 */
async function markProductionCompletionReady(orderId, payload = {}, options = {}) {
    checkFeatureFlag();
    logger.info({ event: 'MARKING_PRODUCTION_COMPLETION_READY', orderId, payload });

    const orders = await mysqlClient.query(
        'SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    // Cancellation checks
    if (order.status === 'PRODUCTION_CANCELLED') {
        throw new Error('PRODUCTION_CANCELLED');
    }
    if (metadata.production_work_order?.status === 'PRODUCTION_CANCELLED') {
        throw new Error('PRODUCTION_WORK_ORDER_CANCELLED');
    }

    // Idempotency check
    if (order.status === 'PRODUCTION_COMPLETION_READY') {
        return {
            ok: true,
            idempotent: true,
            productionProgress: metadata.production_progress,
            status: order.status
        };
    }

    // Status check: Allowed from PRODUCTION_IN_PROGRESS only
    if (order.status !== 'PRODUCTION_IN_PROGRESS') {
        throw new Error('INVALID_STATUS_FOR_COMPLETION_READY');
    }

    // Evaluate eligibility
    const evalResult = await evaluateProductionProgressEligibility(orderId, options);
    if (!evalResult.eligible) {
        throw new Error(evalResult.blockers[0]);
    }

    const currentProgress = getOrInitializeProductionProgress(metadata);

    // Requires progressPercent >= 90
    if (currentProgress.progressPercent < 90) {
        throw new Error('COMPLETION_READY_PROGRESS_PERCENT_REQUIRED');
    }

    const markedAt = new Date().toISOString();
    const markedBy = payload.markedBy || options.operatorId || 'SYSTEM';

    const completionReadyEntry = {
        markedAt,
        markedBy,
        note: payload.note || null,
        completionTriggered: false,
        shipmentTriggered: false,
        qaRequired: true
    };

    metadata.production_work_order.status = 'PRODUCTION_COMPLETION_READY';

    currentProgress.completionReady = completionReadyEntry;
    currentProgress.status = 'PRODUCTION_COMPLETION_READY';
    currentProgress.updatedAt = markedAt;
    currentProgress.updatedBy = markedBy;

    // Persist
    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_COMPLETION_READY", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    // Audit Event
    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_COMPLETION_READY_MARKED',
            actorId: markedBy,
            payload: {
                phase: '38.7',
                orderId,
                workOrderId: metadata.production_work_order?.workOrderId || '',
                machineId: metadata.production_work_order?.machineId || '',
                markedBy,
                progressPercent: currentProgress.progressPercent,
                previousStatus: 'PRODUCTION_IN_PROGRESS',
                nextStatus: 'PRODUCTION_COMPLETION_READY'
            }
        });
    }

    return {
        ok: true,
        productionProgress: currentProgress,
        status: 'PRODUCTION_COMPLETION_READY'
    };
}

module.exports = {
    getProductionProgressStatus,
    evaluateProductionProgressEligibility,
    recordProductionProgress,
    pauseProductionProgress,
    resumeProductionProgress,
    markProductionCompletionReady
};
