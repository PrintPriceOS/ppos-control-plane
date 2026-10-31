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
 * creep compensation, and routing decomposed signatures into 'Manufacturing Queue'.
 *
 * Industrial Algorithms & Rules:
 * 1. Signatures & Sheet Layout (`calculateSignaturesLayout`):
 *    - Standard editorial signatures (cuadernillos/signaturas): 32, 16, 8, and 4 pages
 *      (cross-fold / french fold / parallel fold).
 *    - Machine Sheet Formats:
 *      * B1 (720 x 1020 mm) -> up to 32 pp (16 pp/side) for standard octavo/A5 trim sizes.
 *      * B2 (520 x 720 mm)  -> up to 16 pp (8 pp/side).
 *      * SRA3 (320 x 450 mm) -> up to 8 pp (4 pp/side).
 *    - Workshop Marks & Allowances:
 *      * Intermediate cutting gutters/gaps: min 6.0 mm (3.0 mm bleed per adjacent page).
 *      * Gripper edge (pinza de máquina): 10.0 - 12.0 mm non-image margin.
 *      * Color control bar (tira densitométrica): 6.0 mm perimeter strip + fold/registration marks.
 *
 * 2. Creep Compensation (`calculateCreepOffset`):
 *    - For Saddle Stitch (Grapa / Caballete) bindings:
 *      Sheet_Thickness = 4 * (Grammage / 1000) * Bulk
 *      Progressive_Offset(sheetIndex) = (sheetIndex - 1) * Sheet_Thickness
 *      Symmetric inward shift toward the spine fold as sheets progress toward the center.
 *
 * 3. Setup Make-Ready & Run Waste (`estimateMakeReadyWaste`):
 *    - Sheetfed Offset 4/4 (OFFSET_4_4): 150 setup sheets per signature/plate change + 1.5% run waste.
 *    - Editorial Web Offset (WEB_ROTARY): 450 linear meters of setup per reel + 1.5% run waste.
 *    - Sheetfed Digital Toner/Inkjet (DIGITAL_SHEET): 10 setup sheets per job + 0.5% technical run waste.
 *    - Post-press finishing/varnish (lamination matte/gloss, spot UV): +50 extra sheets per finishing pass.
 *
 * 4. Dynamic Routing to Manufacturing Queue (`dispatchImpositionJob`):
 *    - Comparative cost & efficiency evaluation across candidate presses (plates + make-ready + run).
 *    - Decomposes the book into exact signature runs (e.g. "240 pp: 7 x 32pp + 1 x 16pp") and
 *      enqueues the production work order into the Manufacturing Queue.
 */

const crypto = require('crypto');

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
    FINISHING_PASS_EXTRA_SHEETS: 50
});

