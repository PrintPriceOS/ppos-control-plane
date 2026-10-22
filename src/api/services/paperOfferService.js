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
async function getTechnicalCatalog({ page = 1, limit = 20, search = null, category = null, finish = null, supplierId = null }) {
    const offset = Math.max(0, (page - 1) * limit);
    const whereConditions = [];
    const params = [];

    if (search && search.trim()) {
        whereConditions.push('(p.name LIKE ? OR v.fingerprint LIKE ?)');
        const term = `%${search.trim()}%`;
        params.push(term, term);
    }

    if (category) {
        whereConditions.push('p.category = ?');
        params.push(category);
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

    // Do NOT expose counts of PRIVATE offers belonging to competing suppliers
    let activeOffersSubquery = `
        (SELECT COUNT(*) FROM supplier_paper_offers o 
         WHERE o.variant_id = v.id 
           AND o.status = 'ACTIVE' 
           AND (o.visibility IN ('MARKETPLACE', 'APPROVED_CUSTOMERS') ${supplierId ? 'OR o.supplier_id = ?' : ''})) as active_offers_count
    `;
    const dataParams = [...params];
    if (supplierId) {
        dataParams.push(supplierId);
    }

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
    const rows = await db.query(dataSql, [...dataParams, limit, offset]);

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
    return {
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
        JOIN paper_variants v ON o.variant_id = v.id
        JOIN paper_products p ON v.product_id = p.id
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
            v.gsm,
            v.width_mm,
            v.height_mm,
            v.finish,
            v.grain_direction,
            v.fingerprint
        FROM supplier_paper_offers o
        JOIN paper_variants v ON o.variant_id = v.id
        JOIN paper_products p ON v.product_id = p.id
        LEFT JOIN supplier_paper_offer_revisions rev ON o.current_revision_id = rev.id
        ${whereSql}
        ORDER BY o.updated_at DESC
        LIMIT ? OFFSET ?
    `;
    const rows = await db.query(dataSql, [...params, limit, offset]);

    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        items: rows.map(r => ({
            ...formatOfferRecord(r),
            variantDetails: {
                productName: r.product_name,
                category: r.category,
                gsm: Number(r.gsm),
                widthMm: Number(r.width_mm),
                heightMm: Number(r.height_mm),
                finish: r.finish,
                grainDirection: r.grain_direction,
                fingerprint: r.fingerprint
            }
        }))
    };
}

/**
 * Get single offer by ID with full revision history.
 */
async function getOfferById({ offerId, tenantId, supplierId }) {
    const offerSql = `
        SELECT o.*, p.name as product_name, p.category, v.gsm, v.width_mm, v.height_mm, v.finish, v.grain_direction
        FROM supplier_paper_offers o
        JOIN paper_variants v ON o.variant_id = v.id
        JOIN paper_products p ON v.product_id = p.id
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
                productName: offer.product_name,
                category: offer.category,
                gsm: Number(offer.gsm),
                widthMm: Number(offer.width_mm),
                heightMm: Number(offer.height_mm),
                finish: offer.finish,
                grainDirection: offer.grain_direction
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

        const validated = validateOfferPayload(mergedPayload);

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
            throw new Error(`SKU_ALREADY_EXISTS: Supplier SKU '${validated.supplierSku}' is already in use by another offer.`);
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
    updateOfferStatus
};
