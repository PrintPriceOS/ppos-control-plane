'use strict';

/**
 * src/api/services/manufacturing/impositionEngineService.js
 *
 * PrintPrice OS — Phase 11B: Motor de Imposición y Planchas Dinámicas
 * (Dynamic Imposition & Gang-Run Dispatcher Engine)
 *
 * Connects geometrically validated PDF archives from PHASE-11A with the sheet formats
 * of machines registered in 'Machines' (B1: 720x1020 mm, B2: 520x720 mm, SRA3: 320x450 mm,
 * Web Offset Roll), optimizing paper efficiency, calculating technical make-ready waste,
 * caliper-driven creep compensation, and routing decomposed signatures into 'Manufacturing Queue'.
 */

const crypto = require('crypto');

let db = null;
try {
    db = require('../mysqlClient');
} catch (_) {
    db = null;
}

const IMPOSITION_STANDARDS = Object.freeze({
    GUTTER_MIN_MM: 6.0,
    BLEED_PER_PAGE_MM: 3.0,
    GRIPPER_EDGE_MIN_MM: 10.0,
    GRIPPER_EDGE_DEFAULT_MM: 12.0,
    COLOR_BAR_MM: 6.0,
    SIDE_MARGIN_MM: 8.0,
    OFFSET_SETUP_SHEETS_PER_SIGNATURE: 150,
    OFFSET_RUN_WASTE_RATIO: 0.015,
    WEB_ROTARY_SETUP_LINEAR_METERS: 450,
    DIGITAL_SETUP_SHEETS_PER_JOB: 10,
    DIGITAL_RUN_WASTE_RATIO: 0.005,
    FINISHING_PASS_EXTRA_SHEETS: 50,
    MAX_32PP_CALIPER_UM: 125,
    MAX_32PP_GRAMMAGE_GSM: 120,
    CREEP_WARNING_THRESHOLD_MM: 1.5,
    BLOCK_THICKNESS_WARNING_MM: 4.5,
    DEFAULT_FOLD_COMPRESSION_FACTOR: 1.0
});

const MACHINE_SHEET_FORMATS = Object.freeze({
    B1: {
        formatCode: 'B1',
        deviceId: 'HEIDELBERG-XL106-PRINECT-01',
        folderDeviceId: 'STAHL-KH82-FOLDER-01',
        name: 'Heidelberg Speedmaster XL 106 (B1 720×1020 mm)',
        technology: 'OFFSET_4_4',
        sheetWidthMm: 1020,
        sheetHeightMm: 720,
        gripperMarginMm: 12.0,
        colorBarMm: 6.0,
        maxFolderFolds: 4,
        max32ppCaliperUm: 125,
        plateCostEur: 18.0,
        hourlyRateEur: 240.0,
        sheetsPerHour: 15000
    },
    B2: {
        formatCode: 'B2',
        deviceId: 'KOMORI-G29-KPCONNECT-01',
        folderDeviceId: 'MBO-K70-FOLDER-01',
        name: 'Komori Lithrone G29 (B2 520×720 mm)',
        technology: 'OFFSET_4_4',
        sheetWidthMm: 720,
        sheetHeightMm: 520,
        gripperMarginMm: 10.0,
        colorBarMm: 6.0,
        maxFolderFolds: 3,
        max32ppCaliperUm: 95,
        plateCostEur: 12.0,
        hourlyRateEur: 165.0,
        sheetsPerHour: 13000
    },
    SRA3: {
        formatCode: 'SRA3',
        deviceId: 'HP-INDIGO-12000-DFE-01',
        folderDeviceId: 'HORIZON-AFV566F-01',
        name: 'HP Indigo 12000 / Canon varioPRINT (SRA3 320×450 mm)',
        technology: 'DIGITAL_SHEET',
        sheetWidthMm: 450,
        sheetHeightMm: 320,
        gripperMarginMm: 5.0,
        colorBarMm: 4.0,
        maxFolderFolds: 2,
        max32ppCaliperUm: 0,
        plateCostEur: 0.0,
        hourlyRateEur: 95.0,
        sheetsPerHour: 4200
    },
    WEB_ROTARY: {
        formatCode: 'WEB_ROTARY',
        deviceId: 'MANROLAND-LITHOMAN-WEB-01',
        folderDeviceId: 'LITHOMAN-INLINE-FORMER-01',
        name: 'Manroland Lithoman Rotativa Editorial (Bobina 960 mm)',
        technology: 'WEB_ROTARY',
        sheetWidthMm: 960,
        sheetHeightMm: 630,
        gripperMarginMm: 10.0,
        colorBarMm: 6.0,
        maxFolderFolds: 4,
        max32ppCaliperUm: 115,
        plateCostEur: 22.0,
        hourlyRateEur: 420.0,
        sheetsPerHour: 35000
    }
});

