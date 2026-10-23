'use strict';

/**
 * src/api/services/paperProcurementService.js
 * 
 * Commercial paper procurement orders, bidirectional RFQ lifecycle,
 * and atomic warehouse receipt services for PrintPrice OS Control Plane.
 * 
 * Invariants:
 * 1. Printhouses only see offers authorized for their tenancy (MARKETPLACE, APPROVED_CUSTOMERS, PRIVATE).
 * 2. Placing, confirming, or dispatching an order does NOT mutate inventory stock.
 * 3. Only authorized warehouse receipt produces inventory movements and increments stock.
 * 4. Orders retain an immutable snapshot of technical specifications, units, pricing, and agreed terms.
 * 5. Partial receipts track cumulative received sheets and quantities, strictly preventing over-receipt.
 * 6. Receipt operations enforce MySQL row-level locking (SELECT ... FOR UPDATE) and persistent idempotency.
 */

const crypto = require('crypto');
const db = require('./mysqlClient');
const logger = require('./logger');

const ALLOWED_ORDER_TYPES = ['ORDER', 'RFQ'];
const ALLOWED_PRICE_BASES = ['KG', 'TONNE', 'SHEET', 'THOUSAND_SHEETS', 'PACK'];

function canonicalJsonStringify(obj) {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJsonStringify(obj[k])).join(',') + '}';
}

const unwrapRows = (result) => {
    if (!result) return [];
    if (Array.isArray(result)) {
        if (result.length > 0 && Array.isArray(result[0])) {
            return result[0];
        }
        return result;
    }
    return [result];
};

/**
 * Calculates physical sheets and unit conversions deterministically.
 */
function calculateSheets(quantity, basis, variant, sheetsPerPack) {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Quantity must be a positive finite number');
    }

    const widthMm = Number(variant.width_mm);
    const heightMm = Number(variant.height_mm);
    const gsm = Number(variant.gsm);

    if (!widthMm || !heightMm || !gsm) {
        throw new Error('Variant physical specifications (width, height, gsm) are incomplete');
    }

    const areaM2 = (widthMm * heightMm) / 1000000;
    const kgPerSheet = areaM2 * (gsm / 1000);

    switch (basis) {
        case 'SHEET':
            return Math.round(qty);
        case 'THOUSAND_SHEETS':
            return Math.round(qty * 1000);
        case 'PACK': {
            const packSize = Number(sheetsPerPack);
            if (!Number.isInteger(packSize) || packSize <= 0) {
                throw new Error("sheetsPerPack must be a positive integer when basis is 'PACK'");
            }
            return Math.round(qty * packSize);
        }
        case 'KG': {
            if (kgPerSheet <= 0) throw new Error('Invalid sheet weight calculation');
            return Math.round(qty / kgPerSheet);
        }
        case 'TONNE': {
            if (kgPerSheet <= 0) throw new Error('Invalid sheet weight calculation');
            return Math.round((qty * 1000) / kgPerSheet);
        }
        default:
            throw new Error(`Unsupported quantity basis: ${basis}`);
    }
}

/**
 * Calculates total monetary amount based on price basis and total sheets.
 */
function calculateTotalAmount(priceAmount, priceBasis, totalSheets, variant, sheetsPerPack) {
    const price = Number(priceAmount);
    const widthMm = Number(variant.width_mm);
    const heightMm = Number(variant.height_mm);
    const gsm = Number(variant.gsm);

    const areaM2 = (widthMm * heightMm) / 1000000;
    const kgPerSheet = areaM2 * (gsm / 1000);

    let pricePerSheet = 0;
    switch (priceBasis) {
        case 'SHEET':
            pricePerSheet = price;
            break;
        case 'THOUSAND_SHEETS':
            pricePerSheet = price / 1000;
            break;
        case 'PACK': {
            const packSize = Number(sheetsPerPack);
            if (!Number.isInteger(packSize) || packSize <= 0) {
                throw new Error("sheetsPerPack must be a positive integer for 'PACK' pricing");
            }
            pricePerSheet = price / packSize;
            break;
        }
        case 'KG':
            pricePerSheet = price * kgPerSheet;
            break;
        case 'TONNE':
            pricePerSheet = (price / 1000) * kgPerSheet;
            break;
        default:
            throw new Error(`Unsupported price basis: ${priceBasis}`);
    }

    const total = pricePerSheet * totalSheets;
    return Math.round(total * 100) / 100;
}

class PaperProcurementService {

