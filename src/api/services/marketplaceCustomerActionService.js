/**
 * src/api/services/marketplaceCustomerActionService.js
 *
 * Phase 36.7 — Customer Notification + Reupload UI Handoff.
 *
 * Converts remediation.status into a customer-facing correction flow:
 *   CUSTOMER_ACTION_REQUIRED / STILL_BLOCKED
 *   → generate customer action payload
 *   → generate secure opaque reupload token
 *   → persist under metadata_json.customer_action
 *   → audit trail
 *
 * Does NOT modify:
 *   - Phase 36.3 upload/register flow
 *   - Phase 36.4 preflight binding
 *   - Phase 36.5 invoice gate
 *   - Phase 36.6 remediation versioning
 */

const crypto = require('crypto');
const mysqlClient = require('./mysqlClient');
const logger = require('./logger').child('marketplace-customer-action');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseJson(value, fallback = null) {
    if (typeof value === 'object' && value !== null) return value;
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch (e) {
        return fallback;
    }
}

/**
 * Generate a secure opaque token with the `cat_` prefix.
 * Returns { token, tokenHash, tokenPreview }.
 */
function generateSecureToken() {
    const randomBytes = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const token = `cat_${randomBytes}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenPreview = token.substring(0, 12); // "cat_XXXXXXXX"
    return { token, tokenHash, tokenPreview };
}

/**
 * Hash a raw token for comparison against the stored hash.
 */
function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Get the configured token TTL in days, or default to 14.
 */
function getTokenTtlDays() {
    const envVal = process.env.CUSTOMER_ACTION_TOKEN_TTL_DAYS;
    if (envVal && !isNaN(Number(envVal))) return Number(envVal);
    return 14;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * createCustomerAction(orderId, payload = {}, options = {})
 *
 * Creates a customer action record under metadata_json.customer_action.
 *
 * Gates:
 *   - remediation.status must be CUSTOMER_ACTION_REQUIRED or STILL_BLOCKED
 *     (unless payload.force === true)
 *   - invoice_gate.invoiceReady must NOT be true
 *
 * Idempotency:
 *   - If an active customer_action already exists and force !== true,
 *     returns the existing action without creating a new token.
 *
 * Returns the full action payload including the raw token (one-time exposure).
 */
async function createCustomerAction(orderId, payload = {}, options = {}) {
    const operatorId = options.operatorId || 'system';
    const force = payload.force === true;

    // 1. Load order
    const orderRows = await mysqlClient.query(
        'SELECT * FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orderRows || orderRows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const orderRow = orderRows[0];
    const metadata = safeParseJson(orderRow.metadata_json, {});

    // 2. Check invoice gate — if invoiceReady, action is not required
    const invoiceGate = metadata.invoice_gate || {};
    if (invoiceGate.invoiceReady === true) {
        return {
            ok: true,
            orderId,
            actionRequired: false,
            reason: 'ACTION_NOT_REQUIRED',
            message: 'Invoice gate is ready; no customer action needed.'
        };
    }

    // 3. Check remediation status gate
    const remediation = metadata.remediation || {};
    const allowedStatuses = ['CUSTOMER_ACTION_REQUIRED', 'STILL_BLOCKED'];
    if (!force && !allowedStatuses.includes(remediation.status)) {
        return {
            ok: false,
            orderId,
            error: 'REMEDIATION_STATUS_NOT_ACTIONABLE',
            currentStatus: remediation.status || 'UNKNOWN',
            message: `Remediation status must be one of: ${allowedStatuses.join(', ')}. Use force=true to override.`
        };
    }

    // 4. Idempotency check
    const existingAction = metadata.customer_action || null;
    if (existingAction && existingAction.status && !force) {
        // If action is not expired, return it as-is (no raw token)
        const expiresAt = existingAction.expiresAt ? new Date(existingAction.expiresAt) : null;
        const isExpired = expiresAt && expiresAt < new Date();

        if (!isExpired) {
            return {
                ok: true,
                orderId,
                actionRequired: true,
                alreadyExists: true,
                type: existingAction.type,
                status: existingAction.status,
                requiredFiles: existingAction.requiredFiles || [],
                blockers: existingAction.blockers || [],
                message: existingAction.message || '',
                tokenPreview: existingAction.tokenPreview || '',
                createdAt: existingAction.createdAt,
                expiresAt: existingAction.expiresAt,
                notifiedAt: existingAction.notifiedAt,
                viewedAt: existingAction.viewedAt
            };
        }
    }

    // 5. Build the customer action
    const requiredFiles = remediation.requiredFiles || [];
    const blockers = remediation.blockers || invoiceGate.blockers || [];
    const message = payload.message || remediation.message || 'Please reupload corrected print-ready files.';

    const { token, tokenHash, tokenPreview } = generateSecureToken();
    const ttlDays = getTokenTtlDays();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const customerAction = {
        phase: '36.7',
        status: 'PENDING_NOTIFICATION',
        type: 'FILE_REUPLOAD_REQUIRED',
        requiredFiles,
        blockers,
        message,
        tokenHash,
        tokenPreview,
        createdAt: now.toISOString(),
        createdBy: operatorId,
        expiresAt: expiresAt.toISOString(),
        notifiedAt: null,
        viewedAt: null
    };

    // 6. Persist — merge safely into metadata_json
    metadata.customer_action = customerAction;

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    // 7. Audit event
    await require('./marketplaceOrderService').appendOrderEvent(orderId, {
        type: 'CUSTOMER_ACTION_CREATED',
        actorType: 'ADMIN',
        actorId: operatorId,
        payload: {
            type: customerAction.type,
            requiredFiles,
            blockers,
            tokenPreview,
            expiresAt: customerAction.expiresAt,
            forced: force
        }
    });

    logger.info({
        event: 'CUSTOMER_ACTION_CREATED',
        orderId,
        type: customerAction.type,
        tokenPreview,
        expiresAt: customerAction.expiresAt,
        operatorId
    });

    // 8. Return (includes raw token — one-time exposure)
    return {
        ok: true,
        orderId,
        actionRequired: true,
        type: customerAction.type,
        status: customerAction.status,
        requiredFiles,
        blockers,
        message,
        token, // Raw token — only returned on creation
        tokenPreview,
        createdAt: customerAction.createdAt,
        expiresAt: customerAction.expiresAt
    };
}

/**
 * getCustomerAction(orderId, options = {})
 *
 * Returns the current customer_action from metadata_json (admin view, no raw token).
 */
async function getCustomerAction(orderId, options = {}) {
    const orderRows = await mysqlClient.query(
        'SELECT * FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orderRows || orderRows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const orderRow = orderRows[0];
    const metadata = safeParseJson(orderRow.metadata_json, {});
    const action = metadata.customer_action || null;

    if (!action) {
        return {
            ok: true,
            orderId,
            actionRequired: false,
            customerAction: null,
            message: 'No customer action has been created for this order.'
        };
    }

    // Check expiry
    const expiresAt = action.expiresAt ? new Date(action.expiresAt) : null;
    const isExpired = expiresAt && expiresAt < new Date();

    return {
        ok: true,
        orderId,
        actionRequired: !isExpired,
        expired: isExpired,
        customerAction: {
            phase: action.phase,
            status: action.status,
            type: action.type,
            requiredFiles: action.requiredFiles || [],
            blockers: action.blockers || [],
            message: action.message || '',
            tokenPreview: action.tokenPreview || '',
            createdAt: action.createdAt,
            createdBy: action.createdBy,
            expiresAt: action.expiresAt,
            notifiedAt: action.notifiedAt,
            viewedAt: action.viewedAt
        }
    };
}

/**
 * markCustomerActionNotified(orderId, options = {})
 *
 * Updates the customer action status to NOTIFIED and sets notifiedAt.
 */
async function markCustomerActionNotified(orderId, options = {}) {
    const operatorId = options.operatorId || 'system';

    const orderRows = await mysqlClient.query(
        'SELECT * FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orderRows || orderRows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const orderRow = orderRows[0];
    const metadata = safeParseJson(orderRow.metadata_json, {});
    const action = metadata.customer_action || null;

    if (!action) {
        return {
            ok: false,
            error: 'NO_CUSTOMER_ACTION',
            message: 'No customer action exists for this order.'
        };
    }

    const now = new Date().toISOString();
    action.status = 'NOTIFIED';
    action.notifiedAt = now;
    action.notifiedBy = operatorId;
    metadata.customer_action = action;

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    await orderService.appendOrderEvent(orderId, {
        type: 'CUSTOMER_ACTION_NOTIFIED',
        actorType: 'ADMIN',
        actorId: operatorId,
        payload: { notifiedAt: now, status: 'NOTIFIED' }
    });

    logger.info({ event: 'CUSTOMER_ACTION_NOTIFIED', orderId, operatorId });

    return {
        ok: true,
        orderId,
        status: 'NOTIFIED',
        notifiedAt: now
    };
}

/**
 * markCustomerActionViewed(orderId, rawToken, options = {})
 *
 * Validates the raw token against the stored hash and checks expiry.
 * If valid, updates status to VIEWED and sets viewedAt.
 */
async function markCustomerActionViewed(orderId, rawToken, options = {}) {
    const orderRows = await mysqlClient.query(
        'SELECT * FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orderRows || orderRows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const orderRow = orderRows[0];
    const metadata = safeParseJson(orderRow.metadata_json, {});
    const action = metadata.customer_action || null;

    if (!action) {
        return {
            ok: false,
            error: 'NO_CUSTOMER_ACTION',
            message: 'No customer action exists for this order.'
        };
    }

    // Validate token
    const providedHash = hashToken(rawToken);
    if (providedHash !== action.tokenHash) {
        logger.warn({ event: 'CUSTOMER_ACTION_TOKEN_INVALID', orderId });
        return {
            ok: false,
            error: 'INVALID_TOKEN',
            message: 'The provided token is invalid.'
        };
    }

    // Check expiry
    const expiresAt = action.expiresAt ? new Date(action.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
        return {
            ok: false,
            error: 'TOKEN_EXPIRED',
            message: 'The customer action token has expired. Please request a new one.',
            expiredAt: action.expiresAt
        };
    }

    // Update viewed status
    const now = new Date().toISOString();
    action.status = 'VIEWED';
    action.viewedAt = now;
    metadata.customer_action = action;

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    await orderService.appendOrderEvent(orderId, {
        type: 'CUSTOMER_ACTION_VIEWED',
        actorType: 'CUSTOMER',
        actorId: 'customer-via-token',
        payload: { viewedAt: now, status: 'VIEWED', tokenPreview: action.tokenPreview }
    });

    logger.info({ event: 'CUSTOMER_ACTION_VIEWED', orderId });

    return {
        ok: true,
        orderId,
        status: 'VIEWED',
        viewedAt: now,
        customerAction: {
            type: action.type,
            requiredFiles: action.requiredFiles || [],
            blockers: action.blockers || [],
            message: action.message || '',
            expiresAt: action.expiresAt
        }
    };
}

/**
 * generateCustomerReuploadToken(orderId, options = {})
 *
 * Rotates the token for an existing customer action.
 * Useful when the original token has expired or needs invalidation.
 */
async function generateCustomerReuploadToken(orderId, options = {}) {
    const operatorId = options.operatorId || 'system';

    const orderRows = await mysqlClient.query(
        'SELECT * FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orderRows || orderRows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    const orderRow = orderRows[0];
    const metadata = safeParseJson(orderRow.metadata_json, {});
    const action = metadata.customer_action || null;

    if (!action) {
        return {
            ok: false,
            error: 'NO_CUSTOMER_ACTION',
            message: 'No customer action exists for this order. Create one first.'
        };
    }

    // Generate new token
    const { token, tokenHash, tokenPreview } = generateSecureToken();
    const ttlDays = getTokenTtlDays();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const oldTokenPreview = action.tokenPreview;
    action.tokenHash = tokenHash;
    action.tokenPreview = tokenPreview;
    action.expiresAt = expiresAt.toISOString();
    // Reset view state on rotation
    action.viewedAt = null;
    if (action.status === 'VIEWED') {
        action.status = 'NOTIFIED'; // If it was viewed, back to notified (token changed)
    }
    metadata.customer_action = action;

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    await orderService.appendOrderEvent(orderId, {
        type: 'CUSTOMER_ACTION_TOKEN_ROTATED',
        actorType: 'ADMIN',
        actorId: operatorId,
        payload: {
            oldTokenPreview,
            newTokenPreview: tokenPreview,
            expiresAt: expiresAt.toISOString()
        }
    });

    logger.info({
        event: 'CUSTOMER_ACTION_TOKEN_ROTATED',
        orderId,
        oldTokenPreview,
        newTokenPreview: tokenPreview,
        operatorId
    });

    return {
        ok: true,
        orderId,
        token, // Raw token — one-time exposure
        tokenPreview,
        expiresAt: expiresAt.toISOString(),
        message: 'Token rotated successfully. Previous token is now invalid.'
    };
}

/**
 * validateCustomerToken(orderId, rawToken)
 *
 * Public-facing validation: checks hash match + expiry.
 * Returns the customer action payload if valid.
 */
async function validateCustomerToken(orderId, rawToken) {
    const orderRows = await mysqlClient.query(
        'SELECT * FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!orderRows || orderRows.length === 0) {
        return { ok: false, error: 'ORDER_NOT_FOUND' };
    }
    const orderRow = orderRows[0];
    const metadata = safeParseJson(orderRow.metadata_json, {});
    const action = metadata.customer_action || null;

    if (!action) {
        return { ok: false, error: 'NO_CUSTOMER_ACTION' };
    }

    // Validate hash
    const providedHash = hashToken(rawToken);
    if (providedHash !== action.tokenHash) {
        return { ok: false, error: 'INVALID_TOKEN' };
    }

    // Check expiry
    const expiresAt = action.expiresAt ? new Date(action.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
        return { ok: false, error: 'TOKEN_EXPIRED', expiredAt: action.expiresAt };
    }

    // Load active files for context
    const files = await mysqlClient.query(
        'SELECT file_id, role, status, preflight_status, preflight_outcome_category, findings_count, version FROM marketplace_order_files WHERE order_id = ? AND status <> \'SUPERSEDED\' ORDER BY role ASC',
        [orderId]
    );

    return {
        ok: true,
        orderId,
        action: {
            type: action.type,
            status: action.status,
            requiredFiles: action.requiredFiles || [],
            blockers: action.blockers || [],
            message: action.message || '',
            expiresAt: action.expiresAt,
            createdAt: action.createdAt
        },
        currentFiles: files.map(f => ({
            fileId: f.file_id,
            role: f.role,
            status: f.status,
            preflightStatus: f.preflight_status,
            outcomeCategory: f.preflight_outcome_category,
            findingsCount: Number(f.findings_count || 0),
            version: Number(f.version || 1)
        }))
    };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
    createCustomerAction,
    getCustomerAction,
    markCustomerActionNotified,
    markCustomerActionViewed,
    generateCustomerReuploadToken,
    validateCustomerToken
};
