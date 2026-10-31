'use strict';

/**
 * src/api/services/spine/spineCalculationEngine.js
 *
 * PrintPrice OS — Phase 197B (SPINE-03): Pure Deterministic Spine & Cover Geometry Engine
 *
 * Implements the five decoupled calculation stages from Livonia Spine Calculator 2.0:
 * 1. calculateBlockThickness
 * 2. calculateBindingAdjustment
 * 3. calculateSpineWidth
 * 4. calculateCoverGeometry
 * 5. validateManufacturingConstraints
 *
 * Plus the four-tier epistemic classification:
 * - EXCEL_EXAMPLE_PARITY
 * - MATH_BRANCH_VALIDATED
 * - PRINTHOUSE_TECHNICALLY_VALIDATED
 * - PRODUCTION_CERTIFIED
 * (Never conflating mathematical parity with physical bindery certification.)
 *
 * Zero dependencies on browser globals, UI, network, or environment variables.
 */

const crypto = require('crypto');

const ENGINE_VERSION = '2.0.0';

/**
 * Four distinct validation / certification tiers that MUST NEVER be treated as equivalent.
 */
const CERTIFICATION_TIERS = Object.freeze({
    EXCEL_EXAMPLE_PARITY: 'EXCEL_EXAMPLE_PARITY',
    MATH_BRANCH_VALIDATED: 'MATH_BRANCH_VALIDATED',
    PRINTHOUSE_TECHNICALLY_VALIDATED: 'PRINTHOUSE_TECHNICALLY_VALIDATED',
    PRODUCTION_CERTIFIED: 'PRODUCTION_CERTIFIED'
});

/**
 * Authoritative versioned binding profiles extracted from Livonia Spine Calculator 2.0.
 */
const BUILTIN_BINDING_PROFILES = Object.freeze({
    'livonia-alegro-softcover@2.0.0': Object.freeze({
        profileId: 'livonia-alegro-softcover',
        version: '2.0.0',
        fullProfileKey: 'livonia-alegro-softcover@2.0.0',
        displayName: 'Livonia Print — Alegro Softcover (Standard & Flaps)',
        machineryLine: 'Müller Martini Alegro',
        operationalStatus: 'MATH_VALIDATED_ACTIVE',
        certificationTier: CERTIFICATION_TIERS.MATH_BRANCH_VALIDATED,
        supportedBindingCategories: Object.freeze(['SOFTCOVER_STANDARD', 'SOFTCOVER_WITH_FLAPS']),
        supportedProcessingTypes: Object.freeze(['GLUED', 'SEWN']),
        roundingStepMm: 0.5,
        rules: Object.freeze({
            gluedOffsetMm: 0.7,
            sewnSlopeFactor: 1.0718,
            sewnCoverCaliperMultiplier: 2.0,
            sewnInnerOffsetMm: -0.66,
            sewnOuterInterceptMm: 0.9964,
            bleedPerSideMm: 3.0,
            flaps: Object.freeze({
                panelTurnAllowanceMm: 2.0,
                panelAuxReferenceOffsetMm: 5.0,
                maxFlapClearanceFromWidthMm: 16.0
            })
        })
    }),
    'livonia-colibri-hardcover@2.0.0': Object.freeze({
        profileId: 'livonia-colibri-hardcover',
        version: '2.0.0',
        fullProfileKey: 'livonia-colibri-hardcover@2.0.0',
        displayName: 'Livonia Print — Colibri Hardcover & Dust Jacket',
        machineryLine: 'Kolbus / Colibri Hardcover Line',
        operationalStatus: 'REQUIRES_TECH_APPROVAL',
        certificationTier: CERTIFICATION_TIERS.MATH_BRANCH_VALIDATED,
        supportedBindingCategories: Object.freeze(['HARDCOVER']),
        supportedProcessingTypes: Object.freeze(['SEWN', 'GLUED']),
        roundingStepMm: 0.5,
        rules: Object.freeze({
            separateEndpapersThicknessMm: 0.6,
            allowedBoardThicknessesMm: Object.freeze([1.0, 2.0, 2.4, 3.0]),
            allowedOverhangsMm: Object.freeze([2.5, 3.0]),
            allowedSignaturePages: Object.freeze([16, 32]),
            sewnSwelling: Object.freeze({
                coated: Object.freeze({ slope: 1.1906, intercept: 1.2599 }),
                uncoatedUpTo29Mm: Object.freeze({ slope: 1.1338, intercept: 1.5213 }),
                uncoatedOver29MmSig16: Object.freeze({ slope: 1.1636, intercept: 1.1486 }),
                uncoatedOver29MmSig32: Object.freeze({ slope: 1.1040, intercept: 1.8940 }),
                uncoatedTechReviewThresholdMm: 29.0
            }),
            maxSewnSwellingBlockMm: 78.0,
            maxGluedBlockMm: 63.0,
            dustJacketMaxFlapClearanceMm: 20.0,
            dustJacketBleedPerSideMm: 3.0
        })
    }),
    'livonia-colibri-flexi@2.0.0': Object.freeze({
        profileId: 'livonia-colibri-flexi',
        version: '2.0.0',
        fullProfileKey: 'livonia-colibri-flexi@2.0.0',
        displayName: 'Livonia Print — Colibri Flexibound (Experimental / Disabled)',
        machineryLine: 'Kolbus / Colibri Flexi',
        operationalStatus: 'EXPERIMENTAL_DISABLED',
        certificationTier: CERTIFICATION_TIERS.EXCEL_EXAMPLE_PARITY,
        supportedBindingCategories: Object.freeze(['FLEXI_STANDARD', 'FLEXI_WITH_FLAPS']),
        supportedProcessingTypes: Object.freeze(['SEWN', 'GLUED']),
        roundingStepMm: 0.5,
        rules: Object.freeze({
            separateEndpapersThicknessMm: 0.6,
            panelWidthAllowanceMm: 4.0,
            heightInnerAllowanceMm: 6.0,
            turnInMm: 15.0,
            maxFlapClearanceFromWidthMm: 15.0,
            squareSpineEnabled: false
        })
    })
});