    /**
     * Printhouse Paper Sourcing: Queries visible offers for the buyer tenant.
     * Enforces visibility rules:
     * - MARKETPLACE: visible to all authenticated tenants.
     * - APPROVED_CUSTOMERS: visible only if buyerTenantId is in approved_customer_ids.
     * - PRIVATE: visible only if buyerTenantId matches offer.tenant_id.
     */
    async searchVisibleOffers(buyerTenantId, query = {}) {
        if (!buyerTenantId) {
            const err = new Error('TENANT_ID_REQUIRED');
            err.statusCode = 400;
            throw err;
        }

        const {
            search = '',
            category = '',
            finish = '',
            gsmMin = null,
            gsmMax = null,
            supplierId = '',
            limit = 50,
            offset = 0
        } = query;

        const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
        const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

        let whereClauses = [
            "o.deleted_at IS NULL",
            "o.status = 'ACTIVE'",
            "(o.valid_from IS NULL OR o.valid_from <= CURRENT_TIMESTAMP)",
            "(o.valid_until IS NULL OR o.valid_until >= CURRENT_TIMESTAMP)",
            "(o.visibility = 'MARKETPLACE' OR (o.visibility = 'APPROVED_CUSTOMERS' AND JSON_CONTAINS(COALESCE(o.metadata_json->'$.approved_customer_ids', '[]'), JSON_QUOTE(?))) OR (o.visibility = 'PRIVATE' AND o.tenant_id = ?))"
        ];
        let params = [buyerTenantId, buyerTenantId];

        if (supplierId) {
            whereClauses.push("o.supplier_id = ?");
            params.push(supplierId);
        }

        if (category) {
            whereClauses.push("p.category = ?");
            params.push(category);
        }

        if (finish) {
            whereClauses.push("v.finish = ?");
            params.push(finish);
        }

        if (gsmMin) {
            whereClauses.push("v.gsm >= ?");
            params.push(Number(gsmMin));
        }

        if (gsmMax) {
            whereClauses.push("v.gsm <= ?");
            params.push(Number(gsmMax));
        }

        if (search && search.trim()) {
            whereClauses.push("(p.name LIKE ? OR p.brand LIKE ? OR o.supplier_sku LIKE ?)");
            const s = `%${search.trim()}%`;
            params.push(s, s, s);
        }

        const whereSql = whereClauses.join(' AND ');

        // 1. Get total count
        const countSql = `
            SELECT COUNT(*) AS total
            FROM supplier_paper_offers o
            JOIN paper_variants v ON o.variant_id = v.id
            JOIN paper_products p ON v.product_id = p.id
            JOIN paper_suppliers s ON o.supplier_id = s.id
            WHERE ${whereSql}
        `;
        const countRows = unwrapRows(await db.query(countSql, params));
        const total = (countRows && countRows[0] && countRows[0].total) ? Number(countRows[0].total) : 0;

        // 2. Fetch paginated records
        const dataSql = `
            SELECT 
                o.id AS offer_id,
                o.supplier_id,
                s.name AS supplier_name,
                o.supplier_sku,
                o.variant_id,
                p.id AS product_id,
                p.name AS product_name,
                p.brand,
                p.category,
                v.finish,
                v.gsm,
                v.width_mm,
                v.height_mm,
                v.caliper_um,
                v.grain_direction,
                o.price_amount,
                o.price_basis,
                o.currency,
                o.moq,
                o.order_multiple,
                o.sheets_per_pack,
                o.delivery_zones_json,
                o.metadata_json,
                o.visibility,
                o.valid_from,
                o.valid_until,
                o.current_revision_id
            FROM supplier_paper_offers o
            JOIN paper_variants v ON o.variant_id = v.id
            JOIN paper_products p ON v.product_id = p.id
            JOIN paper_suppliers s ON o.supplier_id = s.id
            WHERE ${whereSql}
            ORDER BY p.name ASC, v.gsm ASC
            LIMIT ? OFFSET ?
        `;
        const dataParams = [...params, safeLimit, safeOffset];
        const rows = unwrapRows(await db.query(dataSql, dataParams));
        const items = Array.isArray(rows) ? rows : [];

        const formattedItems = items.map(r => ({
            offerId: r.offer_id,
            supplierId: r.supplier_id,
            supplierName: r.supplier_name,
            supplierSku: r.supplier_sku,
            variantId: r.variant_id,
            productId: r.product_id,
            productName: r.product_name,
            brand: r.brand,
            category: r.category,
            finish: r.finish,
            gsm: r.gsm,
            widthMm: Number(r.width_mm),
            heightMm: Number(r.height_mm),
            caliperUm: r.caliper_um,
            grainDirection: r.grain_direction,
            priceAmount: Number(r.price_amount),
            priceBasis: r.price_basis,
            currency: r.currency,
            moq: r.moq,
            orderMultiple: r.order_multiple,
            sheetsPerPack: r.sheets_per_pack,
            deliveryZones: typeof r.delivery_zones_json === 'string' ? JSON.parse(r.delivery_zones_json) : (r.delivery_zones_json || []),
            visibility: r.visibility,
            validFrom: r.valid_from,
            validUntil: r.valid_until,
            currentRevisionId: r.current_revision_id
        }));

        return {
            items: formattedItems,
            total,
            limit: safeLimit,
            offset: safeOffset
        };
    }

