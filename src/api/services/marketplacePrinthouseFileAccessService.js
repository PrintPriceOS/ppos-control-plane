/**
 * src/api/services/marketplacePrinthouseFileAccessService.js
 * 
 * Phase 38.3.1 — ControlPlane Secure Printhouse File Access API
 */

const mysqlClient = require('./mysqlClient');
const crypto = require('crypto');
const logger = require('./logger').child('printhouse-file-access');
const fs = require('fs');
const path = require('path');

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
 * Returns a sanitized list of files from the order's dispatch package manifest.
 */
async function listPackageFiles(orderId, options = {}) {
    const orders = await mysqlClient.query('SELECT metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) throw new Error('ORDER_NOT_FOUND');
    
    const metadata = safeParseJson(orders[0].metadata_json, {});
    const dispatch = metadata.dispatch_package;
    if (!dispatch) {
        throw new Error('HANDOFF_PACKAGE_NOT_FOUND');
    }

    const manifestFiles = dispatch.manifest?.files || [];
    
    return manifestFiles.map(file => {
        const f = { ...file };
        if (f.storagePath) {
            f.storagePath = `/api/production-files/download/${f.fileId}`;
        }
        return f;
    });
}

function checkPackageEligibility(metadata) {
    const dispatch = metadata.dispatch_package;
    if (!dispatch) throw new Error('HANDOFF_PACKAGE_NOT_FOUND');

    const validStatuses = [
        'ACKNOWLEDGED',
        'PRINTHOUSE_ACCEPTED',
        'PRINTHOUSE_HANDOFF_READY',
        'DISPATCH_PACKAGE_CREATED'
    ];
    if (!validStatuses.includes(dispatch.status)) {
        throw new Error('PACKAGE_NOT_ELIGIBLE_FOR_FILE_ACCESS');
    }
    
    if (dispatch.handoffStatus === 'REJECTED' || dispatch.handoffStatus === 'CLARIFICATION_REQUESTED') {
        throw new Error('PACKAGE_NOT_ELIGIBLE_FOR_FILE_ACCESS');
    }

    if (metadata.production_unlock?.status !== 'PRODUCTION_UNLOCKED') {
        throw new Error('PACKAGE_NOT_ELIGIBLE_FOR_FILE_ACCESS');
    }
    if (metadata.payment?.status !== 'PAYMENT_CONFIRMED') {
        throw new Error('PACKAGE_NOT_ELIGIBLE_FOR_FILE_ACCESS');
    }
    if (metadata.invoice?.status !== 'ISSUED') {
        throw new Error('PACKAGE_NOT_ELIGIBLE_FOR_FILE_ACCESS');
    }
    return dispatch;
}

/**
 * Creates a short-lived file access token.
 */
async function createPrinthouseFileAccessToken(orderId, fileId, payload = {}, options = {}) {
    if (process.env.PPOS_ENABLE_PHASE38_SECURE_FILE_ACCESS !== 'true') {
        throw new Error('PHASE38_SECURE_FILE_ACCESS_DISABLED');
    }

    // Use direct mysqlClient.query instead of transactions to match project pattern
    const orders = await mysqlClient.query('SELECT metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) throw new Error('ORDER_NOT_FOUND');
    
    const metadata = safeParseJson(orders[0].metadata_json, {});
    const dispatch = checkPackageEligibility(metadata);

        const file = (dispatch.manifest?.files || []).find(f => f.fileId === fileId);
        if (!file) throw new Error('FILE_NOT_IN_DISPATCH_PACKAGE');
        if (file.status === 'SUPERSEDED') throw new Error('FILE_SUPERSEDED');

        const tokenId = `pfat_${crypto.randomBytes(16).toString('hex')}`;
        const tokenPreview = `pfat_***${tokenId.slice(-4)}`;
        const now = Date.now();

        const tokenData = {
            tokenId,
            tokenPreview,
            orderId,
            fileId,
            role: file.role,
            packageId: dispatch.packageId,
            printhouseId: dispatch.manifest?.printhouse?.id || 'unknown',
            scope: "PRINTHOUSE_FILE_DOWNLOAD",
            status: "ACTIVE",
            expiresAt: now + (15 * 60 * 1000), // 15 mins
            createdAt: now,
            createdBy: payload.actor || 'control-plane-admin',
            maxUses: 3,
            useCount: 0,
            lastUsedAt: null
        };

        if (!metadata.dispatch_package.fileAccessTokens) {
            metadata.dispatch_package.fileAccessTokens = {};
        }
        metadata.dispatch_package.fileAccessTokens[tokenId] = tokenData;

    await mysqlClient.query('UPDATE marketplace_orders SET metadata_json = ? WHERE order_id = ?', [JSON.stringify(metadata), orderId]);

    await recordPrinthouseFileAccessEvent(orderId, fileId, 'PRINTHOUSE_FILE_ACCESS_TOKEN_CREATED', {
        packageId: dispatch.packageId,
        role: file.role,
        tokenPreview,
        actor: tokenData.createdBy
    });

    return {
        ok: true,
        token: tokenId,
        tokenPreview,
        expiresAt: tokenData.expiresAt,
        maxUses: tokenData.maxUses,
        downloadUrl: `/api/admin/marketplace/orders/${orderId}/printhouse-handoff/files/${fileId}/download?token=${tokenId}`
    };
}

/**
 * Validates token. Use { consume: true } to increment usage.
 */
async function validatePrinthouseFileAccessToken(token, options = {}) {
    if (!token || !token.startsWith('pfat_')) throw new Error('FILE_ACCESS_TOKEN_INVALID');

    // Use simple query without transactions
    // Inefficient but matches spec for token fallback lookup
    const orders = await mysqlClient.query(`SELECT order_id, metadata_json FROM marketplace_orders WHERE metadata_json LIKE ?`, [`%${token}%`]);
    if (!orders || orders.length === 0) throw new Error('FILE_ACCESS_TOKEN_INVALID');

        let targetOrder, targetTokenData, targetMetadata;
        for (const o of orders) {
            const meta = safeParseJson(o.metadata_json, {});
            if (meta.dispatch_package?.fileAccessTokens && meta.dispatch_package.fileAccessTokens[token]) {
                targetOrder = o;
                targetMetadata = meta;
                targetTokenData = meta.dispatch_package.fileAccessTokens[token];
                break;
            }
        }

        if (!targetTokenData) throw new Error('FILE_ACCESS_TOKEN_INVALID');

        if (targetTokenData.status !== 'ACTIVE') throw new Error('FILE_ACCESS_TOKEN_REVOKED');
        if (Date.now() > targetTokenData.expiresAt) throw new Error('FILE_ACCESS_TOKEN_EXPIRED');
        if (targetTokenData.useCount >= targetTokenData.maxUses) throw new Error('FILE_ACCESS_TOKEN_MAX_USES_EXCEEDED');

        // Check package eligibility at access time
        checkPackageEligibility(targetMetadata);

        const dispatch = targetMetadata.dispatch_package;
        const file = (dispatch.manifest?.files || []).find(f => f.fileId === targetTokenData.fileId);
        if (!file) throw new Error('FILE_NOT_IN_DISPATCH_PACKAGE');
        if (file.status === 'SUPERSEDED') throw new Error('FILE_SUPERSEDED');

    if (options.consume) {
        targetTokenData.useCount += 1;
        targetTokenData.lastUsedAt = Date.now();
        await mysqlClient.query('UPDATE marketplace_orders SET metadata_json = ? WHERE order_id = ?', [JSON.stringify(targetMetadata), targetOrder.order_id]);
    }

    return {
        ok: true,
        orderId: targetOrder.order_id,
        file,
        dispatch,
        tokenData: targetTokenData
    };
}

/**
 * Returns sanitized file descriptor.
 */
async function getPrinthouseFileDownloadDescriptor(orderId, fileId, tokenOrContext, options = {}) {
    let context = tokenOrContext;
    if (typeof tokenOrContext === 'string') {
        context = await validatePrinthouseFileAccessToken(tokenOrContext, { consume: false });
    }

    if (context.orderId !== orderId || context.file.fileId !== fileId) {
        throw new Error('FILE_ACCESS_TOKEN_INVALID');
    }

    const { file, dispatch, tokenData } = context;

    await recordPrinthouseFileAccessEvent(orderId, fileId, 'PRINTHOUSE_FILE_DOWNLOAD_DESCRIPTOR_CREATED', {
        packageId: dispatch.packageId,
        role: file.role,
        tokenPreview: tokenData.tokenPreview,
        actor: options.actor || 'control-plane-admin'
    });

    return {
        ok: true,
        orderId,
        fileId,
        role: file.role,
        packageId: dispatch.packageId,
        originalName: file.originalName || `${file.role.toLowerCase()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: file.sizeBytes || 0,
        checksumSha256: file.checksumSha256 || null,
        downloadReady: true,
        downloadUrl: `/api/admin/marketplace/orders/${orderId}/printhouse-handoff/files/${fileId}/download?token=${tokenData.tokenId}`,
        expiresAt: tokenData.expiresAt
    };
}

/**
 * Appends audit event.
 */
async function recordPrinthouseFileAccessEvent(orderId, fileId, eventType, payload = {}, options = {}) {
    const conn = mysqlClient;
    const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Make sure we never log the full token
    if (payload.token) {
        delete payload.token;
    }

    const query = `
        INSERT INTO marketplace_order_events 
        (event_id, order_id, file_id, type, actor_type, actor_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const actorId = payload.actor || 'SYSTEM';
    const actorType = actorId === 'SYSTEM' || actorId === 'control-plane-admin' || actorId === 'download-agent' ? 'SYSTEM' : 'USER';
    
    const queryParams = [
        eventId,
        orderId,
        fileId || null,
        eventType,
        actorType,
        actorId,
        JSON.stringify(payload)
    ];

    await conn.query(query, queryParams);
}

/**
 * Resolves a safe absolute physical path for file streaming.
 */
async function resolvePrinthouseFileStorage(orderId, fileId, fileContext, options = {}) {
    // 1. Determine allowed root
    const allowedRoot = process.env.PPOS_SECURE_FILE_STORAGE_ROOT || process.env.PPOS_PRODUCTION_FILES_ROOT;
    const defaultRoot = '/opt/printprice-os/storage/production-files';
    
    let activeRoot = allowedRoot;
    if (!activeRoot) {
        if (fs.existsSync(defaultRoot)) {
            activeRoot = defaultRoot;
        } else {
            throw new Error('FILE_STREAMING_NOT_CONFIGURED');
        }
    }
    
    // Normalize root to absolute
    activeRoot = path.resolve(activeRoot);

    const { file, dispatch } = fileContext;
    let candidates = [];

    // Candidate A: marketplace_order_files.storage_path
    const filesRows = await mysqlClient.query('SELECT storage_path FROM marketplace_order_files WHERE order_id = ? AND file_id = ?', [orderId, fileId]);
    if (filesRows && filesRows.length > 0 && filesRows[0].storage_path) {
        candidates.push(filesRows[0].storage_path);
    }
    
    // Candidate B: logical path or explicit storage path
    let logicalId = null;
    if (file.storagePath && file.storagePath.startsWith('/api/production-files/download/')) {
        logicalId = file.storagePath.replace('/api/production-files/download/', '').split('?')[0];
    } else if (file.storagePath) {
        candidates.push(file.storagePath);
    }

    if (logicalId) {
        candidates.push(`${logicalId}.pdf`);
        candidates.push(logicalId);
    }

    candidates.push(`${fileId}.pdf`);
    candidates.push(fileId);

    if (file.originalName) {
        const safeName = file.originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        candidates.push(safeName);
    }

    if (file.storageRef) {
        candidates.push(`${file.storageRef}.pdf`);
        candidates.push(file.storageRef);
    }
    
    if (file.storageId) {
        candidates.push(`${file.storageId}.pdf`);
        candidates.push(file.storageId);
    }

    let resolvedPath = null;

    if (process.env.PPOS_DEBUG_FILE_RESOLVER === 'true') {
        logger.info(`[DEBUG] File resolver candidates for ${fileId}:`, candidates);
    }

    for (const candidate of candidates) {
        if (!candidate) continue;

        let targetPath = candidate;

        if (!path.isAbsolute(targetPath)) {
            targetPath = path.join(activeRoot, targetPath);
        }

        // Normalize and defend against traversal
        targetPath = path.resolve(targetPath);
        if (!targetPath.startsWith(activeRoot + path.sep) && targetPath !== activeRoot) {
            continue; // Escape attempt or outside root
        }

        if (fs.existsSync(targetPath)) {
            try {
                // Verify it's a file
                const stat = await fs.promises.stat(targetPath);
                if (!stat.isFile()) continue;

                if (targetPath.toLowerCase().endsWith('.pdf')) {
                    resolvedPath = targetPath;
                    break;
                } else {
                    // allow no-extension candidate if magic bytes start with %PDF-
                    const fd = await fs.promises.open(targetPath, 'r');
                    const buffer = Buffer.alloc(5);
                    await fd.read(buffer, 0, 5, 0);
                    await fd.close();
                    if (buffer.toString('utf-8') === '%PDF-') {
                        resolvedPath = targetPath;
                        break;
                    }
                }
            } catch(e) {
                // Ignore stat/read errors
            }
        }
    }

    if (!resolvedPath) {
        throw new Error('FILE_NOT_FOUND_IN_STORAGE');
    }

    return resolvedPath;
}

module.exports = {
    listPackageFiles,
    createPrinthouseFileAccessToken,
    validatePrinthouseFileAccessToken,
    getPrinthouseFileDownloadDescriptor,
    recordPrinthouseFileAccessEvent,
    resolvePrinthouseFileStorage
};
