/**
 * src/api/services/marketplacePrinthouseHandoffService.js
 * 
 * Phase 38.1 — ControlPlane Printhouse Handoff Consumption API
 * Manages operator/printhouse lifecycle actions for a dispatched package.
 */

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('marketplace-printhouse-handoff');

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
 * Returns a list of orders that have a dispatch package.
 */
async function listPrinthouseHandoffPackages(filters = {}, options = {}) {
    // Only orders with a dispatch_package are considered in handoff phase
    // In a real system, this would use JSON_EXTRACT in MySQL 5.7+ or a dedicated index
    // For this mock implementation, we retrieve all orders with a non-null dispatch_package in metadata.
    const query = `
        SELECT order_id, status, metadata_json, created_at, updated_at 
        FROM marketplace_orders 
        WHERE metadata_json LIKE '%"dispatch_package"%'
    `;
    const orders = await mysqlClient.query(query, []);

    const mapped = orders.map(order => {
        const metadata = safeParseJson(order.metadata_json, {});
        const dispatch = metadata.dispatch_package || {};
        const manifest = dispatch.manifest || {};

        return {
            orderId: order.order_id,
            packageId: dispatch.packageId,
            dispatchStatus: dispatch.status,
            handoffStatus: dispatch.handoffStatus,
            printhouse: manifest.printhouse,
            invoice_number: manifest.invoice?.invoice_number,
            paymentStatus: manifest.payment?.status,
            files: (manifest.files || []).map(f => ({ role: f.role, preflightStatus: f.preflightStatus })),
            createdAt: dispatch.createdAt,
            acknowledgedAt: dispatch.acknowledgedAt
        };
    }).filter(pkg => pkg.packageId); // ensure it actually had one

    // Optional manual filtering based on `filters` object
    let results = mapped;
    if (filters.status) {
        results = results.filter(p => p.dispatchStatus === filters.status);
    }
    if (filters.printhouseId) {
        results = results.filter(p => p.printhouse?.id === filters.printhouseId);
    }

    return {
        ok: true,
        count: results.length,
        packages: results
    };
}

/**
 * Redacts internal paths to secure logical API paths.
 */
function sanitizeManifest(manifest) {
    if (!manifest) return null;
    const sanitized = JSON.parse(JSON.stringify(manifest)); // deep clone
    
    if (sanitized.files && Array.isArray(sanitized.files)) {
        for (const file of sanitized.files) {
            if (file.storagePath) {
                // Redact local paths
                if (file.storagePath.includes('/tmp/') || file.storagePath.includes('/var/')) {
                    file.storagePath = `/api/production-files/download/${file.fileId}`;
                }
            }
        }
    }
    return sanitized;
}

/**
 * Fetches the specific dispatch package manifest for an order, sanitized.
 */
async function getPrinthouseHandoffPackage(orderId, options = {}) {
    const orders = await mysqlClient.query('SELECT metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    
    const metadata = safeParseJson(orders[0].metadata_json, {});
    const dispatch = metadata.dispatch_package;
    if (!dispatch) {
        return {
            ok: false,
            error: 'HANDOFF_PACKAGE_NOT_FOUND',
            message: `No dispatch package found for order ${orderId}`
        };
    }

    return {
        ok: true,
        orderId,
        packageId: dispatch.packageId,
        status: dispatch.status,
        handoffStatus: dispatch.handoffStatus,
        createdAt: dispatch.createdAt,
        acknowledgedAt: dispatch.acknowledgedAt,
        manifest: sanitizeManifest(dispatch.manifest)
    };
}

/**
 * Accepts a handoff package (Printhouse approves it for production).
 */
async function acceptPrinthouseHandoff(orderId, payload = {}, options = {}) {
    logger.info({ event: 'PRINTHOUSE_HANDOFF_ACCEPTING', orderId });
    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) throw new Error('ORDER_NOT_FOUND');
    
    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});
    
    if (!metadata.dispatch_package) {
        return { ok: false, error: 'HANDOFF_PACKAGE_NOT_FOUND' };
    }
    
    const currentStatus = metadata.dispatch_package.status;
    if (currentStatus === 'PRINTHOUSE_ACCEPTED') {
        return { ok: true, idempotent: true, dispatchPackage: metadata.dispatch_package };
    }

    if (!['ACKNOWLEDGED', 'PRINTHOUSE_HANDOFF_READY', 'DISPATCH_PACKAGE_CREATED', 'CLARIFICATION_REQUESTED'].includes(currentStatus)) {
        return { ok: false, error: 'INVALID_STATUS_FOR_ACCEPT', message: `Cannot accept package from status: ${currentStatus}` };
    }

    const acceptedBy = options.operatorId || 'SYSTEM';
    
    metadata.dispatch_package.status = 'PRINTHOUSE_ACCEPTED';
    metadata.dispatch_package.acceptedAt = new Date().toISOString();
    metadata.dispatch_package.acceptedBy = acceptedBy;
    metadata.dispatch_package.acceptancePayload = payload;

    const newOrderStatus = 'PRINTHOUSE_ACCEPTED';
    await mysqlClient.query(`
        UPDATE marketplace_orders SET metadata_json = ?, status = ?, updated_at = NOW() WHERE order_id = ?
    `, [JSON.stringify(metadata), newOrderStatus, orderId]);

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRINTHOUSE_HANDOFF_ACCEPTED',
            actorId: acceptedBy,
            payload: { packageId: metadata.dispatch_package.packageId }
        });
    }

    return { ok: true, dispatchPackage: metadata.dispatch_package };
}

