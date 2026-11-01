'use strict';

/**
 * src/api/services/pricing/pricingIntelligenceService.js
 *
 * PrintPrice OS — Phase 14B: Bidirectional MySQL Persistence & Pricing Intelligence Engine
 *
 * Responsibilities:
 * 1. Unified MySQL Persistence Bridge between Onboarding (`/printhouse/setup?tab=PRICING`) and
 *    Workspace (`/ops/pricing`):
 *    - Queries `printer_nodes`, `printhouse_machines`, `printer_pricing_profiles`,
 *      `printhouse_machine_pricing_profiles`, `materials_catalog` (`printhouse_materials`),
 *      and `printhouse_pricing_revisions`.
 *    - Hydrates real economic profiles from the tenant's registered machines and calibrated
 *      `printer_nodes.rates_json` when available in MySQL, falling back cleanly to seed profiles
 *      only when the tenant has no machinery or rates registered yet.
 * 2. Bidirectional Synchronization:
 *    - `savePricingProfile(tenantId, profileData)`:
 *      Persists to `printer_pricing_profiles` (UPSERT/UPDATE) AND updates the corresponding
 *      `printer_nodes.rates_json` + inserts an immutable revision in `printhouse_pricing_revisions`
 *      with recalculated SHA-256 `rates_checksum`.
 *    - `syncFromOnboardingRates(tenantId, ratesJson, options)`:
 *      Triggered automatically when Onboarding saves `PUT /api/printhouse/onboarding/pricing/industrial`
 *      or accepts a calibration run (`calibrationAcceptanceService.js`), mapping calibrated rates
 *      into `printer_pricing_profiles` and updating the synchronized workspace state.
 * 3. Live Technical Cost Breakdown (`calibrateQuote`) & Digital vs. Offset Crossover (`calculateCrossoverPoint`).
 */

const crypto = require('crypto');
const db = require('../mysqlClient');

const tenantPricingStore = new Map();

const DEFAULT_PAPER_CATALOG = [
    {
        paperId: 'paper-offset-80',
        name: 'Offset Blanco Sin Estucar 80 g/m²',
        materialName: 'Offset Blanco Sin Estucar',
        grammageGsm: 80,
        bulkFactor: 1.25,
        bulkMicrons: 100,
        costPerTonEur: 1180,
        costPerKgEur: 1.18,
        costPerSheetEur: 0.066,
        substrateClass: 'UNCOATED',
        categoryLabel: 'Offset / Ahuesado',
        sheetFormat: '70x100'
    },
    {
        paperId: 'paper-ahuesado-90',
        name: 'Ahuesado Editorial Novela 90 g/m² (Vol 1.5)',
        materialName: 'Ahuesado Editorial Novela',
        grammageGsm: 90,
        bulkFactor: 1.5,
        bulkMicrons: 135,
        costPerTonEur: 1320,
        costPerKgEur: 1.32,
        costPerSheetEur: 0.083,
        substrateClass: 'UNCOATED',
        categoryLabel: 'Offset / Ahuesado',
        sheetFormat: '70x100'
    },
    {
        paperId: 'paper-estucado-115',
        name: 'Estucado Mate Arte 115 g/m²',
        materialName: 'Estucado Mate Arte',
        grammageGsm: 115,
        bulkFactor: 0.95,
        bulkMicrons: 109,
        costPerTonEur: 1290,
        costPerKgEur: 1.29,
        costPerSheetEur: 0.104,
        substrateClass: 'COATED',
        categoryLabel: 'Estucado',
        sheetFormat: '70x100'
    },
    {
        paperId: 'paper-estucado-150',
        name: 'Estucado Semimate Catálogo 150 g/m²',
        materialName: 'Estucado Semimate Catálogo',
        grammageGsm: 150,
        bulkFactor: 0.9,
        bulkMicrons: 135,
        costPerTonEur: 1340,
        costPerKgEur: 1.34,
        costPerSheetEur: 0.141,
        substrateClass: 'COATED',
        categoryLabel: 'Estucado',
        sheetFormat: '70x100'
    },
    {
        paperId: 'paper-folding-300',
        name: 'Cartulina Gráfica Cubierta 300 g/m²',
        materialName: 'Cartulina Gráfica Cubierta',
        grammageGsm: 300,
        bulkFactor: 1.15,
        bulkMicrons: 345,
        costPerTonEur: 1480,
        costPerKgEur: 1.48,
        costPerSheetEur: 0.311,
        substrateClass: 'BOARD',
        categoryLabel: 'Cartoncillo / Cubierta',
        sheetFormat: '70x100'
    }
];

const PRODUCT_FAMILY_SPECS = {
    SOFTCOVER: {
        id: 'SOFTCOVER',
        label: 'Softcover / Paperback (Rústica PUR)',
        bindingType: 'PUR',
        compatibleTechnologies: ['OFFSET_B1', 'OFFSET_B2', 'DIGITAL_TONER', 'WEB_ROTARY'],
        defaultTrimSize: '150x230',
        defaultPages: 192
    },
    HARDCOVER: {
        id: 'HARDCOVER',
        label: 'Hardcover / Case Bound (Cartoné)',
        bindingType: 'HARDCOVER',
        compatibleTechnologies: ['OFFSET_B1', 'OFFSET_B2', 'DIGITAL_TONER'],
        defaultTrimSize: '150x230',
        defaultPages: 256
    },
    WIRE_O: {
        id: 'WIRE_O',
        label: 'Wire-O / Twin Loop (Espiral Metálica)',
        bindingType: 'WIRE_O',
        compatibleTechnologies: ['DIGITAL_TONER', 'OFFSET_B2', 'OFFSET_B1'],
        defaultTrimSize: '210x297',
        defaultPages: 120
    },
    SADDLE_STITCH: {
        id: 'SADDLE_STITCH',
        label: 'Saddle Stitch / Stapled (Grapado)',
        bindingType: 'SADDLE',
        compatibleTechnologies: ['DIGITAL_TONER', 'OFFSET_B2', 'OFFSET_B1', 'WEB_ROTARY'],
        defaultTrimSize: '210x297',
        defaultPages: 48
    }
};

function inferSupportedFamiliesForTechnology(technology = 'OFFSET_B1', machineRow = {}) {
    const tech = String(technology || 'OFFSET_B1').toUpperCase();
    const meta = safeParseJson(machineRow.metadata_json, {});
    if (Array.isArray(meta.supported_families) && meta.supported_families.length > 0) {
        return meta.supported_families.map((f) => String(f).toUpperCase());
    }
    if (tech === 'WEB_ROTARY') {
        return ['SOFTCOVER', 'SADDLE_STITCH'];
    }
    return ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'];
}

function classifyMaterialCategory(materialRow = {}) {
    const type = String(materialRow.material_type || '').toUpperCase();
    const subClass = String(materialRow.substrate_class || '').toUpperCase();
    const finish = String(materialRow.finish_type || '').toUpperCase();
    const name = String(materialRow.material_name || '').toLowerCase();
    const gsm = Number(materialRow.gsm || 90);

    if (type === 'BOARD' || subClass.includes('BOARD') || name.includes('cartulina') || name.includes('folding') || name.includes('gc1') || name.includes('gc2') || gsm >= 240) {
        return { substrateClass: 'BOARD', categoryLabel: 'Cartoncillo / Cubierta' };
    }
    if (subClass === 'COATED' || finish.includes('MATTE') || finish.includes('GLOSS') || finish.includes('SILK') || name.includes('estucado') || name.includes('coated') || name.includes('silk') || name.includes('art')) {
        return { substrateClass: 'COATED', categoryLabel: 'Estucado' };
    }
    return { substrateClass: 'UNCOATED', categoryLabel: 'Offset / Ahuesado' };
}

