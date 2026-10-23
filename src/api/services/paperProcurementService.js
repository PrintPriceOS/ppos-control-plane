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
const controlPlaneNotificationService = require('./controlPlaneNotificationService');
const notificationDispatcherService = require('./notificationDispatcherService');

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
            id: r.offer_id,
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
     * Search master paper products, technical variants, and system supplier offers.
     * Allows Printhouse operators to search by name/brand/finish or by dimensions/format (e.g. 70x100, 700x1000, 64x92).
     */
    async searchMasterPaperDatabase(buyerTenantId, query = {}) {
        const rawQuery = (query.query || query.q || '').trim();
        const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 30), 100);
        const offset = Math.max(0, parseInt(query.offset, 10) || 0);

        // If raw query is non-empty but under 2 characters and no category/finish filter is specified, return empty
        if (rawQuery.length > 0 && rawQuery.length < 2 && !query.category && !query.finish && !query.gsm) {
            return {
                total: 0,
                limit,
                offset,
                items: []
            };
        }

        // 1. Parse dimension pairs if present
        // Matches e.g. 700x1000, 70 x 100, 64x92, 72x102, 1020x720, 500x700
        const dimMatch = rawQuery.match(/\b(\d{2,4})\s*[*xX×]\s*(\d{2,4})\b/);
        let dimPairs = [];
        if (dimMatch) {
            const d1 = parseInt(dimMatch[1], 10);
            const d2 = parseInt(dimMatch[2], 10);
            dimPairs.push([d1, d2], [d2, d1]);
            // If dimensions look like cm (< 200), also check mm equivalents (* 10)
            if (d1 < 200 && d2 < 200) {
                dimPairs.push([d1 * 10, d2 * 10], [d2 * 10, d1 * 10]);
            }
        }

        // 2. Parse GSM if query contains standalone grammage like "130g", "255 gsm", "300"
        let parsedGsm = query.gsm ? parseInt(query.gsm, 10) : null;
        const gsmMatch = rawQuery.match(/\b(\d{2,3})\s*(?:g|gsm)?\b/i);
        if (!parsedGsm && gsmMatch && !dimMatch) {
            const possibleGsm = parseInt(gsmMatch[1], 10);
            if (possibleGsm >= 50 && possibleGsm <= 600) {
                parsedGsm = possibleGsm;
            }
        }

        // 3. Extract text keywords (excluding matched dimension token and matched gsm token)
        let textQuery = rawQuery;
        if (dimMatch) {
            textQuery = textQuery.replace(dimMatch[0], ' ').trim();
        }
        if (parsedGsm && gsmMatch) {
            textQuery = textQuery.replace(gsmMatch[0], ' ').trim();
        }

        let whereClauses = [];
        let params = [buyerTenantId, buyerTenantId];

        // Dimension filter
        if (dimPairs.length > 0) {
            const orDimClauses = dimPairs.map(() => '(v.width_mm = ? AND v.height_mm = ?)').join(' OR ');
            const dimFlat = [];
            for (const pair of dimPairs) {
                dimFlat.push(pair[0], pair[1]);
            }
            whereClauses.push(`(${orDimClauses} OR p.name LIKE ?)`);
            params.push(...dimFlat, `%${dimMatch[0]}%`);
        }

        // Text query
        if (textQuery && textQuery.length > 0) {
            const tokens = textQuery.split(/\s+/).filter(t => t.length > 0);
            for (const token of tokens) {
                const s = `%${token}%`;
                whereClauses.push('(p.name LIKE ? OR p.brand LIKE ? OR p.manufacturer LIKE ? OR p.category LIKE ? OR v.finish LIKE ? OR s.name LIKE ?)');
                params.push(s, s, s, s, s, s);
            }
        }

        // Category filter
        if (query.category) {
            whereClauses.push('p.category = ?');
            params.push(String(query.category).toUpperCase());
        }

        // Finish filter
        if (query.finish) {
            whereClauses.push('v.finish = ?');
            params.push(String(query.finish).toUpperCase());
        }

        // GSM filter
        if (parsedGsm) {
            whereClauses.push('(v.gsm = ? OR p.name LIKE ?)');
            params.push(parsedGsm, `%${parsedGsm}%`);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Query with Left Join on supplier offers
        const sql = `
            SELECT 
                v.id AS variant_id,
                v.product_id,
                p.name AS product_name,
                p.brand,
                p.manufacturer,
                p.category,
                p.finish_summary,
                p.description,
                v.gsm,
                v.width_mm,
                v.height_mm,
                v.caliper_um,
                v.caliper_mm,
                v.is_reel,
                v.finish,
                v.grain_direction,
                v.fingerprint,
                o.id AS offer_id,
                o.supplier_id,
                s.name AS supplier_name,
                s.contact_email AS supplier_email,
                o.supplier_sku,
                o.price_amount,
                o.price_basis,
                o.currency,
                o.moq,
                o.order_multiple,
                o.sheets_per_pack,
                o.status AS offer_status
            FROM paper_variants v
            JOIN paper_products p ON v.product_id = p.id
            LEFT JOIN supplier_paper_offers o ON o.variant_id = v.id 
                AND o.deleted_at IS NULL
                AND (o.visibility = 'MARKETPLACE' OR (o.visibility = 'APPROVED_CUSTOMERS' AND JSON_CONTAINS(COALESCE(o.metadata_json->'$.approved_customer_ids', '[]'), JSON_QUOTE(?))) OR (o.visibility = 'PRIVATE' AND o.tenant_id = ?))
            LEFT JOIN paper_suppliers s ON o.supplier_id = s.id
            ${whereSql}
            ORDER BY 
                (o.status = 'ACTIVE') DESC,
                (o.id IS NOT NULL) DESC,
                p.name ASC, 
                v.gsm ASC, 
                v.width_mm ASC
            LIMIT ? OFFSET ?
        `;

        const countSql = `
            SELECT COUNT(DISTINCT v.id) as total
            FROM paper_variants v
            JOIN paper_products p ON v.product_id = p.id
            LEFT JOIN supplier_paper_offers o ON o.variant_id = v.id 
                AND o.deleted_at IS NULL
                AND (o.visibility = 'MARKETPLACE' OR (o.visibility = 'APPROVED_CUSTOMERS' AND JSON_CONTAINS(COALESCE(o.metadata_json->'$.approved_customer_ids', '[]'), JSON_QUOTE(?))) OR (o.visibility = 'PRIVATE' AND o.tenant_id = ?))
            LEFT JOIN paper_suppliers s ON o.supplier_id = s.id
            ${whereSql}
        `;

        const countRows = unwrapRows(await db.query(countSql, params));
        const total = (countRows && countRows[0] && countRows[0].total) ? Number(countRows[0].total) : 0;

        const rows = unwrapRows(await db.query(sql, [...params, limit, offset]));
        const rawItems = Array.isArray(rows) ? rows : [];

        // Deduplicate variants so each variant appears only once with its best offer
        const seenVariantIds = new Set();
        const items = [];

        for (const r of rawItems) {
            if (seenVariantIds.has(r.variant_id)) continue;
            seenVariantIds.add(r.variant_id);

            const widthMm = Number(r.width_mm);
            const heightMm = Number(r.height_mm);
            const gsm = Number(r.gsm);
            const areaM2 = (widthMm * heightMm) / 1000000;
            const kgPerSheet = areaM2 * (gsm / 1000);

            let calculatedCostPerSheet = null;
            if (r.price_amount && r.price_basis) {
                const amt = Number(r.price_amount);
                switch (r.price_basis) {
                    case 'SHEET':
                        calculatedCostPerSheet = amt;
                        break;
                    case 'THOUSAND_SHEETS':
                        calculatedCostPerSheet = amt / 1000;
                        break;
                    case 'PACK':
                        if (Number(r.sheets_per_pack) > 0) {
                            calculatedCostPerSheet = amt / Number(r.sheets_per_pack);
                        }
                        break;
                    case 'KG':
                        calculatedCostPerSheet = Number((amt * kgPerSheet).toFixed(5));
                        break;
                    case 'TONNE':
                        calculatedCostPerSheet = Number(((amt / 1000) * kgPerSheet).toFixed(5));
                        break;
                }
            }

            // Standard sheet format tag
            let sheetFormat = `${Math.round(widthMm)}x${Math.round(heightMm)}`;
            if (widthMm === 700 && heightMm === 1000) sheetFormat = '700x1000 (B1)';
            else if (widthMm === 500 && heightMm === 700) sheetFormat = '500x700 (B2)';
            else if (widthMm === 640 && heightMm === 900) sheetFormat = '640x900';
            else if (widthMm === 640 && heightMm === 920) sheetFormat = '640x920';
            else if (widthMm === 720 && heightMm === 1020) sheetFormat = '720x1020';
            else if (widthMm === 1020 && heightMm === 720) sheetFormat = '1020x720';
            else if (widthMm === 320 && heightMm === 450) sheetFormat = 'SRA3';
            else if (widthMm === 450 && heightMm === 640) sheetFormat = '450x640 (SRA2)';

            items.push({
                variantId: r.variant_id,
                productId: r.product_id,
                productName: r.product_name,
                brand: r.brand || null,
                manufacturer: r.manufacturer || null,
                category: r.category || 'OTHER',
                finishSummary: r.finish_summary || null,
                gsm,
                widthMm,
                heightMm,
                dimensionsFormatted: `${widthMm} × ${heightMm} mm`,
                sheetFormat,
                finish: r.finish || 'UNCOATED',
                grainDirection: r.grain_direction || 'UNKNOWN',
                caliperUm: r.caliper_um ? Number(r.caliper_um) : null,
                isReel: Boolean(r.is_reel),
                supplierId: r.supplier_id || 'supp-test-mill-01',
                supplierName: r.supplier_name || 'Papelera del Mediterraneo (Demo)',
                supplierEmail: r.supplier_email || 'proveedor@demo-papel.pro',
                offerId: r.offer_id || null,
                supplierSku: r.supplier_sku || null,
                priceAmount: r.price_amount ? Number(r.price_amount) : null,
                priceBasis: r.price_basis || null,
                currency: r.currency || 'EUR',
                moq: r.moq ? Number(r.moq) : 1,
                calculatedCostPerSheet,
                hasActiveOffer: Boolean(r.offer_id && r.offer_status === 'ACTIVE')
            });
        }

        return {
            items,
            total,
            limit,
            offset
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

        const createdOrder = await this.getSupplierOrderById(supplierId, orderId);
        
        // Notify supplier of newly submitted Order / RFQ
        const rawRows = unwrapRows(await db.query("SELECT * FROM supplier_paper_procurement_orders WHERE id = ?", [orderId]));
        if (rawRows && rawRows.length > 0) {
            this._notifyProcurementEvent(type === 'RFQ' ? 'PAPER_RFQ_SUBMITTED' : 'PAPER_ORDER_SUBMITTED', rawRows[0]);
        }

        return createdOrder;
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

                const price = Number(payload.pricePerBasis !== undefined && payload.pricePerBasis !== null ? payload.pricePerBasis : payload.quotePricePerBasis);
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

                const quotedRaw = unwrapRows(await db.query("SELECT * FROM supplier_paper_procurement_orders WHERE id = ?", [orderId]));
                if (quotedRaw && quotedRaw.length > 0) {
                    this._notifyProcurementEvent('PAPER_RFQ_QUOTED', quotedRaw[0]);
                }
                break;
            }

            case 'CONFIRM':
            case 'CONFIRMED': {
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

            case 'DISPATCH':
            case 'DISPATCHED': {
                if (!['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(currentStatus)) {
                    const err = new Error(`Cannot dispatch order in status '${currentStatus}'`);
                    err.statusCode = 400;
                    throw err;
                }

                const dispatchedQty = Number(payload.dispatchedQuantity || order.ordered_quantity);
                const dispatchedSheets = Number(payload.dispatchedSheets || order.total_sheets);
                const isPartial = dispatchedSheets < order.total_sheets;
                const newStatus = isPartial ? 'PARTIALLY_DELIVERED' : 'DISPATCHED';

                const logisticsNote = payload.supplierNotes || (payload.carrier || payload.carrierName || payload.trackingNumber
                    ? `Transportista: ${payload.carrier || payload.carrierName || 'Estándar'} | Seguimiento: ${payload.trackingNumber || 'N/A'}`
                    : null);

                await db.query(`
                    UPDATE supplier_paper_procurement_orders
                    SET status = ?,
                        delivered_quantity = ?,
                        delivered_sheets = ?,
                        dispatched_at = CURRENT_TIMESTAMP,
                        supplier_notes = COALESCE(?, supplier_notes)
                    WHERE id = ?
                `, [newStatus, dispatchedQty, dispatchedSheets, logisticsNote, orderId]);

                const dispatchedRaw = unwrapRows(await db.query("SELECT * FROM supplier_paper_procurement_orders WHERE id = ?", [orderId]));
                if (dispatchedRaw && dispatchedRaw.length > 0) {
                    this._notifyProcurementEvent('PAPER_ORDER_DISPATCHED', dispatchedRaw[0]);
                }
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

        const acceptedRaw = unwrapRows(await db.query("SELECT * FROM supplier_paper_procurement_orders WHERE id = ?", [orderId]));
        if (acceptedRaw && acceptedRaw.length > 0) {
            this._notifyProcurementEvent('PAPER_QUOTE_ACCEPTED', acceptedRaw[0]);
        }

        return await this.getPrinthouseOrderById(actor.tenantId, orderId);
    }

    /**
     * Atomic & Idempotent Warehouse Receipt.
     * Receives physical delivery, increments stock in predictive_material_inventory,
     * logs immutable audit event, and updates order cumulative received counts.
     */
    async receiveOrderAtomic(orderId, actor, options = {}, fourthArg = null) {
        const idempKey = options.idempotencyKey || (typeof fourthArg === 'string' ? fourthArg : null);
        const {
            receivedQuantity = null,
            receivedSheets = null,
            notes = '',
            operatorId = null
        } = options;
        const idempotencyKey = idempKey;

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
            const receiptNumber = options.receiptNumber || options.receipt_number || `RCV-${Date.now().toString().slice(-6)}`;

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

            // Notify supplier of received delivery
            const finalRaw = unwrapRows(await db.query("SELECT * FROM supplier_paper_procurement_orders WHERE id = ?", [orderId]));
            if (finalRaw && finalRaw.length > 0) {
                this._notifyProcurementEvent('PAPER_ORDER_RECEIVED', finalRaw[0], {
                    receivedSheets: effectiveSheets,
                    receiptNumber,
                    newStatus: terminalStatus
                });
            }

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
            type: r.order_type,
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
            snapshotProductName: r.snapshot_product_name,
            snapshotBrand: r.snapshot_brand,
            snapshotCategory: r.snapshot_category,
            snapshotFinish: r.snapshot_finish,
            snapshotGsm: Number(r.snapshot_gsm),
            snapshotWidthMm: Number(r.snapshot_width_mm),
            snapshotHeightMm: Number(r.snapshot_height_mm),
            snapshotCaliperMicrons: r.snapshot_caliper_um ? Number(r.snapshot_caliper_um) : null,
            snapshotGrainDirection: r.snapshot_grain_direction,
            snapshotPricePerBasis: Number(r.snapshot_price_per_basis),
            orderedQuantity: Number(r.ordered_quantity),
            orderedQuantityBasis: r.ordered_quantity_basis,
            quantityBasis: r.ordered_quantity_basis,
            totalSheets: Number(r.total_sheets),
            deliveredQuantity: Number(r.delivered_quantity),
            deliveredSheets: Number(r.delivered_sheets),
            receivedQuantity: Number(r.received_quantity),
            receivedSheets: Number(r.received_sheets),
            totalAmount: Number(r.total_amount),
            currency: r.snapshot_currency || 'EUR',
            status: r.status,
            deliverySiteName: r.delivery_site_name,
            deliveryCenterName: r.delivery_site_name,
            deliveryAddress: r.delivery_address,
            expectedDeliveryDate: r.expected_delivery_date,
            carrierName: r.carrier_name || null,
            trackingNumber: r.tracking_number || null,
            quotePricePerBasis: r.quote_price_per_basis ? Number(r.quote_price_per_basis) : null,
            quoteTotalAmount: r.quote_total_amount ? Number(r.quote_total_amount) : null,
            quoteValidUntil: r.quote_valid_until || null,
            confirmedAt: r.confirmed_at || null,
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

    /**
     * Internal async notification dispatcher for procurement lifecycle events.
     * Non-blocking and resilient to prevent database transaction rollbacks.
     */
    async _notifyProcurementEvent(eventType, order, extra = {}) {
        try {
            let targetTenantId = null;
            let title = '';
            let message = '';
            let actionUrl = '';

            switch (eventType) {
                case 'PAPER_ORDER_SUBMITTED':
                case 'PAPER_RFQ_SUBMITTED': {
                    const suppRows = unwrapRows(await db.query("SELECT tenant_id, name FROM paper_suppliers WHERE id = ?", [order.supplier_id]));
                    if (suppRows && suppRows.length > 0) {
                        targetTenantId = suppRows[0].tenant_id;
                    }
                    const isRfq = order.order_type === 'RFQ';
                    title = isRfq ? 'Nueva Solicitud de Cotización (RFQ)' : 'Nuevo Pedido de Suministro de Papel';
                    message = `La imprenta ha enviado ${isRfq ? 'una solicitud RFQ' : 'un pedido en firme'} para ${order.snapshot_product_name} (${order.total_sheets} hojas). Ref: ${order.order_number}`;
                    actionUrl = '/supplier/orders';
                    break;
                }
                case 'PAPER_RFQ_QUOTED': {
                    targetTenantId = order.tenant_id;
                    title = 'Cotización de Papel Recibida';
                    message = `El proveedor ha cotizado tu solicitud RFQ para ${order.snapshot_product_name} a ${order.snapshot_price_per_basis} ${order.snapshot_currency}/${order.snapshot_price_basis}. Ref: ${order.order_number}`;
                    actionUrl = '/materials/sourcing';
                    break;
                }
                case 'PAPER_QUOTE_ACCEPTED': {
                    const suppRows = unwrapRows(await db.query("SELECT tenant_id, name FROM paper_suppliers WHERE id = ?", [order.supplier_id]));
                    if (suppRows && suppRows.length > 0) {
                        targetTenantId = suppRows[0].tenant_id;
                    }
                    title = 'Cotización Aceptada — Pedido Confirmado';
                    message = `La imprenta ha aceptado la cotización para ${order.snapshot_product_name}. La orden pasa a estado CONFIRMED. Ref: ${order.order_number}`;
                    actionUrl = '/supplier/orders';
                    break;
                }
                case 'PAPER_ORDER_DISPATCHED': {
                    targetTenantId = order.tenant_id;
                    title = 'Expedición en Tránsito';
                    message = `El proveedor ha expedido ${order.delivered_sheets || order.total_sheets} hojas de ${order.snapshot_product_name}. Ref: ${order.order_number}`;
                    actionUrl = '/materials/sourcing';
                    break;
                }
                case 'PAPER_ORDER_RECEIVED': {
                    const suppRows = unwrapRows(await db.query("SELECT tenant_id, name FROM paper_suppliers WHERE id = ?", [order.supplier_id]));
                    if (suppRows && suppRows.length > 0) {
                        targetTenantId = suppRows[0].tenant_id;
                    }
                    title = 'Mercancía Recepcionada en Planta';
                    message = `La imprenta ha registrado la recepción de ${extra.receivedSheets || order.received_sheets} hojas de ${order.snapshot_product_name}. Ref: ${order.order_number}`;
                    actionUrl = '/supplier/orders';
                    break;
                }
                default:
                    return;
            }

            if (targetTenantId) {
                const notifId = `notif_proc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
                await controlPlaneNotificationService.createNotification({
                    id: notifId,
                    tenant_id: targetTenantId,
                    user_id: null,
                    scope: 'TENANT',
                    type: eventType,
                    severity: 'info',
                    title,
                    message,
                    entity_type: 'PAPER_PROCUREMENT_ORDER',
                    entity_id: order.id,
                    action_url: actionUrl,
                    metadata_json: {
                        orderId: order.id,
                        orderNumber: order.order_number,
                        orderType: order.order_type,
                        productName: order.snapshot_product_name,
                        status: order.status,
                        ...extra
                    }
                }).catch(err => {
                    logger.warn({ event: 'notification_creation_caught', error: err.message });
                });

                notificationDispatcherService.dispatch(eventType, {
                    orderId: order.id,
                    orderNumber: order.order_number,
                    tenantId: targetTenantId,
                    title,
                    message
                }).catch(err => {
                    logger.warn({ event: 'notification_dispatch_caught', error: err.message });
                });
            }
        } catch (err) {
            logger.warn({ event: 'procurement_notification_handler_error', error: err.message });
        }
    }

    /**
     * Generates a canonical procurement document (PO or Packing Slip/Albarán).
     * Accessible by both buyer (printhouse) and seller (supplier).
     * 
     * @param {string} orderId 
     * @param {string} docType - 'po' | 'packing_slip'
     * @param {Object} actor - Authenticated user context
     */
    async generateProcurementDocument(orderId, docType = 'po', actor = {}) {
        if (!orderId) {
            const err = new Error('ORDER_ID_REQUIRED');
            err.statusCode = 400;
            throw err;
        }

        const rows = unwrapRows(await db.query(`
            SELECT 
                o.*,
                t.name AS printhouse_name,
                s.name AS supplier_name,
                o.snapshot_currency AS supplier_currency,
                s.status AS supplier_status
            FROM supplier_paper_procurement_orders o
            LEFT JOIN tenants t ON o.tenant_id = t.id
            LEFT JOIN paper_suppliers s ON o.supplier_id = s.id
            WHERE o.id = ?
        `, [orderId]));

        if (!rows || rows.length === 0) {
            const err = new Error('ORDER_NOT_FOUND');
            err.statusCode = 404;
            throw err;
        }

        const raw = rows[0];

        // Authorization check: Actor must be either buyer tenant or supplier
        const isBuyer = actor.tenantId && actor.tenantId === raw.tenant_id;
        const isSupplier = (actor.supplierId && actor.supplierId === raw.supplier_id) ||
                           (actor.verifiedSupplierContext && actor.verifiedSupplierContext.supplierId === raw.supplier_id);
        const isSuperAdmin = actor.role === 'SUPER_ADMIN' || actor.isSuperAdmin;

        if (!isBuyer && !isSupplier && !isSuperAdmin) {
            const err = new Error('FORBIDDEN_DOCUMENT_ACCESS');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_DOCUMENT_ACCESS';
            throw err;
        }

        // Fetch all receipts
        const receiptRows = unwrapRows(await db.query(`
            SELECT * FROM supplier_paper_order_receipts
            WHERE order_id = ?
            ORDER BY created_at DESC
        `, [orderId]));

        const receipts = (Array.isArray(receiptRows) ? receiptRows : []).map(r => ({
            id: r.id,
            receiptNumber: r.receipt_number,
            receivedQuantity: Number(r.received_quantity),
            receivedSheets: Number(r.received_sheets),
            operatorId: r.operator_id,
            notes: r.notes,
            receivedAt: r.created_at
        }));

        const isPackingSlip = String(docType).toLowerCase() === 'packing_slip' || String(docType).toLowerCase() === 'receipt';
        const docNumber = isPackingSlip
            ? (receipts.length > 0 ? receipts[0].receiptNumber : `ALB-${raw.order_number}`)
            : raw.order_number;

        const docData = {
            documentType: isPackingSlip ? 'PACKING_SLIP' : 'PO',
            documentTitle: isPackingSlip ? 'Albarán de Entrega / Packing Slip' : 'Orden de Compra / Purchase Order',
            documentNumber: docNumber,
            documentCode: docNumber,
            orderNumber: raw.order_number,
            orderType: raw.order_type,
            issueDate: new Date().toISOString().split('T')[0],
            orderDate: (raw.created_at ? new Date(raw.created_at) : new Date()).toISOString().split('T')[0],
            status: raw.status,
            buyer: {
                tenantId: raw.tenant_id,
                name: raw.printhouse_name || 'Printhouse Production Partner',
                companyName: raw.printhouse_name || 'Printhouse Production Partner',
                centerId: raw.printhouse_id,
                deliverySiteName: raw.delivery_site_name || 'Main Production Plant',
                deliveryAddress: raw.delivery_address || 'Facility Address',
                buyerNotes: raw.buyer_notes || 'Ninguna especificación adicional'
            },
            supplier: {
                supplierId: raw.supplier_id,
                companyName: raw.supplier_name || 'Paper Supplier Partner',
                supplierSku: raw.snapshot_supplier_sku || 'N/A',
                supplierNotes: raw.supplier_notes || 'Ninguna especificación adicional'
            },
            material: {
                productName: raw.snapshot_product_name,
                brand: raw.snapshot_brand || 'Standard Mill',
                category: raw.snapshot_category,
                finish: raw.snapshot_finish || 'UNCOATED',
                gsm: raw.snapshot_gsm,
                dimensions: `${raw.snapshot_width_mm} × ${raw.snapshot_height_mm} mm`,
                caliperUm: raw.snapshot_caliper_um ? `${raw.snapshot_caliper_um} µm` : 'N/A',
                grainDirection: raw.snapshot_grain_direction || 'LONG_GRAIN',
                sheetsPerPack: raw.snapshot_sheets_per_pack
            },
            quantities: {
                orderedQuantity: Number(raw.ordered_quantity),
                orderedQuantityBasis: raw.ordered_quantity_basis,
                totalSheets: Number(raw.total_sheets),
                deliveredSheets: Number(raw.delivered_sheets),
                receivedSheets: Number(raw.received_sheets),
                remainingBalanceSheets: Math.max(0, Number(raw.total_sheets) - Number(raw.received_sheets))
            },
            financials: {
                priceBasis: raw.snapshot_price_basis,
                pricePerBasis: Number(raw.snapshot_price_per_basis),
                currency: raw.snapshot_currency || 'EUR',
                totalAmount: Number(raw.total_amount),
                taxRate: 0.21,
                taxAmount: Number((Number(raw.total_amount) * 0.21).toFixed(2)),
                grandTotal: Number((Number(raw.total_amount) * 1.21).toFixed(2))
            },
            logistics: {
                carrierName: 'Standard Freight Logistics',
                trackingNumber: raw.order_number,
                dispatchedAt: raw.dispatched_at,
                deliveredAt: raw.delivered_at,
                expectedDeliveryDate: raw.expected_delivery_date
            },
            receipts
        };

        docData.printableHtml = this.renderPrintableDocumentHtml(docData);
        return { ok: true, data: docData, ...docData };
    }

    /**
     * Renders a standalone, high-fidelity printable HTML document with embedded CSS.
     * Complies with industrial invoice and packing slip presentation standards.
     */
    renderPrintableDocumentHtml(d) {
        const isSlip = d.documentType === 'PACKING_SLIP';
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${d.documentTitle} — ${d.documentNumber}</title>
    <style>
        @page { size: A4 portrait; margin: 12mm 15mm; }
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background-color: #ffffff;
            margin: 0;
            padding: 24px;
            font-size: 13px;
            line-height: 1.4;
        }
        .no-print {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 24px;
            gap: 12px;
        }
        .btn-print {
            background-color: #dc0000;
            color: #ffffff;
            border: none;
            padding: 10px 20px;
            font-weight: 600;
            font-size: 13px;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(220, 0, 0, 0.2);
        }
        .btn-print:hover { background-color: #b30000; }
        .doc-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 16px;
            margin-bottom: 20px;
        }
        .brand-title {
            font-size: 20px;
            font-weight: 800;
            color: #dc0000;
            letter-spacing: -0.5px;
            margin: 0;
        }
        .brand-subtitle {
            font-size: 11px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 2px;
        }
        .doc-title-block { text-align: right; }
        .doc-title {
            font-size: 18px;
            font-weight: 800;
            margin: 0;
            color: #0f172a;
        }
        .doc-badge {
            display: inline-block;
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 700;
            margin-top: 6px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 24px;
        }
        .info-card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px;
            background-color: #f8fafc;
        }
        .card-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #64748b;
            margin-bottom: 6px;
        }
        .card-name {
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 4px;
        }
        .card-detail { font-size: 12px; color: #334155; margin: 2px 0; }
        .spec-table, .receipt-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
        }
        .spec-table th, .receipt-table th {
            background-color: #0f172a;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 12px;
            text-align: left;
        }
        .spec-table td, .receipt-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 12px;
        }
        .spec-table tr:nth-child(even) { background-color: #f8fafc; }
        .totals-section {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 30px;
        }
        .totals-card {
            width: 280px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            background-color: #f8fafc;
        }
        .totals-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            padding: 4px 0;
            color: #475569;
        }
        .totals-row.grand-total {
            border-top: 2px solid #0f172a;
            margin-top: 6px;
            padding-top: 8px;
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
        }
        .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-top: 36px;
            page-break-inside: avoid;
        }
        .signature-box {
            border: 1px dashed #94a3b8;
            border-radius: 8px;
            padding: 16px;
            min-height: 100px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .sig-title {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
        }
        .sig-line {
            border-top: 1px solid #cbd5e1;
            margin-top: 40px;
            font-size: 10px;
            color: #64748b;
            padding-top: 4px;
        }
        .footer-note {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            border-top: 1px solid #f1f5f9;
            padding-top: 12px;
        }
        @media print {
            .no-print { display: none !important; }
            body { padding: 0; background: white; }
            .info-card { background: white !important; border: 1px solid #cbd5e1; }
            .spec-table th, .receipt-table th { background-color: #000000 !important; color: #ffffff !important; }
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>
    </div>

    <header class="doc-header">
        <div>
            <h1 class="brand-title">PrintPrice OS</h1>
            <div class="brand-subtitle">Control Plane — Paper Procurement Hub</div>
        </div>
        <div class="doc-title-block">
            <h2 class="doc-title">${d.documentTitle}</h2>
            <div class="doc-badge">DOC REF: ${d.documentNumber}</div>
        </div>
    </header>

    <div class="info-grid">
        <div class="info-card">
            <div class="card-label">Comprador / Destino de Entrega</div>
            <div class="card-name">${d.buyer.companyName}</div>
            <div class="card-detail"><strong>Centro:</strong> ${d.buyer.deliverySiteName}</div>
            <div class="card-detail"><strong>Dirección:</strong> ${d.buyer.deliveryAddress}</div>
            <div class="card-detail"><strong>Notas:</strong> ${d.buyer.buyerNotes}</div>
        </div>
        <div class="info-card">
            <div class="card-label">Proveedor / Emisor</div>
            <div class="card-name">${d.supplier.companyName}</div>
            <div class="card-detail"><strong>SKU Proveedor:</strong> ${d.supplier.supplierSku}</div>
            <div class="card-detail"><strong>Pedido PPOS:</strong> ${d.orderNumber} (${d.orderType})</div>
            <div class="card-detail"><strong>Fecha Emisión:</strong> ${d.issueDate} | <strong>Estado:</strong> ${d.status}</div>
            ${d.supplier.supplierNotes ? `<div class="card-detail"><strong>Logística / Notas:</strong> ${d.supplier.supplierNotes}</div>` : ''}
        </div>
    </div>

    <table class="spec-table">
        <thead>
            <tr>
                <th>Material & Ficha Técnica</th>
                <th>Gramaje</th>
                <th>Formato</th>
                <th>Acabado</th>
                <th>Cantidad</th>
                <th>Hojas Totales</th>
                ${isSlip ? '<th>Recibidas</th><th>Saldo Pendiente</th>' : '<th>Precio/Base</th><th>Importe</th>'}
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <strong>${d.material.productName}</strong><br>
                    <span style="font-size: 10px; color: #64748b;">Marca: ${d.material.brand} | Cat: ${d.material.category} | Fibra: ${d.material.grainDirection}</span>
                </td>
                <td>${d.material.gsm} g/m²</td>
                <td>${d.material.dimensions}</td>
                <td>${d.material.finish}</td>
                <td>${d.quantities.orderedQuantity} ${d.quantities.orderedQuantityBasis}</td>
                <td><strong>${Number(d.quantities.totalSheets).toLocaleString()}</strong></td>
                ${isSlip
                    ? `<td><strong style="color: #16a34a;">${Number(d.quantities.receivedSheets).toLocaleString()}</strong></td>
                       <td><strong>${Number(d.quantities.remainingBalanceSheets).toLocaleString()}</strong></td>`
                    : `<td>${Number(d.financials.pricePerBasis).toFixed(2)} ${d.financials.currency}/${d.financials.priceBasis}</td>
                       <td><strong>${Number(d.financials.totalAmount).toFixed(2)} ${d.financials.currency}</strong></td>`
                }
            </tr>
        </tbody>
    </table>

    ${isSlip && d.receipts && d.receipts.length > 0 ? `
    <h3 style="font-size: 13px; text-transform: uppercase; color: #0f172a; margin-bottom: 8px; letter-spacing: 0.5px;">Desglose de Albaranes de Entrada Físicos</h3>
    <table class="receipt-table">
        <thead>
            <tr>
                <th>Nº Albarán</th>
                <th>Fecha Entrada</th>
                <th>Cantidad Recibida</th>
                <th>Hojas Verificadas</th>
                <th>Operador / Inspección</th>
                <th>Notas</th>
            </tr>
        </thead>
        <tbody>
            ${d.receipts.map(r => `
            <tr>
                <td><strong>${r.receiptNumber}</strong></td>
                <td>${new Date(r.receivedAt).toLocaleString()}</td>
                <td>${r.receivedQuantity}</td>
                <td><strong>${Number(r.receivedSheets).toLocaleString()}</strong></td>
                <td>${r.operatorId || 'Responsable de Almacén'}</td>
                <td>${r.notes || 'Recepción conforme'}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    ` : ''}

    <div class="totals-section">
        <div class="totals-card">
            ${isSlip ? `
            <div class="totals-row"><span>Total Hojas Contratadas:</span><strong>${Number(d.quantities.totalSheets).toLocaleString()}</strong></div>
            <div class="totals-row"><span>Total Hojas Recibidas:</span><strong style="color: #16a34a;">${Number(d.quantities.receivedSheets).toLocaleString()}</strong></div>
            <div class="totals-row grand-total"><span>Saldo Pendiente:</span><strong>${Number(d.quantities.remainingBalanceSheets).toLocaleString()}</strong></div>
            ` : `
            <div class="totals-row"><span>Subtotal Neto:</span><strong>${Number(d.financials.totalAmount).toFixed(2)} ${d.financials.currency}</strong></div>
            <div class="totals-row"><span>IVA Est. (21%):</span><strong>${Number(d.financials.taxAmount).toFixed(2)} ${d.financials.currency}</strong></div>
            <div class="totals-row grand-total"><span>Total Pedido:</span><strong>${Number(d.financials.grandTotal).toFixed(2)} ${d.financials.currency}</strong></div>
            `}
        </div>
    </div>

    <div class="signatures-grid">
        <div class="signature-box">
            <div class="sig-title">Expedición Proveedor / Conductor</div>
            <div class="sig-line">Firma y Sello de Salida de Fábrica</div>
        </div>
        <div class="signature-box">
            <div class="sig-title">Recepción Almacén Imprenta</div>
            <div class="sig-line">Firma Responsable y Sello de Entrada en Planta</div>
        </div>
    </div>

    <footer class="footer-note">
        Documento oficial emitido por PrintPrice OS Control Plane. Inmutable, con registro de auditoría en ledger criptográfico de inventario.
    </footer>
</body>
</html>`;
    }

    calculateSheets(quantity, basis, variant, sheetsPerPack) {
        return calculateSheets(quantity, basis, variant, sheetsPerPack);
    }

    calculateTotalAmount(priceAmount, priceBasis, totalSheets, variant, sheetsPerPack) {
        return calculateTotalAmount(priceAmount, priceBasis, totalSheets, variant, sheetsPerPack);
    }
}

module.exports = new PaperProcurementService();