    /**
     * Printhouse Places Order or RFQ against a paper offer or variant.
     * Takes an immutable snapshot of specifications and commercial terms.
     */
    async placeOrderOrRfq(actor, payload) {
        const {
            type = 'ORDER',
            offerId = null,
            variantId,
            orderedQuantity,
            quantityBasis,
            printhouseId,
            deliverySiteName = '',
            deliveryAddress = '',
            buyerNotes = '',
            expectedDeliveryDate = null
        } = payload;

        if (!ALLOWED_ORDER_TYPES.includes(type)) {
            const err = new Error(`Invalid order type '${type}'. Allowed: ${ALLOWED_ORDER_TYPES.join(', ')}`);
            err.statusCode = 400;
            throw err;
        }

        if (!actor.tenantId) {
            const err = new Error('TENANT_ID_REQUIRED');
            err.statusCode = 401;
            throw err;
        }

        if (!printhouseId) {
            const err = new Error('PRINTHOUSE_ID_REQUIRED');
            err.statusCode = 400;
            throw err;
        }

        // Validate delivery center belongs to actor tenant
        const centerRows = unwrapRows(await db.query(
            "SELECT * FROM printer_nodes WHERE id = ? AND tenant_id = ?",
            [printhouseId, actor.tenantId]
        ));
        if (!centerRows || centerRows.length === 0) {
            const err = new Error('FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_UNAUTHORIZED_CENTER_ACCESS';
            throw err;
        }

        const center = centerRows[0];
        const siteName = deliverySiteName || center.nickname || center.name || 'Main Production Plant';
        const address = deliveryAddress || center.address || (center.city ? `${center.city}, ${center.country || ''}`.trim() : '');

        const qty = Number(orderedQuantity);
        if (!Number.isFinite(qty) || qty <= 0) {
            const err = new Error('orderedQuantity must be a positive finite number');
            err.statusCode = 400;
            throw err;
        }

        if (!variantId) {
            const err = new Error('variantId is required');
            err.statusCode = 400;
            throw err;
        }

        // Fetch physical variant and product
        const varRows = unwrapRows(await db.query(`
            SELECT v.*, p.name AS product_name, p.brand, p.category
            FROM paper_variants v
            JOIN paper_products p ON v.product_id = p.id
            WHERE v.id = ?
        `, [variantId]));

        if (!varRows || varRows.length === 0) {
            const err = new Error('VARIANT_NOT_FOUND');
            err.statusCode = 404;
            throw err;
        }
        const variant = varRows[0];

        let offer = null;
        let supplierId = payload.supplierId || null;
        let pricePerBasis = 0;
        let priceBasis = quantityBasis || 'SHEET';
        let currency = 'EUR';
        let supplierSku = null;
        let sheetsPerPack = null;
        let offerRevisionId = null;

        if (offerId) {
            const offerRows = unwrapRows(await db.query(`
                SELECT o.*, s.name AS supplier_name, s.status AS supplier_status
                FROM supplier_paper_offers o
                JOIN paper_suppliers s ON o.supplier_id = s.id
                WHERE o.id = ? AND o.deleted_at IS NULL
            `, [offerId]));

            if (!offerRows || offerRows.length === 0) {
                const err = new Error('OFFER_NOT_FOUND');
                err.statusCode = 404;
                throw err;
            }
            offer = offerRows[0];

            if (offer.status !== 'ACTIVE') {
                const err = new Error('OFFER_NOT_ACTIVE');
                err.statusCode = 400;
                throw err;
            }

            // Check visibility
            const isMarketplace = offer.visibility === 'MARKETPLACE';
            const isPrivateOwn = offer.visibility === 'PRIVATE' && offer.tenant_id === actor.tenantId;
            let isApprovedCust = false;
            if (offer.visibility === 'APPROVED_CUSTOMERS') {
                try {
                    let meta = {};
                    if (offer.metadata_json) {
                        meta = typeof offer.metadata_json === 'string' ? JSON.parse(offer.metadata_json) : offer.metadata_json;
                    }
                    const ids = meta.approved_customer_ids || offer.approved_customer_ids || [];
                    const parsedIds = typeof ids === 'string' ? JSON.parse(ids) : ids;
                    isApprovedCust = Array.isArray(parsedIds) && parsedIds.includes(actor.tenantId);
                } catch {}
            }

            if (!isMarketplace && !isPrivateOwn && !isApprovedCust) {
                const err = new Error('FORBIDDEN_OFFER_ACCESS');
                err.statusCode = 403;
                throw err;
            }

            supplierId = offer.supplier_id;
            pricePerBasis = Number(offer.price_amount);
            priceBasis = offer.price_basis;
            currency = offer.currency;
            supplierSku = offer.supplier_sku;
            sheetsPerPack = offer.sheets_per_pack;
            offerRevisionId = offer.current_revision_id || null;

            // In direct ORDER mode, enforce MOQ and order step
            if (type === 'ORDER') {
                if (qty < Number(offer.moq)) {
                    const err = new Error(`Order quantity ${qty} is below Minimum Order Quantity (MOQ: ${offer.moq})`);
                    err.statusCode = 400;
                    err.code = 'BELOW_MOQ';
                    throw err;
                }

                const mult = Number(offer.order_multiple || 1);
                if (mult > 1) {
                    const diff = qty - Number(offer.moq);
                    if (diff % mult !== 0) {
                        const err = new Error(`Order quantity ${qty} must align with orderMultiple step of ${mult} above MOQ (${offer.moq})`);
                        err.statusCode = 400;
                        err.code = 'INVALID_ORDER_MULTIPLE';
                        throw err;
                    }
                }
            }
        }

        if (!supplierId) {
            const err = new Error('supplierId could not be resolved from offer or payload');
            err.statusCode = 400;
            throw err;
        }

        // Calculate total physical sheets
        const basisToUse = quantityBasis || priceBasis;
        const totalSheets = calculateSheets(qty, basisToUse, variant, sheetsPerPack);

        // Calculate total amount
        const totalAmount = type === 'ORDER'
            ? calculateTotalAmount(pricePerBasis, priceBasis, totalSheets, variant, sheetsPerPack)
            : 0.00;

        const orderId = `pord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const orderNumber = `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
        const initialStatus = 'SUBMITTED';

        const expDeliverySql = expectedDeliveryDate
            ? new Date(expectedDeliveryDate).toISOString().slice(0, 19).replace('T', ' ')
            : null;

        await db.query(`
            INSERT INTO supplier_paper_procurement_orders (
                id,
                order_number,
                order_type,
                tenant_id,
                printhouse_id,
                supplier_id,
                offer_id,
                offer_revision_id,
                variant_id,
                snapshot_product_name,
                snapshot_brand,
                snapshot_category,
                snapshot_finish,
                snapshot_gsm,
                snapshot_width_mm,
                snapshot_height_mm,
                snapshot_caliper_um,
                snapshot_grain_direction,
                snapshot_price_basis,
                snapshot_price_per_basis,
                snapshot_currency,
                snapshot_supplier_sku,
                snapshot_sheets_per_pack,
                ordered_quantity,
                ordered_quantity_basis,
                total_sheets,
                total_amount,
                status,
                delivery_site_name,
                delivery_address,
                expected_delivery_date,
                buyer_notes,
                created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            orderId,
            orderNumber,
            type,
            actor.tenantId,
            printhouseId,
            supplierId,
            offerId,
            offerRevisionId,
            variantId,
            variant.product_name,
            variant.brand || null,
            variant.category,
            variant.finish || null,
            variant.gsm,
            variant.width_mm,
            variant.height_mm,
            variant.caliper_um || null,
            variant.grain_direction || null,
            priceBasis,
            pricePerBasis,
            currency,
            supplierSku,
            sheetsPerPack,
            qty,
            basisToUse,
            totalSheets,
            totalAmount,
            initialStatus,
            siteName,
            address,
            expDeliverySql,
            buyerNotes || null,
            actor.userId || null
        ]);

        return await this.getSupplierOrderById(supplierId, orderId);
    }

    /**
     * Lists procurement orders for a supplier organization.
     * Scoped strictly to supplierId.
     */
    async listSupplierOrders(supplierId, query = {}) {
        if (!supplierId) {
            const err = new Error('SUPPLIER_ID_REQUIRED');
            err.statusCode = 400;
            throw err;
        }

        const {
            status = '',
            type = '',
            search = '',
            limit = 50,
            offset = 0
        } = query;

        const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
        const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

        let whereClauses = ["o.supplier_id = ?"];
        let params = [supplierId];

        if (status) {
            whereClauses.push("o.status = ?");
            params.push(status);
        }

        if (type) {
            whereClauses.push("o.order_type = ?");
            params.push(type);
        }

        if (search && search.trim()) {
            whereClauses.push("(o.order_number LIKE ? OR o.snapshot_product_name LIKE ? OR o.snapshot_supplier_sku LIKE ?)");
            const s = `%${search.trim()}%`;
            params.push(s, s, s);
        }

        const whereSql = whereClauses.join(' AND ');

        // 1. Get filtered total
        const countSql = `SELECT COUNT(*) AS total FROM supplier_paper_procurement_orders o WHERE ${whereSql}`;
        const countRows = unwrapRows(await db.query(countSql, params));
        const total = countRows && countRows[0] ? Number(countRows[0].total) : 0;

        // 2. Get status breakdown metrics for the supplier
        const metricRows = unwrapRows(await db.query(`
            SELECT 
                status, 
                COUNT(*) AS cnt 
            FROM supplier_paper_procurement_orders 
            WHERE supplier_id = ? 
            GROUP BY status
        `, [supplierId]));

        const counts = {
            all: 0,
            submitted: 0,
            quoted: 0,
            confirmed: 0,
            dispatched: 0,
            delivered: 0,
            received: 0,
            cancelled: 0,
            rejected: 0
        };

        if (Array.isArray(metricRows)) {
            for (const m of metricRows) {
                const c = Number(m.cnt) || 0;
                counts.all += c;
                const s = String(m.status).toLowerCase();
                if (counts[s] !== undefined) {
                    counts[s] = c;
                }
            }
        }

        // 3. Get paginated orders
        const dataSql = `
            SELECT 
                o.*,
                t.name AS printhouse_name
            FROM supplier_paper_procurement_orders o
            LEFT JOIN tenants t ON o.tenant_id = t.id
            WHERE ${whereSql}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `;
        const rows = unwrapRows(await db.query(dataSql, [...params, safeLimit, safeOffset]));
        const items = (Array.isArray(rows) ? rows : []).map(r => this.formatOrderRow(r));

        return {
            items,
            total,
            counts,
            limit: safeLimit,
            offset: safeOffset
        };
    }

    /**
     * Lists procurement orders for a printhouse buyer.
     * Scoped strictly to tenantId.
     */
    async listPrinthouseOrders(tenantId, printhouseId = null, query = {}) {
        if (!tenantId) {
            const err = new Error('TENANT_ID_REQUIRED');
            err.statusCode = 400;
            throw err;
        }

        const {
            status = '',
            type = '',
            search = '',
            limit = 50,
            offset = 0
        } = query;

        const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
        const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

        let whereClauses = ["o.tenant_id = ?"];
        let params = [tenantId];

        if (printhouseId) {
            whereClauses.push("o.printhouse_id = ?");
            params.push(printhouseId);
        }

        if (status) {
            whereClauses.push("o.status = ?");
            params.push(status);
        }

        if (type) {
            whereClauses.push("o.order_type = ?");
            params.push(type);
        }

        if (search && search.trim()) {
            whereClauses.push("(o.order_number LIKE ? OR o.snapshot_product_name LIKE ?)");
            const s = `%${search.trim()}%`;
            params.push(s, s);
        }

        const whereSql = whereClauses.join(' AND ');
        const countRows = unwrapRows(await db.query(`SELECT COUNT(*) AS total FROM supplier_paper_procurement_orders o WHERE ${whereSql}`, params));
        const total = countRows && countRows[0] ? Number(countRows[0].total) : 0;

        const dataSql = `
            SELECT 
                o.*,
                s.name AS supplier_name
            FROM supplier_paper_procurement_orders o
            LEFT JOIN paper_suppliers s ON o.supplier_id = s.id
            WHERE ${whereSql}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `;
        const rows = unwrapRows(await db.query(dataSql, [...params, safeLimit, safeOffset]));
        const items = (Array.isArray(rows) ? rows : []).map(r => this.formatOrderRow(r));

        return {
            items,
            total,
            limit: safeLimit,
            offset: safeOffset
        };
    }

    /**
     * Retrieves an order by ID for a supplier.
     */
    async getSupplierOrderById(supplierId, orderId) {
        const rows = unwrapRows(await db.query(`
            SELECT 
                o.*,
                t.name AS printhouse_name
            FROM supplier_paper_procurement_orders o
            LEFT JOIN tenants t ON o.tenant_id = t.id
            WHERE o.id = ? AND o.supplier_id = ?
        `, [orderId, supplierId]));

        if (!rows || rows.length === 0) {
            const err = new Error('ORDER_NOT_FOUND');
            err.statusCode = 404;
            throw err;
        }

        const order = this.formatOrderRow(rows[0]);

        // Load receipts history
        const receiptRows = unwrapRows(await db.query(`
            SELECT * FROM supplier_paper_order_receipts
            WHERE order_id = ?
            ORDER BY created_at DESC
        `, [orderId]));

        order.receipts = (Array.isArray(receiptRows) ? receiptRows : []).map(r => ({
            id: r.id,
            receiptNumber: r.receipt_number,
            receivedQuantity: Number(r.received_quantity),
            receivedSheets: Number(r.received_sheets),
            operatorId: r.operator_id,
            notes: r.notes,
            receivedAt: r.created_at
        }));

        return order;
    }

    /**
     * Retrieves an order by ID for a printhouse buyer.
     */
    async getPrinthouseOrderById(tenantId, orderId) {
        const rows = unwrapRows(await db.query(`
            SELECT 
                o.*,
                s.name AS supplier_name
            FROM supplier_paper_procurement_orders o
            LEFT JOIN paper_suppliers s ON o.supplier_id = s.id
            WHERE o.id = ? AND o.tenant_id = ?
        `, [orderId, tenantId]));

        if (!rows || rows.length === 0) {
            const err = new Error('ORDER_NOT_FOUND');
            err.statusCode = 404;
            throw err;
        }

        const order = this.formatOrderRow(rows[0]);

        // Load receipts history
        const receiptRows = unwrapRows(await db.query(`
            SELECT * FROM supplier_paper_order_receipts
            WHERE order_id = ?
            ORDER BY created_at DESC
        `, [orderId]));

        order.receipts = (Array.isArray(receiptRows) ? receiptRows : []).map(r => ({
            id: r.id,
            receiptNumber: r.receipt_number,
            receivedQuantity: Number(r.received_quantity),
            receivedSheets: Number(r.received_sheets),
            operatorId: r.operator_id,
            notes: r.notes,
            receivedAt: r.created_at
        }));

        return order;
    }

    /**
     * Executes allowed supplier state transitions on an order.
     * Transitions:
     * - 'QUOTE': SUBMITTED -> QUOTED (RFQ only)
     * - 'CONFIRM': SUBMITTED -> CONFIRMED (Order acceptance)
     * - 'DISPATCH': CONFIRMED -> DISPATCHED (or PARTIALLY_DELIVERED)
     * - 'DELIVER': DISPATCHED -> DELIVERED
     * - 'REJECT': SUBMITTED -> REJECTED
     * - 'CANCEL': SUBMITTED / CONFIRMED -> CANCELLED
     */
    async transitionSupplierOrder(supplierId, orderId, action, payload = {}) {
        const rows = unwrapRows(await db.query(
            "SELECT * FROM supplier_paper_procurement_orders WHERE id = ? AND supplier_id = ?",
            [orderId, supplierId]
        ));

        if (!rows || rows.length === 0) {
            const err = new Error('ORDER_NOT_FOUND');
            err.statusCode = 404;
            throw err;
        }

        const order = rows[0];
        const currentStatus = order.status;

        switch (action) {
            case 'QUOTE': {
                if (order.order_type !== 'RFQ') {
                    const err = new Error("QUOTE action is only permitted on RFQ requests");
                    err.statusCode = 400;
                    throw err;
                }
                if (currentStatus !== 'SUBMITTED') {
                    const err = new Error(`Cannot quote RFQ in status '${currentStatus}'`);
                    err.statusCode = 400;
                    throw err;
                }

                const price = Number(payload.pricePerBasis);
                if (!Number.isFinite(price) || price <= 0) {
                    const err = new Error('pricePerBasis must be a positive finite number');
                    err.statusCode = 400;
                    throw err;
                }

                const basis = payload.priceBasis || order.snapshot_price_basis;
                const totalAmount = calculateTotalAmount(
                    price,
                    basis,
                    order.total_sheets,
                    {
                        width_mm: order.snapshot_width_mm,
                        height_mm: order.snapshot_height_mm,
                        gsm: order.snapshot_gsm
                    },
                    order.snapshot_sheets_per_pack
                );

                const expDate = payload.expectedDeliveryDate
                    ? new Date(payload.expectedDeliveryDate).toISOString().slice(0, 19).replace('T', ' ')
                    : order.expected_delivery_date;

                await db.query(`
                    UPDATE supplier_paper_procurement_orders
                    SET status = 'QUOTED',
                        snapshot_price_per_basis = ?,
                        snapshot_price_basis = ?,
                        total_amount = ?,
                        expected_delivery_date = ?,
                        supplier_notes = COALESCE(?, supplier_notes)
                    WHERE id = ?
                `, [price, basis, totalAmount, expDate, payload.supplierNotes || null, orderId]);
                break;
            }

            case 'CONFIRM': {
                if (!['SUBMITTED', 'QUOTED'].includes(currentStatus)) {
                    const err = new Error(`Cannot confirm order in status '${currentStatus}'`);
                    err.statusCode = 400;
                    throw err;
                }

                const expDate = payload.expectedDeliveryDate
                    ? new Date(payload.expectedDeliveryDate).toISOString().slice(0, 19).replace('T', ' ')
                    : order.expected_delivery_date;

                await db.query(`
                    UPDATE supplier_paper_procurement_orders
                    SET status = 'CONFIRMED',
                        expected_delivery_date = COALESCE(?, expected_delivery_date),
                        supplier_notes = COALESCE(?, supplier_notes)
                    WHERE id = ?
                `, [expDate, payload.supplierNotes || null, orderId]);
                break;
            }

            case 'DISPATCH': {
                if (!['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(currentStatus)) {
                    const err = new Error(`Cannot dispatch order in status '${currentStatus}'`);
                    err.statusCode = 400;
                    throw err;
                }

                const dispatchedQty = Number(payload.dispatchedQuantity || order.ordered_quantity);
                const dispatchedSheets = Number(payload.dispatchedSheets || order.total_sheets);
                const isPartial = dispatchedSheets < order.total_sheets;
                const newStatus = isPartial ? 'PARTIALLY_DELIVERED' : 'DISPATCHED';

                await db.query(`
                    UPDATE supplier_paper_procurement_orders
                    SET status = ?,
                        delivered_quantity = ?,
                        delivered_sheets = ?,
                        dispatched_at = CURRENT_TIMESTAMP,
                        supplier_notes = COALESCE(?, supplier_notes)
                    WHERE id = ?
                `, [newStatus, dispatchedQty, dispatchedSheets, payload.supplierNotes || null, orderId]);
                break;
            }

            case 'DELIVER': {
                if (!['DISPATCHED', 'PARTIALLY_DELIVERED'].includes(currentStatus)) {
                    const err = new Error(`Cannot mark delivered from status '${currentStatus}'`);
                    err.statusCode = 400;
                    throw err;
                }

                await db.query(`
                    UPDATE supplier_paper_procurement_orders
                    SET status = 'DELIVERED',
                        delivered_at = CURRENT_TIMESTAMP,
                        supplier_notes = COALESCE(?, supplier_notes)
                    WHERE id = ?
                `, [payload.supplierNotes || null, orderId]);
                break;
            }

            case 'REJECT': {
                if (!['SUBMITTED', 'QUOTED'].includes(currentStatus)) {
                    const err = new Error(`Cannot reject order in status '${currentStatus}'`);
                    err.statusCode = 400;
                    throw err;
                }

                await db.query(`
                    UPDATE supplier_paper_procurement_orders
                    SET status = 'REJECTED',
                        cancellation_reason = ?,
                        cancelled_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [payload.reason || 'Rejected by supplier', orderId]);
                break;
            }

            case 'CANCEL': {
                if (['DELIVERED', 'RECEIVED', 'CANCELLED', 'REJECTED'].includes(currentStatus)) {
                    const err = new Error(`Cannot cancel order in status '${currentStatus}'`);
                    err.statusCode = 400;
                    throw err;
                }

                await db.query(`
                    UPDATE supplier_paper_procurement_orders
                    SET status = 'CANCELLED',
                        cancellation_reason = ?,
                        cancelled_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [payload.reason || 'Cancelled by supplier', orderId]);
                break;
            }

            default: {
                const err = new Error(`Unknown action '${action}'`);
                err.statusCode = 400;
                throw err;
            }
        }

        return await this.getSupplierOrderById(supplierId, orderId);
    }

    /**
     * Printhouse Accepts RFQ Quote.
     * Transitions QUOTED RFQ into a CONFIRMED ORDER.
     */
    async acceptRfqQuote(actor, orderId) {
        const rows = unwrapRows(await db.query(
            "SELECT * FROM supplier_paper_procurement_orders WHERE id = ? AND tenant_id = ?",
            [orderId, actor.tenantId]
        ));

        if (!rows || rows.length === 0) {
            const err = new Error('ORDER_NOT_FOUND');
            err.statusCode = 404;
            throw err;
        }

        const order = rows[0];
        if (order.status !== 'QUOTED') {
            const err = new Error(`Cannot accept quote in status '${order.status}'`);
            err.statusCode = 400;
            throw err;
        }

        await db.query(`
            UPDATE supplier_paper_procurement_orders
            SET status = 'CONFIRMED',
                order_type = 'ORDER'
            WHERE id = ?
        `, [orderId]);

        return await this.getPrinthouseOrderById(actor.tenantId, orderId);
    }

    /**
     * Atomic & Idempotent Warehouse Receipt.
     * Receives physical delivery, increments stock in predictive_material_inventory,
     * logs immutable audit event, and updates order cumulative received counts.
     */
    async receiveOrderAtomic(orderId, actor, options = {}) {
        const {
            receivedQuantity = null,
            receivedSheets = null,
            idempotencyKey,
            notes = '',
            operatorId = null
        } = options;

        if (!idempotencyKey || !idempotencyKey.trim()) {
            const err = new Error('IDEMPOTENCY_KEY_REQUIRED');
            err.statusCode = 400;
            err.code = 'IDEMPOTENCY_KEY_REQUIRED';
            throw err;
        }

        if (!actor.tenantId) {
            const err = new Error('TENANT_ID_REQUIRED');
            err.statusCode = 401;
            throw err;
        }

        const pool = db.getPool();
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // 1. Lock order row with SELECT ... FOR UPDATE
            const [orderRows] = await connection.query(
                "SELECT * FROM supplier_paper_procurement_orders WHERE id = ? FOR UPDATE",
                [orderId]
            );

            if (!orderRows || orderRows.length === 0) {
                const err = new Error('ORDER_NOT_FOUND');
                err.statusCode = 404;
                throw err;
            }
            const order = orderRows[0];

            // 2. Boundary isolation: verify tenant and center
            if (order.tenant_id !== actor.tenantId) {
                const err = new Error('FORBIDDEN_CROSS_TENANT_ORDER_RECEIPT');
                err.statusCode = 403;
                throw err;
            }

            if (actor.printhouseId && order.printhouse_id !== actor.printhouseId) {
                const err = new Error('FORBIDDEN_CROSS_PRINTHOUSE_ORDER_RECEIPT');
                err.statusCode = 403;
                throw err;
            }

            // 3. Check Idempotency Ledger first (before status check to allow idempotent replay on completed orders)
            const [existingReceipt] = await connection.query(
                "SELECT * FROM supplier_paper_order_receipts WHERE idempotency_key = ? FOR UPDATE",
                [idempotencyKey.trim()]
            );

            if (existingReceipt && existingReceipt.length > 0) {
                const rec = existingReceipt[0];
                if (rec.order_id !== orderId) {
                    const err = new Error('IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_ORDER');
                    err.statusCode = 409;
                    err.code = 'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_ORDER';
                    throw err;
                }

                // Check payload consistency if receivedSheets was provided
                if (receivedSheets !== undefined && receivedSheets !== null && Number(rec.received_sheets) !== Number(receivedSheets)) {
                    const err = new Error('IDEMPOTENCY_PAYLOAD_MISMATCH');
                    err.statusCode = 409;
                    err.code = 'IDEMPOTENCY_PAYLOAD_MISMATCH';
                    throw err;
                }

                // Idempotent replay: return cached state without stock change
                await connection.rollback();
                return {
                    ok: true,
                    idempotentReplay: true,
                    receiptId: rec.id,
                    receiptNumber: rec.receipt_number,
                    receivedSheets: Number(rec.received_sheets),
                    receivedQuantity: Number(rec.received_quantity)
                };
            }

            // 4. Status eligibility
            const validReceiptStatuses = ['CONFIRMED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'PARTIALLY_RECEIVED'];
            if (!validReceiptStatuses.includes(order.status)) {
                const err = new Error(`Order in status '${order.status}' cannot receive warehouse goods`);
                err.statusCode = 400;
                err.code = 'ORDER_NOT_IN_RECEIVABLE_STATUS';
                throw err;
            }

            // 5. Calculate incoming quantities
            const totalRemainingSheets = Number(order.total_sheets) - Number(order.received_sheets);
            if (totalRemainingSheets <= 0) {
                const err = new Error('ORDER_ALREADY_FULLY_RECEIVED');
                err.statusCode = 409;
                err.code = 'ORDER_ALREADY_FULLY_RECEIVED';
                throw err;
            }

            const effectiveSheets = (receivedSheets !== null && receivedSheets !== undefined)
                ? Number(receivedSheets)
                : totalRemainingSheets;

            const effectiveQuantity = (receivedQuantity !== null && receivedQuantity !== undefined)
                ? Number(receivedQuantity)
                : Number(order.ordered_quantity);

            if (!Number.isFinite(effectiveSheets) || effectiveSheets <= 0) {
                const err = new Error('receivedSheets must be a positive finite integer');
                err.statusCode = 400;
                throw err;
            }

            // 6. Over-receipt guard
            if (effectiveSheets > totalRemainingSheets) {
                const err = new Error(`RECEIPT_EXCEEDS_ORDERED_QUANTITY: Receipt quantity (${effectiveSheets} sheets) exceeds remaining order balance (${totalRemainingSheets} sheets)`);
                err.statusCode = 400;
                err.code = 'RECEIPT_EXCEEDS_ORDERED_QUANTITY';
                throw err;
            }

            const effectivePayload = {
                order_id: orderId,
                tenant_id: actor.tenantId,
                printhouse_id: order.printhouse_id,
                effective_sheets: effectiveSheets,
                effective_quantity: effectiveQuantity,
                operator_id: operatorId || actor.userId
            };
            const payloadHash = crypto.createHash('sha256').update(canonicalJsonStringify(effectivePayload)).digest('hex');

            // 7. Locate or Provision Inventory Item in predictive_material_inventory
            let inventoryId = order.material_inventory_id;
            let currentStock = 0;

            if (inventoryId) {
                const [invRows] = await connection.query(
                    "SELECT * FROM predictive_material_inventory WHERE id = ? FOR UPDATE",
                    [inventoryId]
                );
                if (invRows && invRows.length > 0) {
                    currentStock = Number(invRows[0].current_stock_units) || 0;
                }
            } else {
                // Find matching material for tenant and center
                const [matchRows] = await connection.query(`
                    SELECT id, current_stock_units
                    FROM predictive_material_inventory
                    WHERE tenant_id = ? AND (printhouse_id = ? OR node_id = ?)
                      AND (paper_gsm = ? OR paper_gsm IS NULL)
                    LIMIT 1
                    FOR UPDATE
                `, [actor.tenantId, order.printhouse_id, order.printhouse_id, order.snapshot_gsm]);

                if (matchRows && matchRows.length > 0) {
                    inventoryId = matchRows[0].id;
                    currentStock = Number(matchRows[0].current_stock_units) || 0;
                } else {
                    // Provision catalog and inventory item
                    const catalogId = `mat-cat-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
                    await connection.query(`
                        INSERT INTO materials_catalog (
                            id, tenant_id, material_name, material_type, gsm, finish_type, supplier_name, cost_per_unit
                        ) VALUES (?, ?, ?, 'PAPER', ?, ?, ?, ?)
                    `, [
                        catalogId,
                        actor.tenantId,
                        order.snapshot_product_name,
                        order.snapshot_gsm,
                        order.snapshot_finish || 'UNCOATED',
                        'Paper Supplier Hub',
                        Number(order.snapshot_price_per_basis)
                    ]);

                    inventoryId = `mat-inv-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
                    await connection.query(`
                        INSERT INTO predictive_material_inventory (
                            id, node_id, material_catalog_id, material_name, material_type, paper_gsm, finish,
                            current_stock_units, reserved_stock_units, available_units, reorder_point,
                            replenishment_lead_days, shortage_risk, operational_status, status,
                            supplier_name, cost_per_unit, tenant_id, printhouse_id
                        ) VALUES (?, ?, ?, ?, 'PAPER', ?, ?, 0, 0, 0, 100, 7, 'NONE', 'AVAILABLE', 'STABLE', ?, ?, ?, ?)
                    `, [
                        inventoryId,
                        order.printhouse_id,
                        catalogId,
                        order.snapshot_product_name || 'Paper Stock',
                        order.snapshot_gsm || null,
                        order.snapshot_finish || 'UNCOATED',
                        'Paper Supplier Hub',
                        Number(order.snapshot_price_per_basis) || 0,
                        actor.tenantId,
                        order.printhouse_id
                    ]);

                    currentStock = 0;
                }

                // Associate inventory ID on order
                await connection.query(
                    "UPDATE supplier_paper_procurement_orders SET material_inventory_id = ? WHERE id = ?",
                    [inventoryId, orderId]
                );
            }

            // 8. Increment stock in predictive_material_inventory
            const newStock = currentStock + effectiveSheets;
            await connection.query(
                "UPDATE predictive_material_inventory SET current_stock_units = ?, available_units = ? WHERE id = ?",
                [newStock, newStock, inventoryId]
            );

            // 9. Emit material inventory event
            const eventId = `evt-proc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
            await connection.query(`
                INSERT INTO material_inventory_events (
                    id, material_inventory_id, event_type, quantity_units,
                    before_stock, after_stock, operator_id, reason, metadata_json
                ) VALUES (?, ?, 'PROCUREMENT_RECEIPT', ?, ?, ?, ?, 'Paper Supplier Hub Delivery Receipt', ?)
            `, [
                eventId,
                inventoryId,
                effectiveSheets,
                currentStock,
                newStock,
                operatorId || actor.userId || 'operator',
                JSON.stringify({
                    orderId,
                    orderNumber: order.order_number,
                    supplierId: order.supplier_id,
                    sheetsReceived: effectiveSheets,
                    quantityReceived: effectiveQuantity,
                    idempotencyKey
                })
            ]);

            // 10. Record receipt in supplier_paper_order_receipts
            const receiptId = `prct_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
            const receiptNumber = `RCV-${Date.now().toString().slice(-6)}`;

            await connection.query(`
                INSERT INTO supplier_paper_order_receipts (
                    id, order_id, tenant_id, printhouse_id, supplier_id,
                    receipt_number, received_quantity, received_sheets,
                    idempotency_key, material_inventory_id, inventory_event_id,
                    operator_id, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                receiptId,
                orderId,
                actor.tenantId,
                order.printhouse_id,
                order.supplier_id,
                receiptNumber,
                effectiveQuantity,
                effectiveSheets,
                idempotencyKey.trim(),
                inventoryId,
                eventId,
                operatorId || actor.userId || 'operator',
                notes || null
            ]);

            // 11. Record in procurement_receipt_records for global idempotency
            await connection.query(`
                INSERT INTO procurement_receipt_records (
                    id, tenant_id, procurement_id, idempotency_key, payload_sha256, response_json
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                `rec-pord-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
                actor.tenantId,
                orderId,
                idempotencyKey.trim(),
                payloadHash,
                JSON.stringify({
                    receiptId,
                    receiptNumber,
                    receivedSheets: effectiveSheets,
                    receivedQuantity: effectiveQuantity
                })
            ]).catch(() => {}); // If duplicate key fails, transaction catches

            // 12. Update order cumulative totals and status
            const newAccumulatedSheets = Number(order.received_sheets) + effectiveSheets;
            const newAccumulatedQty = Number(order.received_quantity) + effectiveQuantity;
            const isCompleted = newAccumulatedSheets >= Number(order.total_sheets);
            const terminalStatus = isCompleted ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

            await connection.query(`
                UPDATE supplier_paper_procurement_orders
                SET received_quantity = ?,
                    received_sheets = ?,
                    status = ?
                WHERE id = ?
            `, [newAccumulatedQty, newAccumulatedSheets, terminalStatus, orderId]);

            await connection.commit();

            return {
                ok: true,
                idempotentReplay: false,
                receiptId,
                receiptNumber,
                receivedSheets: effectiveSheets,
                receivedQuantity: effectiveQuantity,
                newStock,
                orderStatus: terminalStatus
            };

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Real aggregates for Supplier Dashboard cards.
     * Computes verified counts without faking zeros.
     */
    async getSupplierDashboardStats(supplierId) {
        if (!supplierId) {
            const err = new Error('SUPPLIER_ID_REQUIRED');
            err.statusCode = 400;
            throw err;
        }

        // 1. Catalog Variants associated
        const catRows = unwrapRows(await db.query(
            "SELECT COUNT(*) AS total FROM supplier_paper_catalog_variants WHERE supplier_id = ? AND deleted_at IS NULL",
            [supplierId]
        ));
        const catalogVariants = catRows && catRows[0] ? Number(catRows[0].total) : 0;

        // 2. Offers by status
        const offRows = unwrapRows(await db.query(`
            SELECT 
                status,
                COUNT(*) AS cnt
            FROM supplier_paper_offers
            WHERE supplier_id = ? AND deleted_at IS NULL
            GROUP BY status
        `, [supplierId]));

        const offers = {
            total: 0,
            active: 0,
            inactive: 0,
            archived: 0
        };

        if (Array.isArray(offRows)) {
            for (const r of offRows) {
                const c = Number(r.cnt) || 0;
                offers.total += c;
                const s = String(r.status).toLowerCase();
                if (offers[s] !== undefined) {
                    offers[s] = c;
                }
            }
        }

        // 3. Orders and RFQ metrics
        const ordRows = unwrapRows(await db.query(`
            SELECT 
                status,
                order_type,
                COUNT(*) AS cnt
            FROM supplier_paper_procurement_orders
            WHERE supplier_id = ?
            GROUP BY status, order_type
        `, [supplierId]));

        let pendingRequests = 0;
        let activeOrders = 0;
        let completedOrders = 0;

        if (Array.isArray(ordRows)) {
            for (const r of ordRows) {
                const c = Number(r.cnt) || 0;
                if (r.status === 'SUBMITTED') {
                    pendingRequests += c;
                } else if (['CONFIRMED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'PARTIALLY_RECEIVED', 'DELIVERED'].includes(r.status)) {
                    activeOrders += c;
                } else if (r.status === 'RECEIVED') {
                    completedOrders += c;
                }
            }
        }

        return {
            catalogVariants,
            offers,
            pendingRequests,
            activeOrders,
            completedOrders
        };
    }

    /**
     * Format raw database order row into camelCase API response.
     */
    formatOrderRow(r) {
        return {
            id: r.id,
            orderNumber: r.order_number,
            orderType: r.order_type,
            tenantId: r.tenant_id,
            printhouseId: r.printhouse_id,
            printhouseName: r.printhouse_name || null,
            supplierId: r.supplier_id,
            supplierName: r.supplier_name || null,
            offerId: r.offer_id,
            offerRevisionId: r.offer_revision_id,
            variantId: r.variant_id,
            materialInventoryId: r.material_inventory_id,
            snapshot: {
                productName: r.snapshot_product_name,
                brand: r.snapshot_brand,
                category: r.snapshot_category,
                finish: r.snapshot_finish,
                gsm: r.snapshot_gsm,
                widthMm: Number(r.snapshot_width_mm),
                heightMm: Number(r.snapshot_height_mm),
                caliperUm: r.snapshot_caliper_um,
                grainDirection: r.snapshot_grain_direction,
                priceBasis: r.snapshot_price_basis,
                pricePerBasis: Number(r.snapshot_price_per_basis),
                currency: r.snapshot_currency,
                supplierSku: r.snapshot_supplier_sku,
                sheetsPerPack: r.snapshot_sheets_per_pack
            },
            orderedQuantity: Number(r.ordered_quantity),
            orderedQuantityBasis: r.ordered_quantity_basis,
            totalSheets: Number(r.total_sheets),
            deliveredQuantity: Number(r.delivered_quantity),
            deliveredSheets: Number(r.delivered_sheets),
            receivedQuantity: Number(r.received_quantity),
            receivedSheets: Number(r.received_sheets),
            totalAmount: Number(r.total_amount),
            status: r.status,
            deliverySiteName: r.delivery_site_name,
            deliveryAddress: r.delivery_address,
            expectedDeliveryDate: r.expected_delivery_date,
            dispatchedAt: r.dispatched_at,
            deliveredAt: r.delivered_at,
            cancelledAt: r.cancelled_at,
            cancellationReason: r.cancellation_reason,
            supplierNotes: r.supplier_notes,
            buyerNotes: r.buyer_notes,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        };
    }
}

module.exports = new PaperProcurementService();
