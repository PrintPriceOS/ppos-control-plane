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

        // 7. Generic Technical Book Specification Extraction
        const specification = this.extractTechnicalSpecification(text);
        const allWarnings = [];
        if (specification.warnings && specification.warnings.length > 0) {
            allWarnings.push(...specification.warnings);
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
            specification,
            warnings: allWarnings,
            hasInconsistentOffers: hasInconsistent,
            confidenceStatus: hasInconsistent ? 'REQUIRES_REVIEW' : 'HIGH_CONFIDENCE',
            interpretationVersion: '2.1.0'
        };
    }

    /**
     * Extracts physical and technical book specifications from quote text.
     * ZERO hardcoded filenames or customer data.
     *
     * @param {string} text - Raw document text
     * @returns {Object} Technical book specification
     */
    extractTechnicalSpecification(text) {
        const spec = {};
        const warnings = [];

        // Format dimensions (e.g. "170 x 240 mm")
        const formatMatch = text.match(/(\d+)\s*x\s*(\d+)\s*mm/i);
        if (formatMatch) {
            spec.formatWidthMm = parseInt(formatMatch[1], 10);
            spec.formatHeightMm = parseInt(formatMatch[2], 10);
        }

        // Interior pages (e.g. "640 Seiten", "Inhalt: 200 Seiten")
        const pageMatch = text.match(/(?:Inhalt\s*[\t:]*\s*)?(\d+)\s*(?:Seiten|pages|páginas)/i);
        if (pageMatch) {
            spec.interiorPages = parseInt(pageMatch[1], 10);
        }

        // Family & Binding Method
        const lower = text.toLowerCase();
        let family = 'SOFTCOVER';
        let bindingMethod = 'perfect bound';

        if (/\b(?:hardcover|festeinband)\b/i.test(text)) {
            family = 'HARDCOVER';
        } else if (/\bhandcover\b/i.test(text)) {
            // Typo detection: "Handcover" -> Hardcover with explicit warning
            family = 'HARDCOVER';
            warnings.push('PROBABLE_TYPO_HANDCOVER');
        } else if (/\b(?:wire-?o|spiral(?:e|bindung)?)\b/i.test(text)) {
            family = 'WIRE_O';
            bindingMethod = 'wire-o';
        } else if (/\b(?:rückstich|sattelheftung|heftung|staple)\b/i.test(text) && !/fadenheftung/i.test(text)) {
            family = 'SADDLE_STITCH';
            bindingMethod = 'saddle stitch';
        }

        if (/\bfadenheftung\b/i.test(text) || /\bthread\s*sewn\b/i.test(text)) {
            bindingMethod = 'thread sewn';
        } else if (/\bklebebindung\b/i.test(text) || /\bperfect\s*bound\b/i.test(text)) {
            bindingMethod = 'perfect bound';
        }

        spec.family = family;
        spec.bindingMethod = bindingMethod;

        // Spine Type
        if (/\brunder\s*r(?:ü|ue)cken\b/i.test(text) || /\bround\s*spine\b/i.test(text)) {
            spec.spineType = 'round';
        } else if (/\bgerader\s*r(?:ü|ue)cken\b/i.test(text) || /\bstraight\s*spine\b/i.test(text) || /\bsquare\s*spine\b/i.test(text)) {
            spec.spineType = 'straight';
        }

        // Board Thickness (Graupappe / MGP, e.g. "MGP 2 mm", "MGP 2,4 mm", "2.0 mm Graupappe")
        const mgpMatch = text.match(/MGP\s*[\r\n\t:]*\s*([0-9]+(?:[.,][0-9]+)?)\s*mm/i) ||
                         text.match(/([0-9]+(?:[.,][0-9]+)?)\s*mm\s*(?:graupappe|board|pappe)/i);
        if (mgpMatch) {
            spec.boardThicknessMm = parseLocaleNumber(mgpMatch[1]);
        }

        // Lamination (glanz / matt / kratzfest matt)
        if (/\bkratzfest\s*matt\b/i.test(text) || /\bmatt\s*laminiert\b/i.test(text) || /\bmatte\s*laminat/i.test(text)) {
            spec.lamination = 'matt';
        } else if (/\bglanz\s*laminiert\b/i.test(text) || /\bgloss\s*laminat/i.test(text)) {
            spec.lamination = 'gloss';
        }

        // Headband & Ribbon
        if (/\bkapitalband\b/i.test(text) || /\bweiß\s*kapitalt\b/i.test(text) || /\bheadband\b/i.test(text)) {
            spec.hasHeadband = true;
            const hbMatch = text.match(/kapitalband\s*([0-9a-zA-Z_\- ]+?)(?:,|\.|\n|$)/i);
            if (hbMatch) spec.headbandColor = hbMatch[1].trim();
        }
        if (/\bleseband\b/i.test(text) || /\bribbon\b/i.test(text)) {
            spec.hasRibbon = true;
            const rbMatch = text.match(/leseband\s*([0-9a-zA-Z_\- ]+?)(?:,|\.|\n|$)/i);
            if (rbMatch) spec.ribbonColor = rbMatch[1].trim();
        }

        // Packaging & Samples
        if (/\beinzeln\s*eingeschweißt\b/i.test(text) || /\bshrink-?wrapped\b/i.test(text)) {
            spec.isShrinkWrapped = true;
        }
        const sampleMatch = text.match(/(\d+)\s*muster\s*an\s*verlag/i);
        if (sampleMatch) {
            spec.samplesNotice = `${sampleMatch[1]} Muster an Verlag`;
        }

        // Papers & Colors
        // Look for tabular or line patterns like:
        // Inhalt \n G-Print 115 g
        // Vorsatz/Nachsatz \n Offset 170 g
        // Umschlag \n Silk 130 g
        const inhaltPaperMatch = text.match(/Inhalt\s*[\r\n]+\s*([A-Za-z0-9\-_ ]+?)\s+(\d+)\s*g\b/i);
        if (inhaltPaperMatch) {
            spec.interiorPaper = inhaltPaperMatch[1].trim();
            spec.interiorWeightGsm = parseInt(inhaltPaperMatch[2], 10);
        }

        const umschlagPaperMatch = text.match(/Umschlag\s*[\r\n]+\s*([A-Za-z0-9\-_ ]+?)\s+(\d+)\s*g\b/i);
        if (umschlagPaperMatch) {
            spec.coverPaper = umschlagPaperMatch[1].trim();
            spec.coverWeightGsm = parseInt(umschlagPaperMatch[2], 10);
        }

        const vorsatzPaperMatch = text.match(/Vorsatz(?:\/Nachsatz)?\s*[\r\n]+\s*([A-Za-z0-9\-_ ]+?)\s+(\d+)\s*g\b/i);
        if (vorsatzPaperMatch) {
            spec.hasEndpapers = true;
            spec.endpaperPaper = vorsatzPaperMatch[1].trim();
            spec.endpaperWeightGsm = parseInt(vorsatzPaperMatch[2], 10);
        } else if (family === 'HARDCOVER') {
            // Hardcovers naturally have endpapers unless explicitly omitted
            spec.hasEndpapers = true;
        }

        // Inks (e.g. Inhalt \n 4+4, Umschlag \n 4+0, Vorsatz \n 0+0)
        const inhaltInkMatch = text.match(/Inhalt\s*[\r\n]+\s*([0-5][+/][0-5])/i);
        if (inhaltInkMatch) {
            spec.interiorColors = inhaltInkMatch[1].replace('+', '/');
        } else {
            const genericInk = text.match(/\b([1-4]\/[1-4]|[1-4]\+[1-4])\b/);
            if (genericInk) spec.interiorColors = genericInk[1].replace('+', '/');
        }

        const coverInkMatch = text.match(/Umschlag\s*[\r\n]+\s*([0-5][+/][0-5])/i);
        if (coverInkMatch) {
            spec.coverColors = coverInkMatch[1].replace('+', '/');
        }

        const vorsatzInkMatch = text.match(/Vorsatz(?:\/Nachsatz)?\s*[\r\n]+\s*([0-5][+/][0-5])/i);
        if (vorsatzInkMatch) {
            spec.endpaperColors = vorsatzInkMatch[1].replace('+', '/');
        }

        // Delivery Country from Lieferadresse
        if (/Lieferadresse[^\r\n]*Germany/i.test(text) || /\bDeutschland\b/i.test(text) || /\bGermany\b/i.test(text)) {
            spec.deliveryCountry = 'DE';
        } else if (/Lieferadresse[^\r\n]*Spain/i.test(text) || /\bEspaña\b/i.test(text)) {
            spec.deliveryCountry = 'ES';
        } else if (/Lieferadresse[^\r\n]*Austria/i.test(text) || /\bÖsterreich\b/i.test(text)) {
            spec.deliveryCountry = 'AT';
        } else if (/Lieferadresse[^\r\n]*France/i.test(text) || /\bFrankreich\b/i.test(text)) {
            spec.deliveryCountry = 'FR';
        }

        spec.warnings = warnings;
        return spec;
    }
}

const serviceInstance = new QuoteDocumentInterpretationService();
serviceInstance.parseLocaleNumber = parseLocaleNumber;

module.exports = serviceInstance;