function normalizeMaterialRowToPaperItem(m = {}) {
    const meta = safeParseJson(m.metadata_json, {});
    const gsm = Number(m.gsm || m.paper_gsm || meta.gsm || 90);
    const { substrateClass, categoryLabel } = classifyMaterialCategory({ ...m, gsm });
    const bulkFactor = Number(
        meta.bulk_factor ||
            meta.bulkFactor ||
            (m.caliper_um && gsm > 0 ? round2(Number(m.caliper_um) / gsm) : substrateClass === 'UNCOATED' ? 1.3 : substrateClass === 'BOARD' ? 1.15 : 0.95)
    );
    const bulkMicrons = Math.round(Number(m.caliper_um || meta.bulk_microns || gsm * bulkFactor));
    const sheetFormat = String(m.sheet_format || meta.sheet_format || '70x100');
    const sheetAreaM2 = parseTrimSizeAreaM2(sheetFormat.includes('x') ? `${Number(sheetFormat.split('x')[0]) * 10}x${Number(sheetFormat.split('x')[1]) * 10}` : '700x1000');
    const singleSheetWeightKg = Math.max(0.005, (sheetAreaM2 * gsm) / 1000);

    let costPerTonEur = Number(meta.cost_per_ton_eur || meta.costPerTonEur || 0);
    let costPerKgEur = Number(meta.cost_per_kg_eur || meta.costPerKgEur || 0);
    let costPerSheetEur = Number(m.cost_per_unit || meta.cost_per_sheet_eur || 0);

    if (costPerKgEur > 0 && costPerTonEur <= 0) {
        costPerTonEur = round2(costPerKgEur * 1000);
    } else if (costPerTonEur > 0 && costPerKgEur <= 0) {
        costPerKgEur = round4(costPerTonEur / 1000);
    } else if (costPerSheetEur > 0 && costPerTonEur <= 0) {
        // Derive cost per kg from sheet price if reasonable, bounded between €0.85/kg and €3.20/kg
        const derivedKg = costPerSheetEur / singleSheetWeightKg;
        costPerKgEur = round4(Math.min(3.2, Math.max(0.85, derivedKg)));
        costPerTonEur = round2(costPerKgEur * 1000);
    } else if (costPerTonEur <= 0) {
        costPerTonEur = substrateClass === 'BOARD' ? 1480 : substrateClass === 'COATED' ? 1310 : 1240;
        costPerKgEur = round4(costPerTonEur / 1000);
    }

    if (costPerSheetEur <= 0) {
        costPerSheetEur = round4(singleSheetWeightKg * costPerKgEur);
    }

    const rawName = String(m.material_name || m.name || 'Sustrato Industrial').trim();
    const displayHasGsm = /\b\d+\s*(g|gsm|g\/m)/i.test(rawName);
    const displayName = displayHasGsm ? rawName : `${rawName} (${gsm} g/m²)`;

    return {
        id: String(m.id || m.paperId || `mat-${gsm}`),
        paperId: String(m.id || m.paperId || `mat-${gsm}`),
        name: displayName,
        materialName: rawName,
        material_name: rawName,
        grammageGsm: gsm,
        gsm,
        bulkFactor: round2(bulkFactor),
        bulkMicrons,
        bulk_microns: bulkMicrons,
        costPerTonEur: round2(costPerTonEur),
        costPerKgEur: round4(costPerKgEur),
        cost_per_kg_eur: round4(costPerKgEur),
        costPerSheetEur: round4(costPerSheetEur),
        cost_per_sheet_eur: round4(costPerSheetEur),
        substrateClass,
        categoryLabel,
        sheetFormat,
        finishType: String(m.finish_type || m.finish || 'MATTE'),
        source: 'MYSQL_MATERIALS_CATALOG'
    };
}

function computeDeterministicRatesChecksum(ratesObj) {
    function sortObj(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(sortObj);
        const sorted = {};
        for (const key of Object.keys(obj).sort()) {
            sorted[key] = sortObj(obj[key]);
        }
        return sorted;
    }
    const canonicalJson = JSON.stringify(sortObj(ratesObj || {}));
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

function safeParseJson(val, fallback = {}) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch (_) {
        return fallback;
    }
}

