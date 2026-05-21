/**
 * src/api/services/marketplaceDispatchPackageService.js
 * 
 * Phase 37.5 — Dispatch Package / Printhouse Handoff
 * Governs the creation of an immutable dispatch package for printhouse routing.
 */

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('marketplace-dispatch-package');

function safeParseJson(str, fallback = {}) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

function generateId(prefix = 'dpkg') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Evaluates whether an order is ready to be packaged for dispatch.
 */
async function evaluateDispatchPackageReadiness(orderId, options = {}) {
    logger.info({ event: 'DISPATCH_PACKAGE_EVALUATING', orderId });

    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const currentOrder = orders[0];
    const metadata = safeParseJson(currentOrder.metadata_json, {});
    const readiness = safeParseJson(currentOrder.readiness_json, {});
    
    const productionUnlock = metadata.production_unlock || {};
    const invoice = metadata.invoice || {};
    const payment = metadata.payment || {};
    const selectedOffer = safeParseJson(currentOrder.selected_offer_json, {});

    // Check idempotency early
    if (metadata.dispatch_package && metadata.dispatch_package.status && metadata.dispatch_package.status !== 'CANCELLED') {
        return {
            ok: true,
            orderId,
            dispatchReady: true,
            decision: 'DISPATCH_PACKAGE_CREATED',
            idempotent: true,
            state: metadata.dispatch_package,
            files: [] // Minimal return for idempotent path
        };
    }

    const blockers = [];

    // 1. Core State Conditions
    if (productionUnlock.status !== 'PRODUCTION_UNLOCKED') blockers.push('PRODUCTION_NOT_UNLOCKED');
    if (productionUnlock.handoffStatus !== 'HANDOFF_READY') blockers.push('HANDOFF_NOT_READY');
    if (invoice.status !== 'ISSUED') blockers.push('INVOICE_NOT_ISSUED');
    if (payment.status !== 'PAYMENT_CONFIRMED') blockers.push('PAYMENT_NOT_CONFIRMED');

    // 2. Readiness Conditions
    if (Array.isArray(readiness.blockers) && readiness.blockers.length > 0) {
        blockers.push('READINESS_BLOCKERS_EXIST');
    }
    
    if (Array.isArray(readiness.invoiceGateBlockers) && readiness.invoiceGateBlockers.length > 0) {
        blockers.push('INVOICE_GATE_BLOCKERS_EXIST');
    }

    if (readiness.invoiceGateDecision && !['READY_FOR_INVOICE', 'READY_FOR_INVOICE_WITH_OVERRIDE', 'READY_TO_INVOICE'].includes(readiness.invoiceGateDecision)) {
        blockers.push('INVOICE_GATE_NOT_READY');
    }

    // 3. File Conditions
    const files = await mysqlClient.query(
        "SELECT * FROM marketplace_order_files WHERE order_id = ? AND status <> 'SUPERSEDED'",
        [orderId]
    );

    const interiorFile = files.find(f => f.role === 'INTERIOR_PDF');
    const coverFile = files.find(f => f.role === 'COVER_PDF');

    const checkFile = (file, name) => {
        if (!file) {
            blockers.push(`MISSING_${name}_FILE`);
            return;
        }
        if (!file.preflight_job_id) {
            blockers.push(`MISSING_${name}_PREFLIGHT`);
        }
        // Phase 36 acceptance semantic check
        const acceptableStatuses = ['ACCEPTED', 'ACCEPTED_WITH_WARNINGS'];
        const acceptablePreflightOutcomes = ['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PASS', 'PASS_WITH_WARNINGS', 'COMPLETED_WITH_FINDINGS', 'DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'];
        
        const isAccepted = acceptableStatuses.includes(file.status);
        const hasAcceptablePreflight = acceptablePreflightOutcomes.includes(file.preflight_status) || acceptablePreflightOutcomes.includes(file.preflight_outcome_category);
        
        if (!isAccepted && !hasAcceptablePreflight) {
            blockers.push(`FILE_NOT_CERTIFIABLE_${name}`);
        }
    };

    checkFile(interiorFile, 'INTERIOR');
    checkFile(coverFile, 'COVER');

    const dispatchReady = blockers.length === 0;
    const decision = dispatchReady ? 'DISPATCH_READY' : 'DISPATCH_PACKAGE_BLOCKED';

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        try {
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'DISPATCH_PACKAGE_EVALUATED',
                actorId: options.operatorId || 'SYSTEM',
                payload: {
                    decision,
                    dispatchReady,
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
        dispatchReady,
        decision,
        blockers,
        files: files,
        metadata,
        currentOrder,
        selectedOffer
    };
}

/**
 * Creates the dispatch package manifest.
 */
async function createDispatchPackage(orderId, options = {}) {
    logger.info({ event: 'DISPATCH_PACKAGE_CREATING', orderId });

    const evalResult = await evaluateDispatchPackageReadiness(orderId, options);

    if (evalResult.idempotent) {
        return evalResult;
    }

    if (!evalResult.dispatchReady) {
        return {
            ok: false,
            error: 'DISPATCH_PACKAGE_BLOCKED',
            blockers: evalResult.blockers
        };
    }

    const { files, metadata, currentOrder, selectedOffer } = evalResult;
    
    const packageId = generateId('dpkg');
    const createdAt = new Date().toISOString();
    const createdBy = options.operatorId || 'SYSTEM';

    const manifestFiles = files.map(f => ({
        fileId: f.file_id,
        role: f.role,
        version: f.version || 1,
        originalName: f.original_name,
        storagePath: f.storage_path, // API logical path only
        checksumSha256: f.checksum_sha256,
        preflightJobId: f.preflight_job_id,
        preflightStatus: f.preflight_status,
        findingsCount: f.findings_count
    }));

    const printhouseData = {
        id: currentOrder.printhouse_id || selectedOffer.printhouseId || selectedOffer.printerId,
        name: selectedOffer.printerName || selectedOffer.printhouseName || 'Assigned Printhouse'
    };

    const manifest = {
        phase: '37.5',
        packageId,
        status: 'DISPATCH_PACKAGE_CREATED',
        handoffStatus: 'PRINTHOUSE_HANDOFF_READY',
        orderId,
        createdAt,
        createdBy,
        source: 'CONTROL_PLANE',
        printhouse: printhouseData,
        files: manifestFiles,
        invoice: {
            invoice_number: metadata.invoice.invoice_number,
            status: metadata.invoice.status,
            amount: metadata.invoice.amount,
            currency: metadata.invoice.currency
        },
        payment: {
            status: metadata.payment.status,
            provider: metadata.payment.provider,
            reference: metadata.payment.reference,
            paidAt: metadata.payment.paidAt
        },
        productionUnlock: {
            status: metadata.production_unlock.status,
            handoffStatus: metadata.production_unlock.handoffStatus,
            unlockedAt: metadata.production_unlock.unlockedAt
        }
    };

    const dispatch_package = {
        phase: '37.5',
        packageId,
        status: 'DISPATCH_PACKAGE_CREATED',
        handoffStatus: 'PRINTHOUSE_HANDOFF_READY',
        manifest,
        createdAt,
        createdBy
    };

    const updatedMetadata = {
        ...metadata,
        dispatch_package
    };

    const newStatus = 'PRINTHOUSE_HANDOFF_READY';

    await mysqlClient.query(`
        UPDATE marketplace_orders
        SET metadata_json = ?, status = ?, updated_at = NOW()
        WHERE order_id = ?
    `, [JSON.stringify(updatedMetadata), newStatus, orderId]);

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        try {
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'DISPATCH_PACKAGE_CREATED',
                actorId: createdBy,
                payload: { packageId, status: 'DISPATCH_PACKAGE_CREATED' }
            });
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'PRINTHOUSE_HANDOFF_READY',
                actorId: createdBy,
                payload: { packageId, handoffStatus: 'PRINTHOUSE_HANDOFF_READY' }
            });
        } catch (eventErr) {
            logger.warn({ event: 'EVENT_APPEND_FAILED', orderId, error: eventErr.message });
        }
    }

    return {
        ok: true,
        dispatchReady: true,
        packageId,
        status: 'DISPATCH_PACKAGE_CREATED',
        handoffStatus: 'PRINTHOUSE_HANDOFF_READY',
        state: dispatch_package
    };
}

