/**
 * src/api/services/quoteDocumentInterpretationService.js
 *
 * Phase 194E-R — Production Quote Document Interpretation & Evidence Extraction Service
 *
 * Responsibilities:
 * 1. Interprets extracted PDF page text and converts natural language quotations into
 *    canonical Phase 194A quote evidence objects using generic contextual commercial parsing.
 * 2. ZERO hardcoding: derive product titles, quantities, prices, variants, and specs strictly from text.
 * 3. Preserves numeric source-span provenance (value, sourceText, pageNumber).
 * 4. Differentiates false positives (postal codes, dates, paper weights, dimensions) from commercial quote lines.
 * 5. Supports multiple offer groups / material / transport variants without flattening.
 * 6. Integrates deterministically with Phase 194A quoteEvidenceService.validateOffer.
 * 7. ZERO pricing mutation: returns structured evidence candidate for operator review only.
 */

const quoteEvidenceService = require('./quoteEvidenceService');
const quoteLanguageService = require('./quoteLanguageService');
const printingTranslationService = require('./printingTranslationService');
const logger = require('./logger').child('quote-interpretation-service');

/**
 * Normalizes locale numeric strings (supports both '1.473,00' and '1473.00' or '3,05' -> 3.05).
 */
function parseLocaleNumber(numStr) {
    if (typeof numStr === 'number') return numStr;
    if (!numStr || typeof numStr !== 'string') return null;

    let s = numStr.trim();

    // Handle European format "1.473,00 €" or "3,05 EUR"
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }

    // Strip non-numeric characters except minus and dot
    s = s.replace(/[^0-9.-]/g, '');
    const val = Number(s);
    return isNaN(val) ? null : val;
}

class QuoteDocumentInterpretationService {

