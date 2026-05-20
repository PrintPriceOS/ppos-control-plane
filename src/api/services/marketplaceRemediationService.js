/**
 * src/api/services/marketplaceRemediationService.js
 * 
 * Implements Phase 36.6: Customer Reupload / Remediation Loop.
 * Handles requesting remediation when the invoice gate is blocked,
 * registering customer file reuploads (version increment, superseding),
 * and running the full remediation cycle to verify resolutions.
 */

const mysqlClient = require('./mysqlClient');
const marketplaceInvoiceGateService = require('./marketplaceInvoiceGateService');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('marketplace-remediation');

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

// Helper: Generate unique IDs
function generateId(prefix = 'fil') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Initiates the remediation loop for a blocked order intent.
 * 
 * @param {string} orderId 
 * @param {object} payload { reason, message, force } 
 * @param {object} options { operatorId }
 */
async function requestRemediation(orderId, payload = {}, options = {}) {
    logger.info({ event: 'REMEDIATION_REQUEST_START', orderId });

    // 1. Retrieve the order
    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const order = orders[0];

    // 2. Evaluate the invoice gate
    const gateRes = await marketplaceInvoiceGateService.evaluateMarketplaceInvoiceGate(orderId, options);

    // 3. Reject if not blocked (unless forced)
    if (gateRes.recommendedAction !== 'FILE_REUPLOAD_REQUIRED' && payload.force !== true) {
        return {
            ok: false,
            error: 'REMEDIATION_NOT_REQUIRED',
            decision: gateRes.decision,
            blockers: gateRes.blockers,
            recommendedAction: gateRes.recommendedAction
        };
    }

    const metadata = safeParseJson(order.metadata_json, {});
    const currentRemediation = metadata.remediation || {};

    // 4. Idempotency check: avoid duplicate requests if already in customer action phase
    if (currentRemediation.status === 'CUSTOMER_ACTION_REQUIRED' && payload.force !== true) {
        return {
            ok: true,
            alreadyRequested: true,
            orderId,
            remediationStatus: 'CUSTOMER_ACTION_REQUIRED',
            requiredFiles: currentRemediation.requiredFiles || [],
            blockers: currentRemediation.blockers || [],
            message: currentRemediation.message || ''
        };
    }

    // 5. Determine required remediation files from blockers
    const requiredFiles = [];
    if (gateRes.blockers.includes('PREFLIGHT_NON_CERTIFIABLE_INTERIOR_PDF')) {
        requiredFiles.push('INTERIOR_PDF');
    }
    if (gateRes.blockers.includes('PREFLIGHT_NON_CERTIFIABLE_COVER_PDF')) {
        requiredFiles.push('COVER_PDF');
    }

    const reason = payload.reason || 'PREFLIGHT_NON_CERTIFIABLE';
    const message = payload.message || 'Please reupload corrected print-ready files.';
    const createdAt = new Date().toISOString();
    const createdBy = options.operatorId || options.evaluatedBy || 'break-glass-session';

    // 6. Update metadata with remediation payload and state
    metadata.remediation = {
        phase: '36.6',
        status: 'CUSTOMER_ACTION_REQUIRED',
        reason,
        message,
        requiredFiles,
        createdAt,
        createdBy,
        sourceDecision: gateRes.decision,
        blockers: gateRes.blockers,
        customerNotification: {
            status: 'PENDING_DELIVERY'
        }
    };

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    // 7. Append audit event
    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        try {
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'REMEDIATION_REQUESTED',
                payload: {
                    reason,
                    message,
                    requiredFiles,
                    blockers: gateRes.blockers
                }
            });
        } catch (eventErr) {
            logger.warn({ event: 'REMEDIATION_EVENT_APPEND_FAILED', orderId, error: eventErr.message });
        }
    }

    return {
        ok: true,
        orderId,
        remediationStatus: 'CUSTOMER_ACTION_REQUIRED',
        requiredFiles,
        blockers: gateRes.blockers,
        message
    };
}

/**
 * Registers metadata for a reuploaded file, marking the old file superseded
 * and updating the remediation status accordingly.
 * 
 * @param {string} orderId 
 * @param {object} payload { role, originalName, mimeType, sizeBytes, checksumSha256, storagePath, autoBindPreflight, autoEvaluateInvoiceGate } 
 * @param {object} options { operatorId }
 */
