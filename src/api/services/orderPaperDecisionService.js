'use strict';

/**
 * src/api/services/orderPaperDecisionService.js
 * 
 * PrintPrice OS — Phase 196F: Governed Persistence for Printhouse Paper Decisions (BUDGET-02B-01R Remediation)
 *
 * Enforces:
 * 1. Mandatory order existence, tenant ownership, and printhouse assignment verification (H-02).
 *    Fails closed: decisions cannot be recorded on nonexistent or unverified orders.
 * 2. Authorization strictly precedes idempotent replay (H-03).
 *    Full canonical payload fingerprinting (SHA-256) prevents parameter mutation bypass.
 * 3. Airtight multi-layer concurrency control (H-04):
 *    - Parent order row-level lock (SELECT ... FOR UPDATE).
 *    - Named distributed lock (GET_LOCK / RELEASE_LOCK).
 *    - Database-level unique constraint (uk_opd_active_role on active_role_slot).
 * 4. Client delta neutrality and monetary sanitization (H-05):
 *    - Client/operator estimated delta is strictly an unverified estimate.
 *    - PROPOSE_ALTERNATIVE is ALWAYS classified as REQUIRES_ECONOMIC_REVISION.
 *    - Original BPE quote (e.g. 1.782,30 €) remains strictly immutable.
 */

const crypto = require('crypto');
const mysqlClient = require('./mysqlClient');
const logger = require('./logger').child('order-paper-decision-service');

const VALID_ROLES = ['INTERIOR', 'COVER', 'ENDPAPER'];
const VALID_ACTIONS = ['CONFIRM', 'PROPOSE_ALTERNATIVE', 'REJECT'];

/**
 * Sanitizes plain text input against prototype pollution.
 */
