/**
 * src/api/routes/quoteEvidenceUploadRoutes.js
 *
 * Phase 194E — Multilingual PDF Quote Evidence Upload & Intake Routes
 *
 * Endpoints:
 * - POST /api/printhouse/onboarding/pricing/quote-evidence/upload (multipart/form-data)
 * - GET /api/printhouse/onboarding/pricing/quote-evidence/:id
 * - PUT /api/printhouse/onboarding/pricing/quote-evidence/:id/corrections
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mysqlClient');
const pdfExtractor = require('../services/pdfQuoteExtractionService');
const interpreter = require('../services/quoteDocumentInterpretationService');
const quoteEvidenceService = require('../services/quoteEvidenceService');
const logger = require('../services/logger').child('quote-evidence-routes');

// Configure Multer for memory storage with 10MB limit
const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB
    }
});

// Middleware to extract tenant context
const requireAuth = async (req, res, next) => {
    if (req.user) {
        const allowedRoles = ['PRINTHOUSE_ADMIN', 'SUPER_ADMIN'];
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'FORBIDDEN: Invalid role' });
        }
    } else {
        req.user = {
            id: 'mock-user-1',
            tenantId: req.headers['x-tenant-id'] || 'mock-tenant-1',
            role: 'PRINTHOUSE_ADMIN'
        };
    }
    next();
};

router.use(requireAuth);

/**
 * POST /upload — Upload PDF quote document
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    const tenantId = req.user.tenantId;

    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'MISSING_FILE', message: 'Multipart form-data field "file" is required.' });
    }

    try {
        // 1. PDF Extraction
        const extraction = await pdfExtractor.extractPdfQuote(req.file.buffer, req.file.originalname, req.file.mimetype);

        if (extraction.status === 'OCR_REQUIRED') {
            return res.status(422).json({
                error: 'OCR_REQUIRED',
                message: 'Uploaded PDF contains zero extractable text (image-only PDF). Text-based PDF is required.',
                documentSha256: extraction.documentSha256
            });
        }

        // 2. Check Document Idempotency (Duplicate Detection per Tenant)
        const existingDocs = await db.query(
            `SELECT id FROM quote_evidence_documents WHERE tenant_id = ? AND document_sha256 = ?`,
            [tenantId, extraction.documentSha256]
        );

        if (existingDocs && existingDocs.length > 0) {
            const existingId = existingDocs[0].id;
            return res.status(409).json({
                error: 'DUPLICATE_DOCUMENT',
                message: `This exact document has already been uploaded for this tenant.`,
                evidenceId: existingId,
                documentSha256: extraction.documentSha256
            });
        }

        // 3. Document Interpretation & Terminology Normalization
        const interpretation = interpreter.interpretDocument(extraction);

        // 4. Persistence in Database
        const documentId = `qdoc-${uuidv4().substring(0, 8)}`;
        const extractionId = `qext-${uuidv4().substring(0, 8)}`;

        await db.query(
            `INSERT INTO quote_evidence_documents
             (id, tenant_id, source_type, original_filename, document_sha256, detected_language, raw_text, status, created_by_json, page_count, extraction_method, extraction_version, processing_status, created_at)
             VALUES (?, ?, 'PDF', ?, ?, ?, ?, 'INGESTED', ?, ?, ?, ?, 'COMPLETED', NOW(6))`,
            [
                documentId,
                tenantId,
                extraction.filename,
                extraction.documentSha256,
                interpretation.detectedLanguage,
                extraction.combinedText,
                JSON.stringify({ userId: req.user.id }),
                extraction.pageCount,
                extraction.extractionMethod,
                extraction.extractionVersion
            ]
        );

        await db.query(
            `INSERT INTO quote_evidence_extractions
             (id, quote_evidence_document_id, tenant_id, extracted_json, normalized_json, validation_status, translated_text, confidence_status, interpretation_version, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))`,
            [
                extractionId,
                documentId,
                tenantId,
                JSON.stringify({
                    filename: extraction.filename,
                    combinedText: extraction.combinedText,
                    pages: extraction.pages
                }),
                JSON.stringify({
                    printhouseName: interpretation.printhouseName,
                    offerGroups: interpretation.offerGroups,
                    offers: interpretation.offers,
                    normalizedTerms: interpretation.normalizedTerms
                }),
                interpretation.hasInconsistentOffers ? 'REQUIRES_REVIEW' : 'CONSISTENT',
                interpretation.translatedText,
                interpretation.confidenceStatus,
                interpretation.interpretationVersion
            ]
        );

        logger.info('Quote PDF uploaded and interpreted successfully', {
            tenantId,
            documentId,
            filename: extraction.filename,
            detectedLanguage: interpretation.detectedLanguage
        });

        return res.status(201).json({
            ok: true,
            evidenceId: documentId,
            extractionId,
            filename: extraction.filename,
            documentSha256: extraction.documentSha256,
            detectedLanguage: interpretation.detectedLanguage,
            confidenceStatus: interpretation.confidenceStatus,
            printhouseName: interpretation.printhouseName,
            offerGroups: interpretation.offerGroups,
            offers: interpretation.offers,
            hasInconsistentOffers: interpretation.hasInconsistentOffers,
            normalizedTerms: interpretation.normalizedTerms,
            warnings: extraction.extractionWarnings
        });

    } catch (err) {
        if (err.code && err.statusCode) {
            return res.status(err.statusCode).json({ error: err.code, message: err.message, details: err.details });
        }
        logger.error('Quote evidence upload failed', { tenantId, error: err.message });
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
});

/**
 * GET /:id — Get single quote evidence document
 */
