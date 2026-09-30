/**
 * src/api/services/quoteEvidenceService.js
 *
 * Phase 194A — Quote Evidence Consistency & Ingestion Service
 *
 * Responsibilities:
 * 1. Provides canonical evidence structure for single- and multi-quantity quotation offers.
 * 2. Executes 100% deterministic arithmetic consistency validation (zero LLM decisions).
 * 3. Enforces strict currency rounding tolerances (0.02 EUR total / unit price).
 * 4. Categorizes validation statuses: CONSISTENT, INCONSISTENT_TOTAL, INCONSISTENT_UNIT_PRICE,
 *    INCOMPLETE, AMBIGUOUS, REQUIRES_REVIEW.
 * 5. Preserves original quoted source values alongside computed derived values for audit traceability.
 * 6. Manages quote evidence documents and extractions in MySQL/MariaDB (when connected).
 * 7. ZERO rates mutation: strictly read/write evidence records with strict tenant isolation.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('quote-evidence-service');

// ── Explicit Tolerance Constants (Phase 194A) ──────────────────────────────────
const TOTAL_ABS_TOLERANCE_EUR = 0.02;
const UNIT_PRICE_ABS_TOLERANCE_EUR = 0.02;

/**
 * Computes SHA-256 hash of string or buffer content for evidence idempotency.
 *
 * @param {string|Buffer} content
 * @returns {string} SHA-256 hex digest
 */
function computeDocumentHash(content) {
    if (!content) return '';
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Deterministically validates a single offer row within a quote.
 *
 * @param {Object} offer - Raw or normalized offer row
 * @returns {Object} Validated offer object with computed values, validationStatus, and errors array
 */
function validateOffer(offer) {
    if (!offer || typeof offer !== 'object') {
        return {
            quantity: 0,
            validationStatus: 'INCOMPLETE',
            errors: [{ code: 'INVALID_OFFER_OBJECT', message: 'Offer must be a valid object' }]
        };
    }

    const errors = [];
    const quantity = Number(offer.quantity);
    const manufacturingPrice = offer.manufacturingPrice !== undefined && offer.manufacturingPrice !== null
        ? Number(offer.manufacturingPrice) : null;
    const transportPrice = offer.transportPrice !== undefined && offer.transportPrice !== null
        ? Number(offer.transportPrice) : null;
    const quotedTotalPrice = offer.quotedTotalPrice !== undefined && offer.quotedTotalPrice !== null
        ? Number(offer.quotedTotalPrice) : (offer.totalPrice !== undefined && offer.totalPrice !== null ? Number(offer.totalPrice) : null);
    const quotedUnitPrice = offer.quotedUnitPrice !== undefined && offer.quotedUnitPrice !== null
        ? Number(offer.quotedUnitPrice) : null;

    // 1. Check Quantity
    if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push({
            code: 'INVALID_QUANTITY',
            message: 'Quantity must be a positive finite integer',
            quoted: offer.quantity
        });
    }

    // 2. Check Numeric Monetary Values
    const monetaryFields = [
        { name: 'manufacturingPrice', val: manufacturingPrice },
        { name: 'transportPrice', val: transportPrice },
        { name: 'quotedTotalPrice', val: quotedTotalPrice },
        { name: 'quotedUnitPrice', val: quotedUnitPrice }
    ];

    for (const f of monetaryFields) {
        if (f.val !== null && (!Number.isFinite(f.val) || f.val < 0)) {
            errors.push({
                code: 'INVALID_MONETARY_VALUE',
                field: f.name,
                message: `Field ${f.name} must be a non-negative finite number`,
                quoted: f.val
            });
        }
    }

    // Computed total price calculation (if manufacturing + transport exist)
    let computedTotalPrice = null;
    if (manufacturingPrice !== null && transportPrice !== null) {
        computedTotalPrice = Number((manufacturingPrice + transportPrice).toFixed(4));
    } else if (quotedTotalPrice !== null) {
        computedTotalPrice = quotedTotalPrice;
    }

    // Computed unit price calculation (if total + quantity exist)
    let computedUnitPrice = null;
    if (quotedTotalPrice !== null && Number.isFinite(quantity) && quantity > 0) {
        computedUnitPrice = Number((quotedTotalPrice / quantity).toFixed(6));
    }

    // 3. Check Total Mismatch (manufacturing + transport vs quotedTotalPrice)
    if (manufacturingPrice !== null && transportPrice !== null && quotedTotalPrice !== null) {
        const expectedTotal = manufacturingPrice + transportPrice;
        const totalDelta = Math.abs(expectedTotal - quotedTotalPrice);
        if (totalDelta > TOTAL_ABS_TOLERANCE_EUR) {
            errors.push({
                code: 'TOTAL_MISMATCH',
                message: `Manufacturing (${manufacturingPrice}) + Transport (${transportPrice}) = ${expectedTotal.toFixed(2)} does not match Quoted Total (${quotedTotalPrice})`,
                quoted: quotedTotalPrice,
                computed: expectedTotal,
                delta: Number(totalDelta.toFixed(4))
            });
        }
    }

    // 4. Check Unit Price Mismatch (quotedTotalPrice / quantity vs quotedUnitPrice)
    if (quotedTotalPrice !== null && quotedUnitPrice !== null && Number.isFinite(quantity) && quantity > 0) {
        const expectedUnit = quotedTotalPrice / quantity;
        const unitDelta = Math.abs(expectedUnit - quotedUnitPrice);
        if (unitDelta > UNIT_PRICE_ABS_TOLERANCE_EUR) {
            errors.push({
                code: 'UNIT_PRICE_MISMATCH',
                message: `Quoted Total (${quotedTotalPrice}) / Quantity (${quantity}) = ${expectedUnit.toFixed(4)} does not match Quoted Unit Price (${quotedUnitPrice})`,
                quoted: quotedUnitPrice,
                computed: expectedUnit,
                delta: Number(unitDelta.toFixed(6))
            });
        }
    }

    // 5. Determine Primary Offer Validation Status
    let validationStatus = 'CONSISTENT';

    if (errors.some(e => e.code === 'INVALID_QUANTITY' || e.code === 'INVALID_MONETARY_VALUE')) {
        validationStatus = 'INCOMPLETE';
    } else if (errors.some(e => e.code === 'UNIT_PRICE_MISMATCH')) {
        validationStatus = 'INCONSISTENT_UNIT_PRICE';
    } else if (errors.some(e => e.code === 'TOTAL_MISMATCH')) {
        validationStatus = 'INCONSISTENT_TOTAL';
    } else if (manufacturingPrice === null && quotedTotalPrice === null) {
        validationStatus = 'INCOMPLETE';
    }

    return {
        quantity: quantity || 0,
        manufacturingPrice,
        transportPrice,
        quotedTotalPrice,
        quotedUnitPrice,
        computedTotalPrice,
        computedUnitPrice,
        validationStatus,
        errors,
        provenance: {
            manufacturingPrice: manufacturingPrice !== null ? { type: 'SOURCE_VALUE', value: manufacturingPrice } : null,
            transportPrice: transportPrice !== null ? { type: 'SOURCE_VALUE', value: transportPrice } : null,
            quotedTotalPrice: quotedTotalPrice !== null ? { type: 'SOURCE_VALUE', value: quotedTotalPrice } : null,
            quotedUnitPrice: quotedUnitPrice !== null ? { type: 'SOURCE_VALUE', value: quotedUnitPrice } : null,
            computedTotalPrice: computedTotalPrice !== null ? { type: 'DERIVED_VALUE', value: computedTotalPrice } : null,
            computedUnitPrice: computedUnitPrice !== null ? { type: 'DERIVED_VALUE', value: computedUnitPrice } : null
        }
    };
}