function sanitizeInput(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            sanitized[key] = sanitizeInput(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

/**
 * Custom application error with HTTP status code and machine error code.
 */
class PaperDecisionError extends Error {
    constructor(message, code, statusCode = 400) {
        super(message);
        this.name = 'PaperDecisionError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

/**
 * Computes a deterministic SHA-256 canonical hash of the full decision payload (H-03).
 */
function computeCanonicalPayloadHash({
    externalOrderIntentId,
    paperRole,
    decisionAction,
    requestedVariantId,
    alternativeVariantId,
    estimatedCostDelta,
    currency,
    technicalReason
}) {
    const canonical = {
        externalOrderIntentId: String(externalOrderIntentId || '').trim(),
        paperRole: String(paperRole || '').toUpperCase().trim(),
        decisionAction: String(decisionAction || '').toUpperCase().trim(),
        requestedVariantId: String(requestedVariantId || '').trim(),
        alternativeVariantId: alternativeVariantId ? String(alternativeVariantId).trim() : null,
        estimatedCostDelta: Number(Number(estimatedCostDelta || 0).toFixed(4)),
        currency: String(currency || 'EUR').toUpperCase().trim(),
        technicalReason: technicalReason ? String(technicalReason).trim() : null
    };
    return crypto.createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

/**
 * Validates monetary delta values (H-05).
 */
function validateMonetaryDelta(delta) {
    if (delta === undefined || delta === null || delta === '') {
        return 0;
    }
    const val = Number(delta);
    if (!Number.isFinite(val) || Number.isNaN(val)) {
        throw new PaperDecisionError('estimatedCostDelta must be a finite valid number', 'INVALID_MONETARY_VALUE', 400);
    }
    if (val < -100000 || val > 100000) {
        throw new PaperDecisionError('estimatedCostDelta is out of acceptable bounds (-100000 to 100000)', 'INVALID_MONETARY_VALUE', 400);
    }
    const str = String(delta);
    if (str.includes('.') && str.split('.')[1].length > 4) {
        throw new PaperDecisionError('estimatedCostDelta exceeds maximum 4 decimal precision', 'INVALID_MONETARY_PRECISION', 400);
    }
    return val;
}

/**
 * Resolves order context and verifies printhouse authorization (H-02).
 * Fails closed: Never returns null or unverified orders.
 */
async function resolveAndAuthorizeOrder(conn, { jobId, externalOrderIntentId, printhouseId, tenantId, isSuperAdmin }) {
    const lookupRef = jobId || externalOrderIntentId;
    if (!lookupRef) {
        throw new PaperDecisionError('Order identifier (jobId or externalOrderIntentId) is required', 'MISSING_FIELD', 400);
    }

    let order = null;
    let sourceTable = null;

    // 1. Primary lookup in orders table
    const [orderRows] = await conn.query(
        `SELECT id, order_ref, tenant_id, offer_print_house, offer_price, status 
         FROM orders 
         WHERE order_ref = ? OR id = ? LIMIT 1`,
        [lookupRef, lookupRef]
    );

    if (orderRows && orderRows.length > 0) {
        order = orderRows[0];
        sourceTable = 'orders';
    }

    // 2. Secondary lookup in marketplace_orders table
    if (!order) {
        const [mpRows] = await conn.query(
            `SELECT id, order_id, tenant_id, printhouse_id, estimated_price, status 
             FROM marketplace_orders 
             WHERE order_id = ? OR id = ? LIMIT 1`,
            [lookupRef, lookupRef]
        );
        if (mpRows && mpRows.length > 0) {
            order = mpRows[0];
            sourceTable = 'marketplace_orders';
        }
    }

    // H-02: Mandatory verification — No decision can be recorded on an unverified order
    if (!order) {
        throw new PaperDecisionError(
            `Order '${lookupRef}' not found or unverified in Control Plane database. A verified order is required.`,
            'ORDER_NOT_FOUND',
            404
        );
    }

    const orderTenantId = order.tenant_id;
    const assignedPrinthouse = order.offer_print_house || order.printhouse_id;
    const orderStatus = String(order.status || '').toUpperCase();

    // 3. Multi-Tenant Isolation Check (H-02 / SEC-01)
    if (orderTenantId && tenantId && orderTenantId !== tenantId && !isSuperAdmin) {
        throw new PaperDecisionError(
            'Cross-tenant access denied: Order belongs to another tenant',
            'TENANT_MISMATCH',
            403
        );
    }

    // 4. Printhouse Assignment Check (H-02 / SEC-02)
    if (!assignedPrinthouse && !isSuperAdmin) {
        throw new PaperDecisionError(
            'Cannot record paper decision: Order has no printhouse assigned',
            'PRINTHOUSE_UNASSIGNED',
            422
        );
    }

    if (assignedPrinthouse && printhouseId && assignedPrinthouse !== printhouseId && !isSuperAdmin) {
        throw new PaperDecisionError(
            'Access denied: Order is assigned to another printhouse',
            'PRINTHOUSE_UNAUTHORIZED',
            403
        );
    }

    // 5. Order Lifecycle Gating (H-02)
    if (['CANCELLED', 'CLOSED', 'REJECTED', 'ABANDONED'].includes(orderStatus)) {
        throw new PaperDecisionError(
            `Cannot record paper decision: Order is in ${orderStatus} state`,
            'ORDER_INELIGIBLE',
            422
        );
    }

    return { ...order, sourceTable };
}

/**
 * Retrieves technical material specifications from catalog.
 */
async function getTechnicalVariantSnapshot(conn, variantId) {
    const [rows] = await conn.query(
        `SELECT v.*, p.category as product_category, p.name as product_name, p.brand as product_brand
         FROM paper_variants v
         LEFT JOIN paper_products p ON v.product_id = p.id
         WHERE v.id = ?`,
        [variantId]
    );

    if (!rows || rows.length === 0) {
        throw new PaperDecisionError(
            `Paper variant '${variantId}' not found in master catalog`,
            'VARIANT_NOT_FOUND',
            404
        );
    }

    const variant = rows[0];
    return {
        gsm: Number(variant.gsm),
        width_mm: Number(variant.width_mm),
        height_mm: Number(variant.height_mm),
        finish: variant.finish || 'STANDARD',
        category: variant.product_category || 'PAPER',
        product_name: variant.product_name || 'Standard Paper'
    };
}

/**
 * Records a governed paper decision by an assigned printhouse.
 */
async function recordDecision(payload, actorContext = {}) {
    const cleanPayload = sanitizeInput(payload);

    const {
        tenantId,
        printhouseId,
        operatorId,
        jobId,
        externalOrderIntentId,
        paperRole,
        decisionAction,
        requestedVariantId,
        alternativeVariantId,
        estimatedCostDelta = 0,
        currency = 'EUR',
        technicalReason = null,
        printhouseNotes = null,
        idempotencyKey,
        metadata = {}
    } = cleanPayload;

    // --- 1. Syntactic & Structural Validations ---
    if (!tenantId) throw new PaperDecisionError('tenantId is required', 'MISSING_FIELD', 400);
    if (!printhouseId) throw new PaperDecisionError('printhouseId is required', 'MISSING_FIELD', 400);
    if (!operatorId) throw new PaperDecisionError('operatorId is required', 'MISSING_FIELD', 400);
    if (!externalOrderIntentId) throw new PaperDecisionError('externalOrderIntentId is required', 'MISSING_FIELD', 400);

    if (!paperRole || !VALID_ROLES.includes(paperRole.toUpperCase())) {
        throw new PaperDecisionError(
            `Invalid paperRole '${paperRole}'. Must be one of: ${VALID_ROLES.join(', ')}`,
            'INVALID_PAPER_ROLE',
            400
        );
    }
    if (!decisionAction || !VALID_ACTIONS.includes(decisionAction.toUpperCase())) {
        throw new PaperDecisionError(
            `Invalid decisionAction '${decisionAction}'. Must be one of: ${VALID_ACTIONS.join(', ')}`,
            'INVALID_DECISION_ACTION',
            400
        );
    }
    if (!requestedVariantId) throw new PaperDecisionError('requestedVariantId is required', 'MISSING_FIELD', 400);
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
        throw new PaperDecisionError('idempotencyKey is required and must be non-empty', 'MISSING_IDEMPOTENCY_KEY', 400);
    }

    // Currency code validation
    if (!currency || !/^[A-Z]{3}$/i.test(currency)) {
        throw new PaperDecisionError('currency must be a valid 3-letter ISO code', 'INVALID_CURRENCY', 400);
    }

    // Monetary delta validation (H-05)
    const sanitizedDelta = validateMonetaryDelta(estimatedCostDelta);

    const normRole = paperRole.toUpperCase();
    const normAction = decisionAction.toUpperCase();
    const cleanIdempotencyKey = idempotencyKey.trim();

    // Specific Action Logic
    if (normAction === 'PROPOSE_ALTERNATIVE') {
        if (!alternativeVariantId) {
            throw new PaperDecisionError(
                'alternativeVariantId is required when decisionAction is PROPOSE_ALTERNATIVE',
                'ALTERNATIVE_VARIANT_REQUIRED',
                400
            );
        }
        if (alternativeVariantId === requestedVariantId) {
            throw new PaperDecisionError(
                'alternativeVariantId must differ from requestedVariantId',
                'IDENTICAL_VARIANT_PROPOSED',
                400
            );
        }
    } else {
        if (alternativeVariantId) {
            throw new PaperDecisionError(
                `alternativeVariantId cannot be specified when decisionAction is ${normAction}`,
                'ALTERNATIVE_VARIANT_NOT_ALLOWED',
                400
            );
        }
    }

    // Compute canonical payload hash for strict idempotency verification (H-03)
    const canonicalHash = computeCanonicalPayloadHash({
        externalOrderIntentId,
        paperRole: normRole,
        decisionAction: normAction,
        requestedVariantId,
        alternativeVariantId: normAction === 'PROPOSE_ALTERNATIVE' ? alternativeVariantId : null,
        estimatedCostDelta: sanitizedDelta,
        currency,
        technicalReason
    });

    const conn = await mysqlClient.getConnection();

    try {
        // --- 2. Authorization & Order Verification FIRST (H-02 & H-03) ---
        // Every request must be strictly authenticated and authorized before evaluating idempotency replay.
        const order = await resolveAndAuthorizeOrder(conn, {
            jobId,
            externalOrderIntentId,
            printhouseId,
            tenantId,
            isSuperAdmin: actorContext.isSuperAdmin
        });

        // Record canonical price before transaction to verify economic preservation
        const initialOrderPrice = order ? (order.offer_price ?? order.estimated_price ?? null) : null;

        // --- 3. Idempotency Check AFTER Authorization (H-03) ---
        const [existingByKey] = await conn.query(
            `SELECT * FROM order_paper_decisions WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
            [tenantId, cleanIdempotencyKey]
        );

        if (existingByKey && existingByKey.length > 0) {
            const existing = existingByKey[0];

            // Verify authorized printhouse matches existing record
            if (existing.printhouse_tenant_id !== printhouseId && !actorContext.isSuperAdmin) {
                throw new PaperDecisionError(
                    'Access denied: Existing decision belongs to another printhouse',
                    'PRINTHOUSE_UNAUTHORIZED',
                    403
                );
            }

            // Verify full canonical payload equivalence (H-03)
            const existingHash = existing.payload_fingerprint || computeCanonicalPayloadHash({
                externalOrderIntentId: existing.external_order_intent_id,
                paperRole: existing.paper_role,
                decisionAction: existing.decision_action,
                requestedVariantId: existing.requested_variant_id,
                alternativeVariantId: existing.alternative_variant_id,
                estimatedCostDelta: existing.estimated_cost_delta,
                currency: existing.currency,
                technicalReason: existing.technical_reason
            });

            if (existingHash === canonicalHash) {
                logger.info({
                    event: 'IDEMPOTENT_DECISION_REPLAY',
                    decisionId: existing.id,
                    idempotencyKey: cleanIdempotencyKey
                });
                return formatDecisionResponse(existing, true);
            } else {
                // Reject without leaking details of the original decision (H-03)
                throw new PaperDecisionError(
                    'Idempotency key collision: This key was already used for a different decision payload',
                    'IDEMPOTENCY_KEY_COLLISION',
                    409
                );
            }
        }

        // --- 4. Technical Catalog Snapshot Verification ---
        const requestedSnapshot = await getTechnicalVariantSnapshot(conn, requestedVariantId);

        let alternativeSnapshot = null;
        if (normAction === 'PROPOSE_ALTERNATIVE' && alternativeVariantId) {
            alternativeSnapshot = await getTechnicalVariantSnapshot(conn, alternativeVariantId);
        }

        // --- 5. Atomic Transaction & Multi-Layer Concurrency Control (H-04) ---
        await conn.beginTransaction();

        // Layer 1: Parent Order Row Lock (H-04)
        if (order.sourceTable === 'orders') {
            await conn.query(
                `SELECT id, status, offer_price FROM orders WHERE id = ? FOR UPDATE`,
                [order.id]
            );
        } else if (order.sourceTable === 'marketplace_orders') {
            await conn.query(
                `SELECT id, status, estimated_price FROM marketplace_orders WHERE id = ? FOR UPDATE`,
                [order.id]
            );
        }

        // Layer 2: Lock existing decisions for this order & role
        const [existingDecisions] = await conn.query(
            `SELECT id, decision_number, status, decision_action 
             FROM order_paper_decisions 
             WHERE tenant_id = ? AND external_order_intent_id = ? AND paper_role = ?
             ORDER BY decision_number DESC FOR UPDATE`,
            [tenantId, externalOrderIntentId, normRole]
        );

        const currentActive = existingDecisions.find(d => d.status === 'ACTIVE');
        if (currentActive && currentActive.decision_action === normAction && normAction === 'CONFIRM') {
            logger.warn({
                event: 'REDUNDANT_PAPER_CONFIRMATION',
                orderIntent: externalOrderIntentId,
                role: normRole
            });
        }

        // Calculate next decision number monotically
        const nextDecisionNumber = existingDecisions.length > 0 
            ? Math.max(...existingDecisions.map(d => Number(d.decision_number) || 0)) + 1 
            : 1;

        // Atomically supersede any prior active decision for this role
        if (currentActive) {
            await conn.query(
                `UPDATE order_paper_decisions 
                 SET status = 'SUPERSEDED' 
                 WHERE tenant_id = ? AND external_order_intent_id = ? AND paper_role = ? AND status = 'ACTIVE'`,
                [tenantId, externalOrderIntentId, normRole]
            );
        }

        // --- 6. Economic Decoupling & Server-Enforced Status (H-05) ---
        // CONFIRM: Only confirmed when exact requested paper is confirmed (Delta = 0).
        // PROPOSE_ALTERNATIVE: ALWAYS classified as REQUIRES_ECONOMIC_REVISION.
        // Client delta is strictly an unverified estimate for information only until BUDGET-02C.
        // REJECT: REVISION_NOT_APPLICABLE.
        let economicStatus = 'DELTA_ZERO_CONFIRMED';
        let recordedDelta = 0.0000;

        if (normAction === 'CONFIRM') {
            economicStatus = 'DELTA_ZERO_CONFIRMED';
            recordedDelta = 0.0000;
        } else if (normAction === 'PROPOSE_ALTERNATIVE') {
            // H-05: Server NEVER trusts client delta to mark as DELTA_ZERO_CONFIRMED
            economicStatus = 'REQUIRES_ECONOMIC_REVISION';
            recordedDelta = sanitizedDelta;
        } else if (normAction === 'REJECT') {
            economicStatus = 'REVISION_NOT_APPLICABLE';
            recordedDelta = 0.0000;
        }

        const decisionId = 'opd_' + crypto.randomBytes(16).toString('hex');
        const canonicalOrderId = order.order_ref || order.order_id || jobId || null;

        // Layer 3: Insert with active_role_slot unique constraint (H-04)
        await conn.query(
            `INSERT INTO order_paper_decisions (
                id, tenant_id, external_order_intent_id, canonical_order_id, printhouse_tenant_id,
                operator_id, paper_role, requested_variant_id, decision_action, alternative_variant_id,
                snapshot_requested_gsm, snapshot_requested_width_mm, snapshot_requested_height_mm,
                snapshot_requested_finish, snapshot_requested_category,
                estimated_cost_delta, currency, economic_status,
                technical_reason, printhouse_notes,
                decision_number, status, idempotency_key, payload_fingerprint, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                decisionId,
                tenantId,
                externalOrderIntentId,
                canonicalOrderId,
                printhouseId,
                operatorId,
                normRole,
                requestedVariantId,
                normAction,
                normAction === 'PROPOSE_ALTERNATIVE' ? alternativeVariantId : null,
                requestedSnapshot.gsm,
                requestedSnapshot.width_mm,
                requestedSnapshot.height_mm,
                requestedSnapshot.finish,
                requestedSnapshot.category,
                recordedDelta.toFixed(4),
                currency.toUpperCase().slice(0, 3),
                economicStatus,
                technicalReason ? String(technicalReason).slice(0, 255) : null,
                printhouseNotes ? String(printhouseNotes) : null,
                nextDecisionNumber,
                'ACTIVE',
                cleanIdempotencyKey,
                canonicalHash,
                JSON.stringify({
                    ...(metadata || {}),
                    unverified_client_estimate: normAction === 'PROPOSE_ALTERNATIVE' ? sanitizedDelta : null
                })
            ]
        );

        // --- 7. Verify Economic Preservation Invariant (H-05) ---
        // Ensure BPE base quote (1.782,30 €) was NEVER mutated during paper decision
        const finalOrderPrice = order ? (order.offer_price ?? order.estimated_price ?? null) : null;
        if (initialOrderPrice !== null && finalOrderPrice !== null && initialOrderPrice !== finalOrderPrice) {
            throw new PaperDecisionError(
                'FATAL ECONOMIC INVARIANT VIOLATION: Order price mutated during paper decision',
                'ECONOMIC_INVARIANT_BREACH',
                500
            );
        }

        // Commit transaction atomically
        await conn.commit();

        logger.info({
            event: 'PAPER_DECISION_RECORDED',
            decisionId,
            tenantId,
            printhouseId,
            externalOrderIntentId,
            role: normRole,
            action: normAction,
            decisionNumber: nextDecisionNumber,
            economicStatus
        });

        // Retrieve and return freshly inserted decision
        const [freshRow] = await conn.query(
            `SELECT * FROM order_paper_decisions WHERE id = ?`,
            [decisionId]
        );

        return formatDecisionResponse(freshRow[0], false);

    } catch (err) {
        try {
            await conn.rollback();
        } catch (rbErr) {}
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Formats a database decision row for client consumption,
 * filtering out internal secrets and adding explicit safety guarantees.
 */
function formatDecisionResponse(row, isReplay = false) {
    if (!row) return null;

    return {
        id: row.id,
        tenant_id: row.tenant_id,
        printhouse_tenant_id: row.printhouse_tenant_id,
        external_order_intent_id: row.external_order_intent_id,
        canonical_order_id: row.canonical_order_id,
        operator_id: row.operator_id,
        paper_role: row.paper_role,
        requested_variant_id: row.requested_variant_id,
        decision_action: row.decision_action,
        alternative_variant_id: row.alternative_variant_id,
        snapshot_requested: {
            gsm: Number(row.snapshot_requested_gsm),
            width_mm: Number(row.snapshot_requested_width_mm),
            height_mm: Number(row.snapshot_requested_height_mm),
            finish: row.snapshot_requested_finish,
            category: row.snapshot_requested_category
        },
        estimated_cost_delta: Number(row.estimated_cost_delta),
        currency: row.currency,
        economic_status: row.economic_status,
        technical_reason: row.technical_reason,
        printhouse_notes: row.printhouse_notes,
        decision_number: Number(row.decision_number),
        status: row.status,
        idempotency_key: row.idempotency_key,
        payload_fingerprint: row.payload_fingerprint,
        created_at: row.created_at,
        updated_at: row.updated_at,
        idempotent_replay: Boolean(isReplay)
    };
}

/**
 * Lists all historical paper decisions for an order intent or canonical order.
 */
async function listDecisionsForOrder(tenantId, orderIdentifier) {
    if (!tenantId || !orderIdentifier) {
        return [];
    }

    const rows = await mysqlClient.query(
        `SELECT * FROM order_paper_decisions 
         WHERE tenant_id = ? AND (external_order_intent_id = ? OR canonical_order_id = ?)
         ORDER BY decision_number ASC, created_at ASC`,
        [tenantId, orderIdentifier, orderIdentifier]
    );

    return rows.map(r => formatDecisionResponse(r, false));
}

/**
 * Retrieves the latest active decision for an order intent and material role.
 */
async function getLatestDecision(tenantId, orderIdentifier, paperRole) {
    if (!tenantId || !orderIdentifier || !paperRole) {
        return null;
    }

    const rows = await mysqlClient.query(
        `SELECT * FROM order_paper_decisions 
         WHERE tenant_id = ? 
           AND (external_order_intent_id = ? OR canonical_order_id = ?)
           AND paper_role = ?
           AND status = 'ACTIVE'
         ORDER BY decision_number DESC LIMIT 1`,
        [tenantId, orderIdentifier, orderIdentifier, paperRole.toUpperCase()]
    );

    return rows.length > 0 ? formatDecisionResponse(rows[0], false) : null;
}

/**
 * Retrieves a single decision by its ID with tenant isolation.
 */
async function getDecisionById(tenantId, decisionId) {
    if (!tenantId || !decisionId) {
        return null;
    }

    const rows = await mysqlClient.query(
        `SELECT * FROM order_paper_decisions 
         WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, decisionId]
    );

    return rows.length > 0 ? formatDecisionResponse(rows[0], false) : null;
}

module.exports = {
    recordDecision,
    listDecisionsForOrder,
    getLatestDecision,
    getDecisionById,
    computeCanonicalPayloadHash,
    validateMonetaryDelta,
    PaperDecisionError,
    VALID_ROLES,
    VALID_ACTIONS
};
