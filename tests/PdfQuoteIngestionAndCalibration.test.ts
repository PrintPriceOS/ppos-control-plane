/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { canonicalizeToEngineBookSpec } from '../src/ui/lib/bookSpecCanonicalizer';

// Import services and helpers under test
const pdfService = require('../src/api/services/pdfQuoteExtractionService');
const interpService = require('../src/api/services/quoteDocumentInterpretationService');
const calibrationService = require('../src/api/services/calibrationSessionService');

describe('PDF Quote Ingestion and Calibration Canonicalizer Regression Suite', () => {
    const HARDCOVER_PDF_PATH = 'C:\\Users\\KIKE\\Downloads\\Hardcover_640_Seiten_19.10.2026.pdf';
    const BILDBAND_PDF_PATH = 'C:\\Users\\KIKE\\Downloads\\Bildband_16.10.2026 (1).pdf';

    it('1. Extracts 3 distinct runs and technical specification from Hardcover_640_Seiten_19.10.2026.pdf', async () => {
        expect(fs.existsSync(HARDCOVER_PDF_PATH)).toBe(true);
        const buf = fs.readFileSync(HARDCOVER_PDF_PATH);
        const extraction = await pdfService.extractPdfQuote(buf, 'Hardcover_640_Seiten_19.10.2026.pdf');
        expect(extraction.status).toBe('SUCCESS');

        const interp = interpService.interpretDocument(extraction);
        expect(interp.ok).toBe(true);
        expect(interp.offers).toHaveLength(3);

        // Check runs without conflation or fallback values (1250, 150, 1000)
        const [run1, run2, run3] = interp.offers;
        expect(run1.quantity).toBe(200);
        expect(run1.manufacturingPrice).toBe(4399);
        expect(run1.transportPrice).toBe(350);
        expect(run1.quotedTotalPrice).toBe(4749);
        expect(run1.quotedUnitPrice).toBe(23.75);

        expect(run2.quantity).toBe(300);
        expect(run2.manufacturingPrice).toBe(4765);
        expect(run2.transportPrice).toBe(350);
        expect(run2.quotedTotalPrice).toBe(5115);
        expect(run2.quotedUnitPrice).toBe(17.05);

        expect(run3.quantity).toBe(500);
        expect(run3.manufacturingPrice).toBe(5493);
        expect(run3.transportPrice).toBe(450);
        expect(run3.quotedTotalPrice).toBe(5943);
        expect(run3.quotedUnitPrice).toBe(11.89);

        // Verify technical specification is extracted and populated
        expect(interp.specification).toBeDefined();
        expect(interp.specification.formatWidthMm).toBe(170);
        expect(interp.specification.formatHeightMm).toBe(240);
        expect(interp.specification.interiorPages).toBe(640);
        expect(interp.specification.family).toBe('HARDCOVER');
        expect(interp.specification.bindingMethod).toBe('thread sewn');
        expect(interp.specification.spineType).toBe('round');
        expect(interp.specification.boardThicknessMm).toBe(2);
        expect(interp.specification.lamination).toBe('matt');
        expect(interp.specification.interiorPaper).toContain('G-Print');
        expect(interp.specification.interiorWeightGsm).toBe(115);
        expect(interp.specification.interiorColors).toBe('4/4');
        expect(interp.specification.hasEndpapers).toBe(true);
        expect(interp.specification.deliveryCountry).toBe('DE');
    });

    it('2. Extracts 3 distinct runs and flags "Handcover" typo as HARDCOVER warning in Bildband_16.10.2026 (1).pdf', async () => {
        expect(fs.existsSync(BILDBAND_PDF_PATH)).toBe(true);
        const buf = fs.readFileSync(BILDBAND_PDF_PATH);
        const extraction = await pdfService.extractPdfQuote(buf, 'Bildband_16.10.2026 (1).pdf');
        expect(extraction.status).toBe('SUCCESS');

        const interp = interpService.interpretDocument(extraction);
        expect(interp.ok).toBe(true);
        expect(interp.offers).toHaveLength(3);

        const [run1, run2, run3] = interp.offers;
        expect(run1.quantity).toBe(1500);
        expect(run1.manufacturingPrice).toBe(5799);
        expect(run1.transportPrice).toBe(535);
        expect(run1.quotedTotalPrice).toBe(6334);
        expect(run1.quotedUnitPrice).toBe(4.22);

        expect(run2.quantity).toBe(2000);
        expect(run2.manufacturingPrice).toBe(6886);
        expect(run2.transportPrice).toBe(535);
        expect(run2.quotedTotalPrice).toBe(7421);
        expect(run2.quotedUnitPrice).toBe(3.71);

        expect(run3.quantity).toBe(2500);
        expect(run3.manufacturingPrice).toBe(8042);
        expect(run3.transportPrice).toBe(635);
        expect(run3.quotedTotalPrice).toBe(8677);
        expect(run3.quotedUnitPrice).toBe(3.47);

        // Technical specification & typo handling
        expect(interp.specification).toBeDefined();
        expect(interp.specification.formatWidthMm).toBe(210);
        expect(interp.specification.formatHeightMm).toBe(270);
        expect(interp.specification.interiorPages).toBe(200);
        expect(interp.specification.family).toBe('HARDCOVER');
        expect(interp.warnings).toContain('PROBABLE_TYPO_HANDCOVER');
        expect(interp.specification.boardThicknessMm).toBe(2.4);
        expect(interp.specification.lamination).toBe('gloss');
        expect(interp.specification.deliveryCountry).toBe('DE');
    });

    it('3. Adapts extracted specifications to canonical BPE bookSpec and passes calibrationSessionService.validateBookSpec', () => {
        const sampleOffer = {
            family: 'HARDCOVER' as const,
            productTitle: 'Hardcover 640 Seiten',
            quoteRef: 'REF-2026-640',
            evidenceId: 'doc-640',
            formatWidthMm: 170,
            formatHeightMm: 240,
            interiorPages: 640,
            interiorPaper: 'G-Print 115g',
            interiorWeightGsm: 115,
            interiorColors: '4/4',
            coverPaper: 'Silk 130g',
            coverWeightGsm: 130,
            coverColors: '4/0',
            bindingMethod: 'thread sewn' as const,
            lamination: 'matt' as const,
            boardThicknessMm: 2.0,
            hasEndpapers: true,
            endpaperPaper: 'Offset 170g',
            deliveryCountry: 'DE',
            currency: 'EUR',
            runs: []
        };

        const targetRun = {
            id: 'run-1',
            quantity: 200,
            manufacturingPrice: 4399,
            transportPrice: 350,
            quotedTotalPrice: 4749,
            quotedUnitPrice: 23.75,
            validationStatus: 'CONSISTENT' as const
        };

        const result = canonicalizeToEngineBookSpec(sampleOffer, targetRun);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.bookSpec).toBeDefined();

        // Pass directly to the REAL backend validation service
        const backendValidation = calibrationService.validateBookSpec(result.bookSpec);
        expect(backendValidation.valid).toBe(true);
        expect(backendValidation.errors).toEqual([]);

        // Invariants
        expect(result.bookSpec.copies).toBe(200);
        expect(result.bookSpec.interior_pages).toBe(640);
        expect(result.bookSpec.book_width_mm).toBe(170);
        expect(result.bookSpec.book_height_mm).toBe(240);
        expect(result.bookSpec.interior_print).toBe('4/4');
        expect(result.bookSpec.cover_print).toBe('4/0');
        expect(result.bookSpec.paper_type_interior).toBe('mc');
        expect(result.bookSpec.paper_weight_interior).toBe(115);
        expect(result.bookSpec.paper_type_cover).toBe('mc');
        expect(result.bookSpec.paper_weight_cover).toBe(130);
        expect(result.bookSpec.binding_method).toBe('thread sewn');
        expect(result.bookSpec.lamination).toBe('matt');
        expect(result.bookSpec.delivery_country).toBe('DE');
        expect(result.bookSpec.evidenceId).toBe('REF-2026-640');
        expect(result.bookSpec.selectedVariantId).toBe('run-1');
    });

    it('4. Rejects incomplete bookSpec with explicit error list rather than failing silently', () => {
        const incompleteOffer = {
            family: 'HARDCOVER' as const,
            productTitle: 'Incomplete Quote'
        };
        const invalidRun = {
            id: 'run-x',
            quantity: 0
        };

        const result = canonicalizeToEngineBookSpec(incompleteOffer, invalidRun);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors).toContain('copies must be a positive integer');
        expect(result.errors).toContain('interior_pages must be a positive integer');
    });

    it('5. Strictly isolates manufacturing price from transport and never conflates or averages runs', () => {
        const sampleOffer = {
            family: 'SOFTCOVER' as const,
            productTitle: 'Softcover Test',
            widthMm: 210,
            heightMm: 297,
            interiorPages: 120,
            interiorColors: '1/1',
            coverColors: '4/0',
            interiorPaper: 'Offset 80g',
            interiorWeightGsm: 80,
            coverPaper: 'Cartulina 250g',
            coverWeightGsm: 250,
            bindingMethod: 'perfect bound' as const,
            deliveryCountry: 'ES',
            runs: []
        };

        const targetRun = {
            id: 'run-selected',
            quantity: 1500,
            manufacturingPrice: 5799,
            transportPrice: 535,
            quotedTotalPrice: 6334,
            quotedUnitPrice: 4.22
        };

        const canonical = canonicalizeToEngineBookSpec(sampleOffer, targetRun);
        expect(canonical.valid).toBe(true);
        expect(canonical.targetManufacturingPrice).toBe(5799); // Manufacturing ONLY
        expect(canonical.targetManufacturingPrice).not.toBe(6334); // NOT total
        expect(canonical.bookSpec?.copies).toBe(1500); // Selected run quantity ONLY
        expect(canonical.bookSpec?.copies).not.toBe(1000); // NEVER fallback 1000
        expect(canonical.targetManufacturingPrice).not.toBe(1250); // NEVER fallback 1250
    });

    it('6. Does not invent missing mandatory fields and reports explicit error list', () => {
        const specWithMissingDimensions = {
            family: 'HARDCOVER' as const,
            productTitle: 'Missing Dimensions',
            interiorPages: 64,
            interiorColors: '4/4',
            coverColors: '4/0',
            interiorWeightGsm: 90,
            coverWeightGsm: 250,
            bindingMethod: 'thread sewn' as const,
            deliveryCountry: 'DE'
        };

        const run = {
            id: 'run-1',
            quantity: 500,
            manufacturingPrice: 2000
        };

        const result = canonicalizeToEngineBookSpec(specWithMissingDimensions, run);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('book_width_mm must be between 50 and 500');
        expect(result.errors).toContain('book_height_mm must be between 50 and 700');
    });
});
