// src/api/services/ordersService.js
const { query } = require('./mysqlClient');
const crypto = require('crypto');

const VALID_STATUSES = [
    'pending', 'reviewing', 'in_production', 'shipped', 'delivered', 'cancelled',
    'FILES_PENDING', 'FILES_VALIDATED', 'INVOICE_PENDING', 'PAYMENT_PENDING', 'READY_FOR_PRINTHOUSE'
];
const UPDATABLE_FIELDS = [
    'status', 'specs', 'offer_print_house', 'offer_price',
    'selected_offer_id', 'recommended_offer_id', 'offers_snapshot',
    'production_files', 'invoice_payment'
];

async function listOrders({ status, user_id, printhouse_id, limit = 50, offset = 0 }) {
    const where = [];
    const params = [];

    if (status) { where.push('status = ?'); params.push(status); }
    if (user_id) { where.push('user_id = ?'); params.push(user_id); }
    if (printhouse_id) { where.push('offer_print_house = ?'); params.push(printhouse_id); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRow] = await query(
        `SELECT COUNT(*) AS total FROM orders ${whereSql}`,
        params
    );

    const rows = await query(
        `SELECT * FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, Number(limit), Number(offset)]
    );

    return { total: Number(countRow.total), orders: rows };
}

async function getOrder(id) {
    const rows = await query('SELECT * FROM orders WHERE id = ?', [id]);
    return rows[0] || null;
}

async function getOrderByRef(order_ref) {
    const rows = await query('SELECT * FROM orders WHERE order_ref = ?', [order_ref]);
    return rows[0] || null;
}

let ordersTableColumns = null;

/**
 * Dynamically discover orders table columns for safe backward-compatible inserts.
 */
async function getOrdersTableColumns() {
    if (ordersTableColumns) return ordersTableColumns;
    try {
        const rows = await query('DESCRIBE orders');
        ordersTableColumns = rows.map(r => r.Field);
        return ordersTableColumns;
    } catch (err) {
        console.error('[ORDERS][SCHEMA-CHECK] Failed to describe orders table:', err.message);
        return ['order_ref', 'user_id', 'specs', 'offer_print_house', 'offer_price', 'status']; // Minimum baseline
    }
}

/**
 * Resolve a safe, unique order_ref for legacy orders table (char 16).
 * Prevents collisions by generating a short unique ID for BPE orders.
 */
function makeOrderRef(payload, isBpe) {
    if (payload.order_ref) return String(payload.order_ref).substring(0, 16);
    
    // Generate a unique suffix from timestamp (last 12 digits)
    const suffix = Date.now().toString().slice(-12);
    
    // For BPE, we use a dedicated prefix to avoid collisions with source_ref truncation
    if (isBpe) {
        return `bpe_${suffix}`.substring(0, 16);
    }
    return `ord_${suffix}`.substring(0, 16);
}

async function createOrder(payload) {
    const isBpe = payload.source === 'BPE' || payload.source_ref != null;
    
    // Resolve user id
    let resolvedUserId = payload.user_id || payload.userId;
    if (isBpe && !resolvedUserId) {
        resolvedUserId = process.env.PPOS_BPE_SYSTEM_USER_ID || 'bpe-system-user';
    }

    // Validate user id against users(id) table (VARCHAR 64), not control_users (INT)
    const userRows = await query('SELECT id FROM users WHERE id = ? LIMIT 1', [resolvedUserId]);
    if (!userRows || userRows.length === 0) {
        if (isBpe) {
            throw new Error('BPE_SYSTEM_USER_NOT_FOUND');
        } else {
            throw new Error('ORDER_USER_NOT_FOUND');
        }
    }
    resolvedUserId = String(userRows[0].id);

    // BPE Defaults and Resolvers
    const order_ref = makeOrderRef(payload, isBpe);
    const user_id = resolvedUserId;
    const specs = payload.specs;
    const offer_print_house = payload.offer_print_house || 'BPE_Engine';
    const offer_price = payload.offer_price ?? payload.pricing?.bpe_price ?? payload.pricing?.price ?? 0;

    // Strict Validation for Required Legacy Fields
    if (!order_ref || !user_id || !specs || !offer_print_house || offer_price == null) {
        throw new Error('ORDER_REQUIRED_FIELDS_MISSING');
    }

    // Structured Log
    console.log(`[ORDERS][USER-RESOLVED]`, {
        source: payload.source || (isBpe ? 'BPE' : 'INTERNAL'),
        sourceRef: payload.source_ref || payload.order_ref,
        orderRef: order_ref,
        userId: resolvedUserId
    });

    const allColumns = await getOrdersTableColumns();
    const stringify = (val) => (val && typeof val === 'object') ? JSON.stringify(val) : val;
    
    // Prepare Data Map
    const data = {
        order_ref, 
        user_id,
        specs: stringify(specs),
        offer_print_house,
        offer_price,
        status: payload.status || 'pending',
        
        // Rich BPE Fields (Preserve full length)
        source: payload.source || (isBpe ? 'BPE' : null),
        source_ref: payload.source_ref || payload.order_ref || null,
        tenant_id: payload.tenant_id || 'default',
        customer: stringify(payload.customer),
        pricing: stringify(payload.pricing),
        delivery: stringify(payload.delivery),
        currency: payload.currency || payload.pricing?.currency || 'EUR',
        metadata_json: stringify(payload.metadata_json),

        // Hardened Intake (Phase 10 Intelligence Layer)
        selected_offer_id: payload.selected_offer_id || null,
        recommended_offer_id: payload.recommended_offer_id || null,
        offers_snapshot: stringify(payload.offers_snapshot || payload.metadata_json?.offers_snapshot),
        production_files: stringify(payload.production_files || payload.metadata_json?.production_files),
        invoice_payment: stringify(payload.invoice_payment || payload.metadata_json?.invoice_payment)
    };

    // Industrial: Detect v5.3 Hardened Intake contract
    const isHardenedIntake = payload.metadata_json?.production_files?.required === true;
    if (isHardenedIntake) {
        data.status = 'FILES_PENDING';
        
        // Handle invoice_payment hardening
        const invoice_payment = payload.metadata_json.invoice_payment || {};
        invoice_payment.invoice_status = 'PENDING_FILES';
        invoice_payment.payment_status = 'PENDING';
        invoice_payment.invoice_blocked_until = 'FILES_INGESTED_AND_VALIDATED';
        
        data.invoice_payment = stringify(invoice_payment);
    }

    // Filter available columns (case-insensitive check for robustness)
    const columnsToInsert = Object.keys(data).filter(col => 
        allColumns.some(existing => existing.toLowerCase() === col.toLowerCase()) && 
        data[col] !== undefined
    );
    
    const placeholders = columnsToInsert.map(() => '?').join(', ');
    const values = columnsToInsert.map(col => data[col]);

    const result = await query(
        `INSERT INTO orders (${columnsToInsert.join(', ')}) VALUES (${placeholders})`,
        values
    );

    const insertId = result.insertId;

    // Intake Hook: Instantiate deterministic marketplace session orchestration via BPE client
    try {
        const marketplaceService = require('./marketplaceService');
        // Fetch full updated order row to pass to the session generator (ensures rich fields are included)
        const orderRows = await query('SELECT * FROM orders WHERE id = ?', [insertId]);
        console.log(`[ORDER-INTAKE] Order ${order_ref} created (ID: ${insertId})`);

        // Industrial: Hardened Asset Provisioning (v5.3)
        if (isHardenedIntake) {
            try {
                await provisionHardenedAssets(insertId, payload);
                await logOrderEvent(insertId, 'ORDER_REQUEST_CREATED', { hardened: true });
                await logOrderEvent(insertId, 'PRODUCTION_FILES_DECLARED', { files: Object.keys(payload.metadata_json.production_files).filter(k => k !== 'required') });
                await logOrderEvent(insertId, 'INVOICE_BLOCKED_PENDING_FILES', { reason: 'Hardened Intake' });
            } catch (err) {
                console.error('[ORDER-INTAKE][HARDENED] Asset provisioning failed:', err.message);
            }
        }

        const fullOrder = orderRows[0] || { id: insertId, ...data };

        // Run non-blocking marketplace session creation
        marketplaceService.createMarketplaceSessionFromOrder(fullOrder)
            .then((sessionSummary) => {
                console.log(`[MARKETPLACE][SESSION-CREATED] Deterministic marketplace session orchestrated successfully`, {
                    orderId: insertId,
                    jobId: insertId,
                    tenantId: fullOrder.tenant_id,
                    sessionId: sessionSummary?.id
                });
            })
            .catch(err => {
                const traceId = payload.metadata_json?.trace_id || `trace_${insertId}`;
                console.error(`[MARKETPLACE][ORCHESTRATION-FAILED] Auto-orchestration failure: ${err.message}`, {
                    orderId: insertId,
                    jobId: insertId,
                    tenantId: fullOrder.tenant_id || payload.tenant_id,
                    source: fullOrder.source || payload.source,
                    sourceRef: fullOrder.source_ref || payload.source_ref,
                    traceId
                });
            });
    } catch (err) {
        const traceId = payload.metadata_json?.trace_id || `trace_${insertId}`;
        console.error(`[MARKETPLACE][ORCHESTRATION-FAILED] Failed to invoke marketplace service hook: ${err.message}`, {
            orderId: insertId,
            jobId: insertId,
            tenantId: payload.tenant_id,
            source: payload.source,
            sourceRef: payload.source_ref,
            traceId
        });
    }

    return insertId;
}

/**
 * Provision forensic repository and file records for hardened intake.
 */
async function provisionHardenedAssets(orderId, payload) {
    const { rows: [order] } = await query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return;

    const repoId = crypto.randomUUID();
    const order_ref = order.order_ref;
    const user_id = order.user_id;

    // 1. Create Repository
    await query(`
        INSERT INTO production_file_repositories (id, order_id, order_ref, user_id, status)
        VALUES (?, ?, ?, ?, 'ACTIVE')
    `, [repoId, orderId, order_ref, user_id]);

    // 2. Create Files
    const declarations = payload.metadata_json.production_files || {};
    const assetKinds = ['INTERIOR_PDF', 'COVER_SPINE_BACK_PDF'];

    for (const kind of assetKinds) {
        const decl = declarations[kind] || {};
        const fileId = crypto.randomUUID();

        await query(`
            INSERT INTO production_files (
                id, order_id, order_ref, repository_id, kind, source_type,
                original_filename, download_url, ingestion_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DECLARED')
        `, [
            fileId, orderId, order_ref, repoId, kind,
            decl.source_type || 'UPLOAD',
            decl.filename || null,
            decl.url || null
        ]);

        // Log Initial File Event
        await query(`
            INSERT INTO production_file_events (production_file_id, order_id, order_ref, event_type, event_payload)
            VALUES (?, ?, ?, 'FILE_DECLARED', ?)
        `, [fileId, orderId, order_ref, JSON.stringify({ kind, source_type: decl.source_type })]);
    }
}

/**
 * Log central audit events to marketplace_events.
 */
async function logOrderEvent(orderId, type, metadata = {}) {
    const { rows: [order] } = await query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return;

    const eventId = crypto.randomUUID();
    await query(`
        INSERT INTO marketplace_events (
            id, order_id, order_ref, event_type, metadata_json,
            tenant_id, source, source_ref
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        eventId, orderId, order.order_ref, type, JSON.stringify(metadata),
        order.tenant_id, order.source, order.source_ref
    ]);
}

async function updateOrder(id, updates) {
    const fields = Object.keys(updates).filter(k => UPDATABLE_FIELDS.includes(k));
    if (fields.length === 0) return false;

    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
        throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
        if (f === 'specs' && typeof updates[f] === 'object') return JSON.stringify(updates[f]);
        return updates[f];
    });

    const result = await query(
        `UPDATE orders SET ${setClause} WHERE id = ?`,
        [...values, id]
    );

    return result.affectedRows > 0;
}

async function deleteOrder(id) {
    const result = await query('DELETE FROM orders WHERE id = ?', [id]);
    return result.affectedRows > 0;
}

module.exports = { listOrders, getOrder, getOrderByRef, createOrder, updateOrder, deleteOrder, provisionHardenedAssets, VALID_STATUSES };