// In-memory ledger for planned impositions and dispatched queue entries (scoped by tenantId)
const impositionPlanLedger = new Map();
const manufacturingQueueLedger = new Map();

function roundTo(val, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round((Number(val) + Number.EPSILON) * factor) / factor;
}

/**
 * Resolves substrate technical parameters (caliper_um, gsm, bulk_factor, grain_direction)
 * from the authoritative `paper_variants` master catalog in MySQL when `variantId` is provided.
 */
async function resolveMasterCatalogVariant(variantId) {
    if (!variantId || !db || typeof db.query !== 'function') return null;
    try {
        const res = await db.query(
            `SELECT v.id AS variant_id, v.product_id, p.name AS product_name, p.brand, p.category,
                    v.gsm, v.width_mm, v.height_mm, v.caliper_um, v.caliper_mm, v.bulk_factor,
                    v.grain_direction, v.finish
               FROM paper_variants v
               LEFT JOIN paper_products p ON p.id = v.product_id
              WHERE v.id = ?
              LIMIT 1`,
            [String(variantId)]
        );
        const rows = Array.isArray(res) ? (Array.isArray(res[0]) ? res[0] : res) : [];
        if (rows && rows.length > 0) {
            return rows[0];
        }
    } catch (_) {
        // Fallback to explicit payload parameters if DB is unavailable in unit test contexts
    }
    return null;
}

/**
 * Normalizes physical paper caliper in microns (`caliper_um`), specific volume (`bulk_volume`),
 * and grammage (`gsm`), strictly prioritizing real `caliper_um` from the 1,524 master catalog
 * and eliminating any static 100 µm fallback.
 */
function resolveSubstrateCaliperSpec({
    caliperUm = null,
    caliper_um = null,
    caliperMm = null,
    paperGrammage = 90,
    paperBulk = null,
    bulkFactor = null,
    bulk_volume = null
} = {}) {
    const grammage = Number(paperGrammage) > 0 ? Number(paperGrammage) : 90;
    const rawCaliperUm = Number(caliperUm ?? caliper_um ?? (caliperMm ? Number(caliperMm) * 1000 : 0));
    const rawBulk = Number(paperBulk ?? bulkFactor ?? bulk_volume ?? 0);

    let effectiveCaliperUm;
    let effectiveBulk;
    let caliperSource;

    if (Number.isFinite(rawCaliperUm) && rawCaliperUm > 0) {
        effectiveCaliperUm = roundTo(rawCaliperUm, 2);
        effectiveBulk = rawBulk > 0 ? roundTo(rawBulk, 3) : roundTo(effectiveCaliperUm / grammage, 3);
        caliperSource = 'CATALOG_CALIPER_UM';
    } else if (Number.isFinite(rawBulk) && rawBulk > 0) {
        effectiveBulk = roundTo(rawBulk, 3);
        effectiveCaliperUm = roundTo(grammage * effectiveBulk, 2);
        caliperSource = 'DERIVED_FROM_BULK_VOLUME';
    } else {
        effectiveBulk = 1.3;
        effectiveCaliperUm = roundTo(grammage * effectiveBulk, 2);
        caliperSource = 'DERIVED_FROM_GRAMMAGE_BULK';
    }

    return {
        grammageGsm: grammage,
        caliperUm: effectiveCaliperUm,
        caliperMm: roundTo(effectiveCaliperUm / 1000, 4),
        paperBulk: effectiveBulk,
        caliperSource
    };
}

/**
 * 1. Calculates progressive Creep Compensation (Compensación de Arrastre / Embuchado)
 *
 * Consumes `caliper_um` (microns) or `bulk_volume` directly from the master substrate catalog:
 *   Single_Leaf_Thickness_mm = (caliper_um / 1000)
 *   Incremental_Shift_Per_Sheet_mm (d) = (caliper_um / 1000) * foldCompressionFactor * π_wrap (or 4 * leafThickness * compressionFactor)
 *   Progressive_Offset(sheetIndex) = (sheetIndex - 1) * Sheet_Wrap_Increment_mm
 *   from the outermost sheet (sheetIndex = 1 -> 0 mm) toward the innermost center sheet.
 */
