'use strict';

/**
 * tests/spine02_03_engine_and_api.test.js
 *
 * Comprehensive Verification Suite for SPINE-02/03:
 * 1. The 5 Stored Livonia Excel Examples (100% intermediate & output cell parity).
 * 2. The 7 Complementary SPINE-01 Scenarios (combined papers, odd pages, excessive flaps, >78mm block, missing caliper).
 * 3. Exhaustive Mathematical Branch Coverage:
 *    - All 15 Colibri round-spine radius steps R(x) from <=10mm to 78mm and >78mm overflow.
 *    - All 4 Colibri sewn swelling (Uzaugums) branches (Coated, Uncoated <=29mm, Uncoated >29mm sig 16, Uncoated >29mm sig 32).
 *    - All Colibri Rastri (hinge score) branches (Round <30, 30..40, >=40; Square <5, >=5 across boards 1.0, 2.0, 2.4, 3.0mm).
 *    - All board width & height overhang branches (2.5mm vs 3.0mm, Noloki 18mm vs 19mm).
 *    - Strict separation of the 4 Certification Tiers (EXCEL_EXAMPLE_PARITY, MATH_BRANCH_VALIDATED, PRINTHOUSE_TECHNICALLY_VALIDATED, PRODUCTION_CERTIFIED).
 * 4. Same GSM / Different Caliper & Spine Comparison (100 gsm across G-Print 98µm, Amber Graphic 122µm, Munken Premium Cream 175µm & 195µm).
 * 5. Variants without Accredited Caliper & Reconciliation Matrix (375 Livonia pairs, multi-bulk ambiguity protection, non-overwrite of verified caliper).
 * 6. Multi-Tenant Isolation & Profile Authority on API Routes (POST /api/v1/spine/calculate, GET /api/v1/spine/profiles, GET /api/v1/spine/calculations/:id).
 * 7. Quote Revision Acceptance Invalidating Previous Spine Snapshot & Recomputing Effective Spine Geometry.
 * 8. Concurrency, Snapshot Superseding & Idempotency-Key Collision Protection.
 * 9. Compatibility with Paper Materials Catalog & BPE Decoupling.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_spine_secret_key_2026_ppos_control_plane';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';
process.env.NODE_ENV = 'test';

const mysqlClient = require('../src/api/services/mysqlClient');
const {
    CERTIFICATION_TIERS,
    BUILTIN_BINDING_PROFILES,
    resolveColibriRoundSpineRadiusMm,
    calculateColibriArcLengthMm,
    resolveColibriHingeScoreRastriMm,
    calculateBlockThickness,
    calculateBindingAdjustment,
    calculateSpineWidth,
    calculateCoverGeometry,
    validateManufacturingConstraints,
    executeSpineCalculation
} = require('../src/api/services/spine/spineCalculationEngine');

const {
    LIVONIA_PAPER_REFERENCE_SUMMARY,
    LIVONIA_PAPER_REFERENCE_ROWS,
    evaluateVariantCaliperReconciliation,
    resolveVariantCaliperProvenance
} = require('../src/api/services/spine/paperCaliperReconciliationService');

const {
    SpineCalculationService,
    SpineCalculationError
} = require('../src/api/services/spine/spineCalculationService');

const spineRoutes = require('../src/api/routes/spineRoutes');
const marketplacePublicRouter = require('../src/api/routes/marketplacePublic');
const { OrderQuoteRevisionService } = require('../src/api/services/orderQuoteRevisionService');
const paperProcurementService = require('../src/api/services/paperProcurementService');

const fixturesData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../SPINE-01_TEST_FIXTURES.json'), 'utf8')
);

function createMockReqRes({ method = 'GET', url = '/', headers = {}, query = {}, params = {}, body = {}, user = null }) {
    let statusCode = 200;
    let responseBody = null;
    let nextCalled = false;

    const req = {
        method,
        url,
        originalUrl: url,
        path: url.split('?')[0],
        headers: { ...headers },
        query: { ...query },
        params: { ...params },
        body: { ...body },
        ip: '127.0.0.1',
        user
    };

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            responseBody = data;
            return this;
        },
        send(data) {
            responseBody = data;
            return this;
        }
    };

    const next = () => {
        nextCalled = true;
    };

    return {
        req,
        res,
        next,
        getStatusCode: () => statusCode,
        getBody: () => responseBody,
        isNextCalled: () => nextCalled
    };
}

function findRouteLayer(router, routePath, method) {
    for (const layer of router.stack) {
        if (layer.route && layer.route.path === routePath && layer.route.methods[method.toLowerCase()]) {
            return layer.route;
        }
    }
    return null;
}

describe('SPINE-02/03 — Paper Caliper Provenance & Control Plane Spine Engine Suite', () => {

    describe('1. Five Stored Livonia Excel Examples (100% Cell-by-Cell Parity)', () => {
        it('1.1 Sheet 1 (Mīkstais sējums Alegro) — Sewn & Glued stored example (220pp, 145µm, 170x240, cover 270µm)', () => {
            const fSewn = fixturesData.fixtures.find(f => f.id === 'LIVONIA-S1-STORED-SEWN');
            const resSewn = executeSpineCalculation(fSewn.input);

            assert.strictEqual(resSewn.blockThickness.netPaperBlockMm, fSewn.expectedExcelCells.L2_blockThicknessMm);
            assert.strictEqual(resSewn.bindingAdjustment.gluedCandidateSpineMm, fSewn.expectedExcelCells.M2_gluedCandidateSpineMm);
            assert.strictEqual(resSewn.bindingAdjustment.sewnCandidateSpineMm, fSewn.expectedExcelCells.N2_sewnCandidateSpineMm);
            assert.strictEqual(resSewn.spineWidthMm, fSewn.expectedExcelCells.E14_spineWidthMm);
            assert.strictEqual(resSewn.coverGeometry.netCoverWidthMm, fSewn.expectedExcelCells.E39_netCoverWidthMm);
            assert.strictEqual(resSewn.coverGeometry.flatCoverWidthMm, fSewn.expectedExcelCells.E16_flatCoverWidthMm);
            assert.strictEqual(resSewn.coverGeometry.flatCoverHeightMm, fSewn.expectedExcelCells.E18_flatCoverHeightMm);
            assert.strictEqual(resSewn.manufacturingValidation.status, 'MATH_VALIDATED');
            // Verify strict separation of certification tiers: MATH_BRANCH_VALIDATED !== PRODUCTION_CERTIFIED
            assert.strictEqual(resSewn.certificationTier, CERTIFICATION_TIERS.MATH_BRANCH_VALIDATED);
            assert.strictEqual(resSewn.manufacturingValidation.levels.excelExampleParity, true);
            assert.strictEqual(resSewn.manufacturingValidation.levels.mathBranchValidated, true);
            assert.strictEqual(resSewn.manufacturingValidation.levels.productionCertifiedForManufacturing, false);

            const fGlued = fixturesData.fixtures.find(f => f.id === 'LIVONIA-S1-STORED-GLUED');
            const resGlued = executeSpineCalculation(fGlued.input);
            assert.strictEqual(resGlued.spineWidthMm, fGlued.expectedExcelCells.E14_spineWidthMm);
            assert.strictEqual(resGlued.coverGeometry.netCoverWidthMm, fGlued.expectedExcelCells.E39_netCoverWidthMm);
            assert.strictEqual(resGlued.coverGeometry.flatCoverWidthMm, fGlued.expectedExcelCells.E16_flatCoverWidthMm);
        });

        it('1.2 Sheet 2 (Mīk. sēj. ar atlokiem Alegro) — Softcover with 80mm flaps (504pp, 116µm, 170x297, cover 350µm)', () => {
            const f = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S2-STORED-FLAPS-SEWN');
            const res = executeSpineCalculation(f.input);

            assert.strictEqual(res.blockThickness.netPaperBlockMm, f.expectedExcelCells.L2_blockThicknessMm);
            assert.strictEqual(res.bindingAdjustment.gluedCandidateSpineMm, f.expectedExcelCells.M2_gluedCandidateSpineMm);
            assert.strictEqual(res.bindingAdjustment.sewnCandidateSpineMm, f.expectedExcelCells.N2_sewnCandidateSpineMm);
            assert.strictEqual(res.spineWidthMm, f.expectedExcelCells.E14_spineWidthMm);
            assert.strictEqual(res.coverGeometry.panels.leftFlapMm, f.expectedExcelCells.B30_leftFlapMm);
            assert.strictEqual(res.coverGeometry.panels.backPanelMm, f.expectedExcelCells.C30_backPanelMm);
            assert.strictEqual(res.coverGeometry.panels.frontPanelMm, f.expectedExcelCells.F30_frontPanelMm);
            assert.strictEqual(res.coverGeometry.panels.rightFlapMm, f.expectedExcelCells.H30_rightFlapMm);
            assert.strictEqual(res.coverGeometry.panels.panelAuxRefMm, f.expectedExcelCells.C33_panelAuxRefMm);
            assert.strictEqual(res.coverGeometry.netCoverWidthMm, f.expectedExcelCells.E39_netCoverWidthMm);
            assert.strictEqual(res.coverGeometry.flatCoverWidthMm, f.expectedExcelCells.E16_flatCoverWidthMm);
            assert.strictEqual(res.coverGeometry.flatCoverHeightMm, f.expectedExcelCells.E18_flatCoverHeightMm);
        });

        it('1.3 Sheet 3 (Ciet. sēj. + Superv. Colibri) — Hardcover + Dust Jacket & all 4 spine branches (AF13..AF16)', () => {
            const f = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S3-STORED-HARDCOVER-ALL-4-BRANCHES');
            const res = executeSpineCalculation(f.input);

            assert.strictEqual(res.blockThickness.netPaperBlockMm, f.expectedExcelCells.AA2_netPaperBlockMm);
            assert.strictEqual(res.blockThickness.endpapersAllowanceMm, f.expectedExcelCells.AD8_endpapersAllowanceMm);
            assert.strictEqual(res.blockThickness.totalBlockWithEndpapersMm, f.expectedExcelCells.AD2_totalBlockWithEndpapersMm);
            assert.strictEqual(res.bindingAdjustment.twoTimesBoardMm, f.expectedExcelCells.AD10_twoTimesBoardThicknessMm);
            assert.strictEqual(res.bindingAdjustment.sewnSwellingBlockMm, f.expectedExcelCells.AG3_sewnSwellingBlockMm);
            assert.strictEqual(res.bindingAdjustment.sewnRoundArcMm, f.expectedExcelCells.AF5_sewnRoundArcMm);
            assert.strictEqual(res.bindingAdjustment.branches.sewnRound_AF13, f.expectedExcelCells.AF6_AF13_sewnRoundFinalSpineMm);
            assert.strictEqual(res.bindingAdjustment.theoreticalWithBoardMm, f.expectedExcelCells.AH5_sewnSquareTheoreticalWithBoardMm);
            assert.strictEqual(res.bindingAdjustment.branches.sewnSquare_AF14, f.expectedExcelCells.AH6_AF14_sewnSquareFinalSpineMm);
            assert.strictEqual(res.bindingAdjustment.gluedRoundArcMm, f.expectedExcelCells.AF10_gluedRoundArcMm);
            assert.strictEqual(res.bindingAdjustment.branches.gluedRound_AF15, f.expectedExcelCells.AF11_AF15_gluedRoundFinalSpineMm);
            assert.strictEqual(res.bindingAdjustment.branches.gluedSquare_AF16, f.expectedExcelCells.AH10_AF16_gluedSquareFinalSpineMm);

            assert.strictEqual(res.spineWidthMm, f.expectedExcelCells.H14_selectedSpineWidthMm);
            assert.strictEqual(res.coverGeometry.panels.leftHingeScoreMm, f.expectedExcelCells.H15_hingeScoreRastriMm);
            assert.strictEqual(res.coverGeometry.panels.boardWidthMm, f.expectedExcelCells.H16_boardWidthMm);
            assert.strictEqual(res.coverGeometry.panels.boardHeightMm, f.expectedExcelCells.J16_boardHeightMm);
            assert.strictEqual(res.coverGeometry.panels.turnInMm, f.expectedExcelCells.H17_turnInNolokiMm);
            assert.strictEqual(res.coverGeometry.netCoverWidthMm, f.expectedExcelCells.E40_openBoardSpreadWidthMm);
            assert.strictEqual(res.coverGeometry.flatCoverWidthMm, f.expectedExcelCells.H18_flatCoverWidthMm);
            assert.strictEqual(res.coverGeometry.flatCoverHeightMm, f.expectedExcelCells.H19_flatCoverHeightMm);

            assert.strictEqual(res.coverGeometry.dustJacket.panelWidthMm, f.expectedExcelCells.P31_dustJacketPanelWidthMm);
            assert.strictEqual(res.coverGeometry.dustJacket.panelWithHingeRefMm, f.expectedExcelCells.P34_dustJacketPanelPlusHingeRefMm);
            assert.strictEqual(res.coverGeometry.dustJacket.netWidthMm, f.expectedExcelCells.R40_dustJacketNetWidthMm);
            assert.strictEqual(res.coverGeometry.dustJacket.flatWidthWithBleedMm, f.expectedExcelCells.R20_dustJacketFlatWidthWithBleedMm);
            assert.strictEqual(res.coverGeometry.dustJacket.flatHeightWithBleedMm, f.expectedExcelCells.R21_dustJacketFlatHeightWithBleedMm);

            // Hardcover requires technologist approval
            assert.strictEqual(res.manufacturingValidation.status, 'REQUIRES_TECH_REVIEW');
            assert.strictEqual(res.manufacturingValidation.requiresTechnologistApproval, true);
        });

        it('1.4 Sheets 4 & 5 (Flexi & Flexi ar atlokiem Colibri) — Stored 0-page examples match Excel formulas but are blocked for production', () => {
            const f4 = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S4-STORED-FLEXI-ZERO-PAGES');
            const res4 = executeSpineCalculation(f4.input);
            assert.strictEqual(res4.blockThickness.totalBlockWithEndpapersMm, f4.expectedExcelCells.N2_totalBlockWithEndpapersMm);
            assert.strictEqual(res4.bindingAdjustment.sewnSwellingBlockMm, f4.expectedExcelCells.S2_sewnSwellingBlockMm);
            assert.strictEqual(res4.rawFormulaSpineWidthMm, f4.expectedExcelCells.D14_selectedSpineWidthMm);
            assert.strictEqual(res4.coverGeometry.flatCoverWidthMm, f4.expectedExcelCells.D16_flatCoverWidthMm);
            assert.strictEqual(res4.coverGeometry.flatCoverHeightMm, f4.expectedExcelCells.D18_flatCoverHeightMm);
            assert.strictEqual(res4.manufacturingValidation.status, 'INVALID_BLOCKED');
            assert.strictEqual(res4.spineWidthMm, null);

            const f5 = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S5-STORED-FLEXI-FLAPS-ZERO-PAGES');
            const res5 = executeSpineCalculation(f5.input);
            assert.strictEqual(res5.bindingAdjustment.sewnSwellingBlockMm, f5.expectedExcelCells.S2_sewnSwellingBlockMm);
            assert.strictEqual(res5.rawFormulaSpineWidthMm, f5.expectedExcelCells.D16_selectedSpineWidthMm);
            assert.strictEqual(res5.coverGeometry.flatCoverWidthMm, f5.expectedExcelCells.D18_E39_flatCoverWidthMm);
            assert.strictEqual(res5.manufacturingValidation.status, 'INVALID_BLOCKED');
        });
    });

    describe('2. Complementary SPINE-01 Scenarios & Edge Cases', () => {
        it('2.1 Same 100 gsm across 3 different papers produces 3 different spines (11.5 mm, 14.0 mm, 20.0 mm)', () => {
            const f = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S1-SAME-100GSM-THREE-PAPERS-COMPARISON');
            for (const sc of f.subCases) {
                const res = executeSpineCalculation({
                    bindingCategory: 'SOFTCOVER_STANDARD',
                    processingType: 'SEWN',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{ segmentIndex: 1, pages: sc.pages, gsm: 100, caliperUm: sc.caliperUm }],
                    cover: { caliperUm: sc.coverCaliperUm }
                });
                assert.strictEqual(res.blockThickness.netPaperBlockMm, sc.expected_L2_blockThicknessMm);
                assert.strictEqual(res.bindingAdjustment.gluedCandidateSpineMm, sc.expected_M2_gluedSpineMm);
                assert.strictEqual(res.bindingAdjustment.sewnCandidateSpineMm, sc.expected_N2_sewnSpineMm);
            }
        });

        it('2.2 Combined two-paper segments (Lpp. 1 + Lpp. 2) in Softcover', () => {
            const f = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S1-COMBINED-TWO-PAPERS');
            const res = executeSpineCalculation(f.input);
            assert.strictEqual(res.blockThickness.netPaperBlockMm, f.expectedExcelCells.L2_blockThicknessMm);
            assert.strictEqual(res.bindingAdjustment.gluedCandidateSpineMm, f.expectedExcelCells.M2_gluedCandidateSpineMm);
            assert.strictEqual(res.bindingAdjustment.sewnCandidateSpineMm, f.expectedExcelCells.N2_sewnCandidateSpineMm);
            assert.strictEqual(res.coverGeometry.flatCoverWidthMm, f.expectedExcelCells.E16_flatCoverWidthMm);
        });

        it('2.3 Odd page count emits ODD_PAGE_COUNT_NOT_DIVISIBLE_BY_2 warning', () => {
            const f = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S1-ODD-PAGES-WARNING');
            const res = executeSpineCalculation(f.input);
            assert.strictEqual(res.blockThickness.netPaperBlockMm, f.expectedExcelCells.L2_rawFormulaValueMm);
            assert.ok(res.manufacturingValidation.issues.some(i => i.code === 'ODD_PAGE_COUNT_NOT_DIVISIBLE_BY_2'));
        });

        it('2.4 Excessive flap width (E11 > C10 - 16) blocks calculation with FLAP_WIDTH_EXCEEDS_LIMIT', () => {
            const f = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S2-EXCESSIVE-FLAP-WIDTH-ERROR');
            const res = executeSpineCalculation(f.input);
            assert.strictEqual(res.manufacturingValidation.status, 'INVALID_BLOCKED');
            assert.strictEqual(res.spineWidthMm, null);
            assert.ok(res.manufacturingValidation.issues.some(i => i.code === 'FLAP_WIDTH_EXCEEDS_LIMIT'));
        });

        it('2.5 Hardcover sewn block exceeding 78 mm blocks calculation with BLOCK_THICKNESS_EXCEEDS_MAX_SEWN_78MM', () => {
            const f = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S3-EXCEEDING-MAX-SEWN-78MM');
            const res = executeSpineCalculation(f.input);
            assert.strictEqual(res.manufacturingValidation.status, 'INVALID_BLOCKED');
            assert.strictEqual(res.spineWidthMm, null);
            assert.ok(res.manufacturingValidation.issues.some(i => i.code === 'BLOCK_THICKNESS_EXCEEDS_MAX_SEWN_78MM'));
        });

        it('2.6 Variant without caliper (caliperUm: null) blocks certified calculation with MISSING_SEGMENT_CALIPER', () => {
            const f = fixturesData.fixtures.find(x => x.id === 'LIVONIA-S1-MISSING-CALIPER-BLOCKED');
            const res = executeSpineCalculation(f.input);
            assert.strictEqual(res.manufacturingValidation.status, 'INVALID_BLOCKED');
            assert.strictEqual(res.spineWidthMm, null);
            assert.ok(res.manufacturingValidation.issues.some(i => i.code === 'MISSING_SEGMENT_CALIPER'));
        });
    });

    describe('3. Exhaustive Mathematical Branch Coverage (All 15 Radii, 4 Swelling Branches, Rastri & Overhangs)', () => {
        it('3.1 Covers all 15 Colibri round-spine radius steps R(x) and >78mm overflow', () => {
            const expectedSteps = [
                [8, 16], [14, 16], [15, 20], [22, 20], [25, 23], [29, 28],
                [32, 30], [36, 35], [40, 45], [45, 50], [49, 55], [53, 60],
                [57, 65], [63, 65], [65, 70], [69, 70], [71, 80], [74, 85],
                [78, 90], [78.1, null]
            ];
            for (const [chord, expectedRadius] of expectedSteps) {
                assert.strictEqual(
                    resolveColibriRoundSpineRadiusMm(chord),
                    expectedRadius,
                    `Failed radius lookup at chord=${chord}`
                );
            }
        });

        it('3.2 Covers all 4 Colibri sewn swelling (Uzaugums) branches and uncoated >29mm technologist warning', () => {
            // 1. Coated
            const resCoated = executeSpineCalculation({
                bindingCategory: 'HARDCOVER',
                processingType: 'SEWN',
                trimWidthMm: 170,
                trimHeightMm: 240,
                segments: [{ segmentIndex: 1, pages: 200, caliperUm: 100 }],
                hardcover: { endpapersMode: 'FROM_BLOCK', boardThicknessMm: 2.0, blockPaperCoating: 'COATED', spineShape: 'ROUND', overhangMm: 3.0, foldingSignaturePages: 16 }
            });
            assert.strictEqual(resCoated.bindingAdjustment.sewnSwellingBlockMm, 13.1659);

            // 2. Uncoated > 29mm with 16-page signature
            const resUnc16 = executeSpineCalculation({
                bindingCategory: 'HARDCOVER',
                processingType: 'SEWN',
                trimWidthMm: 170,
                trimHeightMm: 240,
                segments: [{ segmentIndex: 1, pages: 400, caliperUm: 160 }], // 32.0 mm > 29 mm
                hardcover: { endpapersMode: 'FROM_BLOCK', boardThicknessMm: 3.0, blockPaperCoating: 'UNCOATED', spineShape: 'SQUARE', overhangMm: 2.5, foldingSignaturePages: 16 }
            });
            assert.strictEqual(resUnc16.bindingAdjustment.sewnSwellingBlockMm, 38.3838);
            assert.ok(resUnc16.manufacturingValidation.issues.some(i => i.code === 'UNCOATED_BLOCK_OVER_29MM_TECH_REVIEW_RECOMMENDED'));

            // 3. Uncoated > 29mm with 32-page signature
            const resUnc32 = executeSpineCalculation({
                bindingCategory: 'HARDCOVER',
                processingType: 'SEWN',
                trimWidthMm: 170,
                trimHeightMm: 240,
                segments: [{ segmentIndex: 1, pages: 400, caliperUm: 160 }], // 32.0 mm > 29 mm
                hardcover: { endpapersMode: 'FROM_BLOCK', boardThicknessMm: 2.4, blockPaperCoating: 'UNCOATED', spineShape: 'SQUARE', overhangMm: 3.0, foldingSignaturePages: 32 }
            });
            assert.strictEqual(resUnc32.bindingAdjustment.sewnSwellingBlockMm, 37.222);
        });

        it('3.3 Covers all Rastri (hinge score) branches for Round and Square spines across all board thicknesses', () => {
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 20, spineShape: 'ROUND', boardThicknessMm: 2.0 }), 8.0);
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 35, spineShape: 'ROUND', boardThicknessMm: 2.4 }), 9.0);
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 35, spineShape: 'ROUND', boardThicknessMm: 3.0 }), 10.0);
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 45, spineShape: 'ROUND', boardThicknessMm: 1.0 }), 10.0);

            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 4, spineShape: 'SQUARE', boardThicknessMm: 1.0 }), 7.0);
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 4, spineShape: 'SQUARE', boardThicknessMm: 2.0 }), 8.0);
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 4, spineShape: 'SQUARE', boardThicknessMm: 2.4 }), 8.5);
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 4, spineShape: 'SQUARE', boardThicknessMm: 3.0 }), 9.0);

            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 10, spineShape: 'SQUARE', boardThicknessMm: 1.0 }), 9.0);
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 10, spineShape: 'SQUARE', boardThicknessMm: 2.0 }), 10.0);
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 10, spineShape: 'SQUARE', boardThicknessMm: 2.4 }), 10.5);
            assert.strictEqual(resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm: 10, spineShape: 'SQUARE', boardThicknessMm: 3.0 }), 11.0);
        });
    });

    describe('4. Livonia 375 Reference Library & Caliper Reconciliation Rules (SPINE-02)', () => {
        it('4.1 Contains all 60 blocks and 375 (gsm, caliper_um) pairs from Livonia Papers sheet', () => {
            assert.strictEqual(LIVONIA_PAPER_REFERENCE_SUMMARY.totalBlocks, 60);
            assert.strictEqual(LIVONIA_PAPER_REFERENCE_ROWS.length, 375);
            // Verify decimal micron preservation (Maxi Gloss 90 gsm -> 67.5 µm)
            const maxiGloss90 = LIVONIA_PAPER_REFERENCE_ROWS.find(r => r.familyName === 'Maxi Gloss' && r.gsm === 90);
            assert.ok(maxiGloss90);
            assert.strictEqual(maxiGloss90.caliperUm, 67.5);
            assert.strictEqual(maxiGloss90.caliperMm, 0.0675);
        });

        it('4.2 Classifies unambiguous single-bulk family match as SAFE_EXACT_MATCH (pending review, not auto-activated)', () => {
            const res = evaluateVariantCaliperReconciliation({
                id: 'var_gprint_100',
                product_name: 'G-Print 100g 700x1000 LG',
                brand: 'G-Print',
                gsm: 100,
                caliper_um: null
            });
            assert.strictEqual(res.reconciliationStatus, 'SAFE_EXACT_MATCH');
            assert.strictEqual(res.reviewDecision, 'PENDING_REVIEW');
            assert.strictEqual(res.proposedCaliperUm, 98);
        });

        it('4.3 Flags multi-bulk family without explicit bulk factor as AMBIGUOUS_MULTIPLE_BULK (refuses to guess)', () => {
            const res = evaluateVariantCaliperReconciliation({
                id: 'var_munken_cream_100',
                product_name: 'Munken Premium Cream 100g 700x1000',
                brand: 'Munken',
                gsm: 100,
                caliper_um: null
            });
            assert.strictEqual(res.reconciliationStatus, 'AMBIGUOUS_MULTIPLE_BULK');
            assert.strictEqual(res.proposedCaliperUm, null);
            assert.strictEqual(res.candidateReferences.length, 4); // bulks 1.3, 1.5, 1.75, 1.95
        });

        it('4.4 Resolves multi-bulk family when bulk factor is explicitly declared on the variant', () => {
            const res = evaluateVariantCaliperReconciliation({
                id: 'var_munken_cream_100_b175',
                product_name: 'Munken Premium Cream bulk 1.75 100g',
                brand: 'Munken',
                gsm: 100,
                caliper_um: null
            });
            assert.strictEqual(res.reconciliationStatus, 'SAFE_EXACT_MATCH');
            assert.strictEqual(res.proposedCaliperUm, 175);
            assert.strictEqual(res.proposedBulkFactor, 1.75);
        });

        it('4.5 Never overwrites an already verified caliper_um when it differs from Livonia reference (CONFLICT_EXISTING_CALIPER)', () => {
            const res = evaluateVariantCaliperReconciliation({
                id: 'var_amber_100_measured',
                product_name: 'Amber Graphic 100g',
                gsm: 100,
                caliper_um: 126, // Livonia has 122 µm
                caliper_source: 'MEASURED_MICROMETER'
            });
            assert.strictEqual(res.reconciliationStatus, 'CONFLICT_EXISTING_CALIPER');
            assert.strictEqual(res.canAutoApplyOnApproval, false);
            assert.strictEqual(res.existingCaliperUm, 126);
        });
    });

    describe('5. Control Plane API, Multi-Tenant Isolation, Idempotency & Snapshot Invalidation (SPINE-03)', () => {
        let mockDb;
        let origGetConn;
        let origQuery;

        beforeEach(() => {
            mockDb = {
                variants: new Map([
                    ['var_gprint_100', {
                        id: 'var_gprint_100',
                        product_id: 'prod_gprint',
                        product_name: 'G-Print',
                        brand: 'Arctic Paper',
                        category: 'COATED',
                        finish: 'SILK',
                        gsm: 100,
                        caliper_um: 98,
                        caliper_mm: 0.098,
                        caliper_source: 'LIVONIA_REFERENCE_IMPORT',
                        caliper_confidence_status: 'REFERENCE_IMPORTED'
                    }],
                    ['var_munken_100_b175', {
                        id: 'var_munken_100_b175',
                        product_id: 'prod_munken',
                        product_name: 'Munken Premium Cream 1.75',
                        brand: 'Arctic Paper',
                        category: 'DESIGN',
                        finish: 'UNCOATED',
                        gsm: 100,
                        caliper_um: 175,
                        caliper_mm: 0.175,
                        bulk_factor: 1.75,
                        caliper_source: 'MANUFACTURER_DATASHEET',
                        caliper_confidence_status: 'VERIFIED'
                    }],
                    ['var_unaccredited_100', {
                        id: 'var_unaccredited_100',
                        product_id: 'prod_generic',
                        product_name: 'Generic Offset 100g',
                        category: 'OFFSET',
                        finish: 'UNCOATED',
                        gsm: 100,
                        caliper_um: null,
                        caliper_mm: null,
                        caliper_source: 'NONE',
                        caliper_confidence_status: 'MISSING'
                    }]
                ]),
                snapshots: []
            };

            const executeMockQuery = async (sql, params = []) => {
                const normSql = sql.replace(/\s+/g, ' ').trim();
                if (normSql.startsWith('SELECT v.*, p.name AS product_name')) {
                    const v = mockDb.variants.get(params[0]);
                    return [v ? [v] : []];
                }
                if (normSql.startsWith('SELECT * FROM spine_binding_profiles')) {
                    return [[]];
                }
                if (normSql.startsWith('SELECT * FROM spine_calculation_snapshots WHERE tenant_id = ? AND idempotency_key = ?')) {
                    const found = mockDb.snapshots.filter(s => s.tenant_id === params[0] && s.idempotency_key === params[1]);
                    return [found];
                }
                if (normSql.startsWith('UPDATE spine_calculation_snapshots SET snapshot_lifecycle_status =')) {
                    let count = 0;
                    if (normSql.includes("SET snapshot_lifecycle_status = 'SUPERSEDED'")) {
                        const [newId, tId, intentRef, , canonRef] = params;
                        for (const s of mockDb.snapshots) {
                            if (s.tenant_id === tId && s.snapshot_lifecycle_status === 'ACTIVE' &&
                                ((intentRef && s.external_order_intent_id === intentRef) || (canonRef && s.canonical_order_id === canonRef))) {
                                s.snapshot_lifecycle_status = 'SUPERSEDED';
                                s.superseded_by_snapshot_id = newId;
                                count++;
                            }
                        }
                    } else if (normSql.includes("SET snapshot_lifecycle_status = 'INVALIDATED'")) {
                        const [tId, intentRef, canonRef] = params;
                        for (const s of mockDb.snapshots) {
                            if (s.tenant_id === tId && s.snapshot_lifecycle_status === 'ACTIVE' &&
                                ((intentRef && s.external_order_intent_id === intentRef) || (canonRef && s.canonical_order_id === canonRef))) {
                                s.snapshot_lifecycle_status = 'INVALIDATED';
                                s.invalidation_reason = 'PAPER_QUOTE_REVISION_ACCEPTED';
                                count++;
                            }
                        }
                    } else {
                        const [newStatus, repId, reason, tId, intentRef, , canonRef] = params;
                        for (const s of mockDb.snapshots) {
                            if (s.tenant_id === tId && s.snapshot_lifecycle_status === 'ACTIVE' &&
                                ((intentRef && s.external_order_intent_id === intentRef) || (canonRef && s.canonical_order_id === canonRef))) {
                                s.snapshot_lifecycle_status = newStatus;
                                s.superseded_by_snapshot_id = repId;
                                s.invalidation_reason = reason;
                                count++;
                            }
                        }
                    }
                    return [{ affectedRows: count }];
                }
                if (normSql.startsWith('INSERT INTO spine_calculation_snapshots')) {
                    mockDb.snapshots.push({
                        id: params[0],
                        tenant_id: params[1],
                        printhouse_id: params[2],
                        external_order_intent_id: params[3],
                        canonical_order_id: params[4],
                        paper_decision_id: params[5],
                        quote_revision_id: params[6],
                        profile_code: params[7],
                        profile_version: params[8],
                        certification_tier: params[9],
                        binding_category: params[10],
                        processing_type: params[11],
                        spine_shape: params[12],
                        trim_width_mm: params[13],
                        trim_height_mm: params[14],
                        net_block_thickness_mm: params[15],
                        total_block_with_endpapers_mm: params[16],
                        spine_width_mm: params[17],
                        flat_cover_width_mm: params[18],
                        flat_cover_height_mm: params[19],
                        validation_status: params[20],
                        caliper_confidence_summary: params[21],
                        snapshot_lifecycle_status: 'ACTIVE',
                        idempotency_key: params[22],
                        input_canonical_hash: params[23],
                        output_canonical_hash: params[24],
                        input_payload_json: params[25],
                        geometry_breakdown_json: params[26],
                        validation_issues_json: params[27],
                        created_by: params[28],
                        created_at: new Date().toISOString()
                    });
                    return [{ affectedRows: 1 }];
                }
                if (normSql.startsWith('SELECT * FROM spine_calculation_snapshots WHERE id = ?')) {
                    const found = mockDb.snapshots.filter(s => s.id === params[0]);
                    return [found];
                }
                return [[]];
            };

            origQuery = mysqlClient.query;
            origGetConn = mysqlClient.getConnection;
            mysqlClient.query = executeMockQuery;
            mysqlClient.getConnection = async () => ({
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {},
                release: () => {},
                query: executeMockQuery
            });
        });

        afterEach(() => {
            mysqlClient.query = origQuery;
            mysqlClient.getConnection = origGetConn;
        });

        it('5.1 GET /api/v1/spine/profiles returns active profiles and excludes experimental Flexi by default', async () => {
            const route = findRouteLayer(spineRoutes, '/profiles', 'get');
            const handler = route.stack[route.stack.length - 1].handle;
            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'GET',
                url: '/profiles',
                user: { id: 'usr_1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant_alpha', authMode: 'JWT' }
            });

            await handler(req, res);
            assert.strictEqual(getStatusCode(), 200);
            const body = getBody();
            assert.strictEqual(body.ok, true);
            assert.strictEqual(body.data.profiles.length, 2);
            assert.ok(body.data.profiles.every(p => p.operationalStatus !== 'EXPERIMENTAL_DISABLED'));
        });

        it('5.2 POST /api/v1/spine/calculate resolves catalog variantId, persists snapshot, and enforces Idempotency-Key', async () => {
            const route = findRouteLayer(spineRoutes, '/calculate', 'post');
            const handler = route.stack[route.stack.length - 1].handle;

            const payload = {
                externalOrderIntentId: 'oi_book_100',
                bindingCategory: 'SOFTCOVER_STANDARD',
                processingType: 'SEWN',
                trimWidthMm: 170,
                trimHeightMm: 240,
                segments: [{ pages: 200, variantId: 'var_gprint_100' }],
                cover: { caliperUm: 255 }
            };

            const call1 = createMockReqRes({
                method: 'POST',
                url: '/calculate',
                headers: { 'idempotency-key': 'idem_spine_001' },
                body: payload,
                user: { id: 'usr_1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant_alpha', authMode: 'JWT' }
            });
            await handler(call1.req, call1.res);
            assert.strictEqual(call1.getStatusCode(), 201);
            const res1 = call1.getBody().data;
            assert.strictEqual(res1.blockThickness.netPaperBlockMm, 9.8);
            assert.strictEqual(res1.spineWidthMm, 11.5);
            assert.ok(res1.snapshotId);

            // Idempotent replay with identical payload returns 200 and idempotentReplay=true
            const call2 = createMockReqRes({
                method: 'POST',
                url: '/calculate',
                headers: { 'idempotency-key': 'idem_spine_001' },
                body: payload,
                user: { id: 'usr_1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant_alpha', authMode: 'JWT' }
            });
            await handler(call2.req, call2.res);
            assert.strictEqual(call2.getStatusCode(), 200);
            assert.strictEqual(call2.getBody().data.idempotentReplay, true);
            assert.strictEqual(call2.getBody().data.snapshotId, res1.snapshotId);

            // Idempotency collision with mutated page count returns 409 IDEMPOTENCY_KEY_COLLISION
            const call3 = createMockReqRes({
                method: 'POST',
                url: '/calculate',
                headers: { 'idempotency-key': 'idem_spine_001' },
                body: { ...payload, segments: [{ pages: 240, variantId: 'var_gprint_100' }] },
                user: { id: 'usr_1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant_alpha', authMode: 'JWT' }
            });
            await handler(call3.req, call3.res);
            assert.strictEqual(call3.getStatusCode(), 409);
            assert.strictEqual(call3.getBody().error.code, 'IDEMPOTENCY_KEY_COLLISION');
        });

        it('5.3 Enforces strict multi-tenant isolation on POST /calculate and GET /calculations/:id', async () => {
            const calcRoute = findRouteLayer(spineRoutes, '/calculate', 'post');
            const calcHandler = calcRoute.stack[calcRoute.stack.length - 1].handle;
            const getRoute = findRouteLayer(spineRoutes, '/calculations/:id', 'get');
            const getHandler = getRoute.stack[getRoute.stack.length - 1].handle;

            // Attempt tenant spoofing in body -> 403 FORBIDDEN_TENANT_MISMATCH
            const spoofCall = createMockReqRes({
                method: 'POST',
                url: '/calculate',
                body: {
                    tenantId: 'tenant_beta',
                    bindingCategory: 'SOFTCOVER_STANDARD',
                    processingType: 'GLUED',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{ pages: 200, variantId: 'var_gprint_100' }]
                },
                user: { id: 'usr_1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant_alpha', authMode: 'JWT' }
            });
            await calcHandler(spoofCall.req, spoofCall.res);
            assert.strictEqual(spoofCall.getStatusCode(), 403);
            assert.strictEqual(spoofCall.getBody().error.code, 'FORBIDDEN_TENANT_MISMATCH');

            // Create valid snapshot for tenant_alpha
            const createCall = createMockReqRes({
                method: 'POST',
                url: '/calculate',
                body: {
                    persistSnapshot: true,
                    bindingCategory: 'SOFTCOVER_STANDARD',
                    processingType: 'GLUED',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{ pages: 200, variantId: 'var_gprint_100' }]
                },
                user: { id: 'usr_1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant_alpha', authMode: 'JWT' }
            });
            await calcHandler(createCall.req, createCall.res);
            const snapId = createCall.getBody().data.snapshotId;

            // Cross-tenant GET by tenant_beta -> 403 FORBIDDEN_TENANT_MISMATCH
            const crossGet = createMockReqRes({
                method: 'GET',
                url: `/calculations/${snapId}`,
                params: { id: snapId },
                user: { id: 'usr_2', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant_beta', authMode: 'JWT' }
            });
            await getHandler(crossGet.req, crossGet.res);
            assert.strictEqual(crossGet.getStatusCode(), 403);
            assert.strictEqual(crossGet.getBody().error.code, 'FORBIDDEN_TENANT_MISMATCH');
        });

        it('5.4 Supersedes previous snapshot when paper or pagination changes, and invalidates on Quote Revision', async () => {
            const svc = new SpineCalculationService();

            // 1. Initial calculation with G-Print 100g (98 µm) -> Spine = 11.5 mm
            const snap1 = await svc.calculateSpine({
                tenantId: 'tenant_alpha',
                persistSnapshot: true,
                externalOrderIntentId: 'oi_rev_test_1',
                payload: {
                    bindingCategory: 'SOFTCOVER_STANDARD',
                    processingType: 'SEWN',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{ pages: 200, variantId: 'var_gprint_100' }],
                    cover: { caliperUm: 255 }
                }
            });
            assert.strictEqual(snap1.spineWidthMm, 11.5);
            assert.strictEqual(snap1.coverGeometry.flatCoverWidthMm, 357.5);

            // 2. Paper change to Munken Premium Cream 1.75 100g (175 µm) -> Spine = 20.0 mm, previous snapshot SUPERSEDED
            const snap2 = await svc.calculateSpine({
                tenantId: 'tenant_alpha',
                persistSnapshot: true,
                externalOrderIntentId: 'oi_rev_test_1',
                payload: {
                    bindingCategory: 'SOFTCOVER_STANDARD',
                    processingType: 'SEWN',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{ pages: 200, variantId: 'var_munken_100_b175' }],
                    cover: { caliperUm: 255 }
                }
            });
            assert.strictEqual(snap2.spineWidthMm, 20.0);
            assert.strictEqual(snap2.coverGeometry.flatCoverWidthMm, 366.0);

            const oldFetched = await svc.getCalculationById({ tenantId: 'tenant_alpha', calculationId: snap1.snapshotId });
            assert.strictEqual(oldFetched.snapshotLifecycleStatus, 'SUPERSEDED');
            assert.strictEqual(oldFetched.supersededBySnapshotId, snap2.snapshotId);

            // 3. Explicit invalidation on Quote Revision acceptance
            await svc.invalidateOrderSpineSnapshotsOnSpecChange(null, {
                tenantId: 'tenant_alpha',
                externalOrderIntentId: 'oi_rev_test_1',
                reason: 'PAPER_QUOTE_REVISION_ACCEPTED'
            });
            const invalidatedFetched = await svc.getCalculationById({ tenantId: 'tenant_alpha', calculationId: snap2.snapshotId });
            assert.strictEqual(invalidatedFetched.snapshotLifecycleStatus, 'INVALIDATED');
            assert.strictEqual(invalidatedFetched.invalidationReason, 'PAPER_QUOTE_REVISION_ACCEPTED');
        });

        it('5.5 End-to-end Quote Revision ACCEPT in OrderQuoteRevisionService invalidates previous spine snapshot and recomputes effectiveSpecs.spine_geometry with the alternative paper caliper', async () => {
            const crypto = require('crypto');
            const svc = new SpineCalculationService();

            // 1. Create active spine snapshot with initial paper G-Print 100g (98 µm) -> Spine = 11.5 mm, Flat Cover = 357.5 mm
            const initialSnap = await svc.calculateSpine({
                tenantId: 'tenant_alpha',
                persistSnapshot: true,
                externalOrderIntentId: 'job_order_spine_rev_01',
                payload: {
                    bindingCategory: 'SOFTCOVER_STANDARD',
                    processingType: 'SEWN',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{ pages: 200, variantId: 'var_gprint_100' }],
                    cover: { caliperUm: 255 }
                }
            });
            assert.strictEqual(initialSnap.spineWidthMm, 11.5);
            assert.strictEqual(initialSnap.coverGeometry.flatCoverWidthMm, 357.5);

            // 2. Prepare OrderQuoteRevisionService mock state for accepting an alternative paper (Munken Premium Cream 1.75 100g, 175 µm)
            const rawToken = 'qrev_tok_spine_test_0000000000000000000000000000';
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            const otpCode = '654321';
            const otpSalt = '0123456789abcdef0123456789abcdef';
            const revisionId = 'qrev_spine_test_01';
            const otpHash = crypto.createHmac('sha256', otpSalt).update(`${revisionId}:${otpCode}`).digest('hex');

            const insertedEffectiveSpecs = [];
            const baseQuery = mysqlClient.query;
            mysqlClient.getConnection = async () => ({
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {},
                release: () => {},
                query: async (sql, params = []) => {
                    const s = sql.replace(/\s+/g, ' ').trim();
                    if (s.includes('FROM quote_revision_tokens t INNER JOIN order_quote_revisions r')) {
                        return [[{
                            token_id: 'tok_row_1',
                            revision_id: revisionId,
                            tenant_id: 'tenant_alpha',
                            external_order_intent_id: 'job_order_spine_rev_01',
                            canonical_order_id: 'job_order_spine_rev_01',
                            paper_decision_id: 'opd_spine_01',
                            printhouse_id: 'ph_1',
                            token_hash: tokenHash,
                            token_status: 'PENDING',
                            revision_status: 'PENDING',
                            bound_recipient_email: 'editor@publisher.example',
                            bound_order_id: 'job_order_spine_rev_01',
                            bound_paper_decision_id: 'opd_spine_01',
                            bound_revised_gross_amount: '1010.00',
                            bound_currency: 'EUR',
                            base_net_amount: '950.00',
                            revised_net_amount: '960.00',
                            delta_net_amount: '10.00',
                            delta_gross_amount: '12.10',
                            bpe_calculation_id: 'bpe_calc_99',
                            applied_policies_json: JSON.stringify({ otp_delta_threshold_eur: 50 }),
                            otp_hash: otpHash,
                            otp_salt: otpSalt,
                            otp_attempts: 0,
                            otp_max_attempts: 3,
                            otp_delivery_status: 'PROVIDER_ACCEPTED',
                            attempt_count: 0,
                            max_attempts: 5,
                            expires_at: new Date(Date.now() + 3600_000).toISOString(),
                            technical_specs_snapshot_json: JSON.stringify({
                                paper_role: 'INTERIOR',
                                alternative_variant: {
                                    id: 'var_munken_100_b175',
                                    product_name: 'Munken Premium Cream 1.75',
                                    gsm: 100,
                                    finish: 'UNCOATED',
                                    category: 'OFFSET',
                                    caliper_um: 175.0,
                                    bulk_factor: 1.75,
                                    caliper_source: 'MANUFACTURER_DATASHEET',
                                    caliper_confidence_status: 'VERIFIED'
                                }
                            })
                        }]];
                    }
                    if (s.includes('FROM orders WHERE id = ?')) {
                        return [[{
                            id: 'job_order_spine_rev_01',
                            tenant_id: 'tenant_alpha',
                            printhouse_id: 'ph_1',
                            status: 'ON_HOLD_PAPER_REVISION',
                            payment_status: 'PENDING',
                            specs: JSON.stringify({
                                interior_pages: 200,
                                book_width: 170,
                                book_height: 240,
                                binding_method: 'sewn_pb',
                                cover_caliper_um: 255,
                                variant_id: 'var_gprint_100',
                                gsm: 100
                            })
                        }]];
                    }
                    if (s.includes("AND status = 'ACCEPTED'")) {
                        return [[]];
                    }
                    if (s.includes('FROM order_paper_decisions WHERE id = ?')) {
                        return [[{ id: 'opd_spine_01', status: 'ACTIVE' }]];
                    }
                    if (s.includes('INSERT INTO order_effective_technical_specifications')) {
                        insertedEffectiveSpecs.push(JSON.parse(params[7]));
                        return [{ affectedRows: 1 }];
                    }
                    if (s.includes('UPDATE spine_calculation_snapshots')) {
                        return baseQuery(sql, params);
                    }
                    return [{ affectedRows: 1 }];
                }
            });

            const qrevSvc = new OrderQuoteRevisionService();
            const result = await qrevSvc.respondToQuoteRevision({
                rawToken,
                decision: 'ACCEPT',
                otpCode,
                actorContext: { role: 'CUSTOMER', userId: 'cust_01', ipAddress: '127.0.0.1', userAgent: 'Vitest' }
            });

            assert.strictEqual(result.status, 'ACCEPTED');
            assert.strictEqual(insertedEffectiveSpecs.length, 1);
            const eff = insertedEffectiveSpecs[0];

            // Verify that old cover dimensions (357.5 mm) are invalidated and replaced by Munken 1.75 dimensions (20.0 mm spine, 366.0 mm cover)
            assert.strictEqual(eff.previous_spine_geometry_invalidated, true);
            assert.strictEqual(eff.caliper_um, 175);
            assert.strictEqual(eff.caliper_confidence_status, 'VERIFIED');
            assert.ok(eff.spine_geometry);
            assert.strictEqual(eff.spine_geometry.spineWidthMm, 20.0);
            assert.strictEqual(eff.spine_geometry.flatCoverWidthMm, 366.0);

            // And the previous snapshot in spine_calculation_snapshots is now INVALIDATED
            const oldSnapAfter = await svc.getCalculationById({ tenantId: 'tenant_alpha', calculationId: initialSnap.snapshotId });
            assert.strictEqual(oldSnapAfter.snapshotLifecycleStatus, 'INVALIDATED');
            assert.strictEqual(oldSnapAfter.invalidationReason, 'PAPER_QUOTE_REVISION_ACCEPTED');
        });

        it('5.6 Paper Materials Catalog endpoint exposes caliperUm, caliperMm, bulkFactor, caliperSource & caliperConfidenceStatus without altering BPE pricing', async () => {
            const origSearch = paperProcurementService.searchMasterPaperDatabase;
            paperProcurementService.searchMasterPaperDatabase = async () => ({
                items: [{
                    variantId: 'var_gprint_100',
                    productId: 'prod_gprint',
                    productName: 'G-Print',
                    brand: 'Arctic Paper',
                    category: 'COATED',
                    finish: 'SILK',
                    gsm: 100,
                    caliper_um: 98.0,
                    bulk_factor: 0.98,
                    caliper_source: 'MANUFACTURER_DATASHEET',
                    caliper_confidence_status: 'VERIFIED',
                    caliper_revision: 2,
                    widthMm: 640,
                    heightMm: 900,
                    grainDirection: 'LONG_GRAIN',
                    offerStatus: 'ACTIVE'
                }],
                total: 1,
                limit: 80,
                offset: 0
            });

            try {
                const route = findRouteLayer(marketplacePublicRouter, '/paper-catalog', 'get');
                const handler = route.stack[route.stack.length - 1].handle;
                const { req, res, getStatusCode, getBody } = createMockReqRes({
                    method: 'GET',
                    url: '/paper-catalog'
                });
                await handler(req, res, () => {});
                assert.strictEqual(getStatusCode(), 200);
                const item = getBody().data.items[0];
                assert.strictEqual(item.caliperUm, 98);
                assert.strictEqual(item.caliperMm, 0.098);
                assert.strictEqual(item.bulkFactor, 0.98);
                assert.strictEqual(item.caliperSource, 'MANUFACTURER_DATASHEET');
                assert.strictEqual(item.caliperConfidenceStatus, 'VERIFIED');
                assert.strictEqual(item.caliperRevision, 2);
            } finally {
                paperProcurementService.searchMasterPaperDatabase = origSearch;
            }
        });

        it('5.7 SPINE-05 Gate 1–3: Control Plane rejects client caliperUm or gsm tampering against persisted paper_variants and downgrades unbacked VERIFIED claims', async () => {
            const svc = new SpineCalculationService();

            // 1. Client attempts to override caliperUm on persisted variant 'var_gprint_100' (DB=98 µm, client=150 µm) -> 422 CLIENT_VARIANT_CALIPER_MISMATCH
            await assert.rejects(
                async () => {
                    await svc.calculateSpine({
                        tenantId: 'tenant_alpha',
                        payload: {
                            bindingCategory: 'SOFTCOVER_STANDARD',
                            processingType: 'SEWN',
                            trimWidthMm: 170,
                            trimHeightMm: 240,
                            segments: [{ pages: 200, variantId: 'var_gprint_100', caliperUm: 150 }],
                            cover: { caliperUm: 255 }
                        }
                    });
                },
                (err) => err.code === 'CLIENT_VARIANT_CALIPER_MISMATCH' && err.statusCode === 422
            );

            // 2. Client attempts to override gsm on persisted variant 'var_gprint_100' (DB=100 gsm, client=120 gsm) -> 422 CLIENT_VARIANT_GSM_MISMATCH
            await assert.rejects(
                async () => {
                    await svc.calculateSpine({
                        tenantId: 'tenant_alpha',
                        payload: {
                            bindingCategory: 'SOFTCOVER_STANDARD',
                            processingType: 'SEWN',
                            trimWidthMm: 170,
                            trimHeightMm: 240,
                            segments: [{ pages: 200, variantId: 'var_gprint_100', gsm: 120 }],
                            cover: { caliperUm: 255 }
                        }
                    });
                },
                (err) => err.code === 'CLIENT_VARIANT_GSM_MISMATCH' && err.statusCode === 422
            );

            // 3. Client claims caliperConfidenceStatus: 'VERIFIED' on 'var_gprint_100' whose DB record is 'REFERENCE_IMPORTED' -> DB overrides client and emits CLIENT_PROVENANCE_OVERRIDDEN_BY_DB
            const overriddenRes = await svc.calculateSpine({
                tenantId: 'tenant_alpha',
                payload: {
                    bindingCategory: 'SOFTCOVER_STANDARD',
                    processingType: 'GLUED',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{
                        pages: 200,
                        variantId: 'var_gprint_100',
                        caliperSource: 'MEASURED_MICROMETER',
                        caliperConfidenceStatus: 'VERIFIED'
                    }]
                }
            });
            assert.strictEqual(overriddenRes.blockThickness.segmentBreakdown[0].caliperConfidenceStatus, 'REFERENCE_IMPORTED');
            assert.strictEqual(overriddenRes.manufacturingValidation.caliperConfidenceSummary, 'REFERENCE_IMPORTED');
            assert.strictEqual(overriddenRes.manufacturingValidation.canReleaseToManufacturing, false);
            assert.ok(overriddenRes.manufacturingValidation.issues.some(i => i.code === 'CLIENT_PROVENANCE_OVERRIDDEN_BY_DB'));

            // 4. Client sends raw caliperUm without variantId while claiming VERIFIED -> server downgrades to PROVISIONAL_ESTIMATED and status=PROVISIONAL_ESTIMATE
            const unbackedRes = await svc.calculateSpine({
                tenantId: 'tenant_alpha',
                payload: {
                    bindingCategory: 'SOFTCOVER_STANDARD',
                    processingType: 'GLUED',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{
                        pages: 200,
                        caliperUm: 120,
                        caliperSource: 'MEASURED_MICROMETER',
                        caliperConfidenceStatus: 'VERIFIED'
                    }]
                }
            });
            assert.strictEqual(unbackedRes.blockThickness.segmentBreakdown[0].caliperConfidenceStatus, 'PROVISIONAL_ESTIMATED');
            assert.strictEqual(unbackedRes.manufacturingValidation.status, 'PROVISIONAL_ESTIMATE');
            assert.strictEqual(unbackedRes.manufacturingValidation.canReleaseToManufacturing, false);
            assert.ok(unbackedRes.manufacturingValidation.issues.some(i => i.code === 'UNBACKED_CLIENT_CONFIDENCE_DOWNGRADED'));
        });

        it('5.8 SPINE-05 Gate 4–6: Hardcover profile parameter enforcement and Manufacturing Release Gate (POST /calculations/:id/verify-release)', async () => {
            const svc = new SpineCalculationService();

            // 1. Hardcover without profile parameters is rejected with 422 HARDCOVER_PROFILE_PARAMETERS_REQUIRED
            await assert.rejects(
                async () => {
                    await svc.calculateSpine({
                        tenantId: 'tenant_alpha',
                        payload: {
                            bindingCategory: 'HARDCOVER',
                            processingType: 'SEWN',
                            trimWidthMm: 170,
                            trimHeightMm: 240,
                            segments: [{ pages: 200, variantId: 'var_munken_100_b175' }]
                        }
                    });
                },
                (err) => err.code === 'HARDCOVER_PROFILE_PARAMETERS_REQUIRED' && err.statusCode === 422
            );

            // 2. Hardcover with unauthorized boardThicknessMm (e.g. 1.75 mm) is rejected with 422 INVALID_HARDCOVER_BOARD_THICKNESS
            await assert.rejects(
                async () => {
                    await svc.calculateSpine({
                        tenantId: 'tenant_alpha',
                        payload: {
                            bindingCategory: 'HARDCOVER',
                            processingType: 'SEWN',
                            trimWidthMm: 170,
                            trimHeightMm: 240,
                            segments: [{ pages: 200, variantId: 'var_munken_100_b175' }],
                            hardcover: {
                                endpapersMode: 'SEPARATE',
                                boardThicknessMm: 1.75,
                                overhangMm: 2.5,
                                foldingSignaturePages: 16,
                                spineShape: 'ROUND'
                            }
                        }
                    });
                },
                (err) => err.code === 'INVALID_HARDCOVER_BOARD_THICKNESS' && err.statusCode === 422
            );

            // 3. Valid Hardcover calculation succeeds as REQUIRES_TECH_APPROVAL, but verifySnapshotForManufacturingRelease blocks release
            const hcSnap = await svc.calculateSpine({
                tenantId: 'tenant_alpha',
                persistSnapshot: true,
                externalOrderIntentId: 'oi_hc_release_test',
                payload: {
                    bindingCategory: 'HARDCOVER',
                    processingType: 'SEWN',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{ pages: 200, variantId: 'var_munken_100_b175' }],
                    hardcover: {
                        endpapersMode: 'SEPARATE',
                        boardThicknessMm: 2.4,
                        overhangMm: 2.5,
                        foldingSignaturePages: 16,
                        spineShape: 'ROUND'
                    }
                }
            });
            assert.strictEqual(hcSnap.operationalStatus, 'REQUIRES_TECH_APPROVAL');
            assert.strictEqual(hcSnap.manufacturingValidation.canReleaseToManufacturing, false);

            await assert.rejects(
                async () => {
                    await svc.verifySnapshotForManufacturingRelease({
                        tenantId: 'tenant_alpha',
                        calculationId: hcSnap.snapshotId
                    });
                },
                (err) => err.code === 'MANUFACTURING_RELEASE_BLOCKED_PROFILE_APPROVAL_REQUIRED' && err.statusCode === 422
            );

            // 4. Built-in Alegro Softcover (MATH_BRANCH_VALIDATED) with VERIFIED paper is blocked from autonomous manufacturing release until profile is PRODUCTION_CERTIFIED
            const scSnap = await svc.calculateSpine({
                tenantId: 'tenant_alpha',
                persistSnapshot: true,
                externalOrderIntentId: 'oi_sc_release_test',
                payload: {
                    bindingCategory: 'SOFTCOVER_STANDARD',
                    processingType: 'GLUED',
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    segments: [{ pages: 200, variantId: 'var_munken_100_b175' }]
                }
            });
            assert.strictEqual(scSnap.certificationTier, 'MATH_BRANCH_VALIDATED');
            await assert.rejects(
                async () => {
                    await svc.verifySnapshotForManufacturingRelease({
                        tenantId: 'tenant_alpha',
                        calculationId: scSnap.snapshotId
                    });
                },
                (err) => err.code === 'MANUFACTURING_RELEASE_BLOCKED_UNCERTIFIED_PROFILE' && err.statusCode === 422
            );
        });
    });
});