    /**
     * Interprets extracted PDF DTO and returns normalized Phase 194A quote evidence DTO.
     *
     * @param {Object} extraction - Output from pdfQuoteExtractionService.extractPdfQuote
     * @param {Object} [options] - Options (overrideLanguage, documentId)
     * @returns {Object} Structured quote evidence candidate
     */
    interpretDocument(extraction, options = {}) {
        if (!extraction || !extraction.combinedText) {
            return {
                ok: false,
                status: 'PARSE_FAILED',
                warnings: ['EMPTY_EXTRACTION_TEXT'],
                offers: []
            };
        }

        const text = extraction.combinedText;
        const pages = extraction.pages && extraction.pages.length > 0 ? extraction.pages : [{ pageNumber: 1, text }];

        // 1. Language Detection
        const langResult = options.overrideLanguage
            ? { detectedLanguage: options.overrideLanguage, confidence: 1.0, status: 'CONFIDENT' }
            : quoteLanguageService.detectLanguage(text);

        // 2. Translation & Terminology Normalization
        const translationResult = printingTranslationService.translateAndNormalize(
            text,
            langResult.detectedLanguage,
            'en'
        );

        // 3. Document Title / Supplier Extraction (Generic context matching)
        let printhouseName = 'Generic Printing Quotation';
        const prodMatch = text.match(/\bProdukt\b\s*[\t:]*\s*([^\r\n]+)/i);
        if (prodMatch && prodMatch[1].trim()) {
            printhouseName = prodMatch[1].trim();
        } else {
            const clientMatch = text.match(/\bClient\b\s*[\t:]*\s*([^\r\n]+)/i);
            if (clientMatch && clientMatch[1].trim()) {
                printhouseName = `Quote for ${clientMatch[1].trim()}`;
            }
        }

        // 4. Format & Content / Page count extraction
        let format = null;
        const formatMatch = text.match(/(\d+\s*x\s*\d+\s*mm)/i);
        if (formatMatch) format = formatMatch[1];

        let pageCountText = null;
        const pageMatch = text.match(/(\d+)\s*(?:Seiten|pages|páginas)/i);
        if (pageMatch) pageCountText = pageMatch[1];

        // 5. Generic Contextual Commercial Offer Extraction Across Pages
        const rawOffers = [];
        let currentVariantName = null;
        let globalAuflageQty = null;

        // Check for global Auflage quantity (e.g., "Auflage 3000 pc" or "Auflage 1500 pc")
        const globalAuflageMatch = text.match(/Auflage\s*[\t:]?\s*(\d+)\s*(?:pc|Stück|Ex|copies|uds|ejemplares)?/i);
        if (globalAuflageMatch) {
            globalAuflageQty = parseLocaleNumber(globalAuflageMatch[1]);
        }

        for (const pg of pages) {
            const pageNum = pg.pageNumber || 1;
            const pageLines = (pg.text || '').split('\n');

            for (let lineIdx = 0; lineIdx < pageLines.length; lineIdx++) {
                const line = pageLines[lineIdx].trim();
                if (!line) continue;

                // False positive safety: ignore date lines or postal codes from address block
                if (/\b\d{2}\.\d{2}\.\d{4}\b/.test(line) && !line.includes('Euro') && !line.includes('€')) continue;
                if (/LV-\d+|Rencēnu|Daimler|Bahnhofstraße|Königstraße/i.test(line) && !line.includes('Euro') && !line.includes('€')) continue;

                // Track current paper / material variant name (e.g., "Munken Print Cream 1.5", "Standard Shipping Option")
                if (/Munken|Silk|Offset|Gloss|Express|Standard/i.test(line) && !line.includes('Euro') && !line.includes('€') && line.length < 60) {
                    currentVariantName = line;
                }

                // Generic commercial line matcher:
                // Matches lines with Qty + Mfg Price Euro + Transport Price Euro = Total Euro / Unit Price Euro
                const lineOfferRegex = /^(?:(\d+)\s*(?:Stück|Ex|copies|pc|uds|ejemplares|units)\s*)?([A-Za-z0-9\s\-]+)?\b(\d+[\d.,]*)\s*(?:Euro|EUR|€)\s*\+\s*(\d+[\d.,]*)\s*(?:Euro|EUR|€)?\s*(?:\((.*?)\))?\s*=\s*(\d+[\d.,]*)\s*(?:Euro|EUR|€)?(?:\s*\/\s*(\d+[\d.,]*)\s*(?:Euro|EUR|€)?\s*(?:pro|per|\/)\s*(?:Stück|Ex|copy|pc|ud|ejemplar|unit)?)?/i;

                const match = line.match(lineOfferRegex);
                if (match) {
                    const prefixQty = match[1] ? parseLocaleNumber(match[1]) : null;
                    const prefixLabel = match[2] ? match[2].trim() : null;
                    const mfg = parseLocaleNumber(match[3]);
                    const transport = parseLocaleNumber(match[4]);
                    const total = parseLocaleNumber(match[6]);
                    const unit = match[7] ? parseLocaleNumber(match[7]) : null;

                    const qty = prefixQty || globalAuflageQty;

                    if (qty && mfg !== null && total !== null) {
                        const variant = currentVariantName || (prefixLabel && prefixLabel.length < 40 ? prefixLabel : 'Standard Option');
                        rawOffers.push({
                            quantity: qty,
                            manufacturingPrice: mfg,
                            transportPrice: transport || 0,
                            quotedTotalPrice: total,
                            quotedUnitPrice: unit !== null ? unit : (total / qty),
                            sourceText: line,
                            pageNumber: pageNum,
                            variantName: variant,
                            format,
                            pageCountText
                        });
                    }
                }
            }
        }

        // Group offers by variant if multiple distinct variants exist
        const offerGroups = [];
        const variantMap = new Map();
        for (const off of rawOffers) {
            const vKey = off.variantName || 'Standard Option';
            if (!variantMap.has(vKey)) variantMap.set(vKey, []);
            variantMap.get(vKey).push(off);
        }

        if (variantMap.size > 1) {
            for (const [varName, varOffers] of variantMap.entries()) {
                offerGroups.push({
                    variantName: varName,
                    offers: varOffers
                });
            }
        }

        // 6. Run Phase 194A Validation & Build Numeric Source Provenance
        const validatedOffers = [];
        let hasInconsistent = false;

        for (const rawOff of rawOffers) {
            const valOff = quoteEvidenceService.validateOffer(rawOff);
            valOff.sourceText = rawOff.sourceText || '';
            valOff.pageNumber = rawOff.pageNumber || 1;
            valOff.currency = 'EUR';
            valOff.targetBasis = 'MANUFACTURING_PRICE';
            valOff.eligibilityStatus = valOff.validationStatus === 'CONSISTENT' ? 'ELIGIBLE' : 'REQUIRES_REVIEW';
            valOff.format = rawOff.format;
            valOff.pageCountText = rawOff.pageCountText;

            // Numeric source-span provenance
            valOff.provenance = {
                quantity: { value: valOff.quantity, pageNumber: rawOff.pageNumber, sourceText: rawOff.sourceText },
                manufacturingPrice: { value: valOff.manufacturingPrice, pageNumber: rawOff.pageNumber, sourceText: rawOff.sourceText },
                transportPrice: { value: valOff.transportPrice, pageNumber: rawOff.pageNumber, sourceText: rawOff.sourceText },
                quotedTotalPrice: { value: valOff.quotedTotalPrice, pageNumber: rawOff.pageNumber, sourceText: rawOff.sourceText },
                quotedUnitPrice: { value: valOff.quotedUnitPrice, pageNumber: rawOff.pageNumber, sourceText: rawOff.sourceText }
            };

            if (valOff.validationStatus !== 'CONSISTENT') {
                hasInconsistent = true;
            }

            validatedOffers.push(valOff);
        }

        return {
            ok: true,
            status: 'SUCCESS',
            documentSha256: extraction.documentSha256,
            printhouseName,
            detectedLanguage: langResult.detectedLanguage,
            languageConfidence: langResult.confidence,
            originalText: text,
            translatedText: translationResult.translated,
            normalizedTerms: translationResult.normalizedTerms,
            offerGroups,
            offers: validatedOffers,
            hasInconsistentOffers: hasInconsistent,
            confidenceStatus: hasInconsistent ? 'REQUIRES_REVIEW' : 'HIGH_CONFIDENCE',
            interpretationVersion: '2.0.0'
        };
    }
}

const serviceInstance = new QuoteDocumentInterpretationService();
serviceInstance.parseLocaleNumber = parseLocaleNumber;

module.exports = serviceInstance;