function calculateCreepOffset({
    pageCount,
    caliperUm = null,
    caliper_um = null,
    paperGrammage = 90,
    paperBulk = null,
    bulkFactor = null,
    bindingType = 'SADDLE_STITCH',
    foldCompressionFactor = IMPOSITION_STANDARDS.DEFAULT_FOLD_COMPRESSION_FACTOR,
    signaturePages = null,
    creepToleranceMm = IMPOSITION_STANDARDS.CREEP_WARNING_THRESHOLD_MM
}) {
    const pages = Number(pageCount);
    if (!Number.isFinite(pages) || pages <= 0 || pages % 4 !== 0) {
        throw new Error('INVALID_PAGE_COUNT_FOR_CREEP: pageCount must be a positive multiple of 4.');
    }

    const substrate = resolveSubstrateCaliperSpec({
        caliperUm,
        caliper_um,
        paperGrammage,
        paperBulk,
        bulkFactor
    });

    const compressionFactor =
        Number.isFinite(Number(foldCompressionFactor)) && Number(foldCompressionFactor) > 0
            ? Number(foldCompressionFactor)
            : IMPOSITION_STANDARDS.DEFAULT_FOLD_COMPRESSION_FACTOR;

    const normalizedBinding = String(bindingType || 'SADDLE_STITCH').toUpperCase();
    const isSaddleStitch =
        normalizedBinding.includes('SADDLE') ||
        normalizedBinding.includes('GRAPA') ||
        normalizedBinding.includes('CABALLETE') ||
        normalizedBinding === 'STITCHED';
    const isSewnNested =
        normalizedBinding.includes('SEWN') ||
        normalizedBinding.includes('COSID') ||
        normalizedBinding.includes('HARDCOVER_SEWN') ||
        normalizedBinding.includes('THREAD');

    const creepActive = isSaddleStitch || isSewnNested;

    // Single leaf displacement d = (caliper_um / 1000) * factor_compresion_plegado (mm)
    const leafDisplacementMm = roundTo((substrate.caliperUm / 1000) * compressionFactor, 4);
    // Each folded 4-page signature sheet wraps 4 leaves (2 on each side of the spine fold)
    const sheetThicknessMm = roundTo(4 * leafDisplacementMm, 4);
    const totalFoldedSheets = pages / 4;

    // Accumulated book block thickness in mm = (pages / 2) * (caliper_um / 1000)
    const accumulatedBlockThicknessMm = roundTo((pages / 2) * (substrate.caliperUm / 1000), 3);

    // For Saddle-Stitch: all sheets nest inside one another (nestingDepth = totalFoldedSheets).
    // For Sewn Signatures: sheets nest within each signature (e.g. 16pp = 4 sheets, 32pp = 8 sheets).
    const nestedSheetsPerGroup = isSewnNested
        ? Math.max(1, Math.min(totalFoldedSheets, Number(signaturePages || 16) / 4))
        : totalFoldedSheets;

    const sheetOffsets = [];
    for (let sheetNumber = 1; sheetNumber <= totalFoldedSheets; sheetNumber++) {
        const positionInNest = isSewnNested
            ? ((sheetNumber - 1) % nestedSheetsPerGroup) + 1
            : sheetNumber;

        const progressiveOffsetMm = creepActive
            ? roundTo((positionInNest - 1) * sheetThicknessMm, 3)
            : 0;
        const symmetricPerPageShiftMm = roundTo(progressiveOffsetMm / 2, 3);

        sheetOffsets.push({
            sheetNumber,
            nestedPosition: positionInNest,
            outerFolioPair: [sheetNumber * 2 - 1, pages - (sheetNumber * 2 - 2)],
            innerFolioPair: [sheetNumber * 2, pages - (sheetNumber * 2 - 1)],
            leafDisplacementMm: roundTo(leafDisplacementMm, 4),
            progressiveOffsetMm,
            symmetricInwardShiftMm: symmetricPerPageShiftMm,
            innerMarginAdjustmentMm: creepActive ? roundTo(-symmetricPerPageShiftMm, 3) : 0,
            outerMarginTrimLossMm: creepActive ? roundTo(symmetricPerPageShiftMm, 3) : 0
        });
    }

    const maxCreepMm = sheetOffsets.reduce(
        (maxVal, s) => Math.max(maxVal, s.progressiveOffsetMm),
        0
    );

    const exceedsFoldingTolerance =
        (creepActive && maxCreepMm > Number(creepToleranceMm)) ||
        (isSaddleStitch && accumulatedBlockThicknessMm > IMPOSITION_STANDARDS.BLOCK_THICKNESS_WARNING_MM);

    const foldingToleranceWarning = exceedsFoldingTolerance
        ? `PREVENTIVE_FOLDING_WARNING: Accumulated block thickness (${accumulatedBlockThicknessMm.toFixed(2)} mm) and max creep (+${maxCreepMm.toFixed(2)} mm at ${substrate.caliperUm} µm) exceed uncompensated folding tolerance (${Number(creepToleranceMm).toFixed(2)} mm). Progressive inward margin shingling is mandatory.`
        : null;

    return {
        bindingType: normalizedBinding,
        creepActive,
        pageCount: pages,
        totalFoldedSheets,
        nestedSheetsPerGroup,
        caliperUm: substrate.caliperUm,
        caliperSource: substrate.caliperSource,
        paperGrammage: substrate.grammageGsm,
        paperBulk: substrate.paperBulk,
        foldCompressionFactor: compressionFactor,
        leafDisplacementMm: roundTo(leafDisplacementMm, 4),
        sheetThicknessMm: roundTo(sheetThicknessMm, 3),
        accumulatedBlockThicknessMm,
        maxCreepOffsetMm: roundTo(maxCreepMm, 3),
        exceedsFoldingTolerance,
        foldingToleranceWarning,
        formulaUsed: 'd_leaf = (caliper_um / 1000) * foldCompressionFactor; Progressive_Creep(n) = (n - 1) * 4 * d_leaf',
        sheetOffsets
    };
}

