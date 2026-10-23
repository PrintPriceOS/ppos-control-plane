'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');

/**
 * Valid price bases according to canonical contract
 */
const VALID_PRICE_BASES = ['KG', 'TONNE', 'SHEET', 'THOUSAND_SHEETS', 'PACK'];
const VALID_VISIBILITIES = ['PRIVATE', 'APPROVED_CUSTOMERS', 'MARKETPLACE'];
const VALID_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];

const ALLOWED_CURRENCIES = ['EUR', 'USD', 'GBP'];

/**
 * Validate commercial offer input fields strictly.
 * Does not guess currency or price basis.
 */
function validateOfferPayload(payload) {
    const errors = [];

    if (!payload.variantId || typeof payload.variantId !== 'string') {
        errors.push('variantId is required and must be a valid string identifier.');
    }

    if (!payload.supplierSku || typeof payload.supplierSku !== 'string' || !payload.supplierSku.trim()) {
        errors.push('supplierSku is required.');
    }

    const rawPrice = payload.priceAmount;
    const priceAmount = Number(rawPrice);
    if (rawPrice === null || rawPrice === undefined || !Number.isFinite(priceAmount) || priceAmount <= 0) {
        errors.push('priceAmount must be a finite positive number greater than 0.');
    }

    if (!payload.currency || typeof payload.currency !== 'string') {
        errors.push(`currency must be one of: ${ALLOWED_CURRENCIES.join(', ')}.`);
    } else {
        const cur = payload.currency.trim().toUpperCase();
        if (!ALLOWED_CURRENCIES.includes(cur)) {
            errors.push(`currency '${cur}' is not supported. Allowed currencies: ${ALLOWED_CURRENCIES.join(', ')}.`);
        }
    }

    const priceBasis = String(payload.priceBasis || '').toUpperCase();
    if (!VALID_PRICE_BASES.includes(priceBasis)) {
        errors.push(`priceBasis must be one of: ${VALID_PRICE_BASES.join(', ')}.`);
    }

    let sheetsPerPack = null;
    if (priceBasis === 'PACK') {
        const rawSheets = Number(payload.sheetsPerPack);
        if (!Number.isInteger(rawSheets) || rawSheets <= 0) {
            errors.push("sheetsPerPack is required and must be a positive integer > 0 without decimal truncation when priceBasis is 'PACK'.");
        } else {
            sheetsPerPack = rawSheets;
        }
    } else if (payload.sheetsPerPack !== null && payload.sheetsPerPack !== undefined && payload.sheetsPerPack !== '') {
        const rawSheets = Number(payload.sheetsPerPack);
        if (!Number.isInteger(rawSheets) || rawSheets <= 0) {
            errors.push("sheetsPerPack must be a positive integer if provided.");
        } else {
            sheetsPerPack = rawSheets;
        }
    }

    const rawMoq = Number(payload.moq !== undefined ? payload.moq : 1);
    if (!Number.isInteger(rawMoq) || rawMoq < 1) {
        errors.push('moq (Minimum Order Quantity) must be an integer >= 1.');
    }
    const moq = rawMoq;

    const rawMultiple = Number(payload.orderMultiple !== undefined ? payload.orderMultiple : 1);
    if (!Number.isInteger(rawMultiple) || rawMultiple < 1) {
        errors.push('orderMultiple must be an integer >= 1.');
    }
    const orderMultiple = rawMultiple;

    let validFrom = null;
    if (payload.validFrom) {
        validFrom = new Date(payload.validFrom);
        if (isNaN(validFrom.getTime())) {
            errors.push('validFrom must be a valid ISO date timestamp.');
        }
    }

    let validUntil = null;
    if (payload.validUntil) {
        validUntil = new Date(payload.validUntil);
        if (isNaN(validUntil.getTime())) {
            errors.push('validUntil must be a valid ISO date timestamp.');
        }
    }

    if (validFrom && validUntil && validFrom.getTime() > validUntil.getTime()) {
        errors.push(`validFrom (${validFrom.toISOString()}) must be before or equal to validUntil (${validUntil.toISOString()}).`);
    }

    let visibility = 'PRIVATE';
    if (payload.visibility) {
        const vis = String(payload.visibility).toUpperCase();
        if (!VALID_VISIBILITIES.includes(vis)) {
            errors.push(`visibility must be one of: ${VALID_VISIBILITIES.join(', ')}.`);
        } else {
            visibility = vis;
        }
    }

    let status = 'ACTIVE';
    if (payload.status) {
        const st = String(payload.status).toUpperCase();
        if (!VALID_STATUSES.includes(st)) {
            errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}.`);
        } else {
            status = st;
        }
    }

    if (errors.length > 0) {
        const err = new Error(`INVALID_OFFER_PAYLOAD: ${errors.join(' ')}`);
        err.validationErrors = errors;
        throw err;
    }

    return {
        variantId: payload.variantId,
        supplierSku: payload.supplierSku.trim(),
        priceAmount,
        currency: payload.currency.trim().toUpperCase(),
        priceBasis,
        sheetsPerPack: sheetsPerPack || null,
        moq,
        orderMultiple,
        validFrom,
        validUntil,
        deliveryZones: Array.isArray(payload.deliveryZones)
            ? payload.deliveryZones.map(z => String(z).trim().toUpperCase()).filter(Boolean)
            : (payload.deliveryZones ? [String(payload.deliveryZones).trim().toUpperCase()] : []),
        visibility,
        status,
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}
    };
}

/**
 * List products and confirmed technical variants with optional search and pagination.
 * Scopes active offer count to current supplier and marketplace/approved visibility.
 * Returns hierarchical products[].variants AND flat items for full contract compatibility.
 */
async function getTechnicalCatalog({ page = 1, limit = 20, search = null, category = null, finish = null, supplierId = null, customerId = null }) {
    const offset = Math.max(0, (page - 1) * limit);
    const whereConditions = [];
    const params = [];

    if (search && search.trim()) {
        whereConditions.push('(p.name LIKE ? OR v.fingerprint LIKE ?)');
        const term = `%${search.trim()}%`;
        params.push(term, term);
    }

    if (category) {
        const catNorm = String(category).trim().toUpperCase();
        if (catNorm === 'BOARD') {
            whereConditions.push('(p.category = "CARTON" OR p.category = "BOARD")');
        } else if (catNorm === 'SPECIALTY') {
            whereConditions.push('(p.category = "DESIGN" OR p.category = "OTHER" OR p.category = "SPECIALTY")');
        } else if (catNorm === 'KRAFT') {
            whereConditions.push('(p.category = "UNCOATED" OR p.category = "OTHER" OR p.name LIKE "%Kraft%")');
        } else {
            whereConditions.push('p.category = ?');
            params.push(catNorm);
        }
    }

    if (finish) {
        whereConditions.push('v.finish = ?');
        params.push(finish);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countSql = `
        SELECT COUNT(DISTINCT v.id) as total
        FROM paper_variants v
        JOIN paper_products p ON v.product_id = p.id
        ${whereSql}
    `;
    const countResult = await db.query(countSql, params);
    const total = countResult[0]?.total || 0;

    let supplierActiveVariants = 0;
    if (supplierId) {
        const suppVarSql = 'SELECT COUNT(DISTINCT variant_id) as count FROM supplier_paper_offers WHERE supplier_id = ? AND status = "ACTIVE"';
        const suppVarRes = await db.query(suppVarSql, [supplierId]);
        const suppRow = Array.isArray(suppVarRes) ? (Array.isArray(suppVarRes[0]) ? suppVarRes[0][0] : suppVarRes[0]) : suppVarRes;
        supplierActiveVariants = Number(suppRow?.count || 0);
    }

    // Effective Visibility:
    // - MARKETPLACE is visible to all
    // - PRIVATE is strictly visible only to the owning supplier
    // - APPROVED_CUSTOMERS is NOT MARKETPLACE: competing suppliers must NEVER see it.
    //   It is only visible to the owning supplier, or to an authorized customer if customerId/customerTenantId is supplied.
    let visibilityCondition = "o.visibility = 'MARKETPLACE'";
    const subqueryParams = [];

    if (supplierId) {
        visibilityCondition += ' OR o.supplier_id = ?';
        subqueryParams.push(supplierId);
    }

    if (customerId) {
        visibilityCondition += " OR (o.visibility = 'APPROVED_CUSTOMERS' AND JSON_CONTAINS(COALESCE(o.metadata_json->'$.approved_customer_ids', '[]'), JSON_QUOTE(?)))";
        subqueryParams.push(String(customerId));
    }

    let activeOffersSubquery = `
        (SELECT COUNT(*) FROM supplier_paper_offers o 
         WHERE o.variant_id = v.id 
           AND o.status = 'ACTIVE' 
           AND (${visibilityCondition})) as active_offers_count
    `;
    
    // Construct parameters in exact order of appearance in dataSql:
    // 1. subqueryParams for SELECT activeOffersSubquery
    // 2. WHERE conditions (params)
    // 3. LIMIT
    // 4. OFFSET
    const dataParams = [...subqueryParams, ...params, limit, offset];

    const dataSql = `
        SELECT 
            v.id as variant_id,
            v.product_id,
            p.name as product_name,
            p.category,
            p.brand,
            p.manufacturer,
            v.gsm,
            v.caliper_um,
            v.caliper_mm,
            v.width_mm,
            v.height_mm,
            v.finish,
            v.grain_direction,
            v.is_reel,
            v.fingerprint,
            v.created_at,
            ${activeOffersSubquery}
        FROM paper_variants v
        JOIN paper_products p ON v.product_id = p.id
        ${whereSql}
        ORDER BY p.name ASC, v.gsm ASC, v.width_mm ASC
        LIMIT ? OFFSET ?
    `;
    const rows = await db.query(dataSql, dataParams);

    const flatItems = rows.map(r => ({
        id: r.variant_id,
        productId: r.product_id,
        productName: r.product_name,
        name: r.product_name,
        category: r.category,
        brand: r.brand,
        manufacturer: r.manufacturer,
        gsm: Number(r.gsm),
        caliperUm: r.caliper_um ? Number(r.caliper_um) : null,
        caliperMicrons: r.caliper_um ? Number(r.caliper_um) : null,
        caliperMm: r.caliper_mm ? Number(r.caliper_mm) : null,
        widthMm: Number(r.width_mm),
        heightMm: Number(r.height_mm),
        finish: r.finish,
        grainDirection: r.grain_direction,
        isReel: Boolean(r.is_reel),
        fingerprint: r.fingerprint,
        activeOffersCount: Number(r.active_offers_count || 0),
        createdAt: r.created_at
    }));

    // Group items into canonical products[].variants hierarchy
    const productsMap = new Map();
    for (const item of flatItems) {
        if (!productsMap.has(item.productId)) {
            productsMap.set(item.productId, {
                id: item.productId,
                name: item.productName,
                productName: item.productName,
                brand: item.brand,
                manufacturer: item.manufacturer,
                category: item.category,
                finish: item.finish,
                variants: []
            });
        }
        productsMap.get(item.productId).variants.push(item);
    }

    const groupedProducts = Array.from(productsMap.values());

    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        supplierActiveVariants,
        items: flatItems,
        products: groupedProducts
    };
}

/**
 * Get detailed technical variant and all supplier's own offers for it.
 */
async function getTechnicalVariantDetail({ variantId, tenantId, supplierId }) {
    const variantSql = `
        SELECT 
            v.*,
            p.name as product_name,
            p.category,
            p.brand,
            p.manufacturer,
            p.description as product_description,
            p.finish_summary
        FROM paper_variants v
        JOIN paper_products p ON v.product_id = p.id
        WHERE v.id = ?
    `;
    const vRows = await db.query(variantSql, [variantId]);
    const variant = Array.isArray(vRows) ? (vRows[0] || null) : null;
    if (!variant) {
        throw new Error('VARIANT_NOT_FOUND: The requested technical paper variant does not exist.');
    }

    // Retrieve supplier's own offers for this variant
    const offersSql = `
        SELECT *
        FROM supplier_paper_offers
        WHERE variant_id = ? AND tenant_id = ? AND supplier_id = ?
        ORDER BY created_at DESC
    `;
    const offers = await db.query(offersSql, [variantId, tenantId, supplierId]);

    return {
        variant: {
            id: variant.id,
            productId: variant.product_id,
            productName: variant.product_name,
            category: variant.category,
            brand: variant.brand,
            manufacturer: variant.manufacturer,
            productDescription: variant.product_description,
            finishSummary: variant.finish_summary,
            gsm: Number(variant.gsm),
            caliperUm: variant.caliper_um ? Number(variant.caliper_um) : null,
            caliperMm: variant.caliper_mm ? Number(variant.caliper_mm) : null,
            widthMm: Number(variant.width_mm),
            heightMm: Number(variant.height_mm),
            finish: variant.finish,
            grainDirection: variant.grain_direction,
            isReel: Boolean(variant.is_reel),
            fingerprint: variant.fingerprint,
            createdAt: variant.created_at
        },
        offers: offers.map(o => formatOfferRecord(o))
    };
}

/**
 * Format a raw database offer row into a clean canonical response object.
 */
function formatOfferRecord(raw) {
    const formatted = {
        id: raw.id,
        tenantId: raw.tenant_id,
        supplierId: raw.supplier_id,
        variantId: raw.variant_id,
        supplierSku: raw.supplier_sku,
        priceAmount: Number(raw.price_amount),
        currency: raw.currency,
        priceBasis: raw.price_basis,
        sheetsPerPack: raw.sheets_per_pack ? Number(raw.sheets_per_pack) : null,
        moq: Number(raw.moq),
        orderMultiple: Number(raw.order_multiple),
        validFrom: raw.valid_from,
        validUntil: raw.valid_until,
        deliveryZones: typeof raw.delivery_zones_json === 'string' ? JSON.parse(raw.delivery_zones_json) : (raw.delivery_zones_json || []),
        visibility: raw.visibility,
        status: raw.status,
        currentRevisionId: raw.current_revision_id,
        revisionNumber: raw.revision_number !== undefined ? Number(raw.revision_number) : (raw.current_revision_number ? Number(raw.current_revision_number) : 1),
        metadata: typeof raw.metadata_json === 'string' ? JSON.parse(raw.metadata_json) : (raw.metadata_json || {}),
        createdAt: raw.created_at,
        updatedAt: raw.updated_at
    };

    if (raw.product_name !== undefined || raw.gsm !== undefined || raw.productName !== undefined) {
        formatted.productName = raw.product_name || raw.productName || null;
        formatted.category = raw.category || null;
        formatted.brand = raw.brand || null;
        formatted.gsm = (raw.gsm !== null && raw.gsm !== undefined) ? Number(raw.gsm) : null;
        formatted.widthMm = (raw.width_mm !== null && raw.width_mm !== undefined) ? Number(raw.width_mm) : (raw.widthMm ? Number(raw.widthMm) : null);
        formatted.heightMm = (raw.height_mm !== null && raw.height_mm !== undefined) ? Number(raw.height_mm) : (raw.heightMm ? Number(raw.heightMm) : null);
        formatted.finish = raw.finish || null;
        formatted.grainDirection = raw.grain_direction || raw.grainDirection || null;
        formatted.fingerprint = raw.fingerprint || null;
    }

    return formatted;
}

/**
 * Create a new commercial paper offer bound to a confirmed variant.
 * Atomically writes to supplier_paper_offers and supplier_paper_offer_revisions.
 */
async function createOffer({ tenantId, supplierId, actorId, payload }) {
    const validated = validateOfferPayload(payload);

    // Verify variant exists
    const variantCheck = await db.query('SELECT id FROM paper_variants WHERE id = ?', [validated.variantId]);
    if (!variantCheck || variantCheck.length === 0) {
        throw new Error('VARIANT_NOT_FOUND: Cannot create offer for non-existent paper variant.');
    }

    // Check SKU uniqueness for this supplier
    const skuCheck = await db.query(
        'SELECT id FROM supplier_paper_offers WHERE supplier_id = ? AND supplier_sku = ? AND status != "ARCHIVED"',
        [supplierId, validated.supplierSku]
    );
    if (skuCheck && skuCheck.length > 0) {
        throw new Error(`SKU_ALREADY_EXISTS: Supplier SKU '${validated.supplierSku}' is already in use by an active or inactive offer.`);
    }

    const offerId = `off_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const revisionId = `rev_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const revisionNumber = 1;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Insert main offer row
        await conn.query(
            `INSERT INTO supplier_paper_offers 
            (id, tenant_id, supplier_id, variant_id, supplier_sku, price_amount, currency, price_basis, sheets_per_pack, moq, order_multiple, valid_from, valid_until, delivery_zones_json, visibility, status, current_revision_id, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                offerId,
                tenantId,
                supplierId,
                validated.variantId,
                validated.supplierSku,
                validated.priceAmount,
                validated.currency,
                validated.priceBasis,
                validated.sheetsPerPack,
                validated.moq,
                validated.orderMultiple,
                validated.validFrom,
                validated.validUntil,
                JSON.stringify(validated.deliveryZones),
                validated.visibility,
                validated.status,
                revisionId,
                JSON.stringify(validated.metadata)
            ]
        );

        // 2. Insert immutable revision 1 (including supplier_sku)
        await conn.query(
            `INSERT INTO supplier_paper_offer_revisions
            (id, offer_id, revision_number, supplier_sku, price_amount, currency, price_basis, sheets_per_pack, moq, order_multiple, valid_from, valid_until, delivery_zones_json, visibility, status, change_reason, created_by, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                revisionId,
                offerId,
                revisionNumber,
                validated.supplierSku,
                validated.priceAmount,
                validated.currency,
                validated.priceBasis,
                validated.sheetsPerPack,
                validated.moq,
                validated.orderMultiple,
                validated.validFrom,
                validated.validUntil,
                JSON.stringify(validated.deliveryZones),
                validated.visibility,
                validated.status,
                payload.changeReason || 'Initial offer creation',
                actorId || 'system',
                JSON.stringify(validated.metadata)
            ]
        );

        await conn.commit();

        const queryRes = await db.query('SELECT * FROM supplier_paper_offers WHERE id = ?', [offerId]);
        const createdRow = Array.isArray(queryRes) ? (Array.isArray(queryRes[0]) ? queryRes[0][0] : queryRes[0]) : queryRes;
        return formatOfferRecord(createdRow);
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
            throw new Error(`SKU_ALREADY_EXISTS: Supplier SKU '${validated.supplierSku}' is already in use by an active or inactive offer.`);
        }
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Query supplier's offers with pagination, filters, and variant data.
 */
async function listSupplierOffers({ tenantId, supplierId, page = 1, limit = 20, status = null, visibility = null, search = null }) {
    const offset = Math.max(0, (page - 1) * limit);
    const whereConditions = ['o.tenant_id = ?', 'o.supplier_id = ?'];
    const params = [tenantId, supplierId];

    if (status) {
        whereConditions.push('o.status = ?');
        params.push(status);
    } else {
        whereConditions.push('o.status != "ARCHIVED"');
    }

    if (visibility) {
        whereConditions.push('o.visibility = ?');
        params.push(visibility);
    }

    if (search && search.trim()) {
        whereConditions.push('(o.supplier_sku LIKE ? OR p.name LIKE ?)');
        const term = `%${search.trim()}%`;
        params.push(term, term);
    }

    const whereSql = `WHERE ${whereConditions.join(' AND ')}`;

    const countSql = `
        SELECT COUNT(*) as total
        FROM supplier_paper_offers o
        LEFT JOIN paper_variants v ON o.variant_id = v.id
        LEFT JOIN paper_products p ON v.product_id = p.id
        ${whereSql}
    `;
    const countResult = await db.query(countSql, params);
    const total = countResult[0]?.total || 0;

    const dataSql = `
        SELECT 
            o.*,
            COALESCE(rev.revision_number, 1) as revision_number,
            p.name as product_name,
            p.category,
            p.brand,
            v.gsm,
            v.width_mm,
            v.height_mm,
            v.finish,
            v.grain_direction,
            v.fingerprint
        FROM supplier_paper_offers o
        LEFT JOIN paper_variants v ON o.variant_id = v.id
        LEFT JOIN paper_products p ON v.product_id = p.id
        LEFT JOIN supplier_paper_offer_revisions rev ON o.current_revision_id = rev.id
        ${whereSql}
        ORDER BY o.updated_at DESC
        LIMIT ? OFFSET ?
    `;
    const rows = await db.query(dataSql, [...params, limit, offset]);

    // Breakdown counts across all offers of current supplier
    const countsSql = `
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN o.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count,
            SUM(CASE WHEN o.status = 'INACTIVE' THEN 1 ELSE 0 END) as inactive_count,
            SUM(CASE WHEN o.status = 'ARCHIVED' THEN 1 ELSE 0 END) as archived_count
        FROM supplier_paper_offers o
        WHERE o.tenant_id = ? AND o.supplier_id = ?
    `;
    const countsResult = await db.query(countsSql, [tenantId, supplierId]);
    const countsRow = Array.isArray(countsResult) ? (Array.isArray(countsResult[0]) ? countsResult[0][0] : countsResult[0]) : countsResult;
    const counts = {
        total: Number(countsRow?.total || 0),
        active: Number(countsRow?.active_count || 0),
        inactive: Number(countsRow?.inactive_count || 0),
        archived: Number(countsRow?.archived_count || 0)
    };

    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        counts,
        items: rows.map(r => ({
            ...formatOfferRecord(r),
            variantDetails: {
                productName: r.product_name || null,
                category: r.category || null,
                brand: r.brand || null,
                gsm: r.gsm !== null && r.gsm !== undefined ? Number(r.gsm) : null,
                widthMm: r.width_mm !== null && r.width_mm !== undefined ? Number(r.width_mm) : null,
                heightMm: r.height_mm !== null && r.height_mm !== undefined ? Number(r.height_mm) : null,
                finish: r.finish || null,
                grainDirection: r.grain_direction || null,
                fingerprint: r.fingerprint || null
            }
        }))
    };
}

/**
 * Get single offer by ID with full revision history.
 */
async function getOfferById({ offerId, tenantId, supplierId }) {
    const offerSql = `
        SELECT o.*, p.name as product_name, p.category, p.brand, v.gsm, v.width_mm, v.height_mm, v.finish, v.grain_direction, v.fingerprint
        FROM supplier_paper_offers o
        LEFT JOIN paper_variants v ON o.variant_id = v.id
        LEFT JOIN paper_products p ON v.product_id = p.id
        WHERE o.id = ? AND o.tenant_id = ? AND o.supplier_id = ?
    `;
    const rows = await db.query(offerSql, [offerId, tenantId, supplierId]);
    const offer = Array.isArray(rows) ? (rows[0] || null) : null;
    if (!offer) {
        throw new Error('OFFER_NOT_FOUND: Offer not found for current supplier.');
    }

    const revSql = `
        SELECT *
        FROM supplier_paper_offer_revisions
        WHERE offer_id = ?
        ORDER BY revision_number DESC
    `;
    const revRows = await db.query(revSql, [offerId]);

    return {
        offer: {
            ...formatOfferRecord(offer),
            variantDetails: {
                productName: offer.product_name || null,
                category: offer.category || null,
                brand: offer.brand || null,
                gsm: offer.gsm !== null && offer.gsm !== undefined ? Number(offer.gsm) : null,
                widthMm: offer.width_mm !== null && offer.width_mm !== undefined ? Number(offer.width_mm) : null,
                heightMm: offer.height_mm !== null && offer.height_mm !== undefined ? Number(offer.height_mm) : null,
                finish: offer.finish || null,
                grainDirection: offer.grain_direction || null,
                fingerprint: offer.fingerprint || null
            }
        },
        revisions: revRows.map(r => ({
            id: r.id,
            revisionNumber: r.revision_number,
            supplierSku: r.supplier_sku,
            priceAmount: Number(r.price_amount),
            currency: r.currency,
            priceBasis: r.price_basis,
            sheetsPerPack: r.sheets_per_pack ? Number(r.sheets_per_pack) : null,
            moq: Number(r.moq),
            orderMultiple: Number(r.order_multiple),
            validFrom: r.valid_from,
            validUntil: r.valid_until,
            deliveryZones: typeof r.delivery_zones_json === 'string' ? JSON.parse(r.delivery_zones_json) : (r.delivery_zones_json || []),
            visibility: r.visibility,
            status: r.status,
            changeReason: r.change_reason,
            createdBy: r.created_by,
            createdAt: r.created_at
        }))
    };
}

/**
 * Update offer commercial conditions and atomically append a new immutable revision.
 */
async function updateOffer({ offerId, tenantId, supplierId, actorId, payload }) {
    const conn = await db.getConnection();
    let validated = null;
    try {
        await conn.beginTransaction();

        const [existingRows] = await conn.query(
            'SELECT * FROM supplier_paper_offers WHERE id = ? AND tenant_id = ? AND supplier_id = ? FOR UPDATE',
            [offerId, tenantId, supplierId]
        );
        const existing = existingRows && existingRows[0];
        if (!existing) {
            throw new Error('OFFER_NOT_FOUND: Offer not found for current supplier.');
        }

        // Validate merged payload
        const mergedPayload = {
            variantId: existing.variant_id,
            supplierSku: payload.supplierSku !== undefined ? payload.supplierSku : existing.supplier_sku,
            priceAmount: payload.priceAmount !== undefined ? payload.priceAmount : existing.price_amount,
            currency: payload.currency !== undefined ? payload.currency : existing.currency,
            priceBasis: payload.priceBasis !== undefined ? payload.priceBasis : existing.price_basis,
            sheetsPerPack: payload.sheetsPerPack !== undefined ? payload.sheetsPerPack : existing.sheets_per_pack,
            moq: payload.moq !== undefined ? payload.moq : existing.moq,
            orderMultiple: payload.orderMultiple !== undefined ? payload.orderMultiple : existing.order_multiple,
            validFrom: payload.validFrom !== undefined ? payload.validFrom : existing.valid_from,
            validUntil: payload.validUntil !== undefined ? payload.validUntil : existing.valid_until,
            deliveryZones: payload.deliveryZones !== undefined 
                ? payload.deliveryZones 
                : (Array.isArray(existing.delivery_zones_json)
                    ? existing.delivery_zones_json
                    : (typeof existing.delivery_zones_json === 'string'
                        ? (() => {
                            try { return JSON.parse(existing.delivery_zones_json); }
                            catch (e) { return existing.delivery_zones_json.split(',').map(s => s.trim()).filter(Boolean); }
                          })()
                        : [])),
            visibility: payload.visibility !== undefined ? payload.visibility : existing.visibility,
            status: payload.status !== undefined ? payload.status : existing.status,
            metadata: payload.metadata !== undefined 
                ? payload.metadata 
                : (typeof existing.metadata_json === 'string'
                    ? (() => { try { return JSON.parse(existing.metadata_json); } catch (e) { return {}; } })()
                    : (existing.metadata_json || {}))
        };

        validated = validateOfferPayload(mergedPayload);

        // Fetch max revision number
        const [revMax] = await conn.query('SELECT MAX(revision_number) as max_rev FROM supplier_paper_offer_revisions WHERE offer_id = ?', [offerId]);
        const nextRevNumber = (revMax[0]?.max_rev || 1) + 1;
        const newRevisionId = `rev_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

        // 1. Update main offer
        await conn.query(
            `UPDATE supplier_paper_offers
             SET supplier_sku = ?, price_amount = ?, currency = ?, price_basis = ?, sheets_per_pack = ?,
                 moq = ?, order_multiple = ?, valid_from = ?, valid_until = ?, delivery_zones_json = ?,
                 visibility = ?, status = ?, current_revision_id = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                validated.supplierSku,
                validated.priceAmount,
                validated.currency,
                validated.priceBasis,
                validated.sheetsPerPack,
                validated.moq,
                validated.orderMultiple,
                validated.validFrom,
                validated.validUntil,
                JSON.stringify(validated.deliveryZones),
                validated.visibility,
                validated.status,
                newRevisionId,
                JSON.stringify(validated.metadata),
                offerId
            ]
        );

        // 2. Insert new revision record
        const changeReason = payload.changeReason || 'Commercial conditions update';
        await conn.query(
            `INSERT INTO supplier_paper_offer_revisions
            (id, offer_id, revision_number, supplier_sku, price_amount, currency, price_basis, sheets_per_pack, moq, order_multiple, valid_from, valid_until, delivery_zones_json, visibility, status, change_reason, created_by, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newRevisionId,
                offerId,
                nextRevNumber,
                validated.supplierSku,
                validated.priceAmount,
                validated.currency,
                validated.priceBasis,
                validated.sheetsPerPack,
                validated.moq,
                validated.orderMultiple,
                validated.validFrom,
                validated.validUntil,
                JSON.stringify(validated.deliveryZones),
                validated.visibility,
                validated.status,
                changeReason,
                actorId || 'system',
                JSON.stringify(validated.metadata)
            ]
        );

        await conn.commit();

        const queryRes = await db.query(`
            SELECT o.*, rev.revision_number
            FROM supplier_paper_offers o
            LEFT JOIN supplier_paper_offer_revisions rev ON o.current_revision_id = rev.id
            WHERE o.id = ?
        `, [offerId]);
        const updatedRow = Array.isArray(queryRes) ? (Array.isArray(queryRes[0]) ? queryRes[0][0] : queryRes[0]) : queryRes;
        return formatOfferRecord(updatedRow);
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
            const conflictedSku = (validated && validated.supplierSku) || payload.supplierSku || 'specified';
            throw new Error(`SKU_ALREADY_EXISTS: Supplier SKU '${conflictedSku}' is already in use by another offer.`);
        }
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Toggle offer status (e.g. ACTIVE -> INACTIVE or ARCHIVED)
 */
async function updateOfferStatus({ offerId, tenantId, supplierId, actorId, status, reason = null }) {
    const targetStatus = String(status).toUpperCase();
    if (!VALID_STATUSES.includes(targetStatus)) {
        throw new Error(`INVALID_STATUS: Status must be one of: ${VALID_STATUSES.join(', ')}.`);
    }

    return await updateOffer({
        offerId,
        tenantId,
        supplierId,
        actorId,
        payload: {
            status: targetStatus,
            changeReason: reason || `Status changed to ${targetStatus}`
        }
    });
}

/**
 * Bulk update commercial paper offer statuses (ACTIVATE, DEACTIVATE, ARCHIVE, RESTORE).
 * Supports both explicit array of offerIds (scope='SELECTED') and all matching filter (scope='ALL_MATCHING').
 * Fails closed and reports per-record success/failure without inventing global success.
 * Enforces SKU uniqueness invariant upon RESTORE / ACTIVATE.
 */
async function bulkUpdateOfferStatus({ tenantId, supplierId, actorId, action, offerIds = [], scope = 'SELECTED', filters = {}, reason = null }) {
    const validActions = ['ACTIVATE', 'DEACTIVATE', 'ARCHIVE', 'RESTORE'];
    const normAction = String(action || '').toUpperCase();
    if (!validActions.includes(normAction)) {
        throw new Error(`INVALID_BULK_ACTION: Action must be one of: ${validActions.join(', ')}.`);
    }

    let targetStatus = 'ACTIVE';
    if (normAction === 'DEACTIVATE') targetStatus = 'INACTIVE';
    else if (normAction === 'ARCHIVE') targetStatus = 'ARCHIVED';
    else if (normAction === 'RESTORE') targetStatus = 'ACTIVE';
    else if (normAction === 'ACTIVATE') targetStatus = 'ACTIVE';

    let targetIds = [];
    if (scope === 'ALL_MATCHING') {
        const where = ['tenant_id = ?', 'supplier_id = ?'];
        const p = [tenantId, supplierId];
        if (filters.status) {
            where.push('status = ?');
            p.push(filters.status);
        } else {
            // Default: do not touch archived records unless explicitly filtered
            where.push('status != "ARCHIVED"');
        }
        if (filters.search && filters.search.trim()) {
            where.push('(supplier_sku LIKE ?)');
            p.push(`%${filters.search.trim()}%`);
        }
        const matchRows = await db.query(`SELECT id FROM supplier_paper_offers WHERE ${where.join(' AND ')} LIMIT 500`, p);
        targetIds = (Array.isArray(matchRows) ? matchRows : []).map(r => r.id);
    } else {
        if (!Array.isArray(offerIds) || offerIds.length === 0) {
            throw new Error('OFFER_IDS_REQUIRED: offerIds array cannot be empty when scope is SELECTED.');
        }
        targetIds = offerIds.slice(0, 500);
    }

    const results = [];
    let succeededCount = 0;
    let failedCount = 0;

    for (const id of targetIds) {
        try {
            // Check offer existence and tenant isolation
            const offerRes = await db.query(
                'SELECT * FROM supplier_paper_offers WHERE id = ? AND tenant_id = ? AND supplier_id = ?',
                [id, tenantId, supplierId]
            );
            const offer = Array.isArray(offerRes) ? (Array.isArray(offerRes[0]) ? offerRes[0][0] : offerRes[0]) : offerRes;
            if (!offer || !offer.id) {
                results.push({ id, success: false, code: 'OFFER_NOT_FOUND', message: 'Offer not found or unauthorized.' });
                failedCount++;
                continue;
            }

            // If restoring or activating, verify SKU uniqueness against OTHER offers
            if (targetStatus === 'ACTIVE') {
                const skuRes = await db.query(
                    'SELECT id FROM supplier_paper_offers WHERE supplier_id = ? AND supplier_sku = ? AND id != ? AND status != "ARCHIVED"',
                    [supplierId, offer.supplier_sku, id]
                );
                const skuConflict = Array.isArray(skuRes) ? (Array.isArray(skuRes[0]) ? skuRes[0] : skuRes) : [];
                if (skuConflict && skuConflict.length > 0) {
                    results.push({
                        id,
                        sku: offer.supplier_sku,
                        success: false,
                        code: 'SKU_ALREADY_EXISTS',
                        message: `Cannot restore offer: SKU '${offer.supplier_sku}' is currently active in offer '${skuConflict[0].id}'.`
                    });
                    failedCount++;
                    continue;
                }
            }

            await updateOfferStatus({
                offerId: id,
                tenantId,
                supplierId,
                actorId,
                status: targetStatus,
                reason: reason || `Bulk ${normAction} action executed by operator`
            });

            results.push({ id, sku: offer.supplier_sku, success: true, status: targetStatus });
            succeededCount++;
        } catch (itemErr) {
            results.push({ id, success: false, code: 'UPDATE_FAILED', message: itemErr.message });
            failedCount++;
        }
    }

    return {
        action: normAction,
        targetStatus,
        totalProcessed: targetIds.length,
        succeededCount,
        failedCount,
        results
    };
}

/**
 * Permanently delete a commercial paper offer if unreferenced by procurement or historical orders.
 * Restricted strictly to SUPPLIER_ADMIN.
 */
async function deleteOffer({ tenantId, supplierId, actorId, role, offerId }) {
    if (role !== 'SUPPLIER_ADMIN') {
        throw new Error('FORBIDDEN: Hard deletion of commercial offers is restricted to SUPPLIER_ADMIN. Use ARCHIVE instead.');
    }

    const rows = await db.query(
        'SELECT * FROM supplier_paper_offers WHERE id = ? AND tenant_id = ? AND supplier_id = ?',
        [offerId, tenantId, supplierId]
    );
    const offer = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : rows;
    if (!offer || !offer.id) {
        throw new Error('OFFER_NOT_FOUND: Offer not found for current supplier.');
    }

    // Dependency check: procurement_receipt_records referencing this offer/procurement
    const receiptRes = await db.query(
        'SELECT COUNT(*) as count FROM procurement_receipt_records WHERE tenant_id = ? AND procurement_id = ?',
        [tenantId, offerId]
    );
    const receiptRow = Array.isArray(receiptRes) ? (Array.isArray(receiptRes[0]) ? receiptRes[0][0] : receiptRes[0]) : receiptRes;
    if (receiptRow && Number(receiptRow.count || 0) > 0) {
        throw new Error(`OFFER_HAS_DEPENDENCIES: Offer '${offer.supplier_sku}' cannot be deleted because historical procurement receipts exist. Use ARCHIVE instead.`);
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Delete revisions first (or rely on CASCADE)
        await conn.query('DELETE FROM supplier_paper_offer_revisions WHERE offer_id = ?', [offerId]);
        await conn.query('DELETE FROM supplier_paper_offers WHERE id = ?', [offerId]);

        await conn.commit();
        return {
            ok: true,
            deletedOfferId: offerId,
            supplierSku: offer.supplier_sku
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Bulk delete commercial paper offers with strict dependency revalidation per record.
 * Restricted to SUPPLIER_ADMIN.
 */
async function bulkDeleteOffers({ tenantId, supplierId, actorId, role, offerIds = [], scope = 'SELECTED', filters = {}, reason = null }) {
    if (role !== 'SUPPLIER_ADMIN') {
        throw new Error('FORBIDDEN: Bulk deletion of commercial offers is restricted to SUPPLIER_ADMIN.');
    }

    let targetIds = [];
    if (scope === 'ALL_MATCHING') {
        const where = ['tenant_id = ?', 'supplier_id = ?'];
        const p = [tenantId, supplierId];
        if (filters.status) {
            where.push('status = ?');
            p.push(filters.status);
        }
        if (filters.search && filters.search.trim()) {
            where.push('(supplier_sku LIKE ?)');
            p.push(`%${filters.search.trim()}%`);
        }
        const matchRows = await db.query(`SELECT id FROM supplier_paper_offers WHERE ${where.join(' AND ')} LIMIT 500`, p);
        targetIds = (Array.isArray(matchRows) ? matchRows : []).map(r => r.id);
    } else {
        if (!Array.isArray(offerIds) || offerIds.length === 0) {
            throw new Error('OFFER_IDS_REQUIRED: offerIds array cannot be empty when scope is SELECTED.');
        }
        targetIds = offerIds.slice(0, 500);
    }

    const results = [];
    let succeededCount = 0;
    let failedCount = 0;

    for (const id of targetIds) {
        try {
            await deleteOffer({ tenantId, supplierId, actorId, role, offerId: id });
            results.push({ id, success: true });
            succeededCount++;
        } catch (err) {
            results.push({ id, success: false, code: 'DELETE_BLOCKED', message: err.message });
            failedCount++;
        }
    }

    return {
        totalProcessed: targetIds.length,
        succeededCount,
        failedCount,
        results
    };
}

/**
 * Safe deletion of a canonical paper variant.
 * Enforces technical sharing invariants:
 * - NEVER deletes if another supplier has an offer on it.
 * - NEVER deletes if current supplier still has active/inactive offers (must be deleted first).
 * - NEVER deletes if originated by another supplier.
 * - Restricted strictly to SUPPLIER_ADMIN.
 */
async function deleteTechnicalVariant({ tenantId, supplierId, actorId, role, variantId }) {
    if (role !== 'SUPPLIER_ADMIN') {
        throw new Error('FORBIDDEN: Variant deletion is restricted to SUPPLIER_ADMIN.');
    }

    const vRes = await db.query('SELECT * FROM paper_variants WHERE id = ?', [variantId]);
    const variant = Array.isArray(vRes) ? (Array.isArray(vRes[0]) ? vRes[0][0] : vRes[0]) : vRes;
    if (!variant || !variant.id) {
        throw new Error('VARIANT_NOT_FOUND: Variant does not exist.');
    }

    // 1. Check if ANY other supplier has offers on this variant
    const otherRes = await db.query(
        'SELECT COUNT(*) as count FROM supplier_paper_offers WHERE variant_id = ? AND supplier_id != ?',
        [variantId, supplierId]
    );
    const otherRow = Array.isArray(otherRes) ? (Array.isArray(otherRes[0]) ? otherRes[0][0] : otherRes[0]) : otherRes;
    if (otherRow && Number(otherRow.count || 0) > 0) {
        throw new Error('CANNOT_DELETE_SHARED_VARIANT: This technical variant is shared with other suppliers. Remove your own commercial offers instead of deleting the shared physical variant.');
    }

    // 2. Check if current supplier has offers on this variant
    const ownRes = await db.query(
        'SELECT COUNT(*) as count FROM supplier_paper_offers WHERE variant_id = ? AND supplier_id = ?',
        [variantId, supplierId]
    );
    const ownRow = Array.isArray(ownRes) ? (Array.isArray(ownRes[0]) ? ownRes[0][0] : ownRes[0]) : ownRes;
    if (ownRow && Number(ownRow.count || 0) > 0) {
        throw new Error('VARIANT_HAS_OFFERS: Cannot delete variant while commercial offers exist for it. Delete or archive your offers first.');
    }

    // 3. Verify supplier originated this variant via an import batch
    const originRes = await db.query(
        `SELECT COUNT(*) as count 
         FROM paper_import_rows r 
         JOIN paper_import_batches b ON r.batch_id = b.id 
         WHERE r.mapped_variant_id = ? AND b.supplier_id = ?`,
        [variantId, supplierId]
    );
    const originRow = Array.isArray(originRes) ? (Array.isArray(originRes[0]) ? originRes[0][0] : originRes[0]) : originRes;
    if (!originRow || Number(originRow.count || 0) === 0) {
        throw new Error('NOT_VARIANT_ORIGINATOR: This technical variant was not imported by your organization and cannot be deleted.');
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Unlink from import rows so cascade doesn't fail
        await conn.query('UPDATE paper_import_rows SET mapped_variant_id = NULL WHERE mapped_variant_id = ?', [variantId]);
        await conn.query('DELETE FROM paper_variants WHERE id = ?', [variantId]);

        await conn.commit();
        return {
            ok: true,
            deletedVariantId: variantId
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Retract / rollback an import batch.
 * Removes variants created by this batch that are NOT referenced by other suppliers.
 * Preserves shared canonical records and records with active external offers.
 */
async function retractImportBatch({ tenantId, supplierId, actorId, role, batchId }) {
    if (!['SUPPLIER_ADMIN', 'SUPPLIER_OPERATOR'].includes(role)) {
        throw new Error('FORBIDDEN: Only SUPPLIER_ADMIN or SUPPLIER_OPERATOR can retract import batches.');
    }

    const batchRes = await db.query(
        'SELECT * FROM paper_import_batches WHERE id = ? AND tenant_id = ? AND supplier_id = ?',
        [batchId, tenantId, supplierId]
    );
    const batch = Array.isArray(batchRes) ? (Array.isArray(batchRes[0]) ? batchRes[0][0] : batchRes[0]) : batchRes;
    if (!batch || !batch.id) {
        throw new Error('BATCH_NOT_FOUND: Import batch not found for tenant and supplier');
    }

    if (batch.status !== 'CONFIRMED') {
        throw new Error(`CANNOT_RETRACT_UNCONFIRMED_BATCH: Batch is in '${batch.status}' status. Only CONFIRMED batches can be retracted.`);
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Get all variants mapped from this batch
        const [mappedVariants] = await conn.query(
            'SELECT DISTINCT mapped_variant_id FROM paper_import_rows WHERE batch_id = ? AND mapped_variant_id IS NOT NULL',
            [batchId]
        );
        const variantIds = (Array.isArray(mappedVariants) ? mappedVariants : []).map(r => r.mapped_variant_id).filter(Boolean);

        let retractedVariantsCount = 0;
        let preservedSharedVariantsCount = 0;

        for (const vId of variantIds) {
            // Check if any other supplier has an offer on this variant
            const [otherCheck] = await conn.query(
                'SELECT COUNT(*) as count FROM supplier_paper_offers WHERE variant_id = ? AND supplier_id != ?',
                [vId, supplierId]
            );
            const otherCount = Number(otherCheck && otherCheck[0]?.count || 0);
            if (otherCount > 0) {
                preservedSharedVariantsCount++;
                continue; // Preserve shared technical variant
            }

            // Remove this supplier's offers on this variant
            await conn.query('DELETE FROM supplier_paper_offers WHERE variant_id = ? AND supplier_id = ?', [vId, supplierId]);

            // Unlink from other rows and delete variant
            await conn.query('UPDATE paper_import_rows SET mapped_variant_id = NULL WHERE mapped_variant_id = ?', [vId]);
            await conn.query('DELETE FROM paper_variants WHERE id = ?', [vId]);
            retractedVariantsCount++;
        }

        // Update batch status
        await conn.query(
            `UPDATE paper_import_batches 
             SET status = 'REJECTED', 
                 metadata_json = JSON_SET(COALESCE(metadata_json, '{}'), '$.retracted_at', CURRENT_TIMESTAMP, '$.retracted_by', ?)
             WHERE id = ?`,
            [actorId, batchId]
        );

        await conn.commit();
        return {
            ok: true,
            batchId,
            status: 'RETRACTED',
            retractedVariantsCount,
            preservedSharedVariantsCount
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Controlled technical modification of a variant specification.
 * Validates gsm, dimensions, caliper, recalculates fingerprint.
 * If variant is shared with other suppliers, blocks silent mutation.
 */
async function updateTechnicalVariant({ tenantId, supplierId, actorId, role, variantId, payload }) {
    if (!['SUPPLIER_ADMIN', 'SUPPLIER_OPERATOR'].includes(role)) {
        throw new Error('FORBIDDEN: Only SUPPLIER_ADMIN or SUPPLIER_OPERATOR can edit technical variants.');
    }

    const { computeVariantFingerprint } = require('./paperImportService');

    const vRes = await db.query(
        'SELECT v.*, p.name as product_name, p.category, p.brand, p.manufacturer FROM paper_variants v JOIN paper_products p ON v.product_id = p.id WHERE v.id = ?',
        [variantId]
    );
    const existing = Array.isArray(vRes) ? (Array.isArray(vRes[0]) ? vRes[0][0] : vRes[0]) : vRes;
    if (!existing || !existing.id) {
        throw new Error('VARIANT_NOT_FOUND: Technical variant not found.');
    }

    // Check sharing with other suppliers
    const otherRes = await db.query(
        'SELECT COUNT(*) as count FROM supplier_paper_offers WHERE variant_id = ? AND supplier_id != ?',
        [variantId, supplierId]
    );
    const otherRow = Array.isArray(otherRes) ? (Array.isArray(otherRes[0]) ? otherRes[0][0] : otherRes[0]) : otherRes;
    if (otherRow && Number(otherRow.count || 0) > 0 && role !== 'SUPPLIER_ADMIN') {
        throw new Error('SHARED_VARIANT_MUTATION_RESTRICTED: This variant is shared by other suppliers. Only SUPPLIER_ADMIN can modify shared physical specifications.');
    }

    const gsm = payload.gsm !== undefined ? Number(payload.gsm) : Number(existing.gsm);
    const widthMm = payload.widthMm !== undefined ? Number(payload.widthMm) : Number(existing.width_mm);
    const heightMm = payload.heightMm !== undefined ? Number(payload.heightMm) : Number(existing.height_mm);
    const finish = payload.finish !== undefined ? String(payload.finish).trim() : existing.finish;
    const grainDirection = payload.grainDirection !== undefined ? String(payload.grainDirection).toUpperCase() : existing.grain_direction;
    const caliperUm = payload.caliperUm !== undefined ? (payload.caliperUm ? Number(payload.caliperUm) : null) : existing.caliper_um;
    const caliperMm = caliperUm ? Number((caliperUm / 1000).toFixed(4)) : (existing.caliper_mm ? Number(existing.caliper_mm) : null);

    if (!Number.isFinite(gsm) || gsm <= 0) throw new Error('INVALID_GSM: GSM must be a positive number.');
    if (!Number.isFinite(widthMm) || widthMm <= 0) throw new Error('INVALID_WIDTH: Width (mm) must be a positive number.');
    if (!Number.isFinite(heightMm) || heightMm <= 0) throw new Error('INVALID_HEIGHT: Height (mm) must be a positive number.');

    const newFingerprint = computeVariantFingerprint({
        name: existing.product_name,
        gsm,
        width_mm: widthMm,
        height_mm: heightMm,
        finish,
        grain_direction: grainDirection,
        caliper_um: caliperUm
    });

    // Check if another variant already has this fingerprint
    const conflictRes = await db.query('SELECT id FROM paper_variants WHERE fingerprint = ? AND id != ?', [newFingerprint, variantId]);
    const conflict = Array.isArray(conflictRes) ? (Array.isArray(conflictRes[0]) ? conflictRes[0] : conflictRes) : [];
    if (conflict && conflict.length > 0) {
        throw new Error(`VARIANT_FINGERPRINT_COLLISION: A variant with specifications (${gsm}gsm ${widthMm}x${heightMm}mm ${finish || ''}) already exists (ID: ${conflict[0].id}).`);
    }

    await db.query(
        `UPDATE paper_variants 
         SET gsm = ?, width_mm = ?, height_mm = ?, finish = ?, grain_direction = ?, caliper_um = ?, caliper_mm = ?, fingerprint = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [gsm, widthMm, heightMm, finish, grainDirection, caliperUm, caliperMm, newFingerprint, variantId]
    );

    return {
        ok: true,
        variantId,
        gsm,
        widthMm,
        heightMm,
        finish,
        grainDirection,
        caliperUm,
        fingerprint: newFingerprint
    };
}

module.exports = {
    VALID_PRICE_BASES,
    VALID_VISIBILITIES,
    VALID_STATUSES,
    validateOfferPayload,
    getTechnicalCatalog,
    getTechnicalVariantDetail,
    createOffer,
    listSupplierOffers,
    getOfferById,
    updateOffer,
    updateOfferStatus,
    bulkUpdateOfferStatus,
    deleteOffer,
    bulkDeleteOffers,
    deleteTechnicalVariant,
    retractImportBatch,
    updateTechnicalVariant
};