/**
 * Rejects a handoff package (Printhouse cannot produce).
 */
async function rejectPrinthouseHandoff(orderId, payload = {}, options = {}) {
    logger.info({ event: 'PRINTHOUSE_HANDOFF_REJECTING', orderId });
    if (!payload.reason) {
        return { ok: false, error: 'REJECTION_REASON_REQUIRED' };
    }

    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) throw new Error('ORDER_NOT_FOUND');
    
    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});
    
    if (!metadata.dispatch_package) {
        return { ok: false, error: 'HANDOFF_PACKAGE_NOT_FOUND' };
    }

    if (metadata.dispatch_package.status === 'PRINTHOUSE_REJECTED' && metadata.dispatch_package.rejectionReason === payload.reason) {
        return { ok: true, idempotent: true, dispatchPackage: metadata.dispatch_package };
    }

    const rejectedBy = options.operatorId || 'SYSTEM';

    metadata.dispatch_package.status = 'PRINTHOUSE_REJECTED';
    metadata.dispatch_package.rejectedAt = new Date().toISOString();
    metadata.dispatch_package.rejectedBy = rejectedBy;
    metadata.dispatch_package.rejectionReason = payload.reason;

    const newOrderStatus = 'PRINTHOUSE_REJECTED';
    await mysqlClient.query(`
        UPDATE marketplace_orders SET metadata_json = ?, status = ?, updated_at = NOW() WHERE order_id = ?
    `, [JSON.stringify(metadata), newOrderStatus, orderId]);

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRINTHOUSE_HANDOFF_REJECTED',
            actorId: rejectedBy,
            payload: { packageId: metadata.dispatch_package.packageId, reason: payload.reason }
        });
    }

    return { ok: true, dispatchPackage: metadata.dispatch_package };
}

/**
 * Requests operational clarification from ControlPlane regarding the package.
 */
async function requestHandoffClarification(orderId, payload = {}, options = {}) {
    logger.info({ event: 'PRINTHOUSE_HANDOFF_CLARIFICATION', orderId });
    if (!payload.message) {
        return { ok: false, error: 'CLARIFICATION_MESSAGE_REQUIRED' };
    }

    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) throw new Error('ORDER_NOT_FOUND');
    
    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});
    
    if (!metadata.dispatch_package) {
        return { ok: false, error: 'HANDOFF_PACKAGE_NOT_FOUND' };
    }

    const requestedBy = options.operatorId || 'SYSTEM';

    metadata.dispatch_package.status = 'CLARIFICATION_REQUESTED';
    metadata.dispatch_package.clarificationRequestedAt = new Date().toISOString();
    metadata.dispatch_package.clarificationRequestedBy = requestedBy;
    metadata.dispatch_package.clarificationMessage = payload.message;

    const newOrderStatus = 'HANDOFF_CLARIFICATION_REQUESTED';
    await mysqlClient.query(`
        UPDATE marketplace_orders SET metadata_json = ?, status = ?, updated_at = NOW() WHERE order_id = ?
    `, [JSON.stringify(metadata), newOrderStatus, orderId]);

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRINTHOUSE_HANDOFF_CLARIFICATION_REQUESTED',
            actorId: requestedBy,
            payload: { packageId: metadata.dispatch_package.packageId, message: payload.message }
        });
    }

    return { ok: true, dispatchPackage: metadata.dispatch_package };
}

/**
 * Retrieves the timeline of handoff/dispatch related events.
 */
async function getPrinthouseHandoffTimeline(orderId, options = {}) {
    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) throw new Error('ORDER_NOT_FOUND');

    let events = [];
    if (marketplaceOrderService && typeof marketplaceOrderService.listAuditEvents === 'function') {
        const auditRes = await marketplaceOrderService.listAuditEvents({ orderId });
        if (auditRes.ok && auditRes.events) {
            events = auditRes.events;
        }
    }

    // Phase 38 specific events
    const handoffEvents = events.filter(e => [
        'DISPATCH_PACKAGE_EVALUATED',
        'DISPATCH_PACKAGE_CREATED',
        'PRINTHOUSE_HANDOFF_READY',
        'PRINTHOUSE_HANDOFF_ACKNOWLEDGED',
        'PRINTHOUSE_HANDOFF_ACCEPTED',
        'PRINTHOUSE_HANDOFF_REJECTED',
        'PRINTHOUSE_HANDOFF_CLARIFICATION_REQUESTED'
    ].includes(e.event_type));

    return {
        ok: true,
        orderId,
        timeline: handoffEvents
    };
}

module.exports = {
    listPrinthouseHandoffPackages,
    getPrinthouseHandoffPackage,
    acceptPrinthouseHandoff,
    rejectPrinthouseHandoff,
    requestHandoffClarification,
    getPrinthouseHandoffTimeline
};