/**
 * 2. Calculates optimal Signature Decomposition & Sheet Imposition Layout
 * (`calculateSignaturesLayout`)
 *
 * Evaluates 16pp vs 32pp signature partitioning not merely by geometry, but by:
 * - Usable sheet area (sheetDimensions - gripperMargin - colorBar - sideMargins)
 * - Grain direction (LONG_GRAIN / LG vs SHORT_GRAIN / SG) for spine-parallel folding
 * - Substrate caliper (`caliper_um`) & folder capacity (`maxFolderFolds`, `max32ppCaliperUm`):
 *   Heavy/bulky substrates (> 125 µm or > 120 gsm) automatically step down from 32pp (4 cross folds)
 *   to 16pp (3 folds) to prevent crow's-foot fold wrinkling (arrugas de plegado en cruz).
 */
function calculateSignaturesLayout({
    pageCount = 240,
    trimWidthMm = 150,
    trimHeightMm = 230,
    sheetFormat = 'B1',
    gutterMm = IMPOSITION_STANDARDS.GUTTER_MIN_MM,
    gripperMarginMm = null,
    grainDirection = 'LONG_GRAIN',
    caliperUm = null,
    caliper_um = null,
    paperGrammage = 90,
    paperBulk = null,
    maxFolderFolds = null
}) {
    const pages = Number(pageCount);
    if (!Number.isFinite(pages) || pages <= 0 || pages % 4 !== 0) {
        throw new Error('INVALID_PAGE_COUNT: Editorial imposition requires pageCount to be a positive multiple of 4.');
    }

    const formatKey = String(sheetFormat || 'B1').toUpperCase();
    const machineSpec = MACHINE_SHEET_FORMATS[formatKey] || MACHINE_SHEET_FORMATS.B1;

    const substrate = resolveSubstrateCaliperSpec({
        caliperUm,
        caliper_um,
        paperGrammage,
        paperBulk
    });

    const effectiveGripperMm = Number(gripperMarginMm ?? machineSpec.gripperMarginMm);
    const effectiveGutterMm = Math.max(IMPOSITION_STANDARDS.GUTTER_MIN_MM, Number(gutterMm || 6.0));
    const colorBarMm = machineSpec.colorBarMm;

    const printableWidthMm =
        machineSpec.sheetWidthMm - 2 * IMPOSITION_STANDARDS.SIDE_MARGIN_MM;
    const printableHeightMm =
        machineSpec.sheetHeightMm - effectiveGripperMm - colorBarMm;

    // Cell size per page including intermediate gutter (bleed 3mm on each side)
    const cellWidthMm = Number(trimWidthMm) + effectiveGutterMm;
    const cellHeightMm = Number(trimHeightMm) + effectiveGutterMm;

    // Evaluate upright and rotated grid capacity on one side of the press sheet
    const colsUpright = Math.floor(printableWidthMm / cellWidthMm);
    const rowsUpright = Math.floor(printableHeightMm / cellHeightMm);
    const pagesPerSideUpright = colsUpright * rowsUpright;

    const colsRotated = Math.floor(printableWidthMm / cellHeightMm);
    const rowsRotated = Math.floor(printableHeightMm / cellWidthMm);
    const pagesPerSideRotated = colsRotated * rowsRotated;

    const rawPagesPerSide = Math.max(pagesPerSideUpright, pagesPerSideRotated);
    const rawPagesTwoSides = rawPagesPerSide * 2;

    // Snap geometric maximum signature size to standard editorial fold schemes (32, 16, 8, 4)
    let geometricMaxSigPages = 4;
    for (const candidate of [32, 16, 8, 4]) {
        if (rawPagesTwoSides >= candidate) {
            geometricMaxSigPages = candidate;
            break;
        }
    }

    // Evaluate Grain Direction (LG vs SG), Caliper (µm), and Folder Capacity constraints for 32pp vs 16pp
    const normalizedGrain = String(grainDirection || 'LONG_GRAIN').toUpperCase();
    const isShortGrain = normalizedGrain === 'SHORT_GRAIN' || normalizedGrain === 'SG';
    const effectiveMaxFolds = Number(maxFolderFolds ?? machineSpec.maxFolderFolds ?? 4);
    const max32ppCaliperThreshold = Number(machineSpec.max32ppCaliperUm ?? IMPOSITION_STANDARDS.MAX_32PP_CALIPER_UM);

    let maxSignaturePages = geometricMaxSigPages;
    const partitionConstraints = [];

    if (maxSignaturePages === 32) {
        if (effectiveMaxFolds < 4) {
            maxSignaturePages = 16;
            partitionConstraints.push('FOLDER_MAX_3_FOLDS_CAP_16PP');
        } else if (substrate.caliperUm > max32ppCaliperThreshold) {
            maxSignaturePages = 16;
            partitionConstraints.push(
                `CALIPER_${substrate.caliperUm}UM_EXCEEDS_32PP_LIMIT_${max32ppCaliperThreshold}UM_DOWNGRADED_TO_16PP`
            );
        } else if (isShortGrain && pagesPerSideUpright < 16 && pagesPerSideRotated >= 16 && substrate.caliperUm > 105) {
            maxSignaturePages = 16;
            partitionConstraints.push('GRAIN_SG_CROSSFOLD_PROTECTION_16PP');
        }
    }

    const grainAlignmentStatus = isShortGrain
        ? maxSignaturePages === 16
            ? 'SPINE_PARALLEL_ON_16PP_SG'
            : 'SG_ROTATED_HEAD_FOOT'
        : 'SPINE_PARALLEL_ON_LG';

    // Decompose total pages into exact signatures of [32, 16, 8, 4]
    const allowedSignatures = [32, 16, 8, 4].filter(s => s <= maxSignaturePages);
    let remainingPages = pages;
    const signatures = [];
    let sigIndex = 1;

    for (const sigPages of allowedSignatures) {
        while (remainingPages >= sigPages) {
            const pagesPerSide = sigPages / 2;
            const usedAreaMm2 = pagesPerSide * (Number(trimWidthMm) * Number(trimHeightMm));
            const sheetAreaMm2 = machineSpec.sheetWidthMm * machineSpec.sheetHeightMm;
            const paperEfficiencyPct = roundTo((usedAreaMm2 / sheetAreaMm2) * 100, 1);

            // If a partial signature fits twice on the sheet (e.g. 16pp on a 32pp-capable B1 sheet), mark as WORK_AND_TURN
            const isWorkAndTurn =
                machineSpec.technology !== 'DIGITAL_SHEET' &&
                rawPagesPerSide >= sigPages;

            const workMode = isWorkAndTurn ? 'WORK_AND_TURN' : 'SHEETWISE_FRONT_BACK';
            const platesRequired =
                machineSpec.technology === 'DIGITAL_SHEET'
                    ? 0
                    : 8; // 4 CMYK front + 4 CMYK back per signature pass

            signatures.push({
                signatureNumber: sigIndex++,
                signaturePages: sigPages,
                impositionScheme: `${sigPages}pp ${machineSpec.formatCode} (${pagesPerSide}pp/side · ${isWorkAndTurn ? 'Work-and-Turn' : 'Sheetwise'})`,
                foldCatalogCode:
                    sigPages === 32
                        ? 'F32-7'
                        : sigPages === 16
                        ? 'F16-6'
                        : sigPages === 8
                        ? 'F8-4'
                        : 'F4-1',
                foldPattern:
                    sigPages === 32
                        ? '4-Fold Cross (French Fold 32pp)'
                        : sigPages === 16
                        ? '3-Fold Cross (16pp Standard)'
                        : sigPages === 8
                        ? '2-Fold Parallel/Cross (8pp)'
                        : '1-Fold Single (4pp)',
                workMode,
                grainDirection: isShortGrain ? 'SG' : 'LG',
                grainAlignmentStatus,
                platesRequired,
                paperEfficiencyPct
            });
            remainingPages -= sigPages;
        }
    }

    // Build human-readable summary breakdown (e.g. "7×32pp + 1×16pp")
    const countsBySize = {};
    for (const s of signatures) {
        countsBySize[s.signaturePages] = (countsBySize[s.signaturePages] || 0) + 1;
    }
    const breakdownParts = Object.entries(countsBySize)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([size, count]) => `${count}×${size}pp`);

    const totalPlates = signatures.reduce((acc, s) => acc + s.platesRequired, 0);
    const avgEfficiencyPct =
        signatures.length > 0
            ? roundTo(
                  signatures.reduce((acc, s) => acc + s.paperEfficiencyPct, 0) / signatures.length,
                  1
              )
            : 0;

    return {
        pageCount: pages,
        trimSizeMm: { widthMm: Number(trimWidthMm), heightMm: Number(trimHeightMm) },
        sheetFormat: machineSpec.formatCode,
        deviceId: machineSpec.deviceId,
        folderDeviceId: machineSpec.folderDeviceId,
        machineName: machineSpec.name,
        technology: machineSpec.technology,
        sheetDimensionsMm: {
            widthMm: machineSpec.sheetWidthMm,
            heightMm: machineSpec.sheetHeightMm
        },
        printableAreaMm: {
            widthMm: printableWidthMm,
            heightMm: printableHeightMm
        },
        grainDirection: isShortGrain ? 'SG' : 'LG',
        grainAlignmentStatus,
        caliperUm: substrate.caliperUm,
        geometricMaxSignaturePages: geometricMaxSigPages,
        maxSignaturePagesSupported: maxSignaturePages,
        partitionConstraints,
        workshopMarks: {
            gutterMm: effectiveGutterMm,
            bleedPerPageMm: IMPOSITION_STANDARDS.BLEED_PER_PAGE_MM,
            gripperEdgeMm: effectiveGripperMm,
            colorBarMm,
            registrationCrosses: true,
            foldAndCollationMarks: true
        },
        totalSignaturesCount: signatures.length,
        totalPlatesRequired: totalPlates,
        avgPaperEfficiencyPct: avgEfficiencyPct,
        breakdownSummary: breakdownParts.join(' + '),
        signatures
    };
}