/**
 * Normalizes floating-point noise at 10 decimal places before step rounding.
 */
function roundToPrecision(val, decimals = 10) {
    if (!Number.isFinite(val)) return val;
    const factor = Math.pow(10, decimals);
    return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Excel _xlfn.CEILING.MATH(x, step) parity for non-negative numbers.
 */
function ceilToStep(val, step = 0.5) {
    const ratio = roundToPrecision(val / step, 10);
    return roundToPrecision(Math.ceil(ratio) * step, 4);
}

/**
 * Excel _xlfn.FLOOR.MATH(x, step) parity for non-negative numbers.
 */
function floorToStep(val, step = 0.5) {
    const ratio = roundToPrecision(val / step, 10);
    return roundToPrecision(Math.floor(ratio) * step, 4);
}

/**
 * Excel MROUND(x, step) parity (rounds half away from zero / up for positive values).
 */
function mroundToStep(val, step = 0.5) {
    const ratio = roundToPrecision(val / step, 10);
    return roundToPrecision(Math.floor(ratio + 0.5) * step, 4);
}

/**
 * Stepwise radius lookup table R(x) from Livonia Sheets 3, 4, and 5 (cells AF5, AF10, R4, R9).
 * Returns null when x > 78 mm ("bloks par lielu").
 */
function resolveColibriRoundSpineRadiusMm(x) {
    if (!Number.isFinite(x) || x < 0) return null;
    if (x <= 10) return 16;
    if (x <= 14) return 16;
    if (x <= 18) return 20;
    if (x <= 22) return 20;
    if (x <= 26) return 23;
    if (x <= 30) return 28;
    if (x <= 34) return 30;
    if (x <= 38) return 35;
    if (x <= 42) return 45;
    if (x <= 46) return 50;
    if (x <= 50) return 55;
    if (x <= 54) return 60;
    if (x <= 58) return 65;
    if (x <= 63) return 65;
    if (x <= 66) return 70;
    if (x <= 69) return 70;
    if (x <= 72) return 80;
    if (x <= 75) return 85;
    if (x <= 78) return 90;
    return null;
}

/**
 * Evaluates the exact Excel circular arc formula:
 * MROUND((PI() * R * 2 * (90 - ACOS(x / 2 / R) * 180 / PI())) / 180, 0.5)
 */
function calculateColibriArcLengthMm(chordMm, step = 0.5) {
    const radiusMm = resolveColibriRoundSpineRadiusMm(chordMm);
    if (radiusMm === null) {
        return { radiusMm: null, arcRawMm: null, arcRoundedMm: null, exceedsMax: true };
    }
    if (chordMm === 0) {
        return { radiusMm, arcRawMm: 0, arcRoundedMm: 0, exceedsMax: false };
    }
    const ratio = chordMm / (2 * radiusMm);
    const clampedRatio = Math.max(-1, Math.min(1, ratio));
    const angleDeg = 90 - (Math.acos(clampedRatio) * 180) / Math.PI;
    const arcRawMm = (Math.PI * radiusMm * 2 * angleDeg) / 180;
    const arcRoundedMm = mroundToStep(arcRawMm, step);
    return {
        radiusMm,
        arcRawMm: roundToPrecision(arcRawMm, 10),
        arcRoundedMm,
        exceedsMax: false
    };
}

/**
 * Resolves the Colibri hinge score (Rastri, cell H15 / AD23 / AD30) in mm.
 */
function resolveColibriHingeScoreRastriMm({ totalBlockWithEndpapersMm, spineShape, boardThicknessMm }) {
    const b = Number(boardThicknessMm);
    if (spineShape === 'ROUND') {
        if (totalBlockWithEndpapersMm < 30) return 8.0;
        if (totalBlockWithEndpapersMm < 40) return Math.abs(b - 3.0) < 0.01 ? 10.0 : 9.0;
        return 10.0;
    }
    // SQUARE spine (AD30 -> AA30 if < 5mm else AA32)
    if (totalBlockWithEndpapersMm < 5) {
        if (Math.abs(b - 1.0) < 0.01) return 7.0;
        if (Math.abs(b - 2.0) < 0.01) return 8.0;
        if (Math.abs(b - 2.4) < 0.01) return 8.5;
        return 9.0;
    }
    if (Math.abs(b - 1.0) < 0.01) return 9.0;
    if (Math.abs(b - 2.0) < 0.01) return 10.0;
    if (Math.abs(b - 2.4) < 0.01) return 10.5;
    return 11.0;
}

/**
 * STAGE 1: Pure function calculateBlockThickness
 * Formula: T_bloque = sum((P_i / 2) * (caliper_um_i / 1000)) + endpapersAllowanceMm
 */
function calculateBlockThickness(segments = [], hardcoverConfig = null, bindingCategory = 'SOFTCOVER_STANDARD') {
    const normalizedSegments = Array.isArray(segments) ? segments : [];
    const segmentBreakdown = [];
    let netPaperBlockMm = 0;
    let totalPages = 0;

    for (let i = 0; i < normalizedSegments.length; i++) {
        const seg = normalizedSegments[i] || {};
        const pages = Number(seg.pages || 0);
        const caliperUm = seg.caliperUm !== undefined && seg.caliperUm !== null ? Number(seg.caliperUm) : null;
        const sheets = pages / 2;
        let thicknessMm = 0;
        if (pages > 0 && caliperUm !== null && Number.isFinite(caliperUm) && caliperUm > 0) {
            thicknessMm = roundToPrecision((pages / 2) * (caliperUm / 1000), 10);
            netPaperBlockMm = roundToPrecision(netPaperBlockMm + thicknessMm, 10);
        }
        totalPages += pages;
        segmentBreakdown.push({
            segmentIndex: seg.segmentIndex || i + 1,
            pages,
            sheets,
            caliperUm,
            thicknessMm,
            variantId: seg.variantId || null,
            gsm: seg.gsm || null,
            caliperSource: seg.caliperSource || 'NONE',
            caliperConfidenceStatus: seg.caliperConfidenceStatus || (caliperUm && caliperUm > 0 ? 'REFERENCE_IMPORTED' : 'MISSING')
        });
    }

    let endpapersAllowanceMm = 0;
    if (
        (bindingCategory === 'HARDCOVER' || bindingCategory === 'FLEXI_STANDARD' || bindingCategory === 'FLEXI_WITH_FLAPS') &&
        hardcoverConfig &&
        hardcoverConfig.endpapersMode === 'SEPARATE'
    ) {
        endpapersAllowanceMm = 0.6;
    }

    const totalBlockWithEndpapersMm = roundToPrecision(netPaperBlockMm + endpapersAllowanceMm, 10);

    return {
        totalPages,
        netPaperBlockMm,
        endpapersAllowanceMm,
        totalBlockWithEndpapersMm,
        segmentBreakdown
    };
}

/**
 * STAGE 2: Pure function calculateBindingAdjustment
 * Computes glued and sewn candidates, swelling (Uzaugums), circular arc lengths, and board theoretical thickness.
 */
function calculateBindingAdjustment(blockThicknessResult, input, profile) {
    const { netPaperBlockMm, totalBlockWithEndpapersMm } = blockThicknessResult;
    const bindingCategory = input.bindingCategory;
    const processingType = input.processingType || 'SEWN';
    const step = profile.roundingStepMm || 0.5;

    if (bindingCategory === 'SOFTCOVER_STANDARD' || bindingCategory === 'SOFTCOVER_WITH_FLAPS') {
        const rules = profile.rules;
        const coverCaliperUm = input.cover && input.cover.caliperUm !== undefined && input.cover.caliperUm !== null
            ? Number(input.cover.caliperUm)
            : 0;

        const gluedCandidateSpineMm = ceilToStep(netPaperBlockMm + rules.gluedOffsetMm, step);
        const sewnRaw = rules.sewnSlopeFactor * (
            netPaperBlockMm + (rules.sewnCoverCaliperMultiplier * coverCaliperUm) / 1000 + rules.sewnInnerOffsetMm
        ) + rules.sewnOuterInterceptMm;
        const sewnCandidateSpineMm = ceilToStep(sewnRaw, step);

        return {
            processingType,
            spineShape: 'SQUARE',
            coverCaliperUmUsed: coverCaliperUm,
            sewnSwellingBlockMm: null,
            arcRadiusMm: null,
            arcLengthRoundedMm: null,
            theoreticalWithBoardMm: null,
            gluedCandidateSpineMm,
            sewnCandidateSpineMm,
            branches: {
                glued: gluedCandidateSpineMm,
                sewn: sewnCandidateSpineMm
            }
        };
    }

    // HARDCOVER or FLEXI (Colibri rules)
    const hc = input.hardcover || {};
    const blockPaperCoating = hc.blockPaperCoating || 'UNCOATED';
    const spineShape = hc.spineShape || 'ROUND';
    const foldingSignaturePages = Number(hc.foldingSignaturePages || 16);
    const boardThicknessMm = Number(hc.boardThicknessMm || 3.0);
    const twoTimesBoardMm = roundToPrecision(boardThicknessMm * 2, 4);

    // Uzaugums (AG3 in Sheet 3, S2 in Sheets 4 & 5)
    let sewnSwellingBlockMm;
    if (blockPaperCoating === 'COATED') {
        sewnSwellingBlockMm = roundToPrecision(1.1906 * totalBlockWithEndpapersMm + 1.2599, 10);
    } else if (totalBlockWithEndpapersMm <= 29) {
        sewnSwellingBlockMm = roundToPrecision(1.1338 * totalBlockWithEndpapersMm + 1.5213, 10);
    } else if (foldingSignaturePages === 16) {
        sewnSwellingBlockMm = roundToPrecision(1.1636 * totalBlockWithEndpapersMm + 1.1486, 10);
    } else {
        sewnSwellingBlockMm = roundToPrecision(1.1040 * totalBlockWithEndpapersMm + 1.8940, 10);
    }

    // Sewn Round Arc (AF5 / R4)
    const sewnRoundArc = calculateColibriArcLengthMm(sewnSwellingBlockMm, step);
    const sewnRoundFinalMm = sewnRoundArc.exceedsMax ? null : roundToPrecision(sewnRoundArc.arcRoundedMm + 1.0, 4);

    // Glued Round Arc (AF10 / R9)
    const gluedRoundArc = calculateColibriArcLengthMm(totalBlockWithEndpapersMm, step);

    if (bindingCategory === 'HARDCOVER') {
        // Hardcover Square Sewn (AH5 & AH6)
        const theoreticalWithBoardMm = roundToPrecision(totalBlockWithEndpapersMm + twoTimesBoardMm, 10);
        const sewnSquareCandidateMm = sewnSwellingBlockMm > theoreticalWithBoardMm
            ? mroundToStep(sewnSwellingBlockMm, step)
            : floorToStep(theoreticalWithBoardMm, step);
        const sewnSquareFinalMm = sewnSwellingBlockMm > 78 ? null : sewnSquareCandidateMm;

        // Hardcover Round Glued (AF11 & AF15)
        const gluedRoundCandidateMm = gluedRoundArc.exceedsMax
            ? null
            : roundToPrecision(mroundToStep(gluedRoundArc.arcRoundedMm + (twoTimesBoardMm / 2), step) + 2.0, 4);
        const gluedRoundFinalMm = totalBlockWithEndpapersMm > 63 ? null : gluedRoundCandidateMm;

        // Hardcover Square Glued (AH10 & AF16)
        const gluedSquareCandidateMm = mroundToStep(totalBlockWithEndpapersMm + twoTimesBoardMm + 0.5, step);
        const gluedSquareFinalMm = totalBlockWithEndpapersMm > 63 ? null : gluedSquareCandidateMm;

        return {
            processingType,
            spineShape,
            boardThicknessMm,
            twoTimesBoardMm,
            sewnSwellingBlockMm,
            sewnRoundArcMm: sewnRoundArc.arcRoundedMm,
            sewnRoundRadiusMm: sewnRoundArc.radiusMm,
            gluedRoundArcMm: gluedRoundArc.arcRoundedMm,
            gluedRoundRadiusMm: gluedRoundArc.radiusMm,
            theoreticalWithBoardMm,
            gluedCandidateSpineMm: spineShape === 'ROUND' ? gluedRoundFinalMm : gluedSquareFinalMm,
            sewnCandidateSpineMm: spineShape === 'ROUND' ? sewnRoundFinalMm : sewnSquareFinalMm,
            branches: {
                sewnRound_AF13: sewnRoundFinalMm,
                sewnSquare_AF14: sewnSquareFinalMm,
                gluedRound_AF15: gluedRoundFinalMm,
                gluedSquare_AF16: gluedSquareFinalMm
            }
        };
    }

    // FLEXI (Sheets 4 & 5)
    const flexiSewnSquareCandidateMm = roundToPrecision(mroundToStep(sewnSwellingBlockMm, step) + 2.0, 4);
    const flexiSewnSquareFinalMm = sewnSwellingBlockMm > 78 ? null : flexiSewnSquareCandidateMm;

    const flexiGluedRoundCandidateMm = gluedRoundArc.exceedsMax
        ? null
        : roundToPrecision(mroundToStep(gluedRoundArc.arcRoundedMm, step) + 2.0, 4);
    const flexiGluedRoundFinalMm = totalBlockWithEndpapersMm > 63 ? null : flexiGluedRoundCandidateMm;

    const flexiGluedSquareCandidateMm = roundToPrecision(mroundToStep(totalBlockWithEndpapersMm + 0.5, step) + 2.5, 4);
    const flexiGluedSquareFinalMm = totalBlockWithEndpapersMm > 63 ? null : flexiGluedSquareCandidateMm;

    return {
        processingType,
        spineShape,
        sewnSwellingBlockMm,
        sewnRoundArcMm: sewnRoundArc.arcRoundedMm,
        sewnRoundRadiusMm: sewnRoundArc.radiusMm,
        gluedRoundArcMm: gluedRoundArc.arcRoundedMm,
        gluedRoundRadiusMm: gluedRoundArc.radiusMm,
        theoreticalWithBoardMm: null,
        // Note: In Livonia Flexi sheets (R17), only round spine branches (R12, R14) are connected
        gluedCandidateSpineMm: spineShape === 'ROUND' ? flexiGluedRoundFinalMm : flexiGluedSquareFinalMm,
        sewnCandidateSpineMm: spineShape === 'ROUND' ? sewnRoundFinalMm : flexiSewnSquareFinalMm,
        branches: {
            sewnRound_R12: sewnRoundFinalMm,
            sewnSquare_R13_disabled: flexiSewnSquareFinalMm,
            gluedRound_R14: flexiGluedRoundFinalMm,
            gluedSquare_R15_disabled: flexiGluedSquareFinalMm
        }
    };
}

/**
 * STAGE 3: Pure function calculateSpineWidth
 * Selects the authoritative spine width (in mm) based on processingType and spineShape.
 */
function calculateSpineWidth(blockThicknessResult, bindingAdjustmentResult, input) {
    const processingType = input.processingType || 'SEWN';
    const selectedSpineMm = processingType === 'GLUED'
        ? bindingAdjustmentResult.gluedCandidateSpineMm
        : bindingAdjustmentResult.sewnCandidateSpineMm;

    return {
        spineWidthMm: selectedSpineMm !== undefined && selectedSpineMm !== null ? Number(selectedSpineMm) : null
    };
}

/**
 * STAGE 4: Pure function calculateCoverGeometry
 * Computes flat cover dimensions, net open cover, panels, boards, hinges, turn-ins, and dust jacket.
 */
function calculateCoverGeometry(input, blockThicknessResult, bindingAdjustmentResult, spineWidthResult, profile) {
    const W = Number(input.trimWidthMm);
    const H = Number(input.trimHeightMm);
    const S = spineWidthResult.spineWidthMm !== null ? Number(spineWidthResult.spineWidthMm) : 0;
    const bindingCategory = input.bindingCategory;

    if (bindingCategory === 'SOFTCOVER_STANDARD') {
        const bleed = profile.rules.bleedPerSideMm || 3.0;
        const netCoverWidthMm = roundToPrecision(2 * W + S, 4);
        const netCoverHeightMm = H;
        const flatCoverWidthMm = roundToPrecision(netCoverWidthMm + 2 * bleed, 4);
        const flatCoverHeightMm = roundToPrecision(H + 2 * bleed, 4);

        return {
            bleedPerSideMm: bleed,
            netCoverWidthMm,
            netCoverHeightMm,
            flatCoverWidthMm,
            flatCoverHeightMm,
            panels: {
                leftFlapMm: null,
                backPanelMm: W,
                leftHingeScoreMm: null,
                spineMm: S,
                rightHingeScoreMm: null,
                frontPanelMm: W,
                rightFlapMm: null,
                panelAuxRefMm: null,
                turnInMm: null,
                boardWidthMm: null,
                boardHeightMm: null
            },
            dustJacket: null
        };
    }

    if (bindingCategory === 'SOFTCOVER_WITH_FLAPS') {
        const bleed = profile.rules.bleedPerSideMm || 3.0;
        const turnAllowance = profile.rules.flaps.panelTurnAllowanceMm || 2.0;
        const auxOffset = profile.rules.flaps.panelAuxReferenceOffsetMm || 5.0;
        const F = Number((input.cover && input.cover.flapWidthMm) || 0);

        const backPanelMm = roundToPrecision(W + turnAllowance, 4);
        const frontPanelMm = roundToPrecision(W + turnAllowance, 4);
        const panelAuxRefMm = roundToPrecision(backPanelMm + auxOffset, 4);
        const netCoverWidthMm = roundToPrecision(F + backPanelMm + S + frontPanelMm + F, 4);
        const netCoverHeightMm = H;
        const flatCoverWidthMm = roundToPrecision(netCoverWidthMm + 2 * bleed, 4);
        const flatCoverHeightMm = roundToPrecision(H + 2 * bleed, 4);

        return {
            bleedPerSideMm: bleed,
            netCoverWidthMm,
            netCoverHeightMm,
            flatCoverWidthMm,
            flatCoverHeightMm,
            panels: {
                leftFlapMm: F,
                backPanelMm,
                leftHingeScoreMm: null,
                spineMm: S,
                rightHingeScoreMm: null,
                frontPanelMm,
                rightFlapMm: F,
                panelAuxRefMm,
                turnInMm: null,
                boardWidthMm: null,
                boardHeightMm: null
            },
            dustJacket: null
        };
    }

    if (bindingCategory === 'HARDCOVER') {
        const hc = input.hardcover || {};
        const spineShape = hc.spineShape || 'ROUND';
        const boardThicknessMm = Number(hc.boardThicknessMm || 3.0);
        const overhangMm = Number(hc.overhangMm || 2.5);
        const totalBlock = blockThicknessResult.totalBlockWithEndpapersMm;

        // Board width (AA18 for ROUND, AA20 for SQUARE)
        let boardWidthMm;
        if (spineShape === 'ROUND') {
            boardWidthMm = totalBlock <= 30 ? W - 5 : W - 6;
        } else {
            boardWidthMm = totalBlock <= 5 ? W - 3 : W - 5;
        }

        // Board height (J16: C11+6 if overhang=3.0 else C11+5)
        const boardHeightMm = Math.abs(overhangMm - 3.0) < 0.01 ? H + 6 : H + 5;

        // Hinge score Rastri (H15)
        const hingeScoreMm = resolveColibriHingeScoreRastriMm({
            totalBlockWithEndpapersMm: totalBlock,
            spineShape,
            boardThicknessMm
        });

        // Turn-in Noloki (H17: 19 mm if board=3.0 mm else 18 mm)
        const turnInMm = Math.abs(boardThicknessMm - 3.0) < 0.01 ? 19 : 18;

        // Open board spread without turn-ins (E40)
        const netCoverWidthMm = roundToPrecision(2 * boardWidthMm + 2 * hingeScoreMm + S, 4);
        const netCoverHeightMm = boardHeightMm;

        // Full cover wrap with turn-ins (H18 x H19)
        const flatCoverWidthMm = roundToPrecision(netCoverWidthMm + 2 * turnInMm, 4);
        const flatCoverHeightMm = roundToPrecision(boardHeightMm + 2 * turnInMm, 4);

        let dustJacket = null;
        if (hc.dustJacket && hc.dustJacket.enabled) {
            const djFlapMm = Number(hc.dustJacket.flapWidthMm || 80);
            const djPanelWidthMm = roundToPrecision(boardWidthMm + hingeScoreMm, 4); // P31 = T31 = G31 + F36
            const djPanelPlusHingeRefMm = roundToPrecision(djPanelWidthMm + 8, 4);   // P34 = T34 = P31 + 8
            const djNetWidthMm = roundToPrecision(2 * djFlapMm + 2 * djPanelWidthMm + S, 4); // R40
            const djFlatWidthWithBleedMm = roundToPrecision(djNetWidthMm + 6, 4);    // R20 = R40 + 6
            const djFlatHeightWithBleedMm = roundToPrecision(boardHeightMm + 6, 4);  // R21 = X30 + 6

            dustJacket = {
                enabled: true,
                flapWidthMm: djFlapMm,
                panelWidthMm: djPanelWidthMm,
                panelWithHingeRefMm: djPanelPlusHingeRefMm,
                netWidthMm: djNetWidthMm,
                flatWidthWithBleedMm: djFlatWidthWithBleedMm,
                flatHeightWithBleedMm: djFlatHeightWithBleedMm
            };
        }

        return {
            bleedPerSideMm: 0, // Hardcover wrap uses turnInMm (Noloki), not trim bleed
            netCoverWidthMm,
            netCoverHeightMm,
            flatCoverWidthMm,
            flatCoverHeightMm,
            panels: {
                leftFlapMm: null,
                backPanelMm: boardWidthMm,
                leftHingeScoreMm: hingeScoreMm,
                spineMm: S,
                rightHingeScoreMm: hingeScoreMm,
                frontPanelMm: boardWidthMm,
                rightFlapMm: null,
                panelAuxRefMm: null,
                turnInMm,
                boardWidthMm,
                boardHeightMm
            },
            dustJacket
        };
    }

    // FLEXI_STANDARD or FLEXI_WITH_FLAPS (Sheets 4 & 5)
    const panelMm = W + 4;
    const innerHeightMm = H + 6;
    const turnInMm = 15;
    const flatCoverHeightMm = innerHeightMm + 2 * turnInMm; // H + 36

    if (bindingCategory === 'FLEXI_STANDARD') {
        const netCoverWidthMm = roundToPrecision(2 * panelMm + S, 4); // E41 = C32 + E32 + G32
        const flatCoverWidthMm = roundToPrecision(netCoverWidthMm + 2 * turnInMm, 4); // E23 = E41 + 30
        return {
            bleedPerSideMm: 0,
            netCoverWidthMm,
            netCoverHeightMm: innerHeightMm,
            flatCoverWidthMm,
            flatCoverHeightMm,
            panels: {
                leftFlapMm: null,
                backPanelMm: panelMm,
                leftHingeScoreMm: null,
                spineMm: S,
                rightHingeScoreMm: null,
                frontPanelMm: panelMm,
                rightFlapMm: null,
                panelAuxRefMm: null,
                turnInMm,
                boardWidthMm: null,
                boardHeightMm: null
            },
            dustJacket: null
        };
    }

    // FLEXI_WITH_FLAPS (Sheet 5)
    const F = Number((input.cover && input.cover.flapWidthMm) || 0);
    const netCoverWidthMm = roundToPrecision(2 * F + 2 * panelMm + S, 4); // E39
    return {
        bleedPerSideMm: 0,
        netCoverWidthMm,
        netCoverHeightMm: innerHeightMm,
        flatCoverWidthMm: netCoverWidthMm, // D18 = E39
        flatCoverHeightMm,
        panels: {
            leftFlapMm: F,
            backPanelMm: panelMm,
            leftHingeScoreMm: null,
            spineMm: S,
            rightHingeScoreMm: null,
            frontPanelMm: panelMm,
            rightFlapMm: F,
            panelAuxRefMm: null,
            turnInMm,
            boardWidthMm: null,
            boardHeightMm: null
        },
        dustJacket: null
    };
}

/**
 * STAGE 5: Pure function validateManufacturingConstraints
 * Evaluates all physical, material, and operational constraints, separating the 4 certification tiers.
 */
function validateManufacturingConstraints(input, blockThicknessResult, bindingAdjustmentResult, spineWidthResult, profile) {
    const issues = [];
    const W = Number(input.trimWidthMm);
    const H = Number(input.trimHeightMm);
    const bindingCategory = input.bindingCategory;
    const processingType = input.processingType || 'SEWN';

    if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(H) || H <= 0) {
        issues.push({
            code: 'INVALID_TRIM_DIMENSIONS',
            severity: 'ERROR',
            message: 'Book trim width and height must be positive numbers in millimeters.'
        });
    }

    // 1. Total pages & segment checks
    if (blockThicknessResult.totalPages <= 0) {
        issues.push({
            code: 'ZERO_TOTAL_PAGES',
            severity: 'ERROR',
            excelCellRef: 'C7:C8',
            message: 'Total book page count must be greater than zero.'
        });
    }

    let worstConfidence = 'VERIFIED';
    const confidenceOrder = { VERIFIED: 3, REFERENCE_IMPORTED: 2, PROVISIONAL_ESTIMATED: 1, MISSING: 0 };

    for (const seg of blockThicknessResult.segmentBreakdown) {
        if (seg.pages > 0) {
            if (seg.pages % 2 !== 0) {
                issues.push({
                    code: 'ODD_PAGE_COUNT_NOT_DIVISIBLE_BY_2',
                    severity: 'WARNING',
                    excelCellRef: `C${6 + seg.segmentIndex}`,
                    message: `Segment ${seg.segmentIndex} has an odd page count (${seg.pages}). Physical leaves contain 2 pages per sheet.`
                });
            }
            if (seg.caliperUm === null || !Number.isFinite(seg.caliperUm) || seg.caliperUm <= 0) {
                issues.push({
                    code: 'MISSING_SEGMENT_CALIPER',
                    severity: 'ERROR',
                    excelCellRef: `E${6 + seg.segmentIndex}`,
                    message: `Segment ${seg.segmentIndex} (${seg.pages} pp) lacks a valid paper caliper (µm). Cannot certify spine width from gsm alone.`
                });
                worstConfidence = 'MISSING';
            } else {
                const status = seg.caliperConfidenceStatus || 'REFERENCE_IMPORTED';
                if ((confidenceOrder[status] ?? 1) < (confidenceOrder[worstConfidence] ?? 3)) {
                    worstConfidence = status;
                }
                if (status === 'PROVISIONAL_ESTIMATED') {
                    issues.push({
                        code: 'PROVISIONAL_CALIPER_USED',
                        severity: 'WARNING',
                        excelCellRef: `E${6 + seg.segmentIndex}`,
                        message: `Segment ${seg.segmentIndex} uses a provisional/estimated caliper (${seg.caliperUm} µm). Physical micrometer or datasheet verification required before bindery release.`
                    });
                }
            }
        }
    }

    // 2. Softcover specific constraints (Alegro)
    if (bindingCategory === 'SOFTCOVER_STANDARD' || bindingCategory === 'SOFTCOVER_WITH_FLAPS') {
        if (processingType === 'SEWN') {
            const coverUm = input.cover && input.cover.caliperUm !== undefined && input.cover.caliperUm !== null
                ? Number(input.cover.caliperUm)
                : null;
            if (coverUm === null || !Number.isFinite(coverUm) || coverUm <= 0) {
                issues.push({
                    code: 'MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER',
                    severity: 'WARNING',
                    excelCellRef: 'E10',
                    message: 'Sewn softcover formula in Alegro profile depends on cover board caliper (E10). Missing cover caliper makes calculation provisional.'
                });
                if (worstConfidence !== 'MISSING') worstConfidence = 'PROVISIONAL_ESTIMATED';
            }
        }

        if (bindingCategory === 'SOFTCOVER_WITH_FLAPS') {
            const flapW = Number((input.cover && input.cover.flapWidthMm) || 0);
            if (flapW <= 0) {
                issues.push({
                    code: 'INVALID_FLAP_WIDTH',
                    severity: 'ERROR',
                    excelCellRef: 'E11',
                    message: 'Softcover with flaps requires a positive flap width (mm).'
                });
            } else if (flapW > W - 16) {
                issues.push({
                    code: 'FLAP_WIDTH_EXCEEDS_LIMIT',
                    severity: 'ERROR',
                    excelCellRef: 'B22',
                    excelMessageOriginal: 'Atloki pārāk lieli. Samazini atlokus.',
                    message: `Flap width (${flapW} mm) exceeds maximum allowed for book width ${W} mm (max ${W - 16} mm).`
                });
            }
        }
    }

    // 3. Hardcover & Flexi specific constraints (Colibri)
    if (bindingCategory === 'HARDCOVER' || bindingCategory === 'FLEXI_STANDARD' || bindingCategory === 'FLEXI_WITH_FLAPS') {
        const hc = input.hardcover || {};
        const totalBlock = blockThicknessResult.totalBlockWithEndpapersMm;
        const swelling = bindingAdjustmentResult.sewnSwellingBlockMm;

        if (processingType === 'SEWN' && swelling > 78) {
            issues.push({
                code: 'BLOCK_THICKNESS_EXCEEDS_MAX_SEWN_78MM',
                severity: 'ERROR',
                excelCellRef: 'AF5 / AF13 / B22',
                excelMessageOriginal: 'Grāmata pārāk bieza. Samazini lpp. skaitu, vai izvēlies plānāku papīru.',
                message: `Sewn expanded block thickness (${swelling.toFixed(2)} mm) exceeds Colibri maximum limit of 78.0 mm.`
            });
        }

        if (processingType === 'GLUED' && totalBlock > 63) {
            issues.push({
                code: 'BLOCK_THICKNESS_EXCEEDS_MAX_GLUED_63MM',
                severity: 'ERROR',
                excelCellRef: 'AF15 / AF16 / B22',
                excelMessageOriginal: 'Grāmata pārāk bieza. Samazini lpp. skaitu, vai izvēlies plānāku papīru.',
                message: `Glued block thickness (${totalBlock.toFixed(2)} mm) exceeds Colibri maximum limit of 63.0 mm.`
            });
        }

        if (processingType === 'SEWN' && hc.blockPaperCoating === 'UNCOATED' && totalBlock > 29) {
            issues.push({
                code: 'UNCOATED_BLOCK_OVER_29MM_TECH_REVIEW_RECOMMENDED',
                severity: 'WARNING',
                excelCellRef: 'AI3 / AF13',
                excelMessageOriginal: 'Nekrītots līdz 29mm var rekinat, virs, rekina tehnologi',
                message: `Uncoated sewn block (${totalBlock.toFixed(2)} mm) exceeds 29.0 mm threshold. Technologist verification required.`
            });
        }

        if (bindingCategory === 'HARDCOVER' && hc.dustJacket && hc.dustJacket.enabled) {
            const djFlap = Number(hc.dustJacket.flapWidthMm || 0);
            if (djFlap > W - 20) {
                issues.push({
                    code: 'DUST_JACKET_FLAP_EXCEEDS_LIMIT',
                    severity: 'ERROR',
                    excelCellRef: 'T18',
                    excelMessageOriginal: 'Atloki pārāk lieli.',
                    message: `Dust jacket flap width (${djFlap} mm) exceeds maximum allowed (${W - 20} mm).`
                });
            }
        }
    }

    // 4. Flexi specific blocks
    if (bindingCategory === 'FLEXI_STANDARD' || bindingCategory === 'FLEXI_WITH_FLAPS') {
        const hc = input.hardcover || {};
        if (hc.spineShape === 'SQUARE') {
            issues.push({
                code: 'FLEXI_SQUARE_SPINE_NOT_SUPPORTED',
                severity: 'ERROR',
                excelCellRef: 'S13 / S15',
                excelMessageOriginal: 'pagaidām flexi neizmantojam',
                message: 'Square spine Flexibound is explicitly disabled in Livonia Colibri profile ("pagaidām flexi neizmantojam").'
            });
        }
        if (bindingCategory === 'FLEXI_WITH_FLAPS') {
            const flapW = Number((input.cover && input.cover.flapWidthMm) || 0);
            if (flapW + 15 > W) {
                issues.push({
                    code: 'FLAP_WIDTH_EXCEEDS_LIMIT',
                    severity: 'ERROR',
                    excelCellRef: 'A22',
                    excelMessageOriginal: 'Atloki pārāk lieli.',
                    message: `Flexi flap width (${flapW} mm) exceeds maximum allowed (${W - 15} mm).`
                });
            }
            issues.push({
                code: 'FLEXI_FLAP_LATERAL_BLEED_UNVERIFIED',
                severity: 'WARNING',
                excelCellRef: 'E39 / D18',
                message: 'Livonia Sheet 5 (Flexi with flaps) omits lateral bleed on flap edges (E39). Physical sample verification required.'
            });
        }
        issues.push({
            code: 'PROFILE_REQUIRES_PRINTHOUSE_TECH_APPROVAL',
            severity: 'ERROR',
            message: 'Flexi profile is EXPERIMENTAL_DISABLED and cannot be used for automated production calculations.'
        });
    } else if (profile.operationalStatus === 'REQUIRES_TECH_APPROVAL') {
        issues.push({
            code: 'PROFILE_REQUIRES_PRINTHOUSE_TECH_APPROVAL',
            severity: 'WARNING',
            message: `Binding profile '${profile.fullProfileKey}' requires explicit printhouse technologist approval before manufacturing release.`
        });
    }

    const hasError = issues.some(i => i.severity === 'ERROR');
    const requiresTechReview = !hasError && (
        profile.operationalStatus === 'REQUIRES_TECH_APPROVAL' ||
        issues.some(i => i.code === 'UNCOATED_BLOCK_OVER_29MM_TECH_REVIEW_RECOMMENDED')
    );

    let status = 'MATH_VALIDATED';
    if (hasError) {
        status = 'INVALID_BLOCKED';
    } else if (requiresTechReview) {
        status = 'REQUIRES_TECH_REVIEW';
    } else if (worstConfidence === 'PROVISIONAL_ESTIMATED' || issues.some(i => i.code === 'MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER')) {
        status = 'PROVISIONAL_ESTIMATE';
    }

    // Strict separation of the 4 certification levels:
    // Autonomous manufacturing release is ONLY true if status === 'MATH_VALIDATED' AND profile.certificationTier === 'PRODUCTION_CERTIFIED'
    const canReleaseToManufacturing = (
        status === 'MATH_VALIDATED' &&
        profile.certificationTier === CERTIFICATION_TIERS.PRODUCTION_CERTIFIED &&
        worstConfidence === 'VERIFIED'
    );

    const canUseForCoverTemplatePreview = status === 'MATH_VALIDATED' || status === 'REQUIRES_TECH_REVIEW';

    return {
        status,
        certificationTier: profile.certificationTier,
        levels: {
            excelExampleParity: true,
            mathBranchValidated: !hasError,
            printhouseTechnicallyValidated: (
                profile.certificationTier === CERTIFICATION_TIERS.PRINTHOUSE_TECHNICALLY_VALIDATED ||
                profile.certificationTier === CERTIFICATION_TIERS.PRODUCTION_CERTIFIED
            ),
            productionCertifiedForManufacturing: canReleaseToManufacturing
        },
        canUseForCoverTemplatePreview,
        canReleaseToManufacturing,
        requiresTechnologistApproval: requiresTechReview || profile.certificationTier !== CERTIFICATION_TIERS.PRODUCTION_CERTIFIED,
        caliperConfidenceSummary: worstConfidence,
        issues
    };
}

