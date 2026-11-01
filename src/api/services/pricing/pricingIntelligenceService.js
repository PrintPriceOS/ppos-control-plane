'use strict';

/**
 * src/api/services/pricing/pricingIntelligenceService.js
 *
 * PrintPrice OS — Phase 14: Industrial Pricing Intelligence Engine & Live Calibrator
 *
 * Responsibilities:
 * 1. Synchronized Economic Profiles across Offset B1, Offset B2, Digital Sheetfed (SRA3), and Web Rotary.
 * 2. Live Technical Cost Breakdown & Price Calibrator:
 *    Base Industrial Cost = Paper Cost + CTP Plates Cost + Make-Ready Setup Cost + Press Run Time Cost + Finishing Cost
 *    Selling Price = max(Base Industrial Cost * (1 + Target Margin %), Base Industrial Cost + Min Order Fee)
 * 3. Digital vs. Offset Crossover Point Engine:
 *    Computes the exact print-run threshold (copies) where Sheetfed Offset becomes more economical
 *    per unit than Digital Sheetfed due to CTP plate and setup amortization.
 * 4. Multi-tenant in-memory state with deterministic seed profiles so `/ops/pricing` and Onboarding
 *    share the same source of truth.
 */

const tenantPricingStore = new Map();

const DEFAULT_PAPER_CATALOG = [
    {
        paperId: 'paper-offset-80',
        name: 'Offset Blanco Sin Estucar 80 g/m²',
        grammageGsm: 80,
        bulkFactor: 1.25,
        costPerTonEur: 1180,
        sheetFormat: '70x100'
    },
    {
        paperId: 'paper-ahuesado-90',
        name: 'Ahuesado Editorial Novela 90 g/m² (Vol 1.5)',
        grammageGsm: 90,
        bulkFactor: 1.5,
        costPerTonEur: 1320,
        sheetFormat: '70x100'
    },
    {
        paperId: 'paper-estucado-115',
        name: 'Estucado Mate Arte 115 g/m²',
        grammageGsm: 115,
        bulkFactor: 0.95,
        costPerTonEur: 1290,
        sheetFormat: '70x100'
    },
    {
        paperId: 'paper-estucado-150',
        name: 'Estucado Semimate Catálogo 150 g/m²',
        grammageGsm: 150,
        bulkFactor: 0.9,
        costPerTonEur: 1340,
        sheetFormat: '70x100'
    },
    {
        paperId: 'paper-folding-300',
        name: 'Cartulina Gráfica Cubierta 300 g/m²',
        grammageGsm: 300,
        bulkFactor: 1.15,
        costPerTonEur: 1480,
        sheetFormat: '70x100'
    }
];