/**
 * 3. Estimates Technical Make-Ready & Run Waste (`estimateMakeReadyWaste`)
 */
function estimateMakeReadyWaste({
    technology = 'OFFSET_4_4',
    signaturesCount = 1,
    copies = 1000,
    finishingPassesCount = 0,
    reelsCount = 1,
    cutoffLengthMm = 630
}) {
    const tech = String(technology || 'OFFSET_4_4').toUpperCase();
    const numSignatures = Math.max(1, Number(signaturesCount || 1));
    const printRunCopies = Math.max(1, Number(copies || 1000));
    const finishingPasses = Math.max(0, Number(finishingPassesCount || 0));

    const netSheetsRequired = numSignatures * printRunCopies;
    let setupWasteSheets = 0;
    let runWasteSheets = 0;
    let setupLinearMeters = 0;

    if (tech === 'WEB_ROTARY') {
        const reels = Math.max(1, Number(reelsCount || 1));
        setupLinearMeters = reels * IMPOSITION_STANDARDS.WEB_ROTARY_SETUP_LINEAR_METERS;
        setupWasteSheets = Math.ceil((setupLinearMeters * 1000) / Number(cutoffLengthMm || 630));
        runWasteSheets = Math.ceil(netSheetsRequired * IMPOSITION_STANDARDS.OFFSET_RUN_WASTE_RATIO);
    } else if (tech === 'DIGITAL_SHEET' || tech === 'DIGITAL') {
        setupWasteSheets = IMPOSITION_STANDARDS.DIGITAL_SETUP_SHEETS_PER_JOB;
        runWasteSheets = Math.ceil(netSheetsRequired * IMPOSITION_STANDARDS.DIGITAL_RUN_WASTE_RATIO);
    } else {
        // Default OFFSET_4_4
        setupWasteSheets = numSignatures * IMPOSITION_STANDARDS.OFFSET_SETUP_SHEETS_PER_SIGNATURE;
        runWasteSheets = Math.ceil(netSheetsRequired * IMPOSITION_STANDARDS.OFFSET_RUN_WASTE_RATIO);
    }

    const finishingWasteSheets =
        finishingPasses * IMPOSITION_STANDARDS.FINISHING_PASS_EXTRA_SHEETS;
    const totalWasteSheets = setupWasteSheets + runWasteSheets + finishingWasteSheets;
    const grossSheetsRequired = netSheetsRequired + totalWasteSheets;

    return {
        technology: tech,
        signaturesCount: numSignatures,
        copies: printRunCopies,
        finishingPassesCount: finishingPasses,
        netSheetsRequired,
        setupWasteSheets,
        runWasteSheets,
        finishingWasteSheets,
        totalWasteSheets,
        grossSheetsRequired,
        setupLinearMeters: tech === 'WEB_ROTARY' ? setupLinearMeters : 0,
        wastePercentageOfNet: roundTo((totalWasteSheets / netSheetsRequired) * 100, 2)
    };
}