const MACHINE_SHEET_FORMATS = Object.freeze({
    B1: {
        formatCode: 'B1',
        name: 'Heidelberg Speedmaster XL 106 (B1 720×1020 mm)',
        technology: 'OFFSET_4_4',
        sheetWidthMm: 1020,
        sheetHeightMm: 720,
        gripperMarginMm: 12.0,
        colorBarMm: 6.0,
        plateCostEur: 18.0,
        hourlyRateEur: 240.0,
        sheetsPerHour: 15000
    },
    B2: {
        formatCode: 'B2',
        name: 'Komori Lithrone G29 (B2 520×720 mm)',
        technology: 'OFFSET_4_4',
        sheetWidthMm: 720,
        sheetHeightMm: 520,
        gripperMarginMm: 10.0,
        colorBarMm: 6.0,
        plateCostEur: 12.0,
        hourlyRateEur: 165.0,
        sheetsPerHour: 13000
    },
    SRA3: {
        formatCode: 'SRA3',
        name: 'HP Indigo 12000 / Canon varioPRINT (SRA3 320×450 mm)',
        technology: 'DIGITAL_SHEET',
        sheetWidthMm: 450,
        sheetHeightMm: 320,
        gripperMarginMm: 5.0,
        colorBarMm: 4.0,
        plateCostEur: 0.0,
        hourlyRateEur: 95.0,
        sheetsPerHour: 4200
    },
    WEB_ROTARY: {
        formatCode: 'WEB_ROTARY',
        name: 'Manroland Lithoman Rotativa Editorial (Bobina 960 mm)',
        technology: 'WEB_ROTARY',
        sheetWidthMm: 960,
        sheetHeightMm: 630,
        gripperMarginMm: 10.0,
        colorBarMm: 6.0,
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
 * 1. Calculates progressive Creep Compensation (Compensación de Arrastre de Pliego)
 *
 * Formula for Saddle Stitch (Caballete / Grapa):
 *   Grosor_pliego = 4 * (Gramaje / 1000) * Bulk
 *   Desplazamiento_progresivo(n) = (n - 1) * Grosor_pliego
 *   where n = 1 (outermost folded sheet) ... N (innermost center sheet).
 */
function calculateCreepOffset({
    pageCount,
    paperGrammage = 90,
    paperBulk = 1.3,
    bindingType = 'SADDLE_STITCH'
}) {
    const pages = Number(pageCount);
    const grammage = Number(paperGrammage);
    const bulk = Number(paperBulk);

    if (!Number.isFinite(pages) || pages <= 0 || pages % 4 !== 0) {
        throw new Error('INVALID_PAGE_COUNT_FOR_CREEP: pageCount must be a positive multiple of 4.');
    }

    const normalizedBinding = String(bindingType || 'SADDLE_STITCH').toUpperCase();
    const isSaddleStitch =
        normalizedBinding.includes('SADDLE') ||
        normalizedBinding.includes('GRAPA') ||
        normalizedBinding.includes('CABALLETE') ||
        normalizedBinding === 'STITCHED';

    // Each folded 4-page sheet adds 4 * (grammage / 1000) * bulk in spine wrap thickness
    const sheetThicknessMm = roundTo(4 * (grammage / 1000) * bulk, 4);
    const totalFoldedSheets = pages / 4;

    const sheetOffsets = [];
    for (let sheetNumber = 1; sheetNumber <= totalFoldedSheets; sheetNumber++) {
        const progressiveOffsetMm = isSaddleStitch
            ? roundTo((sheetNumber - 1) * sheetThicknessMm, 3)
            : 0;
        const symmetricPerPageShiftMm = roundTo(progressiveOffsetMm / 2, 3);

        sheetOffsets.push({
            sheetNumber,
            outerFolioPair: [sheetNumber * 2 - 1, pages - (sheetNumber * 2 - 2)],
            innerFolioPair: [sheetNumber * 2, pages - (sheetNumber * 2 - 1)],
            progressiveOffsetMm,
            symmetricInwardShiftMm: symmetricPerPageShiftMm
        });
    }

    const maxCreepMm =
        sheetOffsets.length > 0 ? sheetOffsets[sheetOffsets.length - 1].progressiveOffsetMm : 0;

    return {
        bindingType: normalizedBinding,
        creepActive: isSaddleStitch,
        pageCount: pages,
        totalFoldedSheets,
        sheetThicknessMm: roundTo(sheetThicknessMm, 3),
        maxCreepOffsetMm: maxCreepMm,
        formulaUsed: 'Progressive_Creep = (Sheet_Number - 1) * [4 * (Grammage / 1000) * Bulk]',
        sheetOffsets
    };
}

/**
 * 2. Calculates optimal Signature Decomposition & Sheet Imposition Layout
 * (`calculateSignaturesLayout`)
 *
 * Decomposes total pageCount into standard editorial signatures (32, 16, 8, 4 pp)
 * fitted to the machine sheet format (B1, B2, SRA3, WEB_ROTARY), accounting for:
 * - Gripper edge (10-12 mm)
 * - Color control bar (6 mm)
 * - Intermediate cutting gutters (min 6 mm = 3 mm bleed per page)
 */
function calculateSignaturesLayout({
    pageCount = 240,
    trimWidthMm = 150,
    trimHeightMm = 230,
    sheetFormat = 'B1',
    gutterMm = IMPOSITION_STANDARDS.GUTTER_MIN_MM,
    gripperMarginMm = null
}) {
    const pages = Number(pageCount);
    if (!Number.isFinite(pages) || pages <= 0 || pages % 4 !== 0) {
        throw new Error('INVALID_PAGE_COUNT: Editorial imposition requires pageCount to be a positive multiple of 4.');
    }

    const formatKey = String(sheetFormat || 'B1').toUpperCase();
    const machineSpec = MACHINE_SHEET_FORMATS[formatKey] || MACHINE_SHEET_FORMATS.B1;

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

    // Snap maximum signature size to standard editorial fold schemes (32, 16, 8, 4)
    let maxSignaturePages = 4;
    for (const candidate of [32, 16, 8, 4]) {
        if (rawPagesTwoSides >= candidate) {
            maxSignaturePages = candidate;
            break;
        }
    }

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

            signatures.push({
                signatureNumber: sigIndex++,
                signaturePages: sigPages,
                impositionScheme: `${sigPages}pp ${machineSpec.formatCode} (${pagesPerSide}pp/side)`,
                foldPattern:
                    sigPages === 32
                        ? '4-Fold Cross (French Fold 32pp)'
                        : sigPages === 16
                        ? '3-Fold Cross (16pp Standard)'
                        : sigPages === 8
                        ? '2-Fold Parallel/Cross (8pp)'
                        : '1-Fold Single (4pp)',
                workMode: 'SHEETWISE_FRONT_BACK',
                platesRequired: machineSpec.technology === 'DIGITAL_SHEET' ? 0 : 8, // 4 CMYK front + 4 CMYK back
                paperEfficiencyPct
            });
            remainingPages -= sigPages;
        }
    }

    // Build human-readable summary breakdown (e.g. "7x32pp + 1x16pp")
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
        machineName: machineSpec.name,
        technology: machineSpec.technology,
        sheetDimensionsMm: {
            widthMm: machineSpec.sheetWidthMm,
            heightMm: machineSpec.sheetHeightMm
        },
        workshopMarks: {
            gutterMm: effectiveGutterMm,
            bleedPerPageMm: IMPOSITION_STANDARDS.BLEED_PER_PAGE_MM,
            gripperEdgeMm: effectiveGripperMm,
            colorBarMm,
            registrationCrosses: true,
            foldAndCollationMarks: true
        },
        maxSignaturePagesSupported: maxSignaturePages,
        totalSignaturesCount: signatures.length,
        totalPlatesRequired: totalPlates,
        avgPaperEfficiencyPct: avgEfficiencyPct,
        breakdownSummary: breakdownParts.join(' + '),
        signatures
    };
}