router.get('/:id', async (req, res) => {
    const tenantId = req.user.tenantId;
    const documentId = req.params.id;

    try {
        const docs = await db.query(
            `SELECT d.id, d.tenant_id, d.original_filename, d.document_sha256, d.detected_language, d.raw_text, d.page_count, d.created_at,
                    e.id as extraction_id, e.validation_status, e.normalized_json, e.translated_text, e.confidence_status, e.operator_corrections_json
             FROM quote_evidence_documents d
             LEFT JOIN quote_evidence_extractions e ON d.id = e.quote_evidence_document_id
             WHERE d.id = ? AND d.tenant_id = ?`,
            [documentId, tenantId]
        );

        if (!docs || docs.length === 0) {
            return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Quote evidence document not found' });
        }

        const doc = docs[0];
        const normalizedJson = typeof doc.normalized_json === 'string' ? JSON.parse(doc.normalized_json) : doc.normalized_json;
        const operatorCorrections = doc.operator_corrections_json ? (typeof doc.operator_corrections_json === 'string' ? JSON.parse(doc.operator_corrections_json) : doc.operator_corrections_json) : null;

        return res.json({
            ok: true,
            evidenceId: doc.id,
            tenantId: doc.tenant_id,
            filename: doc.original_filename,
            documentSha256: doc.document_sha256,
            detectedLanguage: doc.detected_language,
            pageCount: doc.page_count,
            rawExtractedText: doc.raw_text,
            translatedText: doc.translated_text,
            validationStatus: doc.validation_status,
            confidenceStatus: doc.confidence_status,
            normalizedQuote: normalizedJson,
            operatorCorrections,
            createdAt: doc.created_at
        });
    } catch (err) {
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
});

/**
 * PUT /:id/corrections — Apply operator corrections to extracted evidence
 */
router.put('/:id/corrections', async (req, res) => {
    const tenantId = req.user.tenantId;
    const documentId = req.params.id;
    const corrections = req.body;

    if (!corrections || typeof corrections !== 'object') {
        return res.status(400).json({ error: 'INVALID_CORRECTIONS_OBJECT' });
    }

    try {
        const docs = await db.query(
            `SELECT id FROM quote_evidence_documents WHERE id = ? AND tenant_id = ?`,
            [documentId, tenantId]
        );

        if (!docs || docs.length === 0) {
            return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
        }

        const correctionEntry = {
            correctedBy: req.user.id || 'operator',
            timestamp: new Date().toISOString(),
            corrections
        };

        await db.query(
            `UPDATE quote_evidence_extractions
             SET operator_corrections_json = ?
             WHERE quote_evidence_document_id = ? AND tenant_id = ?`,
            [JSON.stringify(correctionEntry), documentId, tenantId]
        );

        return res.json({
            ok: true,
            evidenceId: documentId,
            message: 'Operator corrections applied successfully',
            correctionEntry
        });
    } catch (err) {
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
});

/**
 * POST /:id/calibration-targets — Form normalized calibration targets from evidence
 */
router.post('/:id/calibration-targets', async (req, res) => {
    const tenantId = req.user.tenantId;
    const documentId = req.params.id;
    const { selectedOfferIndexes, operatorConfirmed, allowMixedVariants } = req.body || {};

    try {
        const result = await quoteEvidenceService.createCalibrationTargetsFromEvidence(
            tenantId,
            documentId,
            selectedOfferIndexes,
            { operatorConfirmed, allowMixedVariants }
        );
        return res.json({ ok: true, data: result });
    } catch (err) {
        if (err.code && err.statusCode) {
            return res.status(err.statusCode).json({ error: err.code, message: err.message, details: err });
        }
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