/**
 * Canonical JSON serialization for deterministic SHA-256 hashing.
 */
function canonicalizeObject(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(canonicalizeObject);
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && obj[key] !== undefined) {
            sorted[key] = canonicalizeObject(obj[key]);
        }
    }
    return sorted;
}

function computeCanonicalHash(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(canonicalizeObject(obj))).digest('hex');
}

/**
 * Resolves the authoritative profile for a given bindingCategory or profileId.
 */
function resolveBindingProfile(bindingCategory, requestedProfileKey = null, customProfilesMap = null) {
    const map = customProfilesMap || BUILTIN_BINDING_PROFILES;
    if (requestedProfileKey && map[requestedProfileKey]) {
        return map[requestedProfileKey];
    }
    if (bindingCategory === 'SOFTCOVER_STANDARD' || bindingCategory === 'SOFTCOVER_WITH_FLAPS') {
        return map['livonia-alegro-softcover@2.0.0'];
    }
    if (bindingCategory === 'HARDCOVER') {
        return map['livonia-colibri-hardcover@2.0.0'];
    }
    if (bindingCategory === 'FLEXI_STANDARD' || bindingCategory === 'FLEXI_WITH_FLAPS') {
        return map['livonia-colibri-flexi@2.0.0'];
    }
    return null;
}