function createDefaultProfiles(tenantId) {
    return [
        {
            id: 'prof-offset-b1-xl106',
            tenantId,
            printerId: 'mach-heidelberg-xl106',
            printerName: 'Heidelberg Speedmaster XL 106-8P',
            technology: 'OFFSET_B1',
            technologyLabel: 'Offset B1 (70×100 cm · 16 pp/sig)',
            scope: 'GLOBAL',
            hourlyRateEur: 265,
            setupFeeEur: 240,
            plateCostEur: 22,
            platesPerForm: 8,
            pagesPerSignature: 16,
            speedSheetsPerHour: 14000,
            makeReadyWasteSheets: 250,
            runWastePct: 2.2,
            clickCostEur: 0,
            targetMarginPct: 28,
            platformMarkupPct: 8,
            minimumJobFeeEur: 380,
            oeeHealthPct: 94.2,
            active: true,
            status: 'ACTIVE',
            updatedAt: '2026-06-01T08:00:00.000Z'
        },
        {
            id: 'prof-offset-b2-g29',
            tenantId,
            printerId: 'mach-komori-g29',
            printerName: 'Komori Lithrone G29 (B2)',
            technology: 'OFFSET_B2',
            technologyLabel: 'Offset B2 (50×70 cm · 8 pp/sig)',
            scope: 'GLOBAL',
            hourlyRateEur: 185,
            setupFeeEur: 160,
            plateCostEur: 15,
            platesPerForm: 8,
            pagesPerSignature: 8,
            speedSheetsPerHour: 12000,
            makeReadyWasteSheets: 180,
            runWastePct: 2.5,
            clickCostEur: 0,
            targetMarginPct: 30,
            platformMarkupPct: 8,
            minimumJobFeeEur: 260,
            oeeHealthPct: 91.8,
            active: true,
            status: 'ACTIVE',
            updatedAt: '2026-06-01T08:00:00.000Z'
        },
        {
            id: 'prof-digital-sra3-indigo',
            tenantId,
            printerId: 'mach-hp-indigo-12000',
            printerName: 'HP Indigo 12000 HD Digital Press',
            technology: 'DIGITAL_TONER',
            technologyLabel: 'Digital SRA3 / B2 (Zero Plate)',
            scope: 'GLOBAL',
            hourlyRateEur: 95,
            setupFeeEur: 25,
            plateCostEur: 0,
            platesPerForm: 0,
            pagesPerSignature: 4,
            speedSheetsPerHour: 3600,
            makeReadyWasteSheets: 15,
            runWastePct: 0.8,
            clickCostEur: 0.038,
            targetMarginPct: 35,
            platformMarkupPct: 8,
            minimumJobFeeEur: 75,
            oeeHealthPct: 96.4,
            active: true,
            status: 'ACTIVE',
            updatedAt: '2026-06-01T08:00:00.000Z'
        },
        {
            id: 'prof-rotativa-lithoman',
            tenantId,
            printerId: 'mach-manroland-lithoman',
            printerName: 'Manroland Lithoman IV Web Offset',
            technology: 'WEB_ROTARY',
            technologyLabel: 'Rotativa Comercial (32 pp/sig)',
            scope: 'GLOBAL',
            hourlyRateEur: 490,
            setupFeeEur: 680,
            plateCostEur: 28,
            platesPerForm: 8,
            pagesPerSignature: 32,
            speedSheetsPerHour: 35000,
            makeReadyWasteSheets: 900,
            runWastePct: 3.4,
            clickCostEur: 0,
            targetMarginPct: 24,
            platformMarkupPct: 7,
            minimumJobFeeEur: 1250,
            oeeHealthPct: 89.5,
            active: true,
            status: 'ACTIVE',
            updatedAt: '2026-06-01T08:00:00.000Z'
        }
    ];
}

function createDefaultRoutingHistory(tenantId) {
    return [
        {
            id: 'rt-decision-901',
            tenantId,
            job_id: 'JOB-2026-8841',
            job_name: 'Catálogo Industrial Primavera (1.500 ej · 128 pp)',
            created_at: '2026-06-01T09:15:00.000Z',
            final_decision_json: {
                printer_id: 'mach-heidelberg-xl106',
                printer_name: 'Heidelberg Speedmaster XL 106-8P',
                technology: 'OFFSET_B1',
                final_routing_score: 94,
                margin_pct: 28,
                estimated_margin: 814.4,
                crossover_threshold_copies: 410,
                selected_reason: 'Tirada (1.500 ej.) superior al umbral de cruce Digital/Offset (410 ej.). Amortización óptima de 64 planchas CTP.'
            }
        },
        {
            id: 'rt-decision-902',
            tenantId,
            job_id: 'JOB-2026-8842',
            job_name: 'Manual Técnico Serie Corta (200 ej · 96 pp)',
            created_at: '2026-06-01T09:42:00.000Z',
            final_decision_json: {
                printer_id: 'mach-hp-indigo-12000',
                printer_name: 'HP Indigo 12000 HD Digital Press',
                technology: 'DIGITAL_TONER',
                final_routing_score: 97,
                margin_pct: 35,
                estimated_margin: 248.9,
                crossover_threshold_copies: 410,
                selected_reason: 'Tirada corta (200 ej.) inferior al punto de cruce (410 ej.). Cero coste de planchas CTP y puesta a punto reducida.'
            }
        },
        {
            id: 'rt-decision-903',
            tenantId,
            job_id: 'JOB-2026-8845',
            job_name: 'Novela bolsillo 150×230 mm (650 ej · 256 pp)',
            created_at: '2026-06-01T10:05:00.000Z',
            final_decision_json: {
                printer_id: 'mach-komori-g29',
                printer_name: 'Komori Lithrone G29 (B2)',
                technology: 'OFFSET_B2',
                final_routing_score: 91,
                margin_pct: 30,
                estimated_margin: 562.1,
                crossover_threshold_copies: 385,
                selected_reason: 'Formato medio B2 optimiza puesta a punto frente a B1 para tirada de 650 ejemplares.'
            }
        }
    ];
}