function createDefaultProfiles(tenantId) {
    return [
        {
            id: 'prof-offset-b1-xl106',
            tenantId,
            printerId: 'mach-heidelberg-xl106',
            printerName: 'Heidelberg Speedmaster XL 106-8P',
            technology: 'OFFSET_B1',
            technologyLabel: 'Offset B1 (70×100 cm · 16 pp/sig)',
            supportedFamilies: ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'],
            minSheetWidthMm: 280,
            minSheetHeightMm: 400,
            maxSheetWidthMm: 1060,
            maxSheetHeightMm: 750,
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
            source: 'SEED_FALLBACK',
            updatedAt: '2026-06-01T08:00:00.000Z'
        },
        {
            id: 'prof-offset-b2-g29',
            tenantId,
            printerId: 'mach-komori-g29',
            printerName: 'Komori Lithrone G29 (B2)',
            technology: 'OFFSET_B2',
            technologyLabel: 'Offset B2 (50×70 cm · 8 pp/sig)',
            supportedFamilies: ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'],
            minSheetWidthMm: 210,
            minSheetHeightMm: 297,
            maxSheetWidthMm: 750,
            maxSheetHeightMm: 530,
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
            source: 'SEED_FALLBACK',
            updatedAt: '2026-06-01T08:00:00.000Z'
        },
        {
            id: 'prof-digital-sra3-indigo',
            tenantId,
            printerId: 'mach-hp-indigo-12000',
            printerName: 'HP Indigo 12000 HD Digital Press',
            technology: 'DIGITAL_TONER',
            technologyLabel: 'Digital SRA3 / B2 (Zero Plate)',
            supportedFamilies: ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'],
            minSheetWidthMm: 210,
            minSheetHeightMm: 297,
            maxSheetWidthMm: 750,
            maxSheetHeightMm: 530,
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
            source: 'SEED_FALLBACK',
            updatedAt: '2026-06-01T08:00:00.000Z'
        },
        {
            id: 'prof-rotativa-lithoman',
            tenantId,
            printerId: 'mach-manroland-lithoman',
            printerName: 'Manroland Lithoman IV Web Offset',
            technology: 'WEB_ROTARY',
            technologyLabel: 'Rotativa Comercial (32 pp/sig)',
            supportedFamilies: ['SOFTCOVER', 'SADDLE_STITCH'],
            minSheetWidthMm: 420,
            minSheetHeightMm: 594,
            maxSheetWidthMm: 1260,
            maxSheetHeightMm: 900,
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
            source: 'SEED_FALLBACK',
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
        const defaultProfs = createDefaultProfiles(key);
        tenantPricingStore.set(key, {
            profiles: defaultProfs,
            papers: DEFAULT_PAPER_CATALOG.map((p) => ({ ...p })),
            routingHistory: createDefaultRoutingHistory(key),
            conflicts: [],
            syncTelemetry: {
                status: 'SYNCED_WITH_WORKSPACE',
                source: 'SEED_OR_MEMORY',
                nodeId: 'node-primary',
                ratesChecksum: computeDeterministicRatesChecksum(defaultProfs),
                lastSyncedAt: new Date().toISOString(),
                revisionId: 'rev-initial-sync'
            }
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

function inferTechnologyFromMachineRow(machineRow = {}) {
    const type = String(machineRow.machine_type || '').toUpperCase();
    const methods = Array.isArray(machineRow.supported_print_methods_json)
        ? machineRow.supported_print_methods_json
        : safeParseJson(machineRow.supported_print_methods_json, []);
    const width = Number(machineRow.max_sheet_width_mm || 700);
    const height = Number(machineRow.max_sheet_height_mm || 1000);

    if (methods.includes('WEB_OFFSET') || String(machineRow.machine_name || '').toLowerCase().includes('rotativa') || String(machineRow.machine_name || '').toLowerCase().includes('web')) {
        return 'WEB_ROTARY';
    }
    if (type === 'DIGITAL_PRESS' || methods.includes('DIGITAL_TONER') || methods.includes('DIGITAL_INKJET')) {
        return 'DIGITAL_TONER';
    }
    if (Math.max(width, height) >= 900) {
        return 'OFFSET_B1';
    }
    return 'OFFSET_B2';
}

function extractEconomicParametersFromRatesJson(ratesJson = {}, technology = 'OFFSET_B1') {
    const r = safeParseJson(ratesJson, {});
    const workspaceMeta = r._workspace_profiles && r._workspace_profiles[technology]
        ? r._workspace_profiles[technology]
        : (r._workspace_profile || {});

    // Derive setup fee from BPE interior_full_colour_fixed / interior_one_colour_fixed or explicit workspace metadata
    const bpeFixedSetup =
        Number(r.interior_full_colour_fixed) ||
        Number(r.interior_one_colour_fixed) ||
        Number(r.binding_pb_fixed) ||
        0;

    // Derive hourly / run rate from BPE interior_full_colour_var_per_1000 or explicit workspace metadata
    const bpeVarPer1000 =
        Number(r.interior_full_colour_var_per_1000) ||
        Number(r.interior_one_colour_var_per_1000) ||
        0;

    const defaultHourly =
        technology === 'WEB_ROTARY'
            ? 490
            : technology === 'OFFSET_B1'
              ? 265
              : technology === 'OFFSET_B2'
                ? 185
                : 95;

    const defaultSetup =
        technology === 'WEB_ROTARY'
            ? 680
            : technology === 'OFFSET_B1'
              ? 240
              : technology === 'OFFSET_B2'
                ? 160
                : 25;

    const hourlyRateEur = Number(
        workspaceMeta.hourlyRateEur ??
            r.hourly_rate_eur ??
            (bpeVarPer1000 > 0 ? round2(bpeVarPer1000 * 6.5) : defaultHourly)
    );

    const setupFeeEur = Number(
        workspaceMeta.setupFeeEur ??
            r.setup_fee_eur ??
            (bpeFixedSetup > 0 ? round2(bpeFixedSetup) : defaultSetup)
    );

    const plateCostEur = Number(
        workspaceMeta.plateCostEur ??
            r.plate_cost_eur ??
            (technology === 'DIGITAL_TONER' ? 0 : technology === 'OFFSET_B2' ? 15 : 22)
    );

    const targetMarginPct = Number(
        workspaceMeta.targetMarginPct ??
            r.target_margin_pct ??
            r.commercial_margin_pct ??
            (technology === 'DIGITAL_TONER' ? 35 : 28)
    );

    const platformMarkupPct = Number(
        workspaceMeta.platformMarkupPct ?? r.platform_markup_pct ?? 8
    );

    const minimumJobFeeEur = Number(
        workspaceMeta.minimumJobFeeEur ??
            r.minimum_job_fee ??
            (technology === 'DIGITAL_TONER' ? 75 : 320)
    );

    return {
        hourlyRateEur: Math.max(10, hourlyRateEur),
        setupFeeEur: Math.max(0, setupFeeEur),
        plateCostEur: Math.max(0, plateCostEur),
        targetMarginPct: Math.min(85, Math.max(1, targetMarginPct)),
        platformMarkupPct: Math.min(40, Math.max(0, platformMarkupPct)),
        minimumJobFeeEur: Math.max(0, minimumJobFeeEur)
    };
}

function buildRatesJsonPatchFromProfile(existingRatesJson = {}, profile = {}) {
    const base = safeParseJson(existingRatesJson, {});
    const tech = String(profile.technology || 'OFFSET_B1').toUpperCase();
    const hourly = Number(profile.hourlyRateEur ?? 220);
    const setup = Number(profile.setupFeeEur ?? 180);
    const plate = Number(profile.plateCostEur ?? 20);
    const margin = Number(profile.targetMarginPct ?? 28);
    const markup = Number(profile.platformMarkupPct ?? 8);
    const minFee = Number(profile.minimumJobFeeEur ?? 250);

    const updated = {
        ...base,
        hourly_rate_eur: hourly,
        setup_fee_eur: setup,
        plate_cost_eur: plate,
        target_margin_pct: margin,
        platform_markup_pct: markup,
        minimum_job_fee: minFee,
        // Synchronize BPE rate keys so the Onboarding Rate Card Editor reflects the exact calibrated values
        interior_full_colour_fixed: round2(setup + (tech === 'DIGITAL_TONER' ? 0 : plate * 4)),
        interior_full_colour_var_per_1000: round2(hourly / 6.5),
        _workspace_profile: {
            id: profile.id,
            printerId: profile.printerId,
            printerName: profile.printerName,
            technology: tech,
            hourlyRateEur: hourly,
            setupFeeEur: setup,
            plateCostEur: plate,
            targetMarginPct: margin,
            platformMarkupPct: markup,
            minimumJobFeeEur: minFee,
            updatedAt: new Date().toISOString()
        },
        _workspace_profiles: {
            ...(base._workspace_profiles || {}),
            [tech]: {
                id: profile.id,
                printerId: profile.printerId,
                printerName: profile.printerName,
                technology: tech,
                supportedFamilies: profile.supportedFamilies,
                minSheetWidthMm: profile.minSheetWidthMm,
                minSheetHeightMm: profile.minSheetHeightMm,
                maxSheetWidthMm: profile.maxSheetWidthMm,
                maxSheetHeightMm: profile.maxSheetHeightMm,
                hourlyRateEur: hourly,
                setupFeeEur: setup,
                plateCostEur: plate,
                targetMarginPct: margin,
                platformMarkupPct: markup,
                minimumJobFeeEur: minFee,
                updatedAt: new Date().toISOString()
            }
        }
    };

    return updated;
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
 * Queries MySQL (`printer_nodes`, `printhouse_machines`, `printer_pricing_profiles`, `materials_catalog`)
 * to hydrate the tenant's real profiles and paper catalog into memory when MySQL is configured/mocked.
 */
async function hydrateTenantFromMySQL(tenantId = 'tenant-default', dbClient = db) {
    const state = getTenantState(tenantId);
    if (!dbClient || typeof dbClient.query !== 'function') {
        return state;
    }

    try {
        const [nodes, machines, dbProfiles, materials, revisions] = await Promise.all([
            dbClient
                .query(
                    'SELECT id, tenant_id, name, signatures, rates_json, status FROM printer_nodes WHERE tenant_id = ? AND status != "DELETED" ORDER BY created_at ASC',
                    [tenantId]
                )
                .catch(() => []),
            dbClient
                .query(
                    'SELECT * FROM printhouse_machines WHERE tenant_id = ? AND status != "ARCHIVED" ORDER BY created_at ASC',
                    [tenantId]
                )
                .catch(() => []),
            dbClient
                .query(
                    `SELECT ppp.*, p.name as printer_name
                     FROM printer_pricing_profiles ppp
                     JOIN printer_nodes p ON ppp.printer_id = p.id
                     WHERE p.tenant_id = ?
                     ORDER BY ppp.created_at DESC`,
                    [tenantId]
                )
                .catch(() => []),
            dbClient
                .query(
                    'SELECT * FROM materials_catalog WHERE tenant_id = ? ORDER BY created_at ASC',
                    [tenantId]
                )
                .catch(() => []),
            dbClient
                .query(
                    'SELECT id, rates_checksum, created_at, source_type FROM printhouse_pricing_revisions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
                    [tenantId]
                )
                .catch(() => [])
        ]);

        const primaryNode = Array.isArray(nodes) && nodes.length > 0 ? nodes[0] : null;
        const primaryRates = primaryNode ? safeParseJson(primaryNode.rates_json, {}) : {};
        const latestRev = Array.isArray(revisions) && revisions.length > 0 ? revisions[0] : null;

        // 1. Hydrate Materials / Paper Catalog if tenant has rows in `materials_catalog`
        if (Array.isArray(materials) && materials.length > 0) {
            const mappedPapers = materials
                .filter((m) => {
                    const meta = safeParseJson(m.metadata_json, {});
                    if (meta.archived === true) return false;
                    return !m.material_type || m.material_type === 'PAPER' || m.material_type === 'BOARD';
                })
                .map((m) => normalizeMaterialRowToPaperItem(m));
            if (mappedPapers.length > 0) {
                state.papers = mappedPapers;
            }
        }

        // 2. Hydrate Economic Profiles from `printhouse_machines`, `printer_pricing_profiles`, and `printer_nodes.rates_json`
        const hydratedProfiles = [];

        if (Array.isArray(machines) && machines.length > 0) {
            for (const mach of machines) {
                const tech = inferTechnologyFromMachineRow(mach);
                const matchingDbProf = Array.isArray(dbProfiles)
                    ? dbProfiles.find((dp) => dp.machine_id === mach.id || dp.printer_id === mach.printhouse_id)
                    : null;
                const machMeta = safeParseJson(mach.metadata_json, {});
                const econ = extractEconomicParametersFromRatesJson(primaryRates, tech);

                const defaultLabels = {
                    OFFSET_B1: 'Offset B1 (70×100 cm · 16 pp/sig)',
                    OFFSET_B2: 'Offset B2 (50×70 cm · 8 pp/sig)',
                    DIGITAL_TONER: 'Digital SRA3 / B2 (Zero Plate)',
                    WEB_ROTARY: 'Rotativa Comercial (32 pp/sig)'
                };

                hydratedProfiles.push({
                    id: matchingDbProf ? String(matchingDbProf.id) : `prof-db-${mach.id}`,
                    tenantId: String(tenantId),
                    nodeId: mach.printhouse_id || (primaryNode ? primaryNode.id : 'node-primary'),
                    printerId: String(mach.id),
                    printerName: String(mach.machine_name || mach.model || 'Industrial Press'),
                    technology: tech,
                    technologyLabel: defaultLabels[tech] || tech,
                    supportedFamilies: inferSupportedFamiliesForTechnology(tech, mach),
                    minSheetWidthMm: Number(mach.min_sheet_width_mm || machMeta.minSheetWidthMm || (tech === 'OFFSET_B1' ? 280 : tech === 'OFFSET_B2' ? 210 : 148)),
                    minSheetHeightMm: Number(mach.min_sheet_height_mm || machMeta.minSheetHeightMm || (tech === 'OFFSET_B1' ? 400 : tech === 'OFFSET_B2' ? 297 : 210)),
                    maxSheetWidthMm: Number(mach.max_sheet_width_mm || machMeta.maxSheetWidthMm || (tech === 'OFFSET_B1' ? 1060 : tech === 'OFFSET_B2' ? 750 : 750)),
                    maxSheetHeightMm: Number(mach.max_sheet_height_mm || machMeta.maxSheetHeightMm || (tech === 'OFFSET_B1' ? 750 : tech === 'OFFSET_B2' ? 530 : 530)),
                    scope: matchingDbProf?.pricing_scope || 'MACHINE',
                    hourlyRateEur: Number(machMeta.hourlyRateEur ?? econ.hourlyRateEur),
                    setupFeeEur: Number(machMeta.setupFeeEur ?? econ.setupFeeEur),
                    plateCostEur: Number(machMeta.plateCostEur ?? econ.plateCostEur),
                    platesPerForm: tech === 'DIGITAL_TONER' ? 0 : 8,
                    pagesPerSignature: tech === 'OFFSET_B1' ? 16 : tech === 'OFFSET_B2' ? 8 : tech === 'WEB_ROTARY' ? 32 : 4,
                    speedSheetsPerHour: tech === 'DIGITAL_TONER' ? 3600 : tech === 'WEB_ROTARY' ? 35000 : 13000,
                    makeReadyWasteSheets: tech === 'DIGITAL_TONER' ? 15 : 220,
                    runWastePct: tech === 'DIGITAL_TONER' ? 0.8 : 2.2,
                    clickCostEur: tech === 'DIGITAL_TONER' ? 0.038 : 0,
                    targetMarginPct: Number(matchingDbProf?.target_margin_pct ?? econ.targetMarginPct),
                    platformMarkupPct: Number(matchingDbProf?.platform_markup_pct ?? econ.platformMarkupPct),
                    minimumJobFeeEur: Number(matchingDbProf?.minimum_job_fee ?? econ.minimumJobFeeEur),
                    oeeHealthPct: 94.0,
                    active: matchingDbProf ? Boolean(matchingDbProf.active !== 0 && matchingDbProf.active !== false) : mach.status === 'ACTIVE',
                    status: mach.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
                    source: 'MYSQL_HYDRATED',
                    updatedAt: new Date().toISOString()
                });
            }
        } else if (primaryNode && Object.keys(primaryRates).length > 0) {
            // Hydrate from `printer_nodes.rates_json` even when individual machines aren't listed in `printhouse_machines`
            const workspaceMap = primaryRates._workspace_profiles || {};
            const workspaceKeys = Object.keys(workspaceMap);

            if (workspaceKeys.length > 0) {
                for (const techKey of workspaceKeys) {
                    const wp = workspaceMap[techKey];
                    const matchingDbProf = Array.isArray(dbProfiles) ? dbProfiles[0] : null;
                    hydratedProfiles.push({
                        id: wp.id || (matchingDbProf ? String(matchingDbProf.id) : `prof-node-${primaryNode.id}-${techKey.toLowerCase()}`),
                        tenantId: String(tenantId),
                        nodeId: String(primaryNode.id),
                        printerId: wp.printerId || String(primaryNode.id),
                        printerName: wp.printerName || `${primaryNode.name || 'Primary Production Node'} (${techKey})`,
                        technology: techKey,
                        technologyLabel: techKey,
                        supportedFamilies: Array.isArray(wp.supportedFamilies) ? wp.supportedFamilies : inferSupportedFamiliesForTechnology(techKey),
                        minSheetWidthMm: Number(wp.minSheetWidthMm ?? (techKey === 'OFFSET_B1' ? 280 : 148)),
                        minSheetHeightMm: Number(wp.minSheetHeightMm ?? (techKey === 'OFFSET_B1' ? 400 : 210)),
                        maxSheetWidthMm: Number(wp.maxSheetWidthMm ?? (techKey === 'OFFSET_B1' ? 1060 : 750)),
                        maxSheetHeightMm: Number(wp.maxSheetHeightMm ?? (techKey === 'OFFSET_B1' ? 750 : 530)),
                        scope: 'PRINTER',
                        hourlyRateEur: Number(wp.hourlyRateEur ?? 220),
                        setupFeeEur: Number(wp.setupFeeEur ?? 180),
                        plateCostEur: Number(wp.plateCostEur ?? (techKey === 'DIGITAL_TONER' ? 0 : 20)),
                        platesPerForm: techKey === 'DIGITAL_TONER' ? 0 : 8,
                        pagesPerSignature: techKey === 'OFFSET_B1' ? 16 : techKey === 'OFFSET_B2' ? 8 : 4,
                        speedSheetsPerHour: techKey === 'DIGITAL_TONER' ? 3600 : 13000,
                        makeReadyWasteSheets: techKey === 'DIGITAL_TONER' ? 15 : 220,
                        runWastePct: 2.0,
                        clickCostEur: techKey === 'DIGITAL_TONER' ? 0.038 : 0,
                        targetMarginPct: Number(wp.targetMarginPct ?? matchingDbProf?.target_margin_pct ?? 28),
                        platformMarkupPct: Number(wp.platformMarkupPct ?? matchingDbProf?.platform_markup_pct ?? 8),
                        minimumJobFeeEur: Number(wp.minimumJobFeeEur ?? matchingDbProf?.minimum_job_fee ?? 250),
                        oeeHealthPct: 94.5,
                        active: true,
                        status: 'ACTIVE',
                        source: 'MYSQL_NODE_RATES',
                        updatedAt: wp.updatedAt || new Date().toISOString()
                    });
                }
            } else {
                const econ = extractEconomicParametersFromRatesJson(primaryRates, 'OFFSET_B1');
                const matchingDbProf = Array.isArray(dbProfiles) ? dbProfiles[0] : null;
                hydratedProfiles.push({
                    id: matchingDbProf ? String(matchingDbProf.id) : `prof-node-${primaryNode.id}`,
                    tenantId: String(tenantId),
                    nodeId: String(primaryNode.id),
                    printerId: String(primaryNode.id),
                    printerName: String(primaryNode.name || 'Primary Production Node'),
                    technology: 'OFFSET_B1',
                    technologyLabel: 'Offset B1 (Calibrated Node Rates)',
                    supportedFamilies: ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'],
                    minSheetWidthMm: 280,
                    minSheetHeightMm: 400,
                    maxSheetWidthMm: 1060,
                    maxSheetHeightMm: 750,
                    scope: matchingDbProf?.pricing_scope || 'PRINTER',
                    hourlyRateEur: econ.hourlyRateEur,
                    setupFeeEur: econ.setupFeeEur,
                    plateCostEur: econ.plateCostEur,
                    platesPerForm: 8,
                    pagesPerSignature: Array.isArray(safeParseJson(primaryNode.signatures, [16]))
                        ? Number(safeParseJson(primaryNode.signatures, [16])[0] || 16)
                        : 16,
                    speedSheetsPerHour: 13500,
                    makeReadyWasteSheets: 220,
                    runWastePct: 2.2,
                    clickCostEur: 0,
                    targetMarginPct: Number(matchingDbProf?.target_margin_pct ?? econ.targetMarginPct),
                    platformMarkupPct: Number(matchingDbProf?.platform_markup_pct ?? econ.platformMarkupPct),
                    minimumJobFeeEur: Number(matchingDbProf?.minimum_job_fee ?? econ.minimumJobFeeEur),
                    oeeHealthPct: 94.8,
                    active: true,
                    status: 'ACTIVE',
                    source: 'MYSQL_NODE_RATES',
                    updatedAt: new Date().toISOString()
                });
            }
        } else if (Array.isArray(dbProfiles) && dbProfiles.length > 0) {
            for (const dp of dbProfiles) {
                hydratedProfiles.push({
                    id: String(dp.id),
                    tenantId: String(tenantId),
                    nodeId: String(dp.printer_id),
                    printerId: String(dp.machine_id || dp.printer_id),
                    printerName: String(dp.printer_name || dp.printer_id || 'Configured Press Node'),
                    technology: 'OFFSET_B1',
                    technologyLabel: 'Offset B1 (70×100 cm · 16 pp/sig)',
                    scope: String(dp.pricing_scope || 'PRINTER'),
                    hourlyRateEur: 245,
                    setupFeeEur: 210,
                    plateCostEur: 20,
                    platesPerForm: 8,
                    pagesPerSignature: 16,
                    speedSheetsPerHour: 13000,
                    makeReadyWasteSheets: 220,
                    runWastePct: 2.2,
                    clickCostEur: 0,
                    targetMarginPct: Number(dp.target_margin_pct ?? 28),
                    platformMarkupPct: Number(dp.platform_markup_pct ?? 8),
                    minimumJobFeeEur: Number(dp.minimum_job_fee ?? 250),
                    oeeHealthPct: 93.5,
                    active: dp.active !== 0 && dp.active !== false,
                    status: dp.active !== 0 && dp.active !== false ? 'ACTIVE' : 'INACTIVE',
                    source: 'MYSQL_PRICING_PROFILES',
                    updatedAt: dp.created_at ? new Date(dp.created_at).toISOString() : new Date().toISOString()
                });
            }
        }

        if (hydratedProfiles.length > 0) {
            state.profiles = hydratedProfiles;
            const checksum =
                latestRev?.rates_checksum ||
                computeDeterministicRatesChecksum(primaryRates && Object.keys(primaryRates).length > 0 ? primaryRates : hydratedProfiles);
            state.syncTelemetry = {
                status: 'SYNCED_WITH_WORKSPACE',
                source: hydratedProfiles[0].source,
                nodeId: primaryNode ? primaryNode.id : hydratedProfiles[0].nodeId || 'node-primary',
                ratesChecksum: checksum,
                lastSyncedAt: latestRev?.created_at
                    ? new Date(latestRev.created_at).toISOString()
                    : new Date().toISOString(),
                revisionId: latestRev?.id || `rev-hydrated-${checksum.slice(0, 8)}`
            };
        }
    } catch (_) {
        // Non-fatal fallback to current in-memory / seed profiles when MySQL is offline in isolated unit tests
    }

    return state;
}

/**
 * Returns all pricing profiles, paper catalog, routing decisions, KPI summary, and sync telemetry.
 * Supports both synchronous access (for unit tests) and async MySQL hydration via `getPricingProfilesAsync`.
 */
function getPricingProfiles(tenantId = 'tenant-default') {
    const state = getTenantState(tenantId);
    const kpiSummary = computeKpiSummary(state.profiles);
    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        profiles: state.profiles,
        papers: state.papers,
        productFamilies: PRODUCT_FAMILY_SPECS,
        routingHistory: state.routingHistory,
        conflicts: state.conflicts,
        kpiSummary,
        syncTelemetry: state.syncTelemetry
    };
}

async function getPricingProfilesAsync(tenantId = 'tenant-default', dbClient = db) {
    await hydrateTenantFromMySQL(tenantId, dbClient);
    return getPricingProfiles(tenantId);
}

/**
 * Returns the tenant's real substrates from `materials_catalog` classified by type
 * (`Estucado` / `COATED`, `Offset / Ahuesado` / `UNCOATED`, `Cartoncillo / Cubierta` / `BOARD`)
 * with `id`, `material_name`, `gsm`, `bulk_microns`, `bulkFactor`, `cost_per_kg_eur`, and `cost_per_sheet_eur`.
 */
async function getTenantMaterialsCatalogAsync(tenantId = 'tenant-default', dbClient = db) {
    await hydrateTenantFromMySQL(tenantId, dbClient);
    const state = getTenantState(tenantId);
    const materials = state.papers || [];
    const groupedByCategory = {
        UNCOATED: materials.filter((p) => (p.substrateClass || 'UNCOATED') === 'UNCOATED'),
        COATED: materials.filter((p) => p.substrateClass === 'COATED'),
        BOARD: materials.filter((p) => p.substrateClass === 'BOARD')
    };
    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        materials,
        groupedByCategory,
        productFamilies: PRODUCT_FAMILY_SPECS
    };
}

/**
 * Adds a new substrate directly into the tenant's `materials_catalog` in MySQL and updates
 * the in-memory paper catalog immediately so both Onboarding and `/ops/pricing` share it.
 */
async function addMaterialToCatalogAsync(tenantId = 'tenant-default', payload = {}, dbClient = db) {
    const rawName = String(payload.material_name || payload.materialName || payload.name || '').trim();
    if (!rawName) {
        const err = new Error('INVALID_MATERIAL_NAME: material_name is required.');
        err.statusCode = 400;
        throw err;
    }

    const gsm = Math.max(35, Number(payload.gsm || payload.grammageGsm || 90));
    const id = String(payload.id || payload.paperId || `mat_${crypto.randomBytes(6).toString('hex')}`);
    const substrateClassInput = String(payload.substrate_class || payload.substrateClass || '').toUpperCase();
    const inferredCat = classifyMaterialCategory({
        material_name: rawName,
        substrate_class: substrateClassInput,
        material_type: payload.material_type || (substrateClassInput === 'BOARD' || gsm >= 240 ? 'BOARD' : 'PAPER'),
        gsm
    });

    const bulkFactor = Number(
        payload.bulkFactor ||
            payload.bulk_factor ||
            (payload.bulk_microns ? round2(Number(payload.bulk_microns) / gsm) : inferredCat.substrateClass === 'UNCOATED' ? 1.3 : inferredCat.substrateClass === 'BOARD' ? 1.15 : 0.95)
    );
    const bulkMicrons = Math.round(Number(payload.bulk_microns || payload.bulkMicrons || gsm * bulkFactor));
    const costPerKgEur = Number(
        payload.cost_per_kg_eur ||
            payload.costPerKgEur ||
            (payload.costPerTonEur ? Number(payload.costPerTonEur) / 1000 : inferredCat.substrateClass === 'BOARD' ? 1.48 : 1.28)
    );
    const costPerTonEur = round2(costPerKgEur * 1000);
    const sheetFormat = String(payload.sheet_format || payload.sheetFormat || '70x100');
    const sheetAreaM2 = parseTrimSizeAreaM2(
        sheetFormat.includes('x') ? `${Number(sheetFormat.split('x')[0]) * 10}x${Number(sheetFormat.split('x')[1]) * 10}` : '700x1000'
    );
    const singleSheetWeightKg = Math.max(0.005, (sheetAreaM2 * gsm) / 1000);
    const costPerSheetEur = round4(
        Number(payload.cost_per_sheet_eur || payload.costPerSheetEur || singleSheetWeightKg * costPerKgEur)
    );

    const metadataObj = {
        bulk_factor: round2(bulkFactor),
        bulk_microns: bulkMicrons,
        cost_per_kg_eur: round4(costPerKgEur),
        cost_per_ton_eur: costPerTonEur,
        cost_per_sheet_eur: costPerSheetEur,
        sheet_format: sheetFormat,
        created_via: payload.source || 'PRICING_CALIBRATOR_QUICK_ADD'
    };

    const rowObj = {
        id,
        tenant_id: String(tenantId || 'tenant-default'),
        printhouse_id: payload.printhouse_id || 'node-primary',
        material_name: rawName,
        material_type: inferredCat.substrateClass === 'BOARD' ? 'BOARD' : 'PAPER',
        substrate_class: inferredCat.substrateClass,
        gsm,
        sheet_format: sheetFormat,
        finish_type: String(payload.finish_type || (inferredCat.substrateClass === 'COATED' ? 'MATTE' : 'UNCOATED')),
        cost_per_unit: costPerSheetEur,
        metadata_json: JSON.stringify(metadataObj)
    };

    const normalizedPaper = normalizeMaterialRowToPaperItem(rowObj);
    const state = getTenantState(tenantId);
    const existingIdx = state.papers.findIndex((p) => p.paperId === normalizedPaper.paperId);
    if (existingIdx >= 0) {
        state.papers[existingIdx] = normalizedPaper;
    } else {
        state.papers.unshift(normalizedPaper);
    }

    if (dbClient && typeof dbClient.query === 'function') {
        try {
            const nodes = await dbClient
                .query('SELECT id FROM printer_nodes WHERE tenant_id = ? AND status != "DELETED" ORDER BY created_at ASC LIMIT 1', [tenantId])
                .catch(() => []);
            const printhouseId = Array.isArray(nodes) && nodes.length > 0 ? nodes[0].id : rowObj.printhouse_id;

            await dbClient
                .query(
                    `INSERT INTO materials_catalog
                     (id, tenant_id, printhouse_id, material_name, material_type, substrate_class, gsm, sheet_format, finish_type, supplier_name, availability_status, lead_time_days, cost_per_unit, currency, metadata_json)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_STOCK', 2, ?, 'EUR', ?)`,
                    [
                        id,
                        String(tenantId || 'tenant-default'),
                        printhouseId,
                        rawName,
                        rowObj.material_type,
                        rowObj.substrate_class,
                        gsm,
                        sheetFormat,
                        rowObj.finish_type,
                        String(payload.supplier_name || 'Catálogo Principal Imprenta'),
                        costPerSheetEur,
                        rowObj.metadata_json
                    ]
                )
                .catch(() => {});
        } catch (_) {
            // Non-fatal in unit test environments without live MySQL
        }
    }

    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        material: normalizedPaper,
        materials: state.papers
    };
}

/**
 * Persists a profile in memory AND synchronizes bidirectionally with MySQL
 * (`printer_pricing_profiles` + `printer_nodes.rates_json` + `printhouse_pricing_revisions`).
 */
function savePricingProfile(tenantId = 'tenant-default', profileData = {}, dbClient = db) {
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
        nodeId: String(profileData.nodeId || baseExisting.nodeId || profileData.printerId || 'node-primary'),
        printerId: String(profileData.printerId || profileData.printer_id || baseExisting.printerId || `mach-${Date.now()}`),
        printerName: String(profileData.printerName || profileData.printer_name || baseExisting.printerName || 'Industrial Press Node'),
        technology,
        technologyLabel: String(profileData.technologyLabel || baseExisting.technologyLabel || defaultLabels[technology] || technology),
        supportedFamilies: Array.isArray(profileData.supportedFamilies) && profileData.supportedFamilies.length > 0
            ? profileData.supportedFamilies.map((f) => String(f).toUpperCase())
            : Array.isArray(baseExisting.supportedFamilies) && baseExisting.supportedFamilies.length > 0
              ? baseExisting.supportedFamilies
              : inferSupportedFamiliesForTechnology(technology),
        minSheetWidthMm: Number(profileData.minSheetWidthMm ?? baseExisting.minSheetWidthMm ?? (technology === 'OFFSET_B1' ? 280 : 148)),
        minSheetHeightMm: Number(profileData.minSheetHeightMm ?? baseExisting.minSheetHeightMm ?? (technology === 'OFFSET_B1' ? 400 : 210)),
        maxSheetWidthMm: Number(profileData.maxSheetWidthMm ?? baseExisting.maxSheetWidthMm ?? (technology === 'OFFSET_B1' ? 1060 : 750)),
        maxSheetHeightMm: Number(profileData.maxSheetHeightMm ?? baseExisting.maxSheetHeightMm ?? (technology === 'OFFSET_B1' ? 750 : 530)),
        scope: String(profileData.scope || profileData.pricing_scope || baseExisting.scope || 'GLOBAL').toUpperCase(),
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
        source: 'WORKSPACE_SYNCED',
        updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0 && !profileData.allowDuplicate) {
        state.profiles[existingIndex] = normalized;
    } else {
        state.profiles.unshift(normalized);
    }

    const updatedRatesSnapshot = buildRatesJsonPatchFromProfile(state.latestRatesJson || {}, normalized);
    state.latestRatesJson = updatedRatesSnapshot;
    const newChecksum = computeDeterministicRatesChecksum(updatedRatesSnapshot);
    const revisionId = `rev_ws_${newChecksum.slice(0, 10)}`;

    state.syncTelemetry = {
        status: 'SYNCED_WITH_WORKSPACE',
        source: 'WORKSPACE_TO_ONBOARDING',
        nodeId: normalized.nodeId,
        ratesChecksum: newChecksum,
        lastSyncedAt: normalized.updatedAt,
        revisionId
    };

    // Fire-and-forget / async MySQL persistence if dbClient is available
    persistProfileToMySQLAsync(tenantId, normalized, updatedRatesSnapshot, newChecksum, revisionId, dbClient).catch(
        () => {}
    );

    return {
        ok: true,
        profile: normalized,
        kpiSummary: computeKpiSummary(state.profiles),
        syncTelemetry: state.syncTelemetry
    };
}

async function persistProfileToMySQLAsync(
    tenantId,
    normalized,
    updatedRatesSnapshot,
    newChecksum,
    revisionId,
    dbClient = db
) {
    if (!dbClient || typeof dbClient.query !== 'function') return;

    // 1. Find tenant's primary printer_node
    const nodes = await dbClient
        .query(
            'SELECT id, rates_json FROM printer_nodes WHERE tenant_id = ? AND status != "DELETED" ORDER BY created_at ASC LIMIT 1',
            [tenantId]
        )
        .catch(() => []);

    const targetNode = Array.isArray(nodes) && nodes.length > 0 ? nodes[0] : null;
    const printerNodeId = targetNode ? targetNode.id : normalized.nodeId;
    const baseRates = targetNode ? safeParseJson(targetNode.rates_json, {}) : {};
    const mergedRates = buildRatesJsonPatchFromProfile(baseRates, normalized);
    const mergedChecksum = computeDeterministicRatesChecksum(mergedRates);

    // 2. Upsert into `printer_pricing_profiles`
    const existingRows = await dbClient
        .query('SELECT id FROM printer_pricing_profiles WHERE id = ? OR printer_id = ? LIMIT 1', [
            normalized.id,
            printerNodeId
        ])
        .catch(() => []);

    if (Array.isArray(existingRows) && existingRows.length > 0) {
        await dbClient
            .query(
                `UPDATE printer_pricing_profiles
                 SET target_margin_pct = ?, platform_markup_pct = ?, minimum_job_fee = ?, active = ?
                 WHERE id = ?`,
                [
                    normalized.targetMarginPct,
                    normalized.platformMarkupPct,
                    normalized.minimumJobFeeEur,
                    normalized.active ? 1 : 0,
                    existingRows[0].id
                ]
            )
            .catch(() => {});
    } else {
        await dbClient
            .query(
                `INSERT INTO printer_pricing_profiles
                 (id, printer_id, machine_id, pricing_scope, currency, target_margin_pct, platform_markup_pct, dynamic_routing_premium, minimum_job_fee, active)
                 VALUES (?, ?, ?, ?, 'EUR', ?, ?, 0, ?, ?)`,
                [
                    normalized.id,
                    printerNodeId,
                    normalized.printerId,
                    normalized.scope || 'PRINTER',
                    normalized.targetMarginPct,
                    normalized.platformMarkupPct,
                    normalized.minimumJobFeeEur,
                    normalized.active ? 1 : 0
                ]
            )
            .catch(() => {});
    }

    // 3. Synchronize `printer_nodes.rates_json` and insert immutable revision in `printhouse_pricing_revisions`
    if (targetNode) {
        const baselineChecksum = computeDeterministicRatesChecksum(baseRates);
        await dbClient
            .query('UPDATE printer_nodes SET rates_json = ? WHERE id = ? AND tenant_id = ?', [
                JSON.stringify(mergedRates),
                printerNodeId,
                tenantId
            ])
            .catch(() => {});

        await dbClient
            .query(
                `INSERT INTO printhouse_pricing_revisions
                 (id, tenant_id, printer_node_id, source_type, rates_json, rates_checksum, baseline_rates_checksum, engine_package, engine_version, engine_commit, created_by_json)
                 VALUES (?, ?, ?, 'WORKSPACE_SYNC', ?, ?, ?, '@ppos/pricing-engine', '1.0.0', '794ae408', ?)`,
                [
                    revisionId,
                    tenantId,
                    printerNodeId,
                    JSON.stringify(mergedRates),
                    mergedChecksum,
                    baselineChecksum,
                    JSON.stringify({ source: 'ops_pricing_workspace', profileId: normalized.id })
                ]
            )
            .catch(() => {});
    }

    const state = getTenantState(tenantId);
    state.syncTelemetry = {
        status: 'SYNCED_WITH_WORKSPACE',
        source: 'WORKSPACE_TO_ONBOARDING',
        nodeId: printerNodeId,
        ratesChecksum: mergedChecksum,
        lastSyncedAt: new Date().toISOString(),
        revisionId
    };
}

async function savePricingProfileAsync(tenantId = 'tenant-default', profileData = {}, dbClient = db) {
    const syncResult = savePricingProfile(tenantId, profileData, null);
    await persistProfileToMySQLAsync(
        tenantId,
        syncResult.profile,
        getTenantState(tenantId).latestRatesJson,
        syncResult.syncTelemetry.ratesChecksum,
        syncResult.syncTelemetry.revisionId,
        dbClient
    );
    return {
        ...syncResult,
        syncTelemetry: getTenantState(tenantId).syncTelemetry
    };
}

/**
 * Deletes a pricing profile in memory AND removes it from MySQL (`printer_pricing_profiles` +
 * `printer_nodes.rates_json._workspace_profiles`).
 */
function deletePricingProfile(tenantId = 'tenant-default', profileId, dbClient = db) {
    if (!profileId || typeof profileId !== 'string') {
        const err = new Error('INVALID_PROFILE_ID: profileId string is required.');
        err.statusCode = 400;
        throw err;
    }

    const state = getTenantState(tenantId);
    const existingIndex = state.profiles.findIndex((p) => p.id === profileId);
    const removedProfile = existingIndex >= 0 ? state.profiles[existingIndex] : { id: profileId };

    if (existingIndex >= 0) {
        state.profiles.splice(existingIndex, 1);
    }

    // Clean up from latestRatesJson._workspace_profiles if present
    const nextRates = {
        ...safeParseJson(state.latestRatesJson, {}),
        _workspace_profiles: {
            ...(safeParseJson(state.latestRatesJson, {})._workspace_profiles || {})
        }
    };

    for (const key of Object.keys(nextRates._workspace_profiles)) {
        if (nextRates._workspace_profiles[key] && nextRates._workspace_profiles[key].id === profileId) {
            delete nextRates._workspace_profiles[key];
        }
    }

    state.latestRatesJson = nextRates;
    const newChecksum = computeDeterministicRatesChecksum(nextRates);
    const revisionId = `rev_del_${newChecksum.slice(0, 10)}`;

    state.syncTelemetry = {
        status: 'SYNCED_WITH_WORKSPACE',
        source: 'WORKSPACE_PROFILE_DELETED',
        nodeId: removedProfile.nodeId || 'node-primary',
        ratesChecksum: newChecksum,
        lastSyncedAt: new Date().toISOString(),
        revisionId
    };

    deleteProfileFromMySQLAsync(tenantId, profileId, nextRates, dbClient).catch(() => {});

    return {
        ok: true,
        deletedId: profileId,
        profiles: state.profiles,
        kpiSummary: computeKpiSummary(state.profiles),
        syncTelemetry: state.syncTelemetry
    };
}

async function deleteProfileFromMySQLAsync(tenantId, profileId, nextRates, dbClient = db) {
    if (!dbClient || typeof dbClient.query !== 'function') return;

    await dbClient
        .query('DELETE FROM printer_pricing_profiles WHERE id = ?', [profileId])
        .catch(() => {});

    const nodes = await dbClient
        .query(
            'SELECT id, rates_json FROM printer_nodes WHERE tenant_id = ? AND status != "DELETED" ORDER BY created_at ASC LIMIT 1',
            [tenantId]
        )
        .catch(() => []);

    const targetNode = Array.isArray(nodes) && nodes.length > 0 ? nodes[0] : null;
    if (targetNode) {
        const baseRates = safeParseJson(targetNode.rates_json, {});
        if (baseRates._workspace_profiles && typeof baseRates._workspace_profiles === 'object') {
            for (const key of Object.keys(baseRates._workspace_profiles)) {
                if (baseRates._workspace_profiles[key] && baseRates._workspace_profiles[key].id === profileId) {
                    delete baseRates._workspace_profiles[key];
                }
            }
            await dbClient
                .query('UPDATE printer_nodes SET rates_json = ? WHERE id = ? AND tenant_id = ?', [
                    JSON.stringify(baseRates),
                    targetNode.id,
                    tenantId
                ])
                .catch(() => {});
        }
    }
}

async function deletePricingProfileAsync(tenantId = 'tenant-default', profileId, dbClient = db) {
    const res = deletePricingProfile(tenantId, profileId, null);
    await deleteProfileFromMySQLAsync(tenantId, profileId, getTenantState(tenantId).latestRatesJson, dbClient);
    return res;
}

/**
 * Synchronizes calibrated rates saved in Onboarding (`PUT /api/printhouse/onboarding/pricing/industrial`
 * or `calibrationAcceptanceService.acceptCalibrationRun`) directly into `/ops/pricing` profiles
 * and `printer_pricing_profiles`.
 */
async function syncFromOnboardingRates(tenantId = 'tenant-default', ratesJson = {}, options = {}, dbClient = db) {
    const state = getTenantState(tenantId);
    const parsedRates = safeParseJson(ratesJson, {});
    state.latestRatesJson = parsedRates;

    const nodeId = String(options.nodeId || options.printerNodeId || 'node-primary');
    const nodeName = String(options.nodeName || 'Primary Production Node');
    const targetMachineId = options.machineId || options.printerId || null;
    const productFamily = options.productFamily ? String(options.productFamily).toUpperCase() : null;
    const ratesChecksum = options.ratesChecksum || computeDeterministicRatesChecksum(parsedRates);
    const revisionId = options.revisionId || `rev_onb_${ratesChecksum.slice(0, 10)}`;

    // Derive economic parameters from the onboarding `rates_json`
    const b1Econ = extractEconomicParametersFromRatesJson(parsedRates, 'OFFSET_B1');
    const digEcon = extractEconomicParametersFromRatesJson(parsedRates, 'DIGITAL_TONER');

    // Update or insert the target machine profile (if specified) or the primary node profile
    const primaryProfileId = targetMachineId ? `prof-db-${targetMachineId}` : `prof-node-${nodeId}`;
    const existingIdx = state.profiles.findIndex(
        (p) =>
            (targetMachineId && (p.printerId === targetMachineId || p.id === targetMachineId)) ||
            p.id === primaryProfileId ||
            p.nodeId === nodeId ||
            p.id === 'prof-offset-b1-xl106'
    );

    const existingProf = existingIdx >= 0 ? state.profiles[existingIdx] : null;
    const targetTech = existingProf?.technology || (options.technology ? String(options.technology).toUpperCase() : 'OFFSET_B1');
    const targetEcon = extractEconomicParametersFromRatesJson(parsedRates, targetTech);

    const syncedPrimaryProfile = {
        ...(existingProf || {}),
        id: existingProf ? existingProf.id : primaryProfileId,
        tenantId: String(tenantId),
        nodeId,
        printerId: targetMachineId || (existingProf ? existingProf.printerId : nodeId),
        printerName:
            options.machineName ||
            (existingProf && existingProf.source !== 'SEED_FALLBACK' ? existingProf.printerName : nodeName),
        technology: targetTech,
        technologyLabel: productFamily
            ? `${targetTech === 'DIGITAL_TONER' ? 'Digital Press' : 'Offset B1'} · Calibrated (${productFamily})`
            : existingProf?.technologyLabel || 'Offset B1 · Calibrated Node Rates',
        supportedFamilies: existingProf?.supportedFamilies || inferSupportedFamiliesForTechnology(targetTech),
        scope: targetMachineId ? 'MACHINE' : 'PRINTER',
        hourlyRateEur: Number(options.hourlyRateEur ?? targetEcon.hourlyRateEur),
        setupFeeEur: Number(options.setupFeeEur ?? targetEcon.setupFeeEur),
        plateCostEur: Number(options.plateCostEur ?? targetEcon.plateCostEur),
        platesPerForm: targetTech === 'DIGITAL_TONER' ? 0 : 8,
        pagesPerSignature: targetTech === 'DIGITAL_TONER' ? 4 : targetTech === 'OFFSET_B2' ? 8 : 16,
        speedSheetsPerHour: targetTech === 'DIGITAL_TONER' ? 3600 : 14000,
        makeReadyWasteSheets: targetTech === 'DIGITAL_TONER' ? 15 : 220,
        runWastePct: targetTech === 'DIGITAL_TONER' ? 0.8 : 2.2,
        clickCostEur: targetTech === 'DIGITAL_TONER' ? 0.038 : 0,
        targetMarginPct: Number(options.targetMarginPct ?? targetEcon.targetMarginPct),
        platformMarkupPct: Number(options.platformMarkupPct ?? targetEcon.platformMarkupPct),
        minimumJobFeeEur: Number(options.minimumJobFeeEur ?? targetEcon.minimumJobFeeEur),
        oeeHealthPct: 95.2,
        active: true,
        status: 'ACTIVE',
        source: 'ONBOARDING_CALIBRATED',
        ratesChecksum,
        updatedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
        state.profiles[existingIdx] = syncedPrimaryProfile;
    } else {
        state.profiles.unshift(syncedPrimaryProfile);
    }

    // Also update Digital profile if present so Digital vs. Offset Crossover reflects onboarding rates
    const digIdx = state.profiles.findIndex((p) => p.technology === 'DIGITAL_TONER');
    if (digIdx >= 0 && parsedRates.digital_click_cost !== undefined) {
        state.profiles[digIdx] = {
            ...state.profiles[digIdx],
            clickCostEur: Number(parsedRates.digital_click_cost || state.profiles[digIdx].clickCostEur),
            targetMarginPct: digEcon.targetMarginPct,
            updatedAt: new Date().toISOString()
        };
    }

    state.syncTelemetry = {
        status: 'SYNCED_WITH_WORKSPACE',
        source: 'ONBOARDING_TO_WORKSPACE',
        nodeId,
        productFamily,
        ratesChecksum,
        lastSyncedAt: new Date().toISOString(),
        revisionId
    };

    // Persist into MySQL `printer_pricing_profiles`
    if (dbClient && typeof dbClient.query === 'function') {
        try {
            const existingDb = await dbClient
                .query('SELECT id FROM printer_pricing_profiles WHERE printer_id = ? LIMIT 1', [nodeId])
                .catch(() => []);
            if (Array.isArray(existingDb) && existingDb.length > 0) {
                await dbClient
                    .query(
                        `UPDATE printer_pricing_profiles
                         SET target_margin_pct = ?, platform_markup_pct = ?, minimum_job_fee = ?, active = 1
                         WHERE id = ?`,
                        [
                            syncedPrimaryProfile.targetMarginPct,
                            syncedPrimaryProfile.platformMarkupPct,
                            syncedPrimaryProfile.minimumJobFeeEur,
                            existingDb[0].id
                        ]
                    )
                    .catch(() => {});
            } else {
                await dbClient
                    .query(
                        `INSERT INTO printer_pricing_profiles
                         (id, printer_id, machine_id, pricing_scope, currency, target_margin_pct, platform_markup_pct, dynamic_routing_premium, minimum_job_fee, active)
                         VALUES (?, ?, ?, 'PRINTER', 'EUR', ?, ?, 0, ?, 1)`,
                        [
                            syncedPrimaryProfile.id,
                            nodeId,
                            syncedPrimaryProfile.printerId,
                            syncedPrimaryProfile.targetMarginPct,
                            syncedPrimaryProfile.platformMarkupPct,
                            syncedPrimaryProfile.minimumJobFeeEur
                        ]
                    )
                    .catch(() => {});
            }
        } catch (_) {
            // Non-fatal in unit test contexts without MySQL
        }
    }

    return {
        ok: true,
        tenantId: String(tenantId),
        syncedProfile: syncedPrimaryProfile,
        kpiSummary: computeKpiSummary(state.profiles),
        syncTelemetry: state.syncTelemetry
    };
}

function parseTrimSizeAreaM2(trimSize = '148x210') {
    const match = String(trimSize).match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!match) {
        return 0.148 * 0.21;
    }
    const wMm = Number(match[1]);
    const hMm = Number(match[2]);
    return (wMm / 1000) * (hMm / 1000);
}

/**
 * Executes the real-time Industrial Price Calibrator formula for a specific specification & profile.
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

    const hourlyRateEur = Number(quoteSpec.hourlyRateEur ?? baseProfile.hourlyRateEur);
    const setupFeeEur = Number(quoteSpec.setupFeeEur ?? baseProfile.setupFeeEur);
    const targetMarginPct = Number(quoteSpec.targetMarginPct ?? baseProfile.targetMarginPct);
    const minimumJobFeeEur = Number(quoteSpec.minimumJobFeeEur ?? baseProfile.minimumJobFeeEur);
    const plateCostEur = Number(quoteSpec.plateCostEur ?? baseProfile.plateCostEur);

    const pagesPerSignature = Math.max(2, Number(baseProfile.pagesPerSignature || 16));
    const signaturesCount = Math.ceil(pages / pagesPerSignature);

    // 1. Paper weight & Paper Cost calculation
    const pageAreaM2 = parseTrimSizeAreaM2(trimSize);
    const leavesPerCopy = pages / 2;
    const netPaperAreaM2 = leavesPerCopy * pageAreaM2 * copies;
    const wasteMultiplier = 1 + Number(baseProfile.runWastePct || 2.0) / 100;
    const makeReadyAreaM2 =
        Number(baseProfile.makeReadyWasteSheets || 100) *
        signaturesCount *
        (pageAreaM2 * (pagesPerSignature / 2));

    const grossPaperAreaM2 = netPaperAreaM2 * wasteMultiplier + makeReadyAreaM2;
    const paperWeightKg = round2((grossPaperAreaM2 * Number(paper.grammageGsm || paper.gsm || 90)) / 1000);
    const costPerKgEur = Number(
        paper.costPerKgEur ?? paper.cost_per_kg_eur ?? (Number(paper.costPerTonEur || 1250) / 1000)
    );
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

    // 4. Press Run Time Cost
    const totalPressSheets = signaturesCount * copies * wasteMultiplier;
    const pressRunHours = round2(totalPressSheets / Math.max(500, Number(baseProfile.speedSheetsPerHour || 10000)));
    const clickChargeEur =
        baseProfile.technology === 'DIGITAL_TONER'
            ? totalPressSheets * Number(baseProfile.clickCostEur || 0.038)
            : 0;
    const runTimeCostEur = round2(pressRunHours * hourlyRateEur + clickChargeEur);

    // 5. Finishing Cost (Product Family / Binding aware)
    const productFamily = String(
        quoteSpec.productFamily ||
            (bindingType === 'HARDCOVER'
                ? 'HARDCOVER'
                : bindingType === 'WIRE_O'
                  ? 'WIRE_O'
                  : bindingType === 'SADDLE' || bindingType === 'SADDLE_STITCH'
                    ? 'SADDLE_STITCH'
                    : 'SOFTCOVER')
    ).toUpperCase();

    const bindingSetupEur =
        productFamily === 'HARDCOVER'
            ? 180
            : productFamily === 'WIRE_O'
              ? 65
              : productFamily === 'SADDLE_STITCH'
                ? 45
                : 85;
    const bindingUnitEur =
        productFamily === 'HARDCOVER'
            ? 1.45 + signaturesCount * 0.04
            : productFamily === 'WIRE_O'
              ? 0.48 + signaturesCount * 0.02
              : productFamily === 'SADDLE_STITCH'
                ? 0.14
                : 0.34 + signaturesCount * 0.025;
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

    const spineWidthMm = round2(
        ((pages / 2) * Number(paper.grammageGsm || paper.gsm || 90) * Number(paper.bulkFactor || 1.3)) / 1000 +
            (productFamily === 'HARDCOVER' ? 3.5 : productFamily === 'WIRE_O' ? 1.8 : 0.6)
    );

    return {
        ok: true,
        tenantId: String(tenantId || 'tenant-default'),
        spec: {
            productFamily,
            trimSize,
            copies,
            pages,
            bindingType,
            spineWidthMm,
            paperId: paper.paperId,
            paperName: paper.name,
            grammageGsm: paper.grammageGsm || paper.gsm,
            bulkFactor: paper.bulkFactor,
            costPerKgEur
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
 * Computes the exact Digital vs. Offset Crossover Point (in copies).
 */
function calculateCrossoverPoint(tenantId = 'tenant-default', options = {}) {
    const state = getTenantState(tenantId);

    const digitalProfile =
        state.profiles.find(
            (p) =>
                p.id === options.digitalProfileId ||
                p.printerId === options.digitalMachineId ||
                p.technology === 'DIGITAL_TONER'
        ) || state.profiles.find((p) => p.technology === 'DIGITAL_TONER') || state.profiles[0];

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
    getPricingProfilesAsync,
    getTenantMaterialsCatalogAsync,
    addMaterialToCatalogAsync,
    hydrateTenantFromMySQL,
    savePricingProfile,
    savePricingProfileAsync,
    deletePricingProfile,
    deletePricingProfileAsync,
    syncFromOnboardingRates,
    calibrateQuote,
    calculateCrossoverPoint,
    computeDeterministicRatesChecksum,
    buildRatesJsonPatchFromProfile,
    normalizeMaterialRowToPaperItem,
    inferSupportedFamiliesForTechnology,
    PRODUCT_FAMILY_SPECS,
    DEFAULT_PAPER_CATALOG
};