/**
 * 3. Estimates Technical Make-Ready & Run Waste (`estimateMakeReadyWaste`)
 *
 * - Offset 4/4 (`OFFSET_4_4`): 150 setup sheets per signature + 1.5% run waste.
 * - Editorial Web Rotary (`WEB_ROTARY`): 450 linear meters setup per reel + 1.5% run waste.
 * - Sheetfed Digital (`DIGITAL_SHEET`): 10 setup sheets per job + 0.5% run waste.
 * - Post-press finishing passes (`finishingPassesCount`): +50 extra sheets per pass.
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
    const paperGrammage = Number(payload.paperGrammage || 90);
    const paperBulk = Number(payload.paperBulk || 1.3);
    const bindingType = payload.bindingType || 'SOFTCOVER_PUR';
    const sheetFormat = payload.sheetFormat || (copies < 400 ? 'SRA3' : 'B1');
    const finishingPassesCount = Number(payload.finishingPassesCount || 1);

    const layout = calculateSignaturesLayout({
        pageCount,
        trimWidthMm,
        trimHeightMm,
        sheetFormat,
        gutterMm: payload.gutterMm,
        gripperMarginMm: payload.gripperMarginMm
    });

    const creep = calculateCreepOffset({
        pageCount,
        paperGrammage,
        paperBulk,
        bindingType
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
            sheetFormat: fmt
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
            machineName: spec.name,
            technology: spec.technology,
            breakdownSummary: candLayout.breakdownSummary,
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
        paperGrammage,
        paperBulk,
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
    if (!plan) {
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
                Math.min(idx, plan.creepCompensation.sheetOffsets.length - 1)
            ];

        return {
            queueEntryId: `${jobId}-SIG-${String(sig.signatureNumber).padStart(2, '0')}`,
            jobId,
            title: plan.title,
            isbn: plan.isbn,
            signatureNumber: sig.signatureNumber,
            totalSignatures: plan.impositionLayout.totalSignaturesCount,
            impositionScheme: sig.impositionScheme,
            foldPattern: sig.foldPattern,
            platesRequired: sig.platesRequired,
            paperEfficiencyPct: sig.paperEfficiencyPct,
            creepOffsetMm: creepEntry ? creepEntry.progressiveOffsetMm : 0,
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
    calculateSignaturesLayout,
    calculateCreepOffset,
    estimateMakeReadyWaste,
    planImpositionJob,
    dispatchImpositionJob,
    listDispatchedImpositionQueue
};