function getTenantState(tenantId = 'tenant-default') {
    const key = String(tenantId || 'tenant-default');
    if (!tenantPricingStore.has(key)) {
        tenantPricingStore.set(key, {
            profiles: createDefaultProfiles(key),
            papers: DEFAULT_PAPER_CATALOG.map((p) => ({ ...p })),
            routingHistory: createDefaultRoutingHistory(key),
            conflicts: []
        });
    }
    return tenantPricingStore.get(key);
}

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function round4(n) {
    return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

function computeKpiSummary(profiles) {
    const activeProfiles = profiles.filter((p) => p.active !== false && p.status !== 'INACTIVE');
    const technologyBreakdown = {
        OFFSET_B1: activeProfiles.filter((p) => p.technology === 'OFFSET_B1').length,
        OFFSET_B2: activeProfiles.filter((p) => p.technology === 'OFFSET_B2').length,
        DIGITAL_TONER: activeProfiles.filter((p) => p.technology === 'DIGITAL_TONER').length,
        WEB_ROTARY: activeProfiles.filter((p) => p.technology === 'WEB_ROTARY').length
    };

    const avgTargetMarginPct =
        activeProfiles.length > 0
            ? round2(
                  activeProfiles.reduce((acc, p) => acc + Number(p.targetMarginPct || 0), 0) /
                      activeProfiles.length
              )
            : 0;

    const avgHourlyRateEur =
        activeProfiles.length > 0
            ? round2(
                  activeProfiles.reduce((acc, p) => acc + Number(p.hourlyRateEur || 0), 0) /
                      activeProfiles.length
              )
            : 0;

    const avgEconomicHealthPct =
        activeProfiles.length > 0
            ? round2(
                  activeProfiles.reduce((acc, p) => acc + Number(p.oeeHealthPct || 92), 0) /
                      activeProfiles.length
              )
            : 0;

    return {
        activeProfilesCount: activeProfiles.length,
        totalProfilesCount: profiles.length,
        activeMachinesCount: new Set(activeProfiles.map((p) => p.printerId)).size,
        avgTargetMarginPct,
        avgHourlyRateEur,
        economicHealthPct: avgEconomicHealthPct,
        technologyBreakdown
    };
}

/**
 * Returns all pricing profiles, paper catalog, routing decisions, and real-time KPI summary for a tenant.
 */
function getPricingProfiles(tenantId = 'tenant-default') {
    const state = getTenantState(tenantId);
    const kpiSummary = computeKpiSummary(state.profiles);
    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        profiles: state.profiles,
        papers: state.papers,
        routingHistory: state.routingHistory,
        conflicts: state.conflicts,
        kpiSummary
    };
}

/**
 * Creates or updates an economic profile for a machine/technology in the tenant store.
 */