/**
 * Master pure orchestrator function: executeSpineCalculation
 */
function executeSpineCalculation(input, resolvedProfile = null) {
    const bindingCategory = input.bindingCategory || 'SOFTCOVER_STANDARD';
    const profile = resolvedProfile || resolveBindingProfile(bindingCategory, input.profileKey);
    if (!profile) {
        throw new Error(`UNSUPPORTED_BINDING_PROFILE: Could not resolve binding profile for category '${bindingCategory}'.`);
    }

    const blockThickness = calculateBlockThickness(input.segments, input.hardcover, bindingCategory);
    const bindingAdjustment = calculateBindingAdjustment(blockThickness, input, profile);
    const spineWidth = calculateSpineWidth(blockThickness, bindingAdjustment, input);
    const coverGeometry = calculateCoverGeometry(input, blockThickness, bindingAdjustment, spineWidth, profile);
    const manufacturingValidation = validateManufacturingConstraints(
        input,
        blockThickness,
        bindingAdjustment,
        spineWidth,
        profile
    );

    const effectiveSpineWidthMm = manufacturingValidation.status === 'INVALID_BLOCKED'
        ? null
        : spineWidth.spineWidthMm;

    const canonicalInputPayload = {
        profileId: profile.profileId,
        profileVersion: profile.version,
        bindingCategory,
        processingType: input.processingType || 'SEWN',
        trimWidthMm: Number(input.trimWidthMm),
        trimHeightMm: Number(input.trimHeightMm),
        segments: blockThickness.segmentBreakdown.map(s => ({
            segmentIndex: s.segmentIndex,
            pages: s.pages,
            variantId: s.variantId,
            gsm: s.gsm,
            caliperUm: s.caliperUm,
            caliperSource: s.caliperSource,
            caliperConfidenceStatus: s.caliperConfidenceStatus
        })),
        cover: input.cover || null,
        hardcover: input.hardcover || null
    };

    const outputPayload = {
        blockThickness,
        bindingAdjustment,
        spineWidthMm: effectiveSpineWidthMm,
        rawFormulaSpineWidthMm: spineWidth.spineWidthMm,
        coverGeometry,
        manufacturingValidation
    };

    return {
        engineVersion: ENGINE_VERSION,
        profileId: profile.profileId,
        profileVersion: profile.version,
        fullProfileKey: profile.fullProfileKey,
        machineryLine: profile.machineryLine,
        operationalStatus: profile.operationalStatus,
        certificationTier: profile.certificationTier,
        inputCanonicalHash: computeCanonicalHash(canonicalInputPayload),
        outputCanonicalHash: computeCanonicalHash(outputPayload),
        ...outputPayload
    };
}

module.exports = {
    ENGINE_VERSION,
    CERTIFICATION_TIERS,
    BUILTIN_BINDING_PROFILES,
    roundToPrecision,
    ceilToStep,
    floorToStep,
    mroundToStep,
    resolveColibriRoundSpineRadiusMm,
    calculateColibriArcLengthMm,
    resolveColibriHingeScoreRastriMm,
    calculateBlockThickness,
    calculateBindingAdjustment,
    calculateSpineWidth,
    calculateCoverGeometry,
    validateManufacturingConstraints,
    resolveBindingProfile,
    executeSpineCalculation,
    computeCanonicalHash
};