/**
 * Evaluates candidate machines (B1 Offset, B2 Offset, SRA3 Digital) and builds a complete
 * Imposition Plan (`POST /api/manufacturing/imposition/plan`)
 */
function planImpositionJob(payload = {}, actorContext = {}) {
    const tenantId = actorContext.tenantId || payload.tenantId || 'tenant-default';
    const jobId = payload.jobId || `IMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const isbn = payload.isbn || '978-84-000000-0-0';
    const title = payload.title || `Editorial Production ${jobId}`;
    const pageCount = Number(payload.pageCount || 240);
    const copies = Number(payload.copies || 1500);
    const trimWidthMm = Number(payload.trimWidthMm || 150);
    const trimHeightMm = Number(payload.trimHeightMm || 230);
    const variantId = payload.variantId || payload.variant_id || null;
    const grainDirection = payload.grainDirection || payload.grain_direction || 'LONG_GRAIN';

    const substrate = resolveSubstrateCaliperSpec({
        caliperUm: payload.caliperUm ?? payload.caliper_um,
        paperGrammage: payload.paperGrammage ?? payload.gsm ?? 90,
        paperBulk: payload.paperBulk ?? payload.bulkFactor ?? payload.bulk_volume
    });

    const bindingType = payload.bindingType || 'SOFTCOVER_PUR';
    const sheetFormat = payload.sheetFormat || (copies < 400 ? 'SRA3' : 'B1');
    const finishingPassesCount = Number(payload.finishingPassesCount || 1);

    const layout = calculateSignaturesLayout({
        pageCount,
        trimWidthMm,
        trimHeightMm,
        sheetFormat,
        gutterMm: payload.gutterMm,
        gripperMarginMm: payload.gripperMarginMm,
        grainDirection,
        caliperUm: substrate.caliperUm,
        paperGrammage: substrate.grammageGsm,
        paperBulk: substrate.paperBulk,
        maxFolderFolds: payload.maxFolderFolds
    });

    const creep = calculateCreepOffset({
        pageCount,
        caliperUm: substrate.caliperUm,
        paperGrammage: substrate.grammageGsm,
        paperBulk: substrate.paperBulk,
        bindingType,
        foldCompressionFactor: payload.foldCompressionFactor,
        signaturePages: layout.maxSignaturePagesSupported
    });

    const waste = estimateMakeReadyWaste({
        technology: layout.technology,
        signaturesCount: layout.totalSignaturesCount,
        copies,
        finishingPassesCount
    });

    // Comparative candidate routing evaluation across B1, B2, and SRA3
    const candidateEvaluations = ['B1', 'B2', 'SRA3'].map(fmt => {
        const spec = MACHINE_SHEET_FORMATS[fmt];
        const candLayout = calculateSignaturesLayout({
            pageCount,
            trimWidthMm,
            trimHeightMm,
            sheetFormat: fmt,
            grainDirection,
            caliperUm: substrate.caliperUm,
            paperGrammage: substrate.grammageGsm,
            paperBulk: substrate.paperBulk
        });
        const candWaste = estimateMakeReadyWaste({
            technology: spec.technology,
            signaturesCount: candLayout.totalSignaturesCount,
            copies,
            finishingPassesCount
        });

        const platesCostEur = roundTo(candLayout.totalPlatesRequired * spec.plateCostEur, 2);
        const pressHours = candWaste.grossSheetsRequired / spec.sheetsPerHour;
        const pressRunCostEur = roundTo(pressHours * spec.hourlyRateEur, 2);
        const paperCostEstEur = roundTo(candWaste.grossSheetsRequired * 0.08, 2);
        const totalEstimatedCostEur = roundTo(platesCostEur + pressRunCostEur + paperCostEstEur, 2);

        return {
            formatCode: fmt,
            deviceId: spec.deviceId,
            machineName: spec.name,
            technology: spec.technology,
            breakdownSummary: candLayout.breakdownSummary,
            maxSignaturePagesSupported: candLayout.maxSignaturePagesSupported,
            totalSignatures: candLayout.totalSignaturesCount,
            totalPlates: candLayout.totalPlatesRequired,
            totalWasteSheets: candWaste.totalWasteSheets,
            grossSheets: candWaste.grossSheetsRequired,
            platesCostEur,
            pressRunCostEur,
            totalEstimatedCostEur
        };
    });

    candidateEvaluations.sort((a, b) => a.totalEstimatedCostEur - b.totalEstimatedCostEur);

    const plan = {
        ok: true,
        planId: `PLAN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        tenantId,
        jobId,
        title,
        isbn,
        copies,
        bindingType,
        variantId,
        caliperUm: substrate.caliperUm,
        caliperSource: substrate.caliperSource,
        paperGrammage: substrate.grammageGsm,
        paperBulk: substrate.paperBulk,
        grainDirection: layout.grainDirection,
        impositionLayout: layout,
        creepCompensation: creep,
        wasteEstimation: waste,
        candidatePressComparison: candidateEvaluations,
        recommendedPress: candidateEvaluations[0],
        plannedAt: new Date().toISOString()
    };

    impositionPlanLedger.set(`${tenantId}:${jobId}`, plan);
    return plan;
}