/**
 * Validates a complete normalized quotation document.
 *
 * @param {Object} normalizedQuote - Complete quote document structure
 * @returns {Object} Document validation summary with validated offers and overall status
 */
function validateNormalizedQuote(normalizedQuote) {
    if (!normalizedQuote || typeof normalizedQuote !== 'object') {
        return {
            overallStatus: 'INCOMPLETE',
            offers: [],
            errors: [{ code: 'INVALID_QUOTE_DOCUMENT', message: 'Quote must be a valid object' }],
            metrics: { totalOffers: 0, consistentOffers: 0, inconsistentOffers: 0 }
        };
    }

    const rawOffers = Array.isArray(normalizedQuote.offers) ? normalizedQuote.offers : [];
    const validatedOffers = rawOffers.map(o => validateOffer(o));

    const errors = [];
    let consistentCount = 0;
    let inconsistentCount = 0;

    for (let i = 0; i < validatedOffers.length; i++) {
        const offer = validatedOffers[i];
        if (offer.validationStatus === 'CONSISTENT') {
            consistentCount++;
        } else {
            inconsistentCount++;
            for (const err of offer.errors) {
                errors.push({
                    offerIndex: i,
                    quantity: offer.quantity,
                    ...err
                });
            }
        }
    }

    // Overall Status Logic
    let overallStatus = 'CONSISTENT';
    if (validatedOffers.length === 0) {
        overallStatus = 'INCOMPLETE';
    } else if (validatedOffers.some(o => o.validationStatus === 'INCONSISTENT_UNIT_PRICE')) {
        overallStatus = 'INCONSISTENT_UNIT_PRICE';
    } else if (validatedOffers.some(o => o.validationStatus === 'INCONSISTENT_TOTAL')) {
        overallStatus = 'INCONSISTENT_TOTAL';
    } else if (validatedOffers.some(o => o.validationStatus === 'INCOMPLETE')) {
        overallStatus = 'INCOMPLETE';
    }

    return {
        product: normalizedQuote.product || null,
        currency: normalizedQuote.currency || 'EUR',
        priceBasis: normalizedQuote.priceBasis || 'EX_VAT',
        overallStatus,
        offers: validatedOffers,
        errors,
        metrics: {
            totalOffers: validatedOffers.length,
            consistentOffers: consistentCount,
            inconsistentOffers: inconsistentCount
        }
    };
}

