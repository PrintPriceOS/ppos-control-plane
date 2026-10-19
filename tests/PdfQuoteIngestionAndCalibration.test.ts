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
    const HARDCOVER_PDF_PATH = path.resolve(__dirname, 'fixtures/sample_hardcover_640p_quote.pdf');
    const BILDBAND_PDF_PATH = path.resolve(__dirname, 'fixtures/sample_bildband_200p_quote.pdf');

    it('1. Extracts 3 distinct runs and technical specification from sample_hardcover_640p_quote.pdf', async () => {
        expect(fs.existsSync(HARDCOVER_PDF_PATH)).toBe(true);
        const buf = fs.readFileSync(HARDCOVER_PDF_PATH);
        const extraction = await pdfService.extractPdfQuote(buf, 'sample_hardcover_640p_quote.pdf');
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
        expect(interp.specification.endpaperPaper).toContain('Offset');
        expect(interp.specification.endpaperWeightGsm).toBe(170);
        expect(interp.specification.endpaperColors).toBe('0/0');
        expect(interp.specification.deliveryCountry).toBe('DE');
    });

    it('2. Extracts 3 distinct runs and flags "Handcover" typo as HARDCOVER warning in sample_bildband_200p_quote.pdf', async () => {
        expect(fs.existsSync(BILDBAND_PDF_PATH)).toBe(true);
        const buf = fs.readFileSync(BILDBAND_PDF_PATH);
        const extraction = await pdfService.extractPdfQuote(buf, 'sample_bildband_200p_quote.pdf');
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

    it('3. Encadenado Documento A: PDF -> extractor -> interpretador -> estado oferta -> canonicalizador -> validador backend', async () => {
        expect(fs.existsSync(HARDCOVER_PDF_PATH)).toBe(true);
        const buf = fs.readFileSync(HARDCOVER_PDF_PATH);
        const extraction = await pdfService.extractPdfQuote(buf, 'sample_hardcover_640p_quote.pdf');
        expect(extraction.status).toBe('SUCCESS');

        const interp = interpService.interpretDocument(extraction);
        expect(interp.ok).toBe(true);
        expect(interp.offers).toHaveLength(3);

        const spec = interp.specification;
        // Build real offer state exactly as UI does
        const realOfferState = {
            family: spec.family,
            productTitle: interp.printhouseName,
            quoteRef: 'DOC-A-EVIDENCE',
            evidenceId: 'DOC-A-EVIDENCE',
            widthMm: spec.formatWidthMm,
            heightMm: spec.formatHeightMm,
            formatWidthMm: spec.formatWidthMm,
            formatHeightMm: spec.formatHeightMm,
            interiorPages: spec.interiorPages,
            interiorPaper: spec.interiorPaper,
            interiorWeightGsm: spec.interiorWeightGsm,
            interiorColors: spec.interiorColors,
            coverPaper: spec.coverPaper,
            coverWeightGsm: spec.coverWeightGsm,
            coverColors: spec.coverColors,
            boardThicknessMm: spec.boardThicknessMm,
            bindingMethod: spec.bindingMethod,
            spineType: spec.spineType,
            lamination: spec.lamination,
            hasEndpapers: spec.hasEndpapers,
            endpaperPaper: spec.endpaperPaper,
            endpaperWeightGsm: spec.endpaperWeightGsm,
            endpaperColors: spec.endpaperColors,
            deliveryCountry: spec.deliveryCountry,
            currency: 'EUR',
            runs: interp.offers
        };

        // Test each of the three runs
        const expectedQuantities = [200, 300, 500];
        const expectedMfgPrices = [4399, 4765, 5493];
        const expectedTransports = [350, 350, 450];

        for (let i = 0; i < interp.offers.length; i++) {
            const run = interp.offers[i];
            expect(run.quantity).toBe(expectedQuantities[i]);
            expect(run.manufacturingPrice).toBe(expectedMfgPrices[i]);
            expect(run.transportPrice).toBe(expectedTransports[i]);

            const canonical = canonicalizeToEngineBookSpec(realOfferState, run);
            expect(canonical.valid).toBe(true);
            expect(canonical.errors).toEqual([]);
            expect(canonical.targetManufacturingPrice).toBe(expectedMfgPrices[i]);
            expect(canonical.bookSpec?.copies).toBe(expectedQuantities[i]);
            expect(canonical.bookSpec?.paper_type_endpaper).toBe('offset');
            expect(canonical.bookSpec?.paper_weight_endpapers).toBe(170); // Preserves real 170g without 140g fallback
            expect(canonical.bookSpec?.endpapers_print).toBe(null); // Unprinted 0/0 correctly omitted/null in taxonomy

            // Run real backend validator
            const backendCheck = calibrationService.validateBookSpec(canonical.bookSpec);
            expect(backendCheck.valid).toBe(true);
            expect(backendCheck.errors).toEqual([]);
        }
    });

    it('4. Encadenado Documento B: PDF -> extractor -> interpretador -> estado oferta -> canonicalizador -> validador backend', async () => {
        expect(fs.existsSync(BILDBAND_PDF_PATH)).toBe(true);
        const buf = fs.readFileSync(BILDBAND_PDF_PATH);
        const extraction = await pdfService.extractPdfQuote(buf, 'sample_bildband_200p_quote.pdf');
        expect(extraction.status).toBe('SUCCESS');

        const interp = interpService.interpretDocument(extraction);
        expect(interp.ok).toBe(true);
        expect(interp.offers).toHaveLength(3);

        const spec = interp.specification;
        const realOfferState = {
            family: spec.family,
            productTitle: interp.printhouseName,
            quoteRef: 'DOC-B-EVIDENCE',
            evidenceId: 'DOC-B-EVIDENCE',
            widthMm: spec.formatWidthMm,
            heightMm: spec.formatHeightMm,
            formatWidthMm: spec.formatWidthMm,
            formatHeightMm: spec.formatHeightMm,
            interiorPages: spec.interiorPages,
            interiorPaper: spec.interiorPaper,
            interiorWeightGsm: spec.interiorWeightGsm,
            interiorColors: spec.interiorColors,
            coverPaper: spec.coverPaper,
            coverWeightGsm: spec.coverWeightGsm,
            coverColors: spec.coverColors,
            boardThicknessMm: spec.boardThicknessMm,
            bindingMethod: spec.bindingMethod,
            spineType: spec.spineType,
            lamination: spec.lamination,
            deliveryCountry: spec.deliveryCountry,
            currency: 'EUR',
            runs: interp.offers
        };

        const expectedQuantities = [1500, 2000, 2500];
        const expectedMfgPrices = [5799, 6886, 8042];
        const expectedTransports = [535, 535, 635];

        for (let i = 0; i < interp.offers.length; i++) {
            const run = interp.offers[i];
            expect(run.quantity).toBe(expectedQuantities[i]);
            expect(run.manufacturingPrice).toBe(expectedMfgPrices[i]);
            expect(run.transportPrice).toBe(expectedTransports[i]);

            const canonical = canonicalizeToEngineBookSpec(realOfferState, run);
            expect(canonical.valid).toBe(true);
            expect(canonical.errors).toEqual([]);
            expect(canonical.targetManufacturingPrice).toBe(expectedMfgPrices[i]);
            expect(canonical.bookSpec?.copies).toBe(expectedQuantities[i]);

            // Run real backend validator
            const backendCheck = calibrationService.validateBookSpec(canonical.bookSpec);
            expect(backendCheck.valid).toBe(true);
            expect(backendCheck.errors).toEqual([]);
        }
    });

    // ── Regresiones individuales de no invención por defecto ──
    it('5. Regresión: Papel interior ausente o desconocido no se inventa como mc y produce error', () => {
        const spec = {
            widthMm: 170,
            heightMm: 240,
            interiorPages: 100,
            interiorColors: '4/4',
            coverColors: '4/0',
            interiorWeightGsm: 100,
            coverWeightGsm: 250,
            coverPaper: 'Silk',
            bindingMethod: 'thread sewn' as const,
            deliveryCountry: 'DE'
        };
        const run = { quantity: 1000, manufacturingPrice: 2000 };

        // 1. Ausente
        const resAbsent = canonicalizeToEngineBookSpec(spec, run);
        expect(resAbsent.valid).toBe(false);
        expect(resAbsent.errors.some(e => e.includes('paper_type_interior is required'))).toBe(true);

        // 2. Desconocido
        const resUnknown = canonicalizeToEngineBookSpec({ ...spec, interiorPaper: 'MaterialFantasmaNoExiste' }, run);
        expect(resUnknown.valid).toBe(false);
        expect(resUnknown.errors.some(e => e.includes('paper_type_interior is required'))).toBe(true);
    });

    it('6. Regresión: Gramaje interior o de cubierta ausente no se inventa como 90g / 250g y produce error', () => {
        const spec = {
            widthMm: 170,
            heightMm: 240,
            interiorPages: 100,
            interiorPaper: 'Silk',
            interiorColors: '4/4',
            coverPaper: 'Silk',
            coverColors: '4/0',
            bindingMethod: 'thread sewn' as const,
            deliveryCountry: 'DE'
        };
        const run = { quantity: 1000, manufacturingPrice: 2000 };

        // Sin gramajes
        const res = canonicalizeToEngineBookSpec(spec, run);
        expect(res.valid).toBe(false);
        expect(res.errors).toContain('paper_weight_interior must be between 40 and 400');
        expect(res.errors).toContain('paper_weight_cover must be between 100 and 600');
    });

    it('7. Regresión: Tintas interiores o de cubierta ausentes no se inventan como 4/4 o 4/0 y producen error', () => {
        const spec = {
            widthMm: 170,
            heightMm: 240,
            interiorPages: 100,
            interiorPaper: 'Silk',
            interiorWeightGsm: 115,
            coverPaper: 'Silk',
            coverWeightGsm: 250,
            bindingMethod: 'thread sewn' as const,
            deliveryCountry: 'DE'
        };
        const run = { quantity: 1000, manufacturingPrice: 2000 };

        const res = canonicalizeToEngineBookSpec(spec, run);
        expect(res.valid).toBe(false);
        expect(res.errors.some(e => e.includes('interior_print must be one of'))).toBe(true);
        expect(res.errors.some(e => e.includes('cover_print must be one of'))).toBe(true);
    });

    it('8. Regresión: Encuadernación ausente no se asume por familia Hardcover ni por defecto', () => {
        const spec = {
            family: 'HARDCOVER' as const,
            widthMm: 170,
            heightMm: 240,
            interiorPages: 100,
            interiorPaper: 'Silk',
            interiorWeightGsm: 115,
            coverPaper: 'Silk',
            coverWeightGsm: 250,
            interiorColors: '4/4',
            coverColors: '4/0',
            deliveryCountry: 'DE'
            // Sin bindingMethod explícito
        };
        const run = { quantity: 1000, manufacturingPrice: 2000 };

        const res = canonicalizeToEngineBookSpec(spec, run);
        expect(res.valid).toBe(false);
        expect(res.errors.some(e => e.includes('binding_method must be one of'))).toBe(true);
    });

    it('9. Regresión: País de entrega ausente o inválido no se asume como DE y produce error', () => {
        const spec = {
            widthMm: 170,
            heightMm: 240,
            interiorPages: 100,
            interiorPaper: 'Silk',
            interiorWeightGsm: 115,
            coverPaper: 'Silk',
            coverWeightGsm: 250,
            interiorColors: '4/4',
            coverColors: '4/0',
            bindingMethod: 'thread sewn' as const
            // Sin deliveryCountry
        };
        const run = { quantity: 1000, manufacturingPrice: 2000 };

        const resAbsent = canonicalizeToEngineBookSpec(spec, run);
        expect(resAbsent.valid).toBe(false);
        expect(resAbsent.errors).toContain('delivery_country must be a valid ISO-2 uppercase country code (e.g. ES, DE, FR)');

        const resInvalid = canonicalizeToEngineBookSpec({ ...spec, deliveryCountry: 'GERMANY_INVALID' }, run);
        expect(resInvalid.valid).toBe(false);
        expect(resInvalid.errors).toContain('delivery_country must be a valid ISO-2 uppercase country code (e.g. ES, DE, FR)');
    });
});
