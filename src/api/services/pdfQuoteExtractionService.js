/**
 * src/api/services/pdfQuoteExtractionService.js
 *
 * Phase 194E-R — Production PDF Quote Extraction & Security Service
 *
 * Responsibilities:
 * 1. Uses maintained PDFParse engine (powered by pdfjs-dist) to decode FlateDecode streams,
 *    object streams, subset fonts, and CMaps.
 * 2. Enforces PDF magic-byte validation (%PDF-), MIME allowlist, and filename sanitization.
 * 3. Enforces technical bounds: max file size (10 MB), max page count (50), max text size (500 KB).
 * 4. Computes deterministic SHA-256 fingerprint for document idempotency.
 * 5. Extracts page-bounded text content with exact pageNumber provenance.
 * 6. Differentiates PDF_ENCRYPTED, PDF_MALFORMED, TEXT_EXTRACTION_FAILED, and OCR_REQUIRED states.
 */

const crypto = require('crypto');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const logger = require('./logger').child('pdf-quote-extraction');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PAGE_COUNT = 50;
const MAX_TEXT_SIZE_BYTES = 500 * 1024; // 500 KB

/**
 * Sanitizes input filename to prevent path traversal or header injection.
 */
function sanitizeFilename(originalName) {
    if (!originalName || typeof originalName !== 'string') return 'document.pdf';
    const basename = path.basename(originalName);
    return basename.replace(/[^a-zA-Z0-9_.\- ()]/g, '_').slice(0, 128);
}

/**
 * Computes SHA-256 fingerprint digest of a buffer.
 */