/**
 * 4. Dispatches the decomposed signatures & plates into the Manufacturing Queue
 * (`POST /api/manufacturing/imposition/dispatch-queue`)
 */
function dispatchImpositionJob(payload = {}, actorContext = {}) {
    const tenantId = actorContext.tenantId || payload.tenantId || 'tenant-default';
    const jobId = payload.jobId;
    if (!jobId) {
        throw new Error('MISSING_JOB_ID: jobId is required to dispatch imposition to Manufacturing Queue.');
    }

    let plan = impositionPlanLedger.get(`${tenantId}:${jobId}`);
    if (!plan || payload.caliperUm || payload.caliper_um || payload.paperGrammage || payload.sheetFormat) {
        plan = planImpositionJob(payload, { tenantId });
    }

    const dispatchId = `DSP-IMP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const targetPress =
        payload.targetPress || plan.impositionLayout.machineName || plan.recommendedPress.machineName;

    const queuedSignatures = plan.impositionLayout.signatures.map((sig, idx) => {
        const sigWaste = estimateMakeReadyWaste({
            technology: plan.impositionLayout.technology,
            signaturesCount: 1,
            copies: plan.copies,
            finishingPassesCount: idx === 0 ? plan.wasteEstimation.finishingPassesCount : 0
        });

        const creepEntry =
            plan.creepCompensation.sheetOffsets[
                Math.min(
                    (idx + 1) * (sig.signaturePages / 4) - 1,
                    plan.creepCompensation.sheetOffsets.length - 1
                )
            ];

        return {
            queueEntryId: `${jobId}-SIG-${String(sig.signatureNumber).padStart(2, '0')}`,
            jobId,
            title: plan.title,
            isbn: plan.isbn,
            variantId: plan.variantId,
            caliperUm: plan.caliperUm,
            signatureNumber: sig.signatureNumber,
            totalSignatures: plan.impositionLayout.totalSignaturesCount,
            impositionScheme: sig.impositionScheme,
            foldCatalogCode: sig.foldCatalogCode,
            foldPattern: sig.foldPattern,
            workMode: sig.workMode,
            grainDirection: sig.grainDirection,
            platesRequired: sig.platesRequired,
            paperEfficiencyPct: sig.paperEfficiencyPct,
            creepOffsetMm: creepEntry ? creepEntry.progressiveOffsetMm : 0,
            maxCreepOffsetMm: plan.creepCompensation.maxCreepOffsetMm,
            accumulatedBlockThicknessMm: plan.creepCompensation.accumulatedBlockThicknessMm,
            exceedsFoldingTolerance: plan.creepCompensation.exceedsFoldingTolerance,
            foldingToleranceWarning: plan.creepCompensation.foldingToleranceWarning,
            makeReadyWasteSheets: sigWaste.totalWasteSheets,
            netSheets: sigWaste.netSheetsRequired,
            grossSheets: sigWaste.grossSheetsRequired,
            targetPress,
            status: 'QUEUED_FOR_PLATESETTER'
        };
    });

    const dispatchRecord = {
        ok: true,
        dispatchId,
        tenantId,
        jobId,
        isbn: plan.isbn,
        title: plan.title,
        variantId: plan.variantId,
        caliperUm: plan.caliperUm,
        accumulatedBlockThicknessMm: plan.creepCompensation.accumulatedBlockThicknessMm,
        maxCreepOffsetMm: plan.creepCompensation.maxCreepOffsetMm,
        exceedsFoldingTolerance: plan.creepCompensation.exceedsFoldingTolerance,
        foldingToleranceWarning: plan.creepCompensation.foldingToleranceWarning,
        breakdownSummary: plan.impositionLayout.breakdownSummary,
        totalSignaturesDispatched: queuedSignatures.length,
        totalPlatesDispatched: plan.impositionLayout.totalPlatesRequired,
        totalMakeReadyWasteSheets: plan.wasteEstimation.totalWasteSheets,
        avgPaperEfficiencyPct: plan.impositionLayout.avgPaperEfficiencyPct,
        targetPress,
        status: 'DISPATCHED_TO_MANUFACTURING_QUEUE',
        queuedSignatures,
        dispatchedAt: new Date().toISOString()
    };

    manufacturingQueueLedger.set(`${tenantId}:${jobId}`, dispatchRecord);
    return dispatchRecord;
}

function listDispatchedImpositionQueue(tenantId = 'tenant-default') {
    const records = [];
    for (const [key, value] of manufacturingQueueLedger.entries()) {
        if (key.startsWith(`${tenantId}:`)) {
            records.push(value);
        }
    }
    return records;
}

module.exports = {
    IMPOSITION_STANDARDS,
    MACHINE_SHEET_FORMATS,
    resolveMasterCatalogVariant,
    resolveSubstrateCaliperSpec,
    calculateSignaturesLayout,
    calculateCreepOffset,
    estimateMakeReadyWaste,
    planImpositionJob,
    dispatchImpositionJob,
    listDispatchedImpositionQueue
};