async function registerRemediationUpload(orderId, payload = {}, options = {}) {
    const { role, originalName, storagePath } = payload;
    logger.info({ event: 'REMEDIATION_FILE_UPLOAD_START', orderId, role, originalName });

    // 1. Validate inputs
    if (role !== 'INTERIOR_PDF' && role !== 'COVER_PDF') {
        return {
            ok: false,
            error: 'INVALID_ROLE',
            message: "Role must be 'INTERIOR_PDF' or 'COVER_PDF'"
        };
    }
    if (!originalName || !storagePath) {
        return {
            ok: false,
            error: 'MISSING_REQUIRED_FIELDS',
            message: 'originalName and storagePath are required'
        };
    }

    // 2. Retrieve order
    const orders = await mysqlClient.query('SELECT * FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const order = orders[0];

    // 3. Mark the active file for this slot as SUPERSEDED (preserving all preflight details)
    const activeFiles = await mysqlClient.query(
        "SELECT * FROM marketplace_order_files WHERE order_id = ? AND role = ? AND status !== 'SUPERSEDED'",
        [orderId, role]
    );

    let oldFileId = null;
    let previousVersion = 0;
    if (activeFiles && activeFiles.length > 0) {
        const activeFile = activeFiles[0];
        oldFileId = activeFile.file_id;
        previousVersion = activeFile.version || 1;
        await mysqlClient.query(`
            UPDATE marketplace_order_files
            SET status = 'SUPERSEDED',
                updated_at = NOW()
            WHERE order_id = ?
              AND role = ?
              AND file_id = ?
        `, [orderId, role, oldFileId]);
    }

    // 4. Compute next version
    const versionRows = await mysqlClient.query(
        "SELECT MAX(version) as maxVersion FROM marketplace_order_files WHERE order_id = ? AND role = ?",
        [orderId, role]
    );
    let maxVersion = 0;
    if (versionRows && versionRows.length > 0 && versionRows[0].maxVersion !== null) {
        maxVersion = versionRows[0].maxVersion;
    }
    const newVersion = maxVersion + 1;

    // 5. Insert new file row
    const newFileId = generateId('fil');
    const newFileMetadata = {
        phase: '36.6',
        supersedesFileId: oldFileId,
        remediationUpload: true,
        uploadedBy: options.operatorId || 'customer',
        uploadedAt: new Date().toISOString()
    };

    await mysqlClient.query(`
        INSERT INTO marketplace_order_files (
            file_id, order_id, role, version, original_name, mime_type, size_bytes, checksum_sha256, storage_path, status,
            preflight_job_id, preflight_status, preflight_outcome_category, findings_count, metadata_json, uploaded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADED', NULL, NULL, NULL, 0, ?, NOW(), NOW(), NOW())
    `, [
        newFileId,
        orderId,
        role,
        newVersion,
        originalName,
        payload.mimeType || 'application/pdf',
        payload.sizeBytes || 0,
        payload.checksumSha256 || null,
        storagePath,
        JSON.stringify(newFileMetadata)
    ]);

    // 6. Append audit events
    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        try {
            if (oldFileId) {
                await marketplaceOrderService.appendOrderEvent(orderId, {
                    fileId: oldFileId,
                    type: 'FILE_SUPERSEDED',
                    payload: { role, supersededBy: newFileId, version: previousVersion }
                });
            }
            await marketplaceOrderService.appendOrderEvent(orderId, {
                fileId: newFileId,
                type: 'REMEDIATION_FILE_UPLOADED',
                payload: { role, originalName, version: newVersion, oldFileId }
            });
        } catch (eventErr) {
            logger.warn({ event: 'REMEDIATION_UPLOAD_EVENT_APPEND_FAILED', orderId, error: eventErr.message });
        }
    }

    // 7. Calculate remediation.status against remediation.requiredFiles
    const freshMetadata = safeParseJson(order.metadata_json, {});
    const remediation = freshMetadata.remediation || {};
    const requiredFiles = remediation.requiredFiles || [];
    const remediationRequestTime = remediation.createdAt ? new Date(remediation.createdAt) : new Date(0);

    const freshActiveFiles = await mysqlClient.query(
        "SELECT * FROM marketplace_order_files WHERE order_id = ? AND status !== 'SUPERSEDED'",
        [orderId]
    );

    const reuploadedRoles = [];
    for (const reqRole of requiredFiles) {
        const file = freshActiveFiles.find(f => f.role === reqRole);
        if (file) {
            const fileMeta = safeParseJson(file.metadata_json, {});
            const uploadedAtStr = fileMeta.uploadedAt || file.uploaded_at;
            const fileUploadedTime = uploadedAtStr ? new Date(uploadedAtStr) : new Date(0);

            if (fileMeta.remediationUpload === true && fileUploadedTime >= remediationRequestTime) {
                reuploadedRoles.push(reqRole);
            }
        }
    }

    let remediationStatus = remediation.status || 'CUSTOMER_ACTION_REQUIRED';
    if (requiredFiles.length > 0) {
        const allReuploaded = requiredFiles.every(r => reuploadedRoles.includes(r));
        if (allReuploaded) {
            remediationStatus = 'REUPLOAD_RECEIVED';
        } else if (reuploadedRoles.length > 0) {
            remediationStatus = 'PARTIAL_REUPLOAD_RECEIVED';
        } else {
            remediationStatus = 'CUSTOMER_ACTION_REQUIRED';
        }
    } else {
        remediationStatus = 'REUPLOAD_RECEIVED';
    }

    remediation.status = remediationStatus;
    remediation.updatedAt = new Date().toISOString();
    freshMetadata.remediation = remediation;

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(freshMetadata), orderId]
    );

    // 8. Auto bind/evaluate
    let preflightBinding = null;
    let invoiceGate = null;

    if (payload.autoBindPreflight === true) {
        const bindingService = require('./marketplacePreflightBindingService');
        preflightBinding = await bindingService.bindPreflightFromMarketplaceFiles(orderId, options);
    }

    if (payload.autoEvaluateInvoiceGate === true) {
        invoiceGate = await marketplaceInvoiceGateService.evaluateMarketplaceInvoiceGate(orderId, options);
    }

    return {
        ok: true,
        orderId,
        role,
        oldFileId,
        newFileId,
        version: newVersion,
        preflightBinding,
        invoiceGate
    };
}