function computeSha256(buffer) {
    if (!Buffer.isBuffer(buffer)) return '';
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validates PDF buffer magic header (%PDF-).
 */
function validatePdfMagicBytes(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false;
    const header = buffer.toString('utf8', 0, 5);
    return header === '%PDF-';
}

class PdfQuoteExtractionService {

    /**
     * Inspects, validates, and extracts text from an uploaded PDF file buffer.
     *
     * @param {Buffer} buffer - Raw file buffer
     * @param {string} originalFilename - User-provided filename
     * @param {string} [mimeType='application/pdf'] - Upload MIME type
     * @returns {Promise<Object>} Extraction DTO
     */
    async extractPdfQuote(buffer, originalFilename, mimeType = 'application/pdf') {
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            const err = new Error('INVALID_FILE_BUFFER');
            err.code = 'INVALID_FILE_BUFFER';
            err.statusCode = 400;
            throw err;
        }

        // 1. File Size Guard
        if (buffer.length > MAX_FILE_SIZE_BYTES) {
            const err = new Error('FILE_TOO_LARGE');
            err.code = 'FILE_TOO_LARGE';
            err.statusCode = 413;
            err.details = `File size ${buffer.length} bytes exceeds max allowed limit of ${MAX_FILE_SIZE_BYTES} bytes (10 MB).`;
            throw err;
        }

        // 2. MIME & Magic Bytes Validation
        const sanitizedName = sanitizeFilename(originalFilename);
        const ext = path.extname(sanitizedName).toLowerCase();
        if (ext !== '.pdf' && mimeType !== 'application/pdf') {
            const err = new Error('INVALID_FILE_TYPE');
            err.code = 'INVALID_FILE_TYPE';
            err.statusCode = 415;
            err.details = 'Only PDF files (.pdf) are permitted.';
            throw err;
        }

        if (!validatePdfMagicBytes(buffer)) {
            const err = new Error('PDF_MALFORMED');
            err.code = 'PDF_MALFORMED';
            err.statusCode = 422;
            err.details = 'File header does not contain valid PDF magic bytes (%PDF-).';
            throw err;
        }

        // 3. Check for encryption (/Encrypt)
        const rawHeader = buffer.toString('binary', 0, Math.min(buffer.length, 4096));
        if (rawHeader.includes('/Encrypt') || buffer.toString('binary').includes('/Encrypt')) {
            const err = new Error('PDF_ENCRYPTED');
            err.code = 'PDF_ENCRYPTED';
            err.statusCode = 422;
            err.details = 'PDF document is password protected or encrypted.';
            throw err;
        }

        // 4. Document SHA-256 Fingerprint
        const documentSha256 = computeSha256(buffer);
        const warnings = [];

        // 5. Extract Text Content via PDFParse
        let pageCount = 1;
        let pages = [];
        let combinedText = '';

        try {
            const parser = new PDFParse({ data: buffer });
            const parseResult = await parser.getText();

            pageCount = parseResult.pages ? Math.min(parseResult.pages.length, MAX_PAGE_COUNT) : 1;
            if (parseResult.pages && parseResult.pages.length > MAX_PAGE_COUNT) {
                warnings.push('PAGE_COUNT_EXCEEDED_TRUNCATED');
            }

            pages = (parseResult.pages || []).slice(0, MAX_PAGE_COUNT).map((p, idx) => ({
                pageNumber: idx + 1,
                text: (p.text || '').trim()
            }));

            combinedText = (parseResult.text || '').trim();

        } catch (err) {
            if (err.name === 'PasswordException' || (err.message && err.message.includes('Password'))) {
                const encErr = new Error('PDF_ENCRYPTED');
                encErr.code = 'PDF_ENCRYPTED';
                encErr.statusCode = 422;
                throw encErr;
            }
            // If PDF structure lacks extractable text streams or has minimal object catalogs (scanned image PDF)
            if (err.message && (err.message.includes('Invalid PDF structure') || err.message.includes('Missing trailer') || err.message.includes('no text'))) {
                return {
                    ok: false,
                    status: 'OCR_REQUIRED',
                    documentSha256,
                    filename: sanitizedName,
                    pageCount,
                    pages: [],
                    combinedText: '',
                    extractionWarnings: ['IMAGE_ONLY_PDF_OCR_REQUIRED'],
                    extractionMethod: 'PDFPARSE_ENGINE',
                    extractionVersion: '2.4.5'
                };
            }
            logger.warn('PDFParse extraction failed', { filename: sanitizedName, error: err.message });
            const malErr = new Error('PDF_TEXT_EXTRACTION_FAILED');
            malErr.code = 'PDF_TEXT_EXTRACTION_FAILED';
            malErr.statusCode = 422;
            malErr.details = err.message;
            throw malErr;
        }

        // 6. Max Text Size Guard
        if (combinedText.length > MAX_TEXT_SIZE_BYTES) {
            combinedText = combinedText.substring(0, MAX_TEXT_SIZE_BYTES);
            warnings.push('TEXT_TRUNCATED_MAX_SIZE_EXCEEDED');
        }

        // 7. OCR Required Gate (Scanned image PDF with no extractable text layer)
        if (!combinedText || combinedText.length < 5) {
            return {
                ok: false,
                status: 'OCR_REQUIRED',
                documentSha256,
                filename: sanitizedName,
                pageCount,
                pages: [],
                combinedText: '',
                extractionWarnings: ['IMAGE_ONLY_PDF_OCR_REQUIRED'],
                extractionMethod: 'PDFPARSE_ENGINE',
                extractionVersion: '2.4.5'
            };
        }

        return {
            ok: true,
            status: 'SUCCESS',
            documentSha256,
            filename: sanitizedName,
            pageCount,
            pages,
            combinedText,
            extractionWarnings: warnings,
            extractionMethod: 'PDFPARSE_ENGINE',
            extractionVersion: '2.4.5'
        };
    }
}

const serviceInstance = new PdfQuoteExtractionService();
serviceInstance.sanitizeFilename = sanitizeFilename;
serviceInstance.computeSha256 = computeSha256;
serviceInstance.validatePdfMagicBytes = validatePdfMagicBytes;

module.exports = serviceInstance;