function savePricingProfile(tenantId = 'tenant-default', profileData = {}) {
    if (!profileData || typeof profileData !== 'object') {
        const err = new Error('INVALID_PROFILE_PAYLOAD: profileData object is required.');
        err.statusCode = 400;
        throw err;
    }

    const state = getTenantState(tenantId);
    const id = profileData.id || `prof-${Date.now()}`;
    const existingIndex = state.profiles.findIndex(
        (p) => p.id === id || (profileData.printerId && p.printerId === profileData.printerId && !profileData.allowDuplicate)
    );

    const technology = String(profileData.technology || 'OFFSET_B1').toUpperCase();
    const defaultLabels = {
        OFFSET_B1: 'Offset B1 (70×100 cm · 16 pp/sig)',
        OFFSET_B2: 'Offset B2 (50×70 cm · 8 pp/sig)',
        DIGITAL_TONER: 'Digital SRA3 / B2 (Zero Plate)',
        WEB_ROTARY: 'Rotativa Comercial (32 pp/sig)'
    };

    const baseExisting = existingIndex >= 0 ? state.profiles[existingIndex] : {};

    const normalized = {
        ...baseExisting,
        id: existingIndex >= 0 && !profileData.allowDuplicate ? baseExisting.id : id,
        tenantId: String(tenantId || 'tenant-default'),
        printerId: String(profileData.printerId || baseExisting.printerId || `mach-${Date.now()}`),
        printerName: String(profileData.printerName || profileData.printer_name || baseExisting.printerName || 'Industrial Press Node'),
        technology,
        technologyLabel: String(profileData.technologyLabel || baseExisting.technologyLabel || defaultLabels[technology] || technology),
        scope: String(profileData.scope || baseExisting.scope || 'GLOBAL').toUpperCase(),
        hourlyRateEur: Math.max(10, Number(profileData.hourlyRateEur ?? baseExisting.hourlyRateEur ?? 180)),
        setupFeeEur: Math.max(0, Number(profileData.setupFeeEur ?? baseExisting.setupFeeEur ?? 150)),
        plateCostEur: Math.max(0, Number(profileData.plateCostEur ?? baseExisting.plateCostEur ?? (technology === 'DIGITAL_TONER' ? 0 : 18))),
        platesPerForm: Number(profileData.platesPerForm ?? baseExisting.platesPerForm ?? (technology === 'DIGITAL_TONER' ? 0 : 8)),
        pagesPerSignature: Math.max(2, Number(profileData.pagesPerSignature ?? baseExisting.pagesPerSignature ?? (technology === 'OFFSET_B1' ? 16 : technology === 'OFFSET_B2' ? 8 : technology === 'WEB_ROTARY' ? 32 : 4))),
        speedSheetsPerHour: Math.max(500, Number(profileData.speedSheetsPerHour ?? baseExisting.speedSheetsPerHour ?? (technology === 'DIGITAL_TONER' ? 3600 : 12000))),
        makeReadyWasteSheets: Math.max(0, Number(profileData.makeReadyWasteSheets ?? baseExisting.makeReadyWasteSheets ?? (technology === 'DIGITAL_TONER' ? 15 : 200))),
        runWastePct: Math.max(0, Number(profileData.runWastePct ?? baseExisting.runWastePct ?? 2.0)),
        clickCostEur: Math.max(0, Number(profileData.clickCostEur ?? baseExisting.clickCostEur ?? (technology === 'DIGITAL_TONER' ? 0.038 : 0))),
        targetMarginPct: Math.min(85, Math.max(1, Number(profileData.targetMarginPct ?? profileData.target_margin_pct ?? baseExisting.targetMarginPct ?? 28))),
        platformMarkupPct: Math.min(40, Math.max(0, Number(profileData.platformMarkupPct ?? profileData.platform_markup_pct ?? baseExisting.platformMarkupPct ?? 8))),
        minimumJobFeeEur: Math.max(0, Number(profileData.minimumJobFeeEur ?? profileData.minimum_job_fee ?? baseExisting.minimumJobFeeEur ?? 150)),
        oeeHealthPct: Number(profileData.oeeHealthPct ?? baseExisting.oeeHealthPct ?? 93.0),
        active: profileData.active !== undefined ? Boolean(profileData.active) : true,
        status: profileData.active === false ? 'INACTIVE' : 'ACTIVE',
        updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0 && !profileData.allowDuplicate) {
        state.profiles[existingIndex] = normalized;
    } else {
        state.profiles.unshift(normalized);
    }

    return {
        ok: true,
        profile: normalized,
        kpiSummary: computeKpiSummary(state.profiles)
    };
}