/**
 * Runs the full preflight binding and invoice gate cycle to resolve remediation.
 * 
 * @param {string} orderId 
 * @param {object} options 
 */
async function runRemediationCycle(orderId, options = {}) {
    logger.info({ event: 'REMEDIATION_CYCLE_RUN_START', orderId });

    // 1. Run preflight binding for active unbound files
    const bindingService = require('./marketplacePreflightBindingService');
    const bindingRes = await bindingService.bindPreflightFromMarketplaceFiles(orderId, options);

    // 2. Evaluate invoice gate
    const gateRes = await marketplaceInvoiceGateService.evaluateMarketplaceInvoiceGate(orderId, options);

    // 3. Conservative status transitions
    let newRemediationStatus = 'STILL_BLOCKED';
    if (gateRes.decision === 'PREFLIGHT_REQUIRED') {
        newRemediationStatus = 'PREFLIGHT_REQUIRED';
    } else if (gateRes.invoiceReady === true) {
        newRemediationStatus = 'RESOLVED';
    } else {
        newRemediationStatus = 'STILL_BLOCKED';
    }

    // 4. Update order metadata remediation status
    const orders = await mysqlClient.query('SELECT metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (orders && orders.length > 0) {
        const metadata = safeParseJson(orders[0].metadata_json, {});
        if (metadata.remediation) {
            metadata.remediation.status = newRemediationStatus;
            metadata.remediation.updatedAt = new Date().toISOString();
            await mysqlClient.query(
                'UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?',
                [JSON.stringify(metadata), orderId]
            );

            // Log appropriate audit events
            if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
                try {
                    if (newRemediationStatus === 'RESOLVED') {
                        await marketplaceOrderService.appendOrderEvent(orderId, {
                            type: 'REMEDIATION_RESOLVED',
                            payload: { decision: gateRes.decision, evaluatedBy: options.operatorId || 'system' }
                        });
                    } else {
                        await marketplaceOrderService.appendOrderEvent(orderId, {
                            type: 'REMEDIATION_STILL_BLOCKED',
                            payload: { decision: gateRes.decision, blockers: gateRes.blockers }
                        });
                    }
                } catch (eventErr) {
                    logger.warn({ event: 'REMEDIATION_CYCLE_EVENT_APPEND_FAILED', orderId, error: eventErr.message });
                }
            }
        }
    }

    return {
        ok: true,
        orderId,
        binding: bindingRes,
        invoiceGate: gateRes,
        remediationStatus: newRemediationStatus
    };
}

module.exports = {
    requestRemediation,
    registerRemediationUpload,
    runRemediationCycle
};
