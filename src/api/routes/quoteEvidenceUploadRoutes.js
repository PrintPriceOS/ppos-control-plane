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
        const extraction = pdfExtractor.extractPdfQuote(req.file.buffer, req.file.originalname, req.file.mimetype);

        if (extraction.status === 'OCR_REQUIRED') {
            return res.status(422).json({
                error: 'OCR_REQUIRED',
                message: 'Uploaded PDF contains zero extractable text (image-only PDF). Text-based PDF is required.',
                documentSha256: extraction.documentSha256
            });
        }

        // 2. Check Document Idempotency (Duplicate Detection per Tenant)
        const existingDocs = await db.query(
            `SELECT id FROM printhouse_quote_evidence_documents WHERE tenant_id = ? AND file_hash_sha256 = ?`,
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
            `INSERT INTO printhouse_quote_evidence_documents
             (id, tenant_id, file_name, file_hash_sha256, document_type, detected_language, raw_extracted_text, page_count, extraction_method, extraction_version, processing_status, created_at)
             VALUES (?, ?, ?, ?, 'PDF_QUOTATION', ?, ?, ?, ?, ?, 'COMPLETED', NOW(6))`,
            [
                documentId,
                tenantId,
                extraction.filename,
                extraction.documentSha256,
                interpretation.detectedLanguage,
                extraction.combinedText,
                extraction.pageCount,
                extraction.extractionMethod,
                extraction.extractionVersion
            ]
        );

        await db.query(
            `INSERT INTO printhouse_quote_evidence_extractions
             (id, tenant_id, document_id, extraction_status, validation_status, normalized_quote_json, warnings_json, translated_text, confidence_status, interpretation_version, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))`,
            [
                extractionId,
                tenantId,
                documentId,
                interpretation.status,
                interpretation.hasInconsistentOffers ? 'REQUIRES_REVIEW' : 'VERIFIED',
                JSON.stringify({
                    printhouseName: interpretation.printhouseName,
                    offerGroups: interpretation.offerGroups,
                    offers: interpretation.offers,
                    normalizedTerms: interpretation.normalizedTerms
                }),
                JSON.stringify(extraction.extractionWarnings),
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
            `SELECT d.id, d.tenant_id, d.file_name, d.file_hash_sha256, d.detected_language, d.raw_extracted_text, d.page_count, d.created_at,
                    e.id as extraction_id, e.extraction_status, e.validation_status, e.normalized_quote_json, e.translated_text, e.confidence_status, e.operator_corrections_json
             FROM printhouse_quote_evidence_documents d
             LEFT JOIN printhouse_quote_evidence_extractions e ON d.id = e.document_id
             WHERE d.id = ? AND d.tenant_id = ?`,
            [documentId, tenantId]
        );

        if (!docs || docs.length === 0) {
            return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Quote evidence document not found' });
        }

        const doc = docs[0];
        const normalizedJson = typeof doc.normalized_quote_json === 'string' ? JSON.parse(doc.normalized_quote_json) : doc.normalized_quote_json;
        const operatorCorrections = doc.operator_corrections_json ? (typeof doc.operator_corrections_json === 'string' ? JSON.parse(doc.operator_corrections_json) : doc.operator_corrections_json) : null;

        return res.json({
            ok: true,
            evidenceId: doc.id,
            tenantId: doc.tenant_id,
            filename: doc.file_name,
            documentSha256: doc.file_hash_sha256,
            detectedLanguage: doc.detected_language,
            pageCount: doc.page_count,
            rawExtractedText: doc.raw_extracted_text,
            translatedText: doc.translated_text,
            extractionStatus: doc.extraction_status,
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
            `SELECT id FROM printhouse_quote_evidence_documents WHERE id = ? AND tenant_id = ?`,
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
            `UPDATE printhouse_quote_evidence_extractions
             SET operator_corrections_json = ?
             WHERE document_id = ? AND tenant_id = ?`,
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

module.exports = router;