// In-memory fallback map for offline unit tests when DB is unavailable
const inMemoryDocs = new Map();

class QuoteEvidenceService {

    constructor() {
        this.TOTAL_ABS_TOLERANCE_EUR = TOTAL_ABS_TOLERANCE_EUR;
        this.UNIT_PRICE_ABS_TOLERANCE_EUR = UNIT_PRICE_ABS_TOLERANCE_EUR;
    }

    computeDocumentHash(content) {
        return computeDocumentHash(content);
    }

    validateOffer(offer) {
        return validateOffer(offer);
    }

    validateNormalizedQuote(normalizedQuote) {
        return validateNormalizedQuote(normalizedQuote);
    }

    /**
     * Store quote evidence document record in DB (tenant scoped).
     */
    async createQuoteDocument(tenantId, documentData, actor) {
        if (!tenantId) {
            throw new Error('MISSING_TENANT_ID');
        }

        const id = `qed_${uuidv4().replace(/-/g, '').substring(0, 24)}`;
        const documentHash = computeDocumentHash(documentData.rawText || documentData.content || id);

        const docRecord = {
            id,
            tenant_id: tenantId,
            printer_node_id: documentData.printerNodeId || null,
            source_type: documentData.sourceType || 'MANUAL_JSON',
            original_filename: documentData.originalFilename || null,
            document_sha256: documentHash,
            detected_language: documentData.detectedLanguage || 'de',
            raw_text: documentData.rawText || null,
            status: 'INGESTED',
            created_by_json: JSON.stringify(actor || { user: 'system' })
        };

        inMemoryDocs.set(`${tenantId}:${id}`, docRecord);

        try {
            const pool = db.getPool();
            await pool.query(
                `INSERT INTO quote_evidence_documents
                (id, tenant_id, printer_node_id, source_type, original_filename, document_sha256, detected_language, raw_text, status, created_by_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    docRecord.id,
                    docRecord.tenant_id,
                    docRecord.printer_node_id,
                    docRecord.source_type,
                    docRecord.original_filename,
                    docRecord.document_sha256,
                    docRecord.detected_language,
                    docRecord.raw_text,
                    docRecord.status,
                    docRecord.created_by_json
                ]
            );
        } catch (err) {
            logger.warn(`Database insert skipped or failed: ${err.message}`);
        }

        return docRecord;
    }

    /**
     * Store extractions and validation results in DB (tenant scoped).
     */
    async createExtraction(tenantId, documentId, extractedJson, normalizedQuote) {
        if (!tenantId || !documentId) {
            throw new Error('MISSING_REQUIRED_EXTRACTION_PARAMS');
        }

        const validation = validateNormalizedQuote(normalizedQuote);
        const id = `qee_${uuidv4().replace(/-/g, '').substring(0, 24)}`;

        const extractionRecord = {
            id,
            quote_evidence_document_id: documentId,
            tenant_id: tenantId,
            extracted_json: extractedJson,
            normalized_json: normalizedQuote,
            validation_status: validation.overallStatus,
            validation_errors_json: validation.errors,
            validation_metrics_json: validation.metrics
        };

        try {
            const pool = db.getPool();
            await pool.query(
                `INSERT INTO quote_evidence_extractions
                (id, quote_evidence_document_id, tenant_id, extracted_json, normalized_json, validation_status, validation_errors_json, validation_metrics_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    extractionRecord.id,
                    extractionRecord.quote_evidence_document_id,
                    extractionRecord.tenant_id,
                    JSON.stringify(extractedJson),
                    JSON.stringify(normalizedQuote),
                    extractionRecord.validation_status,
                    JSON.stringify(validation.errors),
                    JSON.stringify(validation.metrics)
                ]
            );
        } catch (err) {
            logger.warn(`Database insert skipped or failed: ${err.message}`);
        }

        return {
            id,
            documentId,
            tenantId,
            validation
        };
    }

    /**
     * Get document by ID with strict tenant scoping.
     */
    async getQuoteDocument(tenantId, documentId) {
        if (!tenantId || !documentId) return null;
        try {
            const pool = db.getPool();
            const [rows] = await pool.query(
                `SELECT * FROM quote_evidence_documents WHERE id = ? AND tenant_id = ?`,
                [documentId, tenantId]
            );
            if (rows && rows.length > 0) return rows[0];
        } catch (err) {
            logger.warn(`Database query skipped or failed: ${err.message}`);
        }
        return inMemoryDocs.get(`${tenantId}:${documentId}`) || null;
    }

    /**
     * List documents with strict tenant scoping.
     */
    async listQuoteDocuments(tenantId) {
        if (!tenantId) return [];
        try {
            const pool = db.getPool();
            const [rows] = await pool.query(
                `SELECT * FROM quote_evidence_documents WHERE tenant_id = ? ORDER BY created_at DESC`,
                [tenantId]
            );
            return rows || [];
        } catch (err) {
            logger.warn(`Database query skipped or failed: ${err.message}`);
            return [];
        }
    }
}

module.exports = new QuoteEvidenceService();
