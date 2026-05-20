/**
 * src/api/services/marketplaceInvoiceGateService.js
 * 
 * Implements Phase 36.5: Invoice Gate from Preflight Outcome in ControlPlane.
 * Evaluates file and preflight outcomes on a marketplace order, enforces manual
 * override auditing, persists results to database, and logs audit events.
 */

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('marketplace-invoice-gate');

// Helper: Safe JSON parsing
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
 * Evaluates whether a marketplace order is ready for invoicing based on preflight outcomes.
 * 
 * @param {string} orderId 
 * @param {object} options 
 * @returns {Promise<object>} decision details
 */
async function evaluateMarketplaceInvoiceGate(orderId, options = {}) {
    logger.info({ event: 'MARKETPLACE_INVOICE_GATE_EVALUATING', orderId });

    // 1. Run computeReadiness first, if available, to ensure database is in sync
    if (marketplaceOrderService && typeof marketplaceOrderService.computeReadiness === 'function') {
        try {
            await marketplaceOrderService.computeReadiness(orderId);
        } catch (readinessErr) {
            logger.warn({ event: 'READINESS_COMPUTATION_FAILED', orderId, error: readinessErr.message });
        }
    }

    // 2. Load fresh order record from database
    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const currentOrder = orders[0];

    // 3. Load active files for the order
    const files = await mysqlClient.query(
        "SELECT * FROM marketplace_order_files WHERE order_id = ? AND status !== 'SUPERSEDED'",
        [orderId]
    );

    const interiorFile = files.find(f => f.role === 'INTERIOR_PDF');
    const coverFile = files.find(f => f.role === 'COVER_PDF');

    // 4. Resolve manual override details from metadata_json
    const metadata = safeParseJson(currentOrder.metadata_json, {});
    const invoiceOverride = metadata.invoice_override || {};
    const preflightOverride = metadata.preflight_override || {};

    const hasInvoiceOverride = invoiceOverride.enabled === true;
    const hasPreflightOverride = preflightOverride.enabled === true;
    const isOverride = hasInvoiceOverride || hasPreflightOverride;

    let overrideReason = null;
    let overrideActor = null;

    if (hasInvoiceOverride) {
        overrideReason = invoiceOverride.reason || null;
        overrideActor = invoiceOverride.actor || invoiceOverride.operatorId || null;
    } else if (hasPreflightOverride) {
        overrideReason = preflightOverride.reason || null;
        overrideActor = preflightOverride.actor || preflightOverride.operatorId || null;
    }

    // 5. Evaluate Decision Rules
    let invoiceReady = false;
    let decision = null;
    let recommendedAction = null;
    const blockers = [];
    const warnings = [];

    // Rule A: If required files are missing or pending upload
    const missingBlockers = [];
    if (!interiorFile) {
        missingBlockers.push('MISSING_INTERIOR_SLOT');
    } else if (interiorFile.status === 'PENDING' || interiorFile.status === 'REQUIRED') {
        missingBlockers.push('INTERIOR_FILE_PENDING');
    }
    if (!coverFile) {
        missingBlockers.push('MISSING_COVER_SLOT');
    } else if (coverFile.status === 'PENDING' || coverFile.status === 'REQUIRED') {
        missingBlockers.push('COVER_FILE_PENDING');
    }

    if (missingBlockers.length > 0) {
        blockers.push(...missingBlockers);
        decision = 'FILES_REQUIRED';
        recommendedAction = 'UPLOAD_FILES';
    }

    // Rule B: If any required file lacks preflight_job_id
    if (!decision) {
        const preflightMissingBlockers = [];
        if (interiorFile && !interiorFile.preflight_job_id) {
            preflightMissingBlockers.push('PREFLIGHT_MISSING_INTERIOR_PDF');
        }
        if (coverFile && !coverFile.preflight_job_id) {
            preflightMissingBlockers.push('PREFLIGHT_MISSING_COVER_PDF');
        }
        if (preflightMissingBlockers.length > 0) {
            blockers.push(...preflightMissingBlockers);
            decision = 'PREFLIGHT_REQUIRED';
            recommendedAction = 'RUN_PREFLIGHT';
        }
    }

    // Rule C: If preflight outcomes are non-certifiable or degraded/failed
    if (!decision) {
        const blockedStatuses = ['FAILED', 'ERROR', 'DEGRADED'];
        const blockedOutcomes = ['DEGRADED_ANALYSIS', 'FAILED_ANALYSIS', 'NON_CERTIFIABLE'];

        const preflightBlockedBlockers = [];
        if (interiorFile) {
            const status = (interiorFile.preflight_status || '').toUpperCase();
            const outcome = (interiorFile.preflight_outcome_category || '').toUpperCase();
            if (blockedStatuses.includes(status) || blockedOutcomes.includes(outcome)) {
                preflightBlockedBlockers.push('PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF');
            }
        }
        if (coverFile) {
            const status = (coverFile.preflight_status || '').toUpperCase();
            const outcome = (coverFile.preflight_outcome_category || '').toUpperCase();
            if (blockedStatuses.includes(status) || blockedOutcomes.includes(outcome)) {
                preflightBlockedBlockers.push('PREFLIGHT_NON_CERTIFIABLE_COVER_PDF');
            }
        }

        if (preflightBlockedBlockers.length > 0) {
            blockers.push(...preflightBlockedBlockers);
            decision = 'PREFLIGHT_BLOCKED';
            recommendedAction = 'FILE_REUPLOAD_REQUIRED';
        }
    }

    // Rule D: If all required files are certifiable
    if (!decision) {
        decision = 'READY_FOR_INVOICE';
        invoiceReady = true;
        recommendedAction = 'GENERATE_INVOICE';
    }

    // Rule E: Handle manual override
    if (!invoiceReady && isOverride) {
        warnings.push(`Invoice gate overridden by user.`);
        if (overrideReason) warnings.push(`Override reason: ${overrideReason}`);
        if (overrideActor) warnings.push(`Overridden by: ${overrideActor}`);
        warnings.push(`Original blockers: ${blockers.join(', ')}`);

        invoiceReady = true;
        decision = 'READY_FOR_INVOICE_WITH_OVERRIDE';
        recommendedAction = 'GENERATE_INVOICE';
    }

    const evaluatedAt = new Date().toISOString();
    const evaluatedBy = options.evaluatedBy || options.operatorId || 'control-plane';

    // 6. Persist results
    const updatedMetadata = {
        ...metadata,
        invoice_gate: {
            phase: '36.5',
            decision,
            invoiceReady,
            blockers,
            warnings,
            recommendedAction,
            evaluatedAt,
            evaluatedBy
        }
    };

    const currentReadiness = safeParseJson(currentOrder.readiness_json, {});
    const updatedReadiness = {
        ...currentReadiness,
        invoiceReady,
        invoiceGateDecision: decision,
        invoiceGateBlockers: blockers,
        invoiceGateWarnings: warnings,
        invoiceGateRecommendedAction: recommendedAction,
        invoiceGateEvaluatedAt: evaluatedAt
    };

    let statusToSet = currentOrder.status;
    if (invoiceReady) {
        statusToSet = 'READY_TO_INVOICE';
    }

    await mysqlClient.query(`
        UPDATE marketplace_orders
        SET metadata_json = ?, readiness_json = ?, status = ?, updated_at = NOW()
        WHERE order_id = ?
    `, [JSON.stringify(updatedMetadata), JSON.stringify(updatedReadiness), statusToSet, orderId]);

    // 7. Append audit event
    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        try {
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'INVOICE_GATE_EVALUATED',
                payload: {
                    decision,
                    invoiceReady,
                    blockers,
                    warnings,
                    recommendedAction,
                    evaluatedBy,
                    evaluatedAt
                }
            });
        } catch (eventErr) {
            logger.warn({ event: 'EVENT_APPEND_FAILED', orderId, error: eventErr.message });
        }
    }

    return {
        ok: true,
        orderId,
        invoiceReady,
        decision,
        blockers,
        warnings,
        recommendedAction,
        readiness: updatedReadiness,
        files: files.map(f => ({
            fileId: f.file_id,
            role: f.role,
            status: f.status,
            preflightStatus: f.preflight_status,
            preflightOutcomeCategory: f.preflight_outcome_category,
            findingsCount: f.findings_count
        }))
    };
}

module.exports = {
    evaluateMarketplaceInvoiceGate
};
