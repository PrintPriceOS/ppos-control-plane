/**
 * src/api/services/marketplacePrinthouseProductionService.js
 * 
 * Phase 38.4 - Printhouse Production Decision / Job Acceptance Gate
 */
const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('printhouse-production-decision');

function safeParseJson(str, fallback = {}) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

async function getProductionDecisionStatus(orderId, options = {}) {
    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    
    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});
    const dispatchPackage = metadata.dispatch_package;
    
    if (!dispatchPackage) {
        return { ok: false, error: 'HANDOFF_PACKAGE_NOT_FOUND' };
    }

    const events = await mysqlClient.query(
        'SELECT type, payload_json, created_at FROM marketplace_order_events WHERE order_id = ? ORDER BY created_at DESC',
        [orderId]
    );

    const fileAccessEvents = events.filter(e => e.type.startsWith('PRINTHOUSE_FILE_'));
    const hasDownloadCompleted = fileAccessEvents.some(e => e.type === 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED');

    const warnings = [];
    if (!hasDownloadCompleted) {
        warnings.push('FILE_ACCESS_NOT_VERIFIED_BY_AUDIT');
    }

    return {
        ok: true,
        orderId,
        orderStatus: order.status,
        dispatchStatus: dispatchPackage.status,
        productionDecision: metadata.production_decision || null,
        fileAccessVerified: hasDownloadCompleted,
        warnings
    };
}

async function recordProductionDecision(orderId, decision, payload = {}, options = {}) {
    logger.info({ event: 'RECORDING_PRODUCTION_DECISION', orderId, decision });
    const allowedDecisions = ['READY_FOR_PRODUCTION', 'PRODUCTION_ACCEPTED', 'PRODUCTION_REJECTED', 'PRODUCTION_HOLD'];
    if (!allowedDecisions.includes(decision)) {
        throw new Error('INVALID_DECISION');
    }

    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) throw new Error('ORDER_NOT_FOUND');
    
    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});
    const dispatchPackage = metadata.dispatch_package;

    if (!dispatchPackage) throw new Error('HANDOFF_PACKAGE_NOT_FOUND');
    if (dispatchPackage.status !== 'PRINTHOUSE_ACCEPTED') {
        throw new Error('DISPATCH_PACKAGE_NOT_ACCEPTED');
    }

    const allowedOrderStatuses = ['PRINTHOUSE_ACCEPTED', 'READY_FOR_PRODUCTION', 'PRODUCTION_HOLD', 'PRODUCTION_REJECTED', 'PRODUCTION_ACCEPTED'];
    if (!allowedOrderStatuses.includes(order.status)) {
        throw new Error('INVALID_ORDER_STATUS_FOR_DECISION');
    }

    // Validation 5, 6, 7
    const manifest = dispatchPackage.manifest || {};
    const invoice = manifest.invoice || {};
    const payment = manifest.payment || {};
    const productionUnlock = metadata.production_unlock || {};

    if (invoice.status !== 'ISSUED') throw new Error('INVOICE_NOT_ISSUED');
    if (payment.status !== 'PAYMENT_CONFIRMED') throw new Error('PAYMENT_NOT_CONFIRMED');
    if (productionUnlock.status !== 'PRODUCTION_UNLOCKED') throw new Error('PRODUCTION_NOT_UNLOCKED');

    // Decision transitions
    const reason = payload.reason || '';
    if (decision === 'READY_FOR_PRODUCTION') {
        if (!['PRINTHOUSE_ACCEPTED', 'PRODUCTION_HOLD'].includes(order.status)) throw new Error('INVALID_STATE_TRANSITION');
    } else if (decision === 'PRODUCTION_ACCEPTED') {
        if (!['READY_FOR_PRODUCTION', 'PRINTHOUSE_ACCEPTED'].includes(order.status)) throw new Error('INVALID_STATE_TRANSITION');
    } else if (decision === 'PRODUCTION_HOLD') {
        if (!['PRINTHOUSE_ACCEPTED', 'READY_FOR_PRODUCTION'].includes(order.status)) throw new Error('INVALID_STATE_TRANSITION');
        if (!reason) throw new Error('REASON_REQUIRED');
    } else if (decision === 'PRODUCTION_REJECTED') {
        if (!['PRINTHOUSE_ACCEPTED', 'READY_FOR_PRODUCTION', 'PRODUCTION_HOLD'].includes(order.status)) throw new Error('INVALID_STATE_TRANSITION');
        if (!reason) throw new Error('REASON_REQUIRED');
    }

    // Check file access warnings
    const statusData = await getProductionDecisionStatus(orderId, options);
    const warnings = statusData.warnings || [];

    // Idempotency
    const currentDecision = metadata.production_decision || {};
    if (currentDecision.decision === decision && currentDecision.reason === reason) {
        return { ok: true, idempotent: true, productionDecision: currentDecision };
    }

    const decidedBy = options.operatorId || 'SYSTEM';
    const newStatus = decision;

    const newDecisionObj = {
        phase: '38.4',
        decision,
        reason,
        decidedAt: new Date().toISOString(),
        decidedBy,
        source: 'CONTROL_PLANE',
        previousStatus: order.status,
        warnings
    };

    metadata.production_decision = newDecisionObj;

    await mysqlClient.query(`
        UPDATE marketplace_orders SET metadata_json = ?, status = ?, updated_at = NOW() WHERE order_id = ?
    `, [JSON.stringify(metadata), newStatus, orderId]);

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        const auditPayload = {
            phase: '38.4',
            decision,
            reason,
            decidedBy,
            previousStatus: order.status,
            nextStatus: newStatus,
            warnings
        };
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRINTHOUSE_PRODUCTION_DECISION_RECORDED',
            actorId: decidedBy,
            payload: auditPayload
        });
    }

    return { ok: true, productionDecision: newDecisionObj, nextStatus: newStatus };
}

module.exports = {
    getProductionDecisionStatus,
    recordProductionDecision
};
