/**
 * @vitest-environment node
 *
 * tests/smoke_phase193h8c611353_casing_sewing_separation.test.ts
 *
 * Focused regression tests for:
 * 1. Hardcover + thread sewn includes each required operation (block sewing + casing) exactly once.
 * 2. Changing sewing rates changes the total when sewing is separately priced.
 * 3. Softcover thread sewn does not acquire hardcover assembly costs.
 * 4. Missing required rates cannot yield a complete estimate (fail-closed gating).
 * 5. Document B retains interior 130 gsm and cover 115 gsm through extraction and adapter.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const adapter = require('../src/api/services/buildPriceCalibrationAdapter');
const pdfService = require('../src/api/services/pdfQuoteExtractionService');
const interpService = require('../src/api/services/quoteDocumentInterpretationService');

describe('Hardcover Casing vs Block Sewing Separation & Doc B Weight Preservation', () => {

    // Base synthetic rate set with controlled non-zero values
    const createSyntheticRates = (overrides = {}) => {
        const rates = {
            interior_4_colour_fixed: { '16p': 50 },
            interior_4_colour_var: { '16p': 5 },
            cover_fixed_by_colours: { '4': 30 },
            cover_var_per_1000_by_colours: { '4': 20 },
            paper_price_interior_by_kilo: { mc: 1.5 },
            paper_price_cover_by_kilo: { mc: 2.0 },
            binding_hc_fixed_by_sections: { '13': 40.0 },
            binding_hc_var_per_1000_by_sections: { '13': 15.0 },
            binding_ts_fixed_by_sections: { '13': 60.0 },
            binding_ts_var_per_1000_by_sections: { '13': 25.0 },
            binding_pb_fixed_by_sections: { '13': 20.0 },
            binding_pb_var_per_1000_by_sections: { '13': 10.0 },
            paper_price_endpaper_by_kilo: { offset: 2.5 },
            paper_endpapers_fixed_by_colours: { one: 10 },
            paper_endpapers_var_per_1000_by_colours: { one: 5 },
            transport_first_box_cost: 0,
            transport_additional_box_cost: 0,
            max_weight_per_box: 100000
        };

        // Deep merge overrides
        for (const [k, v] of Object.entries(overrides)) {
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                rates[k] = { ...(rates[k] || {}), ...v };
            } else {
                rates[k] = v;
            }
        }
        return rates;
    };

    const baseHardcoverSpec = {
        interior_pages: 200,
        book_width_mm: 210,
        book_height_mm: 270,
        interior_print: '4/4',
        cover_print: '4/0',
        paper_type_interior: 'mc',
        paper_weight_interior: 130,
        paper_type_cover: 'mc',
        paper_weight_cover: 115,
        family: 'HARDCOVER',
        construction: 'hardcover',
        block_binding_method: 'thread sewn',
        binding_method: 'hardcover',
        board_thickness_mm: 2.4,
        lamination: null,
        endpapers: true,
        endpaper_provenance: 'user_supplied',
        paper_type_endpaper: 'offset',
        paper_weight_endpapers: 140,
        endpapers_print: '0/0',
        delivery_country: 'DE',
        copies: 1000
    };

    it('1. Hardcover + thread sewn prices each required operation exactly once (independent formula assertion)', () => {
        const rates = createSyntheticRates();
        const res = adapter.evaluateForwardPrice(baseHardcoverSpec, rates, {}, { signatureSize: 16 });

        // Expected independently:
        // sections = 13
        // copies = 1000 -> ceil(1000/1000) = 1 thousand
        // Sewing: fixed (60.0) + 1 * var (25.0) = 85.00 EUR
        // Casing: fixed (40.0) + 1 * var (15.0) = 55.00 EUR
        // Total binding = 85.00 + 55.00 = 140.00 EUR
        const expectedSewing = 60.0 + 1 * 25.0; // 85.00
        const expectedCasing = 40.0 + 1 * 15.0; // 55.00
        const expectedTotalBinding = expectedSewing + expectedCasing; // 140.00

        expect(res.sections).toBe(13);
        expect(res.debug.components.cost_sewing).toBeCloseTo(expectedSewing, 2);
        expect(res.debug.components.cost_casing).toBeCloseTo(expectedCasing, 2);
        expect(res.debug.components.cost_binding).toBeCloseTo(expectedTotalBinding, 2);
        expect(res.debug.components.cost_block_binding).toBeCloseTo(expectedSewing, 2);

        // Lines breakdown inspection
        const lineNames = res.lines.map((l: any) => l.item);
        expect(lineNames).toContain('Block binding (thread sewn)');
        expect(lineNames).toContain('Hardcover casing');

        const blockLine = res.lines.find((l: any) => l.item === 'Block binding (thread sewn)');
        const casingLine = res.lines.find((l: any) => l.item === 'Hardcover casing');
        expect(blockLine.line_total).toBeCloseTo(expectedSewing, 2);
        expect(casingLine.line_total).toBeCloseTo(expectedCasing, 2);
    });

    it('2. Changing sewing rates strictly changes total binding and manufacturing price by the exact expected delta', () => {
        const initialRates = createSyntheticRates();
        const resInitial = adapter.evaluateForwardPrice(baseHardcoverSpec, initialRates, {}, { signatureSize: 16 });

        // Increase sewing variable rate from 25.0 to 45.0 per 1000 (+20 EUR for 1000 copies)
        const modifiedRates = createSyntheticRates({
            binding_ts_var_per_1000_by_sections: { '13': 45.0 }
        });
        const resModified = adapter.evaluateForwardPrice(baseHardcoverSpec, modifiedRates, {}, { signatureSize: 16 });

        const expectedDelta = (45.0 - 25.0) * 1; // +20.00 EUR
        const actualBindingDelta = resModified.debug.components.cost_binding - resInitial.debug.components.cost_binding;
        const actualMfgDelta = resModified.predictedManufacturingPrice - resInitial.predictedManufacturingPrice;

        expect(actualBindingDelta).toBeCloseTo(expectedDelta, 2);
        expect(actualMfgDelta).toBeCloseTo(expectedDelta, 2);
        expect(resModified.debug.components.cost_casing).toBeCloseTo(resInitial.debug.components.cost_casing, 2);
    });

    it('3. Softcover thread sewn does NOT acquire hardcover assembly/casing costs', () => {
        const rates = createSyntheticRates();
        const softcoverSpec = {
            ...baseHardcoverSpec,
            family: 'PAPERBACK',
            construction: 'softcover',
            binding_method: 'thread sewn',
            block_binding_method: 'thread sewn',
            endpapers: false
        };

        const res = adapter.evaluateForwardPrice(softcoverSpec, rates, {}, { signatureSize: 16 });

        // Expected independently:
        // Sewing: fixed (60.0) + 1 * var (25.0) = 85.00 EUR
        // Casing: 0 EUR (softcover has no hardcover casing)
        // Total binding: 85.00 EUR
        expect(res.debug.components.cost_casing).toBe(0);
        expect(res.debug.components.cost_sewing).toBeCloseTo(85.00, 2);
        expect(res.debug.components.cost_binding).toBeCloseTo(85.00, 2);

        const lineNames = res.lines.map((l: any) => l.item);
        expect(lineNames).not.toContain('Hardcover casing');
    });

    it('4. Missing required rates (sewing, casing, endpapers) produce an incomplete/blocked estimate', () => {
        // A. Missing sewing rates for hardcover thread sewn
        const ratesNoSewing = createSyntheticRates({
            binding_ts_fixed_by_sections: { '13': 0 },
            binding_ts_var_per_1000_by_sections: { '13': 0 }
        });
        const resNoSewing = adapter.evaluateForwardPrice(baseHardcoverSpec, ratesNoSewing, {}, { signatureSize: 16 });
        expect(resNoSewing.isCompleteEstimate).toBe(false);
        expect(resNoSewing.missingComponents).toContain('sewing');

        // B. Missing casing rates for hardcover
        const ratesNoCasing = createSyntheticRates({
            binding_hc_fixed_by_sections: { '13': 0 },
            binding_hc_var_per_1000_by_sections: { '13': 0 }
        });
        const resNoCasing = adapter.evaluateForwardPrice(baseHardcoverSpec, ratesNoCasing, {}, { signatureSize: 16 });
        expect(resNoCasing.isCompleteEstimate).toBe(false);
        expect(resNoCasing.missingComponents).toContain('hardcover_casing');

        // C. Missing endpaper paper rate
        const ratesNoEndpaper = createSyntheticRates({
            paper_price_endpaper_by_kilo: { offset: 0 }
        });
        const resNoEndpaper = adapter.evaluateForwardPrice(baseHardcoverSpec, ratesNoEndpaper, {}, { signatureSize: 16 });
        expect(resNoEndpaper.isCompleteEstimate).toBe(false);
        expect(resNoEndpaper.missingComponents).toContain('endpaper_paper');
    });

    it('5. Document B retains interior 130 gsm and cover 115 gsm across extraction and adapter', async () => {
        const BILDBAND_PDF_PATH = path.resolve(__dirname, 'fixtures/sample_bildband_200p_quote.pdf');
        expect(fs.existsSync(BILDBAND_PDF_PATH)).toBe(true);

        const buf = fs.readFileSync(BILDBAND_PDF_PATH);
        const extraction = await pdfService.extractPdfQuote(buf, 'sample_bildband_200p_quote.pdf');
        expect(extraction.status).toBe('SUCCESS');

        const interp = interpService.interpretDocument(extraction);
        expect(interp.ok).toBe(true);

        // Verification of extracted values from PDF
        expect(interp.specification.interiorWeightGsm).toBe(130);
        expect(interp.specification.coverWeightGsm).toBe(115);
        expect(interp.specification.interiorPaper).toBe('Matt');
        expect(interp.specification.coverPaper).toBe('Silk');
        expect(interp.specification.boardThicknessMm).toBe(2.4);
        expect(interp.specification.bindingMethod).toBe('thread sewn');

        // Endpapers in original PDF are unspecified (not extracted with weights/types)
        expect(interp.specification.paperTypeEndpaper).toBeUndefined();
        expect(interp.specification.paperWeightEndpapers).toBeUndefined();

        // Pass through adapter
        const adapted = adapter.adaptBookSpec({
            interior_pages: interp.specification.interiorPages,
            book_width_mm: interp.specification.formatWidthMm,
            book_height_mm: interp.specification.formatHeightMm,
            interior_print: interp.specification.interiorColors,
            cover_print: interp.specification.coverColors,
            paper_type_interior: 'mc',
            paper_weight_interior: interp.specification.interiorWeightGsm,
            paper_type_cover: 'mc',
            paper_weight_cover: interp.specification.coverWeightGsm,
            family: interp.specification.family,
            construction: 'hardcover',
            block_binding_method: interp.specification.bindingMethod,
            binding_method: 'hardcover',
            board_thickness_mm: interp.specification.boardThicknessMm,
            lamination: interp.specification.lamination,
            endpapers: true,
            endpaper_provenance: 'user_supplied',
            paper_type_endpaper: 'offset',
            paper_weight_endpapers: 140,
            endpapers_print: '0/0',
            delivery_country: 'DE'
        }, { signatureSize: 16 });

        expect(adapted.paperWeightInterior).toBe(130);
        expect(adapted.paperWeightCover).toBe(115);
        expect(adapted.isHardcover).toBe(true);
        expect(adapted.blockBindingMethod).toBe('thread sewn');
        expect(adapted.blockBindingCode).toBe('ts');
        expect(adapted.endpaperProvenance).toBe('user_supplied');
    });
});
