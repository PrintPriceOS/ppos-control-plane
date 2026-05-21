/**
 * src/api/services/marketplacePrinthouseFileAccessService.js
 * 
 * Phase 38.3.1 — ControlPlane Secure Printhouse File Access API
 */

const mysqlClient = require('./mysqlClient');
const crypto = require('crypto');
const logger = require('./logger').child('printhouse-file-access');

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

module.exports = {
    listPackageFiles,
    createPrinthouseFileAccessToken,
    validatePrinthouseFileAccessToken,
    getPrinthouseFileDownloadDescriptor,
    recordPrinthouseFileAccessEvent
};