function parseTrimSizeAreaM2(trimSize = '148x210') {
    const match = String(trimSize).match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!match) {
        return (0.148 * 0.210); // default A5 area m²
    }
    const wMm = Number(match[1]);
    const hMm = Number(match[2]);
    return (wMm / 1000) * (hMm / 1000);
}

/**
 * Executes the real-time Industrial Price Calibrator formula for a specific specification & profile.
 *
 * Formula:
 *   Paper Cost + CTP Plates Cost + Make-Ready Setup Cost + Press Run Time Cost + Finishing Cost = Base Industrial Cost
 *   Selling Price = Base Industrial Cost * (1 + Target Margin %) + Min Order Fee adjustment
 */
function calibrateQuote(tenantId = 'tenant-default', quoteSpec = {}) {
    const state = getTenantState(tenantId);

    const copies = Math.max(1, Number(quoteSpec.copies || 1000));
    const pages = Math.max(4, Number(quoteSpec.pages || 192));
    const trimSize = String(quoteSpec.trimSize || '150x230');
    const bindingType = String(quoteSpec.bindingType || 'PUR').toUpperCase();

    const baseProfile =
        state.profiles.find((p) => p.id === quoteSpec.profileId || p.printerId === quoteSpec.machineId) ||
        state.profiles[0];

    const paper =
        state.papers.find((p) => p.paperId === quoteSpec.paperId) ||
        state.papers[1] ||
        DEFAULT_PAPER_CATALOG[0];

    // Allow interactive slider overrides from the Live Price Calibrator Modal
    const hourlyRateEur = Number(quoteSpec.hourlyRateEur ?? baseProfile.hourlyRateEur);
    const setupFeeEur = Number(quoteSpec.setupFeeEur ?? baseProfile.setupFeeEur);
    const targetMarginPct = Number(quoteSpec.targetMarginPct ?? baseProfile.targetMarginPct);
    const minimumJobFeeEur = Number(quoteSpec.minimumJobFeeEur ?? baseProfile.minimumJobFeeEur);
    const plateCostEur = Number(quoteSpec.plateCostEur ?? baseProfile.plateCostEur);

    const pagesPerSignature = Math.max(2, Number(baseProfile.pagesPerSignature || 16));
    const signaturesCount = Math.ceil(pages / pagesPerSignature);

    // 1. Paper weight & Paper Cost calculation (with make-ready + run waste)
    const pageAreaM2 = parseTrimSizeAreaM2(trimSize);
    const leavesPerCopy = pages / 2;
    const netPaperAreaM2 = leavesPerCopy * pageAreaM2 * copies;
    const wasteMultiplier = 1 + Number(baseProfile.runWastePct || 2.0) / 100;
    const makeReadyAreaM2 =
        Number(baseProfile.makeReadyWasteSheets || 100) *
        signaturesCount *
        (pageAreaM2 * (pagesPerSignature / 2));

    const grossPaperAreaM2 = netPaperAreaM2 * wasteMultiplier + makeReadyAreaM2;
    const paperWeightKg = round2((grossPaperAreaM2 * Number(paper.grammageGsm || 90)) / 1000);
    const costPerKgEur = Number(paper.costPerTonEur || 1250) / 1000;
    const paperCostEur = round2(paperWeightKg * costPerKgEur);

    // 2. CTP Plates Cost
    const totalPlates =
        baseProfile.technology === 'DIGITAL_TONER'
            ? 0
            : signaturesCount * Number(baseProfile.platesPerForm || 8);
    const platesCostEur = round2(totalPlates * plateCostEur);

    // 3. Make-Ready Setup Cost
    const makeReadyHours = baseProfile.technology === 'DIGITAL_TONER' ? 0.15 : signaturesCount * 0.22;
    const setupCostEur = round2(setupFeeEur + makeReadyHours * hourlyRateEur * 0.5);

    // 4. Press Run Time Cost (plus digital click cost when applicable)
    const totalPressSheets = signaturesCount * copies * wasteMultiplier;
    const pressRunHours = round2(totalPressSheets / Math.max(500, Number(baseProfile.speedSheetsPerHour || 10000)));
    const clickChargeEur =
        baseProfile.technology === 'DIGITAL_TONER'
            ? totalPressSheets * Number(baseProfile.clickCostEur || 0.038)
            : 0;
    const runTimeCostEur = round2(pressRunHours * hourlyRateEur + clickChargeEur);

    // 5. Finishing Cost (Folding + Binding PUR / Casebound / Saddle)
    const bindingSetupEur = bindingType === 'HARDCOVER' ? 180 : bindingType === 'PUR' ? 85 : 45;
    const bindingUnitEur =
        bindingType === 'HARDCOVER'
            ? 1.45 + signaturesCount * 0.04
            : bindingType === 'PUR'
              ? 0.34 + signaturesCount * 0.025
              : 0.14;
    const finishingCostEur = round2(bindingSetupEur + copies * bindingUnitEur);

    // 6. Base Industrial Cost & Target Margin / Minimum Fee Application
    const baseIndustrialCostEur = round2(
        paperCostEur + platesCostEur + setupCostEur + runTimeCostEur + finishingCostEur
    );

    const marginAmountEur = round2(baseIndustrialCostEur * (targetMarginPct / 100));
    const rawSellingPriceEur = round2(baseIndustrialCostEur + marginAmountEur);
    const minFloorPriceEur = round2(baseIndustrialCostEur + minimumJobFeeEur);

    const totalSellingPriceEur = round2(Math.max(rawSellingPriceEur, minFloorPriceEur));
    const effectiveMarginEur = round2(totalSellingPriceEur - baseIndustrialCostEur);
    const effectiveMarginPct =
        baseIndustrialCostEur > 0 ? round2((effectiveMarginEur / baseIndustrialCostEur) * 100) : 0;
    const unitSellingPriceEur = round4(totalSellingPriceEur / copies);
    const unitBaseCostEur = round4(baseIndustrialCostEur / copies);

    // Spine width preview (mm)
    const spineWidthMm = round2(
        ((pages / 2) * Number(paper.grammageGsm || 90) * Number(paper.bulkFactor || 1.3)) / 1000 +
            (bindingType === 'HARDCOVER' ? 3.5 : 0.6)
    );

    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        spec: {
            trimSize,
            copies,
            pages,
            bindingType,
            spineWidthMm,
            paperId: paper.paperId,
            paperName: paper.name,
            grammageGsm: paper.grammageGsm,
            bulkFactor: paper.bulkFactor
        },
        machineProfile: {
            id: baseProfile.id,
            printerId: baseProfile.printerId,
            printerName: baseProfile.printerName,
            technology: baseProfile.technology,
            hourlyRateEur,
            setupFeeEur,
            plateCostEur,
            targetMarginPct,
            minimumJobFeeEur
        },
        breakdown: {
            paperWeightKg,
            totalPlates,
            signaturesCount,
            pressRunHours,
            paperCostEur,
            platesCostEur,
            setupCostEur,
            runTimeCostEur,
            finishingCostEur,
            baseIndustrialCostEur,
            marginAmountEur: effectiveMarginEur,
            targetMarginPct,
            effectiveMarginPct,
            minimumJobFeeEur,
            minOrderFloorApplied: minFloorPriceEur > rawSellingPriceEur,
            totalSellingPriceEur,
            unitBaseCostEur,
            unitSellingPriceEur
        }
    };
}