/**
 * Returns read-only dispatch package status.
 */
async function getDispatchPackageStatus(orderId, options = {}) {
    const orders = await mysqlClient.query('SELECT metadata_json, status FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const currentOrder = orders[0];
    const metadata = safeParseJson(currentOrder.metadata_json, {});

    return {
        ok: true,
        orderId,
        dispatchPackage: metadata.dispatch_package || null,
        currentStatus: currentOrder.status
    };
}

/**
 * Marks dispatch package as acknowledged by printhouse/admin.
 */
async function markDispatchPackageAcknowledged(orderId, payload = {}, options = {}) {
    logger.info({ event: 'DISPATCH_PACKAGE_ACKNOWLEDGING', orderId });

    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const currentOrder = orders[0];
    const metadata = safeParseJson(currentOrder.metadata_json, {});

    if (!metadata.dispatch_package) {
        return {
            ok: false,
            error: 'DISPATCH_PACKAGE_NOT_FOUND',
            message: 'No dispatch package exists to acknowledge.'
        };
    }

    if (metadata.dispatch_package.status === 'ACKNOWLEDGED') {
        return {
            ok: true,
            idempotent: true,
            dispatchPackage: metadata.dispatch_package
        };
    }

    const acknowledgedBy = options.operatorId || 'SYSTEM';
    const acknowledgedAt = new Date().toISOString();

    metadata.dispatch_package.status = 'ACKNOWLEDGED';
    metadata.dispatch_package.acknowledgedAt = acknowledgedAt;
    metadata.dispatch_package.acknowledgedBy = acknowledgedBy;
    metadata.dispatch_package.acknowledgementPayload = payload;

    const newStatus = 'PRINTHOUSE_ACKNOWLEDGED';

    await mysqlClient.query(`
        UPDATE marketplace_orders
        SET metadata_json = ?, status = ?, updated_at = NOW()
        WHERE order_id = ?
    `, [JSON.stringify(metadata), newStatus, orderId]);

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        try {
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'PRINTHOUSE_HANDOFF_ACKNOWLEDGED',
                actorId: acknowledgedBy,
                payload: { 
                    packageId: metadata.dispatch_package.packageId,
                    status: 'ACKNOWLEDGED'
                }
            });
        } catch (eventErr) {
            logger.warn({ event: 'EVENT_APPEND_FAILED', orderId, error: eventErr.message });
        }
    }

    return {
        ok: true,
        dispatchPackage: metadata.dispatch_package
    };
}

module.exports = {
    evaluateDispatchPackageReadiness,
    createDispatchPackage,
    getDispatchPackageStatus,
    markDispatchPackageAcknowledged
};
