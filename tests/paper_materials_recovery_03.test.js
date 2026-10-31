/**
 * tests/paper_materials_recovery_03.test.js
 *
 * PrintPrice OS — MISIÓN PAPER-MATERIALS-RECOVERY-03 (Phase 9):
 * Comprehensive Unit & Regression Test Suite for Paper Materials Technical Attribute Recovery:
 *
 * 1. Multilingual ODS normalization dictionary (`krītots`, `nekrītots`, `vienpus. krītots`,
 *    `Matt`, `Silk`, `Gloss`, `pusglancēts`, `dizaina`, `kartons`, `GC1`, `GC2`, `Kappa`).
 * 2. Strict invariant enforcement:
 *    - Never equate `Paper Type = Matt` with `Coating = COATED` when `COAT = nekrītots`
 *      (e.g., `LuxCream 1.8`, `Munken Polar 240`, `Munken Pure Rough 100`).
 *    - Detect when `PAPER TYPE = Silk` in ODS actually contains a `GLOSS` paper (`Galerie Art Gloss`, `Maxi Gloss`).
 *    - Never default missing coating or finish to `UNCOATED`.
 *    - Never infer `grain_direction` (`LONG_GRAIN`/`SHORT_GRAIN`) from sheet dimensions (`width_mm` vs `height_mm`).
 * 3. Deterministic reconciliation classification across all 1,524 production variants:
 *    - `SAFE_UNIQUE_MATCH` (943)
 *    - `STRONG_MATCH_REVIEW` (501)
 *    - `AMBIGUOUS_MATCH` (16)
 *    - `ATTRIBUTE_CONFLICT` (62)
 *    - `ALREADY_VERIFIED` (2)
 *    - `UNMATCHED` (0)
 * 4. Root-cause elimination of `UNKNOWN · UNCOATED`:
 *    - `resolveVariantTechnicalAttributes` resolves ODS metadata and strips synthetic `UNCOATED` defaults on `OTHER` rows.
 * 5. Spine Calculator & BPE compatibility regression:
 *    - Calipers (`caliper_um`, `caliper_source`, `caliper_confidence_status`) and BPE substrate resolution remain 100% intact.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { parseOdsBuffer, normalizeRowData } = require('../src/api/services/paperImportService');
const {
    CANONICAL_PAPER_TYPES,
    CANONICAL_COATING_STATUSES,
    CANONICAL_FINISHES,
    CANONICAL_GRAIN_DIRECTIONS,
    RECONCILIATION_CLASSIFICATIONS,
    decodeOdsCellText,
    normalizeOdsDimensionToMm,
    normalizeGrainDirectionToken,
    normalizeSupplierProviser,
    normalizeMultilingualPaperAttributes,
    resolveVariantTechnicalAttributes,
    reconcileVariantsWithOdsSource
} = require('../src/api/services/paperMaterialsNormalizationService');
const { evaluateVariantCaliperReconciliation, resolveVariantCaliperProvenance } = require('../src/api/services/spine/paperCaliperReconciliationService');

describe('PAPER-MATERIALS-RECOVERY-03 — Multilingual Normalization & Deterministic Reconciliation', () => {
    describe('1. Multilingual Normalization Dictionary (LV / EN / DE / ES)', () => {
        it('normalizes explicit Latvian coated & uncoated markers accurately', () => {
            const coatedSilk = normalizeMultilingualPaperAttributes({
                name: 'G-Print 100 70x100 FSC',
                paperType: 'Matt',
                coat: 'krītots',
                code: 'GP100',
                proviser: 'Papyrus DEF'
            });
            expect(coatedSilk.paperType).toBe('COATED');
            expect(coatedSilk.coatingStatus).toBe('COATED');
            expect(coatedSilk.coatingConfidence).toBe('EXPLICIT_SOURCE');
            expect(coatedSilk.finish).toBe('MATT');
            expect(coatedSilk.grainDirection).toBe('UNKNOWN');
            expect(coatedSilk.supplierCodeNormalized).toBe('PAPYRUS');

            const uncoatedOffset = normalizeMultilingualPaperAttributes({
                name: 'Amber Graphic 100 64x90',
                paperType: 'Ofset',
                coat: 'nekrītots',
                code: 'AG100',
                proviser: 'Antalis DEF'
            });
            expect(uncoatedOffset.paperType).toBe('OFFSET');
            expect(uncoatedOffset.coatingStatus).toBe('UNCOATED');
            expect(uncoatedOffset.coatingConfidence).toBe('EXPLICIT_SOURCE');
            expect(uncoatedOffset.finish).toBe('UNCOATED');
            expect(uncoatedOffset.grainDirection).toBe('UNKNOWN');
            expect(uncoatedOffset.supplierCodeNormalized).toBe('ANTALIS');
        });

        it('normalizes one-side coated markers (vienpus. krītots, Krītots 1s, GC1)', () => {
            const gc1 = normalizeMultilingualPaperAttributes({
                name: 'Invercote G 240 70x100',
                paperType: 'Kartons',
                coat: 'GC1',
                proviser: 'Papyrus DEF'
            });
            expect(gc1.paperType).toBe('CARTON');
            expect(gc1.coatingStatus).toBe('ONE_SIDE_COATED');

            const vienpus = normalizeMultilingualPaperAttributes({
                name: 'Chromolux 700 250g 70x100',
                paperType: 'Kartons',
                coat: 'vienpus. krītots',
                proviser: 'Antalis DEF'
            });
            expect(vienpus.paperType).toBe('CARTON');
            expect(vienpus.coatingStatus).toBe('ONE_SIDE_COATED');

            const kritots1s = normalizeMultilingualPaperAttributes({
                name: 'Ensocoat 1s 275 70x100',
                paperType: 'Kartons',
                coat: 'Krītots 1s',
                proviser: 'Polap DEF'
            });
            expect(kritots1s.paperType).toBe('CARTON');
            expect(kritots1s.coatingStatus).toBe('ONE_SIDE_COATED');
        });

        it('normalizes semi-gloss (pusglancēts / semigloss) and Kappa greyboard', () => {
            const semiGloss = normalizeMultilingualPaperAttributes({
                name: 'Raflatac Pusglancēts 80g',
                paperType: 'Dizaina',
                coat: 'pusglancēts',
                proviser: 'Antalis DEF'
            });
            expect(semiGloss.coatingStatus).toBe('COATED');
            expect(semiGloss.finish).toBe('SEMI_GLOSS');

            const kappa = normalizeMultilingualPaperAttributes({
                name: 'Luxline 2.0mm 70x100',
                paperType: 'Kappa',
                coat: '',
                proviser: 'Polap DEF'
            });
            expect(kappa.paperType).toBe('CARTON');
            expect(kappa.coatingStatus).toBe('UNCOATED');
            expect(kappa.finish).toBe('UNCOATED');
        });
    });

    describe('2. Strict Industrial Invariants (No Hallucinations or Silent Fallbacks)', () => {
        it('NEVER equates Paper Type = Matt with Coating = COATED when COAT = nekrītots', () => {
            const luxCream = normalizeMultilingualPaperAttributes({
                name: 'LuxCream 1.8 90g 64x90',
                paperType: 'Matt',
                coat: 'nekrītots',
                proviser: 'Polap DEF'
            });
            expect(luxCream.coatingStatus).toBe('UNCOATED');
            expect(luxCream.finish).toBe('UNCOATED');
            expect(luxCream.paperType).toBe('OFFSET');
            expect(luxCream.flags).toContain('SOURCE_TYPE_MATT_WITH_NEKRITOTS_COAT');

            const munkenPolar = normalizeMultilingualPaperAttributes({
                name: 'Munken Polar 240 72x102 FSC',
                paperType: 'Matt',
                coat: 'nekrītots',
                proviser: 'Antalis DEF'
            });
            expect(munkenPolar.coatingStatus).toBe('UNCOATED');
            expect(munkenPolar.finish).toBe('UNCOATED');
            expect(munkenPolar.paperType).toBe('DESIGN');
            expect(munkenPolar.flags).toContain('SOURCE_TYPE_MATT_WITH_NEKRITOTS_COAT');
        });

        it('detects when PAPER TYPE = Silk in ODS contains a GLOSS product name', () => {
            const galerieGloss = normalizeMultilingualPaperAttributes({
                name: 'Galerie Art Gloss 150 70x100 FSC',
                paperType: 'Silk',
                coat: 'krītots',
                proviser: 'Antalis DEF'
            });
            expect(galerieGloss.paperType).toBe('COATED');
            expect(galerieGloss.coatingStatus).toBe('COATED');
            expect(galerieGloss.finish).toBe('GLOSS');
            expect(galerieGloss.flags).toContain('PT_SILK_WITH_GLOSS_PRODUCT_NAME');
        });

        it('flags conflict when PAPER TYPE = Matt has COAT = silk (Arctic Volume rows)', () => {
            const arcticConflict = normalizeMultilingualPaperAttributes({
                name: 'Arctic Volume ice 130 72x102 FSC',
                paperType: 'Matt',
                coat: 'silk',
                proviser: 'Antalis DEF'
            });
            expect(arcticConflict.flags).toContain('PT_MATT_WITH_COAT_SILK_CONFLICT');
        });

        it('NEVER defaults missing coating/finish to UNCOATED when evidence is absent or Jautāt', () => {
            const unknownRow = normalizeMultilingualPaperAttributes({
                name: 'Custom Unverified Substrate 250g 70x100',
                paperType: '',
                coat: '',
                proviser: ''
            });
            expect(unknownRow.coatingStatus).toBe('UNKNOWN');
            expect(unknownRow.finish).toBe('UNKNOWN');

            const jautatRow = normalizeMultilingualPaperAttributes({
                name: 'Reacto 60 CFB White 43x61',
                paperType: 'Dizaina',
                coat: 'Jautāt',
                proviser: 'Antalis DEF'
            });
            expect(jautatRow.coatingStatus).toBe('UNKNOWN');
            expect(jautatRow.finish).toBe('UNKNOWN');
            expect(jautatRow.flags).toContain('AMBIGUOUS_COAT_VALUE:Jautāt');
        });

        it('NEVER infers grain_direction from sheet dimensions (70x100 vs 100x70)', () => {
            const sheet70x100 = normalizeMultilingualPaperAttributes({
                name: 'Amber Graphic 100 70x100',
                paperType: 'Ofset',
                coat: 'nekrītots'
            });
            const sheet100x70 = normalizeMultilingualPaperAttributes({
                name: 'Amber Graphic 100 100x70',
                paperType: 'Ofset',
                coat: 'nekrītots'
            });
            expect(sheet70x100.grainDirection).toBe('UNKNOWN');
            expect(sheet100x70.grainDirection).toBe('UNKNOWN');
            expect(normalizeGrainDirectionToken('LONG_GRAIN')).toBe('LONG_GRAIN');
            expect(normalizeGrainDirectionToken('SHORT_GRAIN')).toBe('SHORT_GRAIN');
            expect(normalizeGrainDirectionToken('')).toBe('UNKNOWN');
        });
    });

    describe('3. Root-Cause Elimination of UNKNOWN · UNCOATED in API & Catalog Resolution', () => {
        it('resolves explicit ods_materials_recovery metadata on SAFE_UNIQUE_MATCH variants', () => {
            const safeRecoveredVariantRow = {
                variant_id: 'var_test_arctic',
                product_id: 'prod_test_arctic',
                product_name: 'Arctic Volume White 115 70x100 FSC',
                category: 'COATED',
                finish_summary: 'MATT',
                finish: 'MATT',
                grain_direction: 'UNKNOWN',
                variant_metadata_json: {
                    original_code: '561234',
                    ods_materials_recovery: {
                        ods_paper_type: 'Matt',
                        ods_coat: 'krītots',
                        ods_code: '561234',
                        ods_provider: 'Antalis DEF',
                        paper_type: 'COATED',
                        coating_status: 'COATED',
                        coating_confidence: 'EXPLICIT_SOURCE',
                        finish: 'MATT'
                    }
                }
            };

            const resolved = resolveVariantTechnicalAttributes(safeRecoveredVariantRow);
            expect(resolved.paperType).toBe('COATED');
            expect(resolved.coatingStatus).toBe('COATED');
            expect(resolved.finish).toBe('MATT');
            expect(resolved.grainDirection).toBe('UNKNOWN');
            expect(resolved.originalCode).toBe('561234');
            expect(resolved.isSyntheticUncoatedResolved).toBe(true);
        });

        it('does NOT auto-convert excluded review/conflict rows (which only have ods_caliper_recovery) into verified attributes, while stripping synthetic OTHER + UNCOATED to UNKNOWN', () => {
            const excludedReviewRow = {
                variant_id: 'var_review_only',
                product_id: 'prod_review_only',
                product_name: 'Munken Polar 120 70x100',
                category: 'OTHER',
                finish_summary: 'UNCOATED',
                finish: 'UNCOATED',
                grain_direction: 'UNKNOWN',
                variant_metadata_json: {
                    original_code: 'MP120',
                    ods_caliper_recovery: {
                        ods_paper_type: 'Dizaina',
                        ods_coat: '',
                        ods_code: 'MP120',
                        ods_provider: 'Antalis DEF'
                    }
                }
            };

            const resolved = resolveVariantTechnicalAttributes(excludedReviewRow);
            expect(resolved.paperType).toBe('OTHER');
            expect(resolved.coatingStatus).toBe('UNKNOWN');
            expect(resolved.finish).toBe('UNKNOWN');
            expect(resolved.grainDirection).toBe('UNKNOWN');
            expect(resolved.originalCode).toBe('MP120');
            expect(resolved.isSyntheticUncoatedResolved).toBe(true);
        });

        it('converts unverified OTHER + UNCOATED + UNKNOWN rows without ODS evidence to UNKNOWN instead of claiming UNCOATED', () => {
            const unverifiedDefaultRow = {
                variant_id: 'var_unverified_1',
                product_id: 'prod_unverified_1',
                product_name: 'Mystery Board 300g 70x100',
                category: 'OTHER',
                finish_summary: 'UNCOATED',
                finish: 'UNCOATED',
                grain_direction: 'UNKNOWN',
                variant_metadata_json: {}
            };

            const resolved = resolveVariantTechnicalAttributes(unverifiedDefaultRow);
            expect(resolved.coatingStatus).toBe('UNKNOWN');
            expect(resolved.finish).toBe('UNKNOWN');
            expect(resolved.grainDirection).toBe('UNKNOWN');
            expect(resolved.isSyntheticUncoatedResolved).toBe(true);
        });

        it('preserves accredited demo variants with explicit LONG_GRAIN or SHORT_GRAIN', () => {
            const demoVariant = {
                variant_id: 'var_demo_1',
                product_id: 'prod_demo_1',
                product_name: 'Creator Silk 150g',
                category: 'COATED',
                finish_summary: 'SILK',
                finish: 'SILK',
                grain_direction: 'LONG_GRAIN',
                variant_metadata_json: {}
            };

            const resolved = resolveVariantTechnicalAttributes(demoVariant);
            expect(resolved.paperType).toBe('COATED');
            expect(resolved.coatingStatus).toBe('COATED');
            expect(resolved.finish).toBe('SILK');
            expect(resolved.grainDirection).toBe('LONG_GRAIN');
        });
    });

    describe('4. Full 1,524 Production Variants Reconciliation Matrix Verification', () => {
        const odsPath = 'C:/Users/KIKE/Downloads/Paper data base.ods.zip';
        const prodSnapshotPath = 'C:/Users/KIKE/.gemini/antigravity/brain/4eb15b31-1d7f-458b-b929-282177971441/scratch/prod_variants_after_recovery02.json';

        it('reconciles all 1,524 production variants against the 1,573 ODS rows with zero unmatched ODS variants and exact category counts', (ctx) => {
            if (!fs.existsSync(odsPath) || !fs.existsSync(prodSnapshotPath)) {
                ctx.skip();
                return;
            }

            const odsBuf = fs.readFileSync(odsPath);
            const odsSheet = parseOdsBuffer(odsBuf)[0];
            const odsRawRows = odsSheet.rows.map((r, idx) => {
                const c = r.cells.map(decodeOdsCellText);
                return {
                    sourceRow: idx + 1,
                    fileRowNumber: r.fileRowNumber,
                    code: c[0] || '',
                    name: c[2] || '',
                    microns: c[4] || '',
                    thicknessMm: c[5] || '',
                    format: c[6] || '',
                    grams: c[7] || '',
                    coat: c[9] || '',
                    sortiment: c[12] || '',
                    width: c[13] || '',
                    height: c[14] || '',
                    paperType: c[15] || '',
                    proviser: c[16] || '',
                    aktiv: c[17] || ''
                };
            });

            const prodSnap = JSON.parse(fs.readFileSync(prodSnapshotPath, 'utf8'));
            const recon = reconcileVariantsWithOdsSource(prodSnap.variants, odsRawRows);

            expect(recon.totalVariants).toBe(1524);
            expect(recon.counts.SAFE_UNIQUE_MATCH).toBe(943);
            expect(recon.counts.STRONG_MATCH_REVIEW).toBe(501);
            expect(recon.counts.AMBIGUOUS_MATCH).toBe(16);
            expect(recon.counts.ATTRIBUTE_CONFLICT).toBe(62);
            expect(recon.counts.ALREADY_VERIFIED).toBe(2);
            expect(recon.counts.UNMATCHED).toBe(0);

            const sum = Object.values(recon.counts).reduce((a, b) => a + b, 0);
            expect(sum).toBe(1524);
        });
    });

    describe('5. Spine Calculator & Caliper Provenance Compatibility Regression', () => {
        it('preserves caliper_um, caliper_source, and caliper_confidence_status when technical attributes are resolved', () => {
            const gPrintVariant = {
                variantId: 'var_fb0db99f080fc396',
                productId: 'prod_gprint_100',
                productName: 'G-Print 100 64x90 FSC',
                category: 'OTHER',
                finish: 'UNCOATED',
                gsm: 100,
                widthMm: 640,
                heightMm: 900,
                caliper_um: 98,
                caliper_mm: 0.098,
                bulk_factor: 0.98,
                caliper_source: 'SUPPLIER_IMPORT',
                caliper_confidence_status: 'REFERENCE_IMPORTED',
                caliper_revision: 1,
                variant_metadata_json: {
                    ods_caliper_recovery: {
                        ods_paper_type: 'Matt',
                        ods_coat: 'krītots',
                        ods_code: 'GP100-6490',
                        ods_provider: 'Papyrus DEF'
                    },
                    ods_materials_recovery: {
                        ods_paper_type: 'Matt',
                        ods_coat: 'krītots',
                        ods_code: 'GP100-6490',
                        ods_provider: 'Papyrus DEF',
                        paper_type: 'COATED',
                        coating_status: 'COATED',
                        coating_confidence: 'EXPLICIT_SOURCE',
                        finish: 'MATT'
                    }
                }
            };

            const techAttrs = resolveVariantTechnicalAttributes(gPrintVariant);
            const caliperProv = resolveVariantCaliperProvenance(gPrintVariant);

            expect(techAttrs.paperType).toBe('COATED');
            expect(techAttrs.coatingStatus).toBe('COATED');
            expect(techAttrs.finish).toBe('MATT');
            expect(caliperProv.caliperUm).toBe(98);
            expect(caliperProv.caliperSource).toBe('SUPPLIER_IMPORT');
            expect(caliperProv.caliperConfidenceStatus).toBe('REFERENCE_IMPORTED');
        });

        it('enforces multi-variant shared product protection (Efalin FINE LINEN: eligible sibling resolves DESIGN/UNCOATED while excluded sibling remains OTHER/UNKNOWN)', () => {
            // Eligible variant var_85c142a50239e312 (1020x700) has ods_materials_recovery.paper_type = DESIGN,
            // while shared paper_products.category remains OTHER to protect excluded sibling var_9ebc604670dc6622 (1020x720)
            const efalinEligibleVariant = {
                variant_id: 'var_85c142a50239e312',
                product_id: 'prod_74bc2cb3bd5e8a40',
                product_name: 'Efalin FINE LINEN 130 (Light Blue) 120 102x70',
                category: 'OTHER', // shared product category preserved as OTHER
                finish_summary: 'UNCOATED',
                finish: 'UNCOATED',
                grain_direction: 'UNKNOWN',
                variant_metadata_json: {
                    original_code: 'Efalin FINE...',
                    ods_materials_recovery: {
                        mission: 'PAPER-MATERIALS-RECOVERY-03R',
                        ods_paper_type: 'Dizaina',
                        ods_coat: 'nekrītots',
                        paper_type: 'DESIGN',
                        coating_status: 'UNCOATED',
                        coating_confidence: 'EXPLICIT_SOURCE',
                        finish: 'UNCOATED'
                    }
                }
            };

            const efalinExcludedSibling = {
                variant_id: 'var_9ebc604670dc6622',
                product_id: 'prod_74bc2cb3bd5e8a40',
                product_name: 'Efalin FINE LINEN 130 (Light Blue) 120 102x70',
                category: 'OTHER', // shared product category preserved as OTHER
                finish_summary: 'UNCOATED',
                finish: 'UNCOATED',
                grain_direction: 'UNKNOWN',
                variant_metadata_json: {
                    original_code: '15672130',
                    ods_caliper_recovery: {
                        ods_paper_type: 'Dizaina',
                        ods_coat: '',
                        ods_code: '15672130'
                    }
                }
            };

            const resolvedEligible = resolveVariantTechnicalAttributes(efalinEligibleVariant);
            expect(resolvedEligible.paperType).toBe('DESIGN');
            expect(resolvedEligible.coatingStatus).toBe('UNCOATED');
            expect(resolvedEligible.finish).toBe('UNCOATED');

            const resolvedExcluded = resolveVariantTechnicalAttributes(efalinExcludedSibling);
            expect(resolvedExcluded.paperType).toBe('OTHER');
            expect(resolvedExcluded.coatingStatus).toBe('UNKNOWN');
            expect(resolvedExcluded.finish).toBe('UNKNOWN');
        });
    });
});

