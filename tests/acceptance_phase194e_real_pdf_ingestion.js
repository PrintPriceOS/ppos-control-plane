/**
 * tests/acceptance_phase194e_real_pdf_ingestion.js
 *
 * Phase 194E-R — Real Binary PDF Ingestion Acceptance Suite
 *
 * Tests actual binary PDFs from C:\Users\KIKE\Downloads\precios:
 * 1. Natur_31.08.2026.pdf
 * 2. Stutensee_Mit_Margot_durch_das_Gartenjahr_04.09.2026 (1).pdf
 * 3. Fussel_08.09.2026 (2).pdf
 * 4. Fährmann_(VVA_10_Muster)_07.09.2026.pdf
 * 5. Die_Mysteriösen_Steine_08.09.2026 (1).pdf
 *
 * Requirements:
 * - NO mocked extracted text.
 * - NO manually constructed normalized JSON.
 * - NO fixture value injection or filename matching in production code.
 * - Verifies real binary extraction, field provenance, genericity (changed-number test),
 *   false-positive safety (dates, postal codes, gsm), and full arithmetic validation.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const pdfExtractor = require('../src/api/services/pdfQuoteExtractionService');
const languageService = require('../src/api/services/quoteLanguageService');
const translationService = require('../src/api/services/printingTranslationService');
const interpreter = require('../src/api/services/quoteDocumentInterpretationService');
const quoteEvidenceService = require('../src/api/services/quoteEvidenceService');

const REAL_PDF_DIR = 'C:\\Users\\KIKE\\Downloads\\precios';

async function runAcceptanceTests() {
    console.log('=== Phase 194E-R Real PDF Binary Ingestion Acceptance Suite ===\n');

    // 194E-R-01: Migration 150/153 table names aligned in SQL schema files
    {
        console.log('Running 194E-R-01: Migration 150/153 table names aligned...');
        const m150 = fs.readFileSync(path.join(__dirname, '../migrations/150_phase194_quantity_economics_and_quote_evidence.sql'), 'utf8');
        const m153 = fs.readFileSync(path.join(__dirname, '../migrations/153_phase194e_multilingual_pdf_quote_ingestion.sql'), 'utf8');
        assert.ok(m150.includes('quote_evidence_documents'));
        assert.ok(m150.includes('quote_evidence_extractions'));
        assert.ok(m153.includes('quote_evidence_documents'));
        assert.ok(m153.includes('quote_evidence_extractions'));
        assert.ok(!m153.includes('printhouse_quote_evidence_'));
        console.log('  PASS: Migration 150/153 schema files use canonical table names without printhouse_ prefix');
    }

    // 194E-R-02: Fresh migration chain compatibility
    {
        console.log('Running 194E-R-02: Fresh migration chain compatibility check...');
        const m151 = fs.readFileSync(path.join(__dirname, '../migrations/151_phase194c_multi_quantity_calibration.sql'), 'utf8');
        const m152 = fs.readFileSync(path.join(__dirname, '../migrations/152_phase194d_governed_curve_acceptance.sql'), 'utf8');
        assert.ok(m151.includes('quote_evidence_documents'));
        assert.ok(m152.includes('curve_acceptance_json'));
        console.log('  PASS: Migration chain 150 -> 151 -> 152 -> 153 is aligned');
    }

    // 194E-R-03: Real Natur PDF text extraction
    let naturExtraction;
    {
        console.log('Running 194E-R-03: Real Natur PDF text extraction...');
        const buf = fs.readFileSync(path.join(REAL_PDF_DIR, 'Natur_31.08.2026.pdf'));
        naturExtraction = await pdfExtractor.extractPdfQuote(buf, 'Natur_31.08.2026.pdf');
        assert.strictEqual(naturExtraction.ok, true);
        assert.strictEqual(naturExtraction.status, 'SUCCESS');
        assert.ok(naturExtraction.combinedText.length > 500);
        assert.strictEqual(naturExtraction.pageCount, 2);
        console.log('  PASS: Real Natur PDF decoded successfully with >500 chars text');
    }

    // 194E-R-04: Real Natur values recovered from PDF text
    let naturInterp;
    {
        console.log('Running 194E-R-04: Real Natur values recovered...');
        naturInterp = interpreter.interpretDocument(naturExtraction);
        assert.strictEqual(naturInterp.printhouseName, 'Natur');
        assert.strictEqual(naturInterp.offers.length, 3);

        const quantities = naturInterp.offers.map(o => o.quantity);
        assert.deepStrictEqual(quantities, [500, 600, 700]);

        assert.strictEqual(naturInterp.offers[0].manufacturingPrice, 4321);
        assert.strictEqual(naturInterp.offers[0].transportPrice, 325);
        assert.strictEqual(naturInterp.offers[0].quotedTotalPrice, 4646);
        assert.strictEqual(naturInterp.offers[0].validationStatus, 'CONSISTENT');

        assert.strictEqual(naturInterp.offers[1].manufacturingPrice, 4604);
        assert.strictEqual(naturInterp.offers[1].quotedTotalPrice, 4929);
        assert.strictEqual(naturInterp.offers[1].validationStatus, 'CONSISTENT');

        assert.strictEqual(naturInterp.offers[2].manufacturingPrice, 4846);
        assert.strictEqual(naturInterp.offers[2].quotedTotalPrice, 5171);
        assert.strictEqual(naturInterp.offers[2].validationStatus, 'CONSISTENT');
        console.log('  PASS: Real Natur 500/600/700 values recovered and validated CONSISTENT');
    }

    // 194E-R-05: Real Natur source spans preserved
    {
        console.log('Running 194E-R-05: Real Natur source spans preserved...');
        assert.ok(naturInterp.offers[0].provenance);
        assert.strictEqual(naturInterp.offers[0].provenance.manufacturingPrice.value, 4321);
        assert.strictEqual(naturInterp.offers[0].provenance.manufacturingPrice.pageNumber, 1);
        assert.ok(naturInterp.offers[0].provenance.manufacturingPrice.sourceText.includes('4321'));
        console.log('  PASS: Numeric source spans and page numbers preserved for Natur');
    }

    // 194E-R-06: Real Stutensee values recovered
    let stutenseeExtraction;
    let stutenseeInterp;
    {
        console.log('Running 194E-R-06: Real Stutensee values recovered...');
        const buf = fs.readFileSync(path.join(REAL_PDF_DIR, 'Stutensee_Mit_Margot_durch_das_Gartenjahr_04.09.2026 (1).pdf'));
        stutenseeExtraction = await pdfExtractor.extractPdfQuote(buf, 'Stutensee.pdf');
        stutenseeInterp = interpreter.interpretDocument(stutenseeExtraction);

        assert.strictEqual(stutenseeInterp.offers.length, 2);
        assert.strictEqual(stutenseeInterp.offers[0].quantity, 250);
        assert.strictEqual(stutenseeInterp.offers[0].manufacturingPrice, 1283);
        assert.strictEqual(stutenseeInterp.offers[0].transportPrice, 190);
        assert.strictEqual(stutenseeInterp.offers[0].quotedTotalPrice, 1473);
        assert.strictEqual(stutenseeInterp.offers[0].validationStatus, 'CONSISTENT');
        console.log('  PASS: Real Stutensee 250 values recovered CONSISTENT');
    }

    // 194E-R-07: Real Stutensee inconsistency detected
    {
        console.log('Running 194E-R-07: Real Stutensee inconsistency detected...');
        assert.strictEqual(stutenseeInterp.offers[1].quantity, 300);
        assert.strictEqual(stutenseeInterp.offers[1].manufacturingPrice, 1335);
        assert.strictEqual(stutenseeInterp.offers[1].transportPrice, 190);
        assert.strictEqual(stutenseeInterp.offers[1].quotedTotalPrice, 1525);
        assert.strictEqual(stutenseeInterp.offers[1].validationStatus, 'INCONSISTENT_UNIT_PRICE');
        assert.strictEqual(stutenseeInterp.hasInconsistentOffers, true);
        console.log('  PASS: Real Stutensee 300 detected INCONSISTENT_UNIT_PRICE');
    }

    // 194E-R-08: €3.05 source span proves PDF origin
    {
        console.log('Running 194E-R-08: €3.05 source span proves PDF origin...');
        assert.strictEqual(stutenseeInterp.offers[1].quotedUnitPrice, 3.05);
        assert.ok(Math.abs(stutenseeInterp.offers[1].computedUnitPrice - 5.083333) < 0.001);
        assert.ok(stutenseeInterp.offers[1].provenance.quotedUnitPrice.sourceText.includes('3.05'));
        console.log('  PASS: €3.05 quoted unit price proven derived from real PDF source text span');
    }

    // 194E-R-09: Real Fussel alternatives recovered
    {
        console.log('Running 194E-R-09: Real Fussel alternatives recovered...');
        const buf = fs.readFileSync(path.join(REAL_PDF_DIR, 'Fussel_08.09.2026 (2).pdf'));
        const ext = await pdfExtractor.extractPdfQuote(buf, 'Fussel.pdf');
        const interp = interpreter.interpretDocument(ext);

        assert.strictEqual(interp.offers.length, 2);
        assert.strictEqual(interp.offers[0].quantity, 2000);
        assert.strictEqual(interp.offers[0].manufacturingPrice, 3095);
        assert.strictEqual(interp.offers[0].transportPrice, 600);
        assert.strictEqual(interp.offers[0].quotedTotalPrice, 3695);

        assert.strictEqual(interp.offers[1].quantity, 2000);
        assert.strictEqual(interp.offers[1].manufacturingPrice, 3095);
        assert.strictEqual(interp.offers[1].transportPrice, 200);
        assert.strictEqual(interp.offers[1].quotedTotalPrice, 3295);
        console.log('  PASS: Real Fussel 2000-copy quote recovered both transport options (600 vs 200 EUR)');
    }

    // 194E-R-10: Real Fährmann variants preserved
    {
        console.log('Running 194E-R-10: Real Fährmann variants preserved...');
        const buf = fs.readFileSync(path.join(REAL_PDF_DIR, 'Fährmann_(VVA_10_Muster)_07.09.2026.pdf'));
        const ext = await pdfExtractor.extractPdfQuote(buf, 'Fährmann.pdf');
        const interp = interpreter.interpretDocument(ext);

        assert.strictEqual(interp.offers.length, 4);
        assert.strictEqual(interp.offerGroups.length, 2);
        assert.strictEqual(interp.offers[0].quantity, 3000);
        assert.strictEqual(interp.offers[0].manufacturingPrice, 6048);
        assert.strictEqual(interp.offers[0].transportPrice, 435);
        assert.strictEqual(interp.offers[0].quotedTotalPrice, 6483);

        assert.strictEqual(interp.offers[1].manufacturingPrice, 6184);
        assert.strictEqual(interp.offers[1].quotedTotalPrice, 6619);
        console.log('  PASS: Real Fährmann 3000-copy quote recovered paper variants without flattening');
    }

    // 194E-R-11: Real Mysteriösen Steine values recovered
    {
        console.log('Running 194E-R-11: Real Mysteriösen Steine values recovered...');
        const buf = fs.readFileSync(path.join(REAL_PDF_DIR, 'Die_Mysteriösen_Steine_08.09.2026 (1).pdf'));
        const ext = await pdfExtractor.extractPdfQuote(buf, 'Die_Mysteriösen_Steine.pdf');
        const interp = interpreter.interpretDocument(ext);

        assert.strictEqual(interp.offers.length, 1);
        assert.strictEqual(interp.offers[0].quantity, 1500);
        assert.strictEqual(interp.offers[0].manufacturingPrice, 1792);
        assert.strictEqual(interp.offers[0].transportPrice, 415);
        assert.strictEqual(interp.offers[0].quotedTotalPrice, 2207);
        assert.strictEqual(interp.offers[0].validationStatus, 'CONSISTENT');
        console.log('  PASS: Real Die Mysteriösen Steine recovered 1500 copies (1792 + 415 = 2207 EUR)');
    }

    // 194E-R-12: Zero filename-specific production logic
    {
        console.log('Running 194E-R-12: Zero filename-specific production logic check...');
        const code = fs.readFileSync(path.join(__dirname, '../src/api/services/quoteDocumentInterpretationService.js'), 'utf8');
        assert.ok(!code.includes("if (printhouseName === 'Natur')"));
        assert.ok(!code.includes("if (printhouseName === 'Stutensee')"));
        assert.ok(!code.includes("if (printhouseName === 'Fussel')"));
        assert.ok(!code.includes("4321")); // No hardcoded fixture numbers
        assert.ok(!code.includes("1283"));
        assert.ok(!code.includes("3095"));
        console.log('  PASS: Zero fixture constant hardcoding in quoteDocumentInterpretationService.js');
    }

    // 194E-R-13: Changed-number fixture extracts changed values (genericity test)
    {
        console.log('Running 194E-R-13: Changed-number fixture genericity test...');
        const syntheticExtraction = {
            filename: 'Custom_Book_Quote.pdf',
            documentSha256: 'sha_custom_999',
            combinedText: 'Produkt CustomBook\nFormat 170 x 240 mm\n550 Stück 4400 Euro + 330 Euro (Transport) = 4730 Euro / 8.60 Euro pro Stück',
            pages: [{ pageNumber: 1, text: 'Produkt CustomBook\n550 Stück 4400 Euro + 330 Euro (Transport) = 4730 Euro / 8.60 Euro pro Stück' }]
        };
        const interp = interpreter.interpretDocument(syntheticExtraction);
        assert.strictEqual(interp.printhouseName, 'CustomBook');
        assert.strictEqual(interp.offers.length, 1);
        assert.strictEqual(interp.offers[0].quantity, 550);
        assert.strictEqual(interp.offers[0].manufacturingPrice, 4400);
        assert.strictEqual(interp.offers[0].transportPrice, 330);
        assert.strictEqual(interp.offers[0].quotedTotalPrice, 4730);
        assert.strictEqual(interp.offers[0].quotedUnitPrice, 8.60);
        assert.strictEqual(interp.offers[0].validationStatus, 'CONSISTENT');
        console.log('  PASS: Changed-number synthetic text extracted new values [550, 4400, 330, 4730] correctly');
    }

    // 194E-R-14: Postal codes not misclassified
    {
        console.log('Running 194E-R-14: Postal codes false-positive test...');
        const addrExtraction = {
            filename: 'AddressDoc.pdf',
            documentSha256: 'sha_addr',
            combinedText: 'Client Company GmbH\nRencēnu iela 10A, Riga, Latvia, LV-1073\nDate 08.09.2026\n100 Stück 1000 Euro + 100 Euro (Transport) = 1100 Euro / 11.00 Euro pro Stück',
            pages: [{ pageNumber: 1, text: 'Client Company GmbH\nRencēnu iela 10A, Riga, Latvia, LV-1073\nDate 08.09.2026\n100 Stück 1000 Euro + 100 Euro (Transport) = 1100 Euro / 11.00 Euro pro Stück' }]
        };
        const interp = interpreter.interpretDocument(addrExtraction);
        assert.strictEqual(interp.offers.length, 1);
        assert.strictEqual(interp.offers[0].quantity, 100);
        assert.strictEqual(interp.offers[0].manufacturingPrice, 1000);
        console.log('  PASS: Postal code 1073 ignored for quantity and price parsing');
    }

    // 194E-R-15: Dates not misclassified
    {
        console.log('Running 194E-R-15: Dates false-positive test...');
        const dateExtraction = {
            filename: 'DateDoc.pdf',
            documentSha256: 'sha_date',
            combinedText: 'Date 31.08.2026\n50 Stück 500 Euro + 50 Euro (Transport) = 550 Euro / 11.00 Euro pro Stück',
            pages: [{ pageNumber: 1, text: 'Date 31.08.2026\n50 Stück 500 Euro + 50 Euro (Transport) = 550 Euro / 11.00 Euro pro Stück' }]
        };
        const interp = interpreter.interpretDocument(dateExtraction);
        assert.strictEqual(interp.offers[0].quantity, 50);
        assert.strictEqual(interp.offers[0].manufacturingPrice, 500);
        console.log('  PASS: Date 31.08.2026 ignored for price line extraction');
    }

    // 194E-R-16: Dimensions not misclassified as prices
    {
        console.log('Running 194E-R-16: Format dimensions extraction test...');
        assert.strictEqual(naturInterp.offers[0].format, '148 x 210 mm');
        console.log('  PASS: Format 148 x 210 mm correctly extracted as spec attribute');
    }

    // 194E-R-17: Paper GSM not misclassified as quantity
    {
        console.log('Running 194E-R-17: Paper GSM false-positive test...');
        const gsmExtraction = {
            filename: 'GsmDoc.pdf',
            documentSha256: 'sha_gsm',
            combinedText: 'Inhalt Silk 150 g\n500 Stück 2500 Euro + 200 Euro (Transport) = 2700 Euro / 5.40 Euro pro Stück',
            pages: [{ pageNumber: 1, text: 'Inhalt Silk 150 g\n500 Stück 2500 Euro + 200 Euro (Transport) = 2700 Euro / 5.40 Euro pro Stück' }]
        };
        const interp = interpreter.interpretDocument(gsmExtraction);
        assert.strictEqual(interp.offers[0].quantity, 500);
        console.log('  PASS: Paper weight 150 g not misclassified as quantity');
    }

    // 194E-R-18: Compressed PDF extraction works via PDFParse engine
    {
        console.log('Running 194E-R-18: Compressed FlateDecode stream extraction test...');
        assert.strictEqual(naturExtraction.extractionMethod, 'PDFPARSE_ENGINE');
        assert.ok(naturExtraction.combinedText.includes('Königstraße 43'));
        console.log('  PASS: FlateDecode compressed PDF streams extracted cleanly via PDFParse');
    }

    // 194E-R-19: Multi-page page provenance works
    {
        console.log('Running 194E-R-19: Multi-page page provenance test...');
        assert.strictEqual(naturExtraction.pages.length, 2);
        assert.strictEqual(naturExtraction.pages[0].pageNumber, 1);
        assert.strictEqual(naturExtraction.pages[1].pageNumber, 2);
        console.log('  PASS: Per-page text and page numbers preserved in DTO');
    }

    // 194E-R-20: OCR_REQUIRED differentiated from extraction failure
    {
        console.log('Running 194E-R-20: OCR_REQUIRED differentiation test...');
        const scannedPdfBuf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Page /Contents 3 0 R >>\nendobj\n3 0 obj\n<< /Length 10 >>\nstream\n% NO TEXT\nendstream\nendobj\n%%EOF');
        const res = await pdfExtractor.extractPdfQuote(scannedPdfBuf, 'scanned.pdf');
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.status, 'OCR_REQUIRED');
        console.log('  PASS: Image-only PDF cleanly returns OCR_REQUIRED state');
    }

    console.log('\n=== ALL 20 Real Binary Acceptance Tests PASSED ===');
}

runAcceptanceTests().catch(err => {
    console.error('Acceptance Suite Failure:', err);
    process.exit(1);
});
