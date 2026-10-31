/**
 * src/api/services/marketplaceProductionUnlockService.js
 * 
 * Phase 37.4 — Production Unlock / Handoff after PAYMENT_CONFIRMED
 */

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const invoiceGateService = require('./marketplaceInvoiceGateService');
const logger = require('./logger').child('marketplace-production-unlock');

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
 * Evaluates whether production should be unlocked.
 */
async function evaluateProductionUnlock(orderId, options = {}) {
    logger.info({ event: 'PRODUCTION_UNLOCK_EVALUATING', orderId });

    // 1. Load order
    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const currentOrder = orders[0];
    const metadata = safeParseJson(currentOrder.metadata_json, {});
    const invoice = metadata.invoice || {};
    const payment = metadata.payment || {};

    const blockers = [];
    let invoiceGateResult = null;

    // Check idempotency early
    if (metadata.production_unlock && metadata.production_unlock.status === 'PRODUCTION_UNLOCKED') {
        return {
            ok: true,
            orderId,
            productionUnlocked: true,
            decision: 'PRODUCTION_UNLOCKED',
            idempotent: true,
            handoffStatus: metadata.production_unlock.handoffStatus,
            state: metadata.production_unlock
        };
    }

    // 2. Reuse or call existing invoice gate evaluation
    try {
        invoiceGateResult = await invoiceGateService.evaluateMarketplaceInvoiceGate(orderId, {
            evaluatedBy: options.operatorId || 'control-plane'
        });
    } catch (err) {
        logger.warn({ event: 'INVOICE_GATE_EVALUATION_FAILED', orderId, error: err.message });
        blockers.push('INVOICE_GATE_EVALUATION_FAILED');
    }

    // 3. Required conditions
    if (!invoice || !invoice.status) {
        blockers.push('MISSING_INVOICE');
    } else if (invoice.status !== 'ISSUED') {
        blockers.push('INVOICE_NOT_ISSUED');
    }

    if (!payment || !payment.status) {
        blockers.push('MISSING_PAYMENT');
    } else if (payment.status !== 'PAYMENT_CONFIRMED') {
        blockers.push('PAYMENT_NOT_CONFIRMED');
    }

    if (invoiceGateResult) {
        if (!invoiceGateResult.invoiceReady && invoiceGateResult.decision !== 'READY_FOR_INVOICE' && invoiceGateResult.decision !== 'READY_FOR_INVOICE_WITH_OVERRIDE') {
            blockers.push('INVOICE_GATE_NOT_READY');
        }
        if (invoiceGateResult.blockers && invoiceGateResult.blockers.length > 0) {
            blockers.push('INVOICE_GATE_BLOCKERS_EXIST');
        }
    } else {
        blockers.push('INVOICE_GATE_NOT_READY');
    }

    // 4. Decision
    const productionUnlocked = blockers.length === 0;
    const decision = productionUnlocked ? 'PRODUCTION_UNLOCKED' : 'PRODUCTION_LOCKED';

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        try {
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'PRODUCTION_UNLOCK_EVALUATED',
                actorId: options.operatorId || 'SYSTEM',
                payload: {
                    decision,
                    productionUnlocked,
                    blockers,
                    evaluatedAt: new Date().toISOString()
                }
            });
        } catch (eventErr) {
            logger.warn({ event: 'EVENT_APPEND_FAILED', orderId, error: eventErr.message });
        }
    }

    return {
        ok: true,
        orderId,
        productionUnlocked,
        decision,
        blockers,
        invoiceGateDecision: invoiceGateResult ? invoiceGateResult.decision : null
    };
}

/**
 * Executes production unlock after payment is confirmed.
 */
async function unlockProductionAfterPayment(orderId, options = {}) {
    logger.info({ event: 'PRODUCTION_UNLOCK_EXECUTING', orderId });

    const evalResult = await evaluateProductionUnlock(orderId, options);

    if (evalResult.idempotent) {
        return evalResult;
    }

    if (!evalResult.productionUnlocked) {
        return {
            ok: false,
            error: 'PRODUCTION_UNLOCK_BLOCKED',
            blockers: evalResult.blockers
        };
    }

    // 0. Phase 48: Strict Readiness Guard before unlock
    const progressionAssert = await marketplaceOrderService.assertOrderReadyForFinancialProgression(orderId, {
        action: 'unlock_production',
        operatorId: options.operatorId || 'SYSTEM'
    }, options);

    // Load order to modify
    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    const currentOrder = orders[0];
    const metadata = safeParseJson(currentOrder.metadata_json, {});
    const invoice = metadata.invoice || {};
    const payment = metadata.payment || {};

    const unlockedAt = new Date().toISOString();
    const unlockedBy = options.operatorId || 'SYSTEM';

    const production_unlock = {
        phase: '37.4',
        status: 'PRODUCTION_UNLOCKED',
        handoffStatus: 'HANDOFF_READY',
        unlockedAt,
        unlockedBy,
        source: 'CONTROL_PLANE',
        prerequisites: {
            invoiceStatus: invoice.status,
            paymentStatus: payment.status,
            invoiceGateDecision: evalResult.invoiceGateDecision
        },
        warnings: progressionAssert.warnings || [],
        humanReportGates: progressionAssert.humanReportGates || []
    };

    const updatedMetadata = {
        ...metadata,
        production_unlock
    };

    const newStatus = 'PRODUCTION_UNLOCKED';

    await mysqlClient.query(`
        UPDATE marketplace_orders
        SET metadata_json = ?, status = ?, updated_at = NOW()
        WHERE order_id = ?
    `, [JSON.stringify(updatedMetadata), newStatus, orderId]);

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        try {
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'PRODUCTION_UNLOCKED',
                actorId: unlockedBy,
                payload: production_unlock
            });
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'HANDOFF_READY',
                actorId: unlockedBy,
                payload: { handoffStatus: 'HANDOFF_READY', source: 'PRODUCTION_UNLOCK' }
            });
        } catch (eventErr) {
            logger.warn({ event: 'EVENT_APPEND_FAILED', orderId, error: eventErr.message });
        }
    }

    return {
        ok: true,
        productionUnlocked: true,
        handoffStatus: 'HANDOFF_READY',
        state: production_unlock
    };
}

/**
 * Returns read-only production unlock status.
 */
async function getProductionUnlockStatus(orderId, options = {}) {
    const orders = await mysqlClient.query('SELECT metadata_json, status FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const currentOrder = orders[0];
    const metadata = safeParseJson(currentOrder.metadata_json, {});

    return {
        ok: true,
        orderId,
        productionUnlock: metadata.production_unlock || { status: 'PRODUCTION_LOCKED' },
        currentStatus: currentOrder.status
    };
}

module.exports = {
    evaluateProductionUnlock,
    unlockProductionAfterPayment,
    getProductionUnlockStatus
};