/**
 * Computes the exact Digital vs. Offset Crossover Point (in copies) where Sheetfed Offset
 * becomes cheaper per copy than Digital Toner/Inkjet due to CTP plate and make-ready amortization.
 */
function calculateCrossoverPoint(tenantId = 'tenant-default', options = {}) {
    const state = getTenantState(tenantId);

    const digitalProfile =
        state.profiles.find(
            (p) =>
                p.id === options.digitalProfileId ||
                p.printerId === options.digitalMachineId ||
                p.technology === 'DIGITAL_TONER'
        ) || state.profiles.find((p) => p.technology === 'DIGITAL_TONER');

    const offsetProfile =
        state.profiles.find(
            (p) =>
                p.id === options.offsetProfileId ||
                p.printerId === options.offsetMachineId ||
                p.technology === 'OFFSET_B1' ||
                p.technology === 'OFFSET_B2'
        ) || state.profiles[0];

    const baseSpec = {
        trimSize: options.trimSize || '150x230',
        pages: Number(options.pages || 192),
        paperId: options.paperId || 'paper-ahuesado-90',
        bindingType: options.bindingType || 'PUR'
    };

    // Binary/step search between 50 and 5000 copies to find exact crossover copy count
    let crossoverCopies = 450;
    let low = 25;
    let high = 5000;

    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const digQuote = calibrateQuote(tenantId, {
            ...baseSpec,
            copies: mid,
            profileId: digitalProfile.id
        });
        const offQuote = calibrateQuote(tenantId, {
            ...baseSpec,
            copies: mid,
            profileId: offsetProfile.id
        });

        if (offQuote.breakdown.totalSellingPriceEur <= digQuote.breakdown.totalSellingPriceEur) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    crossoverCopies = low;

    // Sample curve across canonical print runs for the UI comparison table
    const sampleRuns = [100, 250, 400, 500, 750, 1000, 2500, 5000];
    const curve = sampleRuns.map((runCopies) => {
        const dig = calibrateQuote(tenantId, {
            ...baseSpec,
            copies: runCopies,
            profileId: digitalProfile.id
        });
        const off = calibrateQuote(tenantId, {
            ...baseSpec,
            copies: runCopies,
            profileId: offsetProfile.id
        });
        const recommendedTechnology =
            off.breakdown.totalSellingPriceEur <= dig.breakdown.totalSellingPriceEur
                ? offsetProfile.technology
                : digitalProfile.technology;

        return {
            copies: runCopies,
            digitalTotalEur: dig.breakdown.totalSellingPriceEur,
            digitalUnitEur: dig.breakdown.unitSellingPriceEur,
            offsetTotalEur: off.breakdown.totalSellingPriceEur,
            offsetUnitEur: off.breakdown.unitSellingPriceEur,
            savingsEur: round2(
                Math.abs(dig.breakdown.totalSellingPriceEur - off.breakdown.totalSellingPriceEur)
            ),
            recommendedTechnology,
            recommendedPrinterName:
                recommendedTechnology === offsetProfile.technology
                    ? offsetProfile.printerName
                    : digitalProfile.printerName
        };
    });

    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        spec: baseSpec,
        digitalMachine: {
            id: digitalProfile.id,
            printerName: digitalProfile.printerName,
            technology: digitalProfile.technology
        },
        offsetMachine: {
            id: offsetProfile.id,
            printerName: offsetProfile.printerName,
            technology: offsetProfile.technology
        },
        crossoverCopies,
        explanation: `A partir de ${crossoverCopies} ejemplares, la amortización de ${offsetProfile.platesPerForm * Math.ceil(baseSpec.pages / offsetProfile.pagesPerSignature)} planchas CTP y la puesta a punto en ${offsetProfile.printerName} hacen que el coste unitario Offset sea inferior al coste por clic digital en ${digitalProfile.printerName}.`,
        curve
    };
}

module.exports = {
    getPricingProfiles,
    savePricingProfile,
    calibrateQuote,
    calculateCrossoverPoint,
    DEFAULT_PAPER_CATALOG
};

