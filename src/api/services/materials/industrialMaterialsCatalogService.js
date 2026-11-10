'use strict';

/**
 * src/api/services/materials/industrialMaterialsCatalogService.js
 *
 * PrintPrice OS — Phase 15: Unified Industrial Substrates & Paper Catalog Engine
 *
 * Homologates `printhouse_materials` & `materials_catalog` in MySQL (with deterministic
 * in-memory fallback for isolated unit tests) across:
 *   1. `/materials-paper` & `/materials` (Global Industrial Substrates Workspace)
 *   2. `Printhouse Setup > Materials & Paper` (`/printhouse/setup?tab=MATERIALS` & `/printhouses/:id?tab=MATERIALS`)
 *   3. `LivePriceCalibratorModal` (`3. Substrate / Paper Stock` dropdown & instant cost calculation)
 *   4. `PreflightUploadModal` (`+ RUN PREFLIGHT` substrate selector for theoretical spine calculation)
 *
 * Supports both Cut Sheets (Pliegos Cortados: B1 700×1000, B2 500×700, SRA3 320×450)
 * and Continuous Web Reels (Bobinas Continuas: Web Offset & High-Speed Inkjet),
 * along with Board/Carton, Endpapers (Guardas), and Lamination Films.
 */

const crypto = require('crypto');
const db = require('../mysqlClient');
const { recordOperationalEvent } = require('../telemetry/operationalActivityStreamService');

const VALID_INDUSTRIAL_MATERIAL_TYPES = new Set([
    'SHEETFED_PAPER',
    'REEL_PAPER',
    'BOARD_CARTON',
    'ENDPAPERS',
    'LAMINATION_FOIL',
    // Legacy compatibility aliases
    'PAPER',
    'BOARD',
    'VINYL',
    'INK',
    'CONSUMABLE'
]);

const VALID_SUBSTRATE_CATEGORIES = new Set([
    'OFFSET_UNCOATED',
    'COATED_GLOSS',
    'COATED_MATTE',
    'BULKY_CREAM',
    'SPECIALTY',
    'STANDARD',
    'UNCOATED',
    'COATED',
    'BOARD'
]);

const VALID_CERTIFICATIONS = new Set([
    'FSC_MIX',
    'PEFC',
    'ECOLABEL',
    'CRADLE_TO_CRADLE'
]);

/**
 * Canonical European Industrial Paper & Substrates Master Catalog
 * Covers Arctic Paper (Munken), Lecta / Torraspapel (Coral Book, GardaPat),
 * Sappi Europe (Magno), Stora Enso (BookCream Reel), UPM (ProFI Jet Reel),
 * Fedrigoni (Symbol Card, Sirio Color Guardas), Eska (Graphic Board), and Derprosa (Soft-Touch).
 */
const EUROPEAN_MASTER_SUBSTRATES = [
    {
        id: 'MAT-MUNKEN-PRINT-WHITE-90',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'Munken Print White 1.5',
        manufacturer: 'Arctic Paper',
        material_type: 'SHEETFED_PAPER',
        category: 'BULKY_CREAM',
        basis_weight_gsm: 90,
        bulk_volume: 1.50,
        dimensions_json: {
            width_mm: 700,
            height_mm: 1000,
            grain_direction: 'LG',
            format_label: 'B1 (700×1000 mm)'
        },
        cost_per_kg_eur: 1.4200,
        certifications_json: ['FSC_MIX', 'PEFC', 'ECOLABEL'],
        in_stock_kg: 4850.00,
        min_order_kg: 500.00,
        status: 'ACTIVE'
    },
    {
        id: 'MAT-OFFSET-CORAL-90',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'Coral Book White 1.25',
        manufacturer: 'Lecta / Torraspapel',
        material_type: 'SHEETFED_PAPER',
        category: 'OFFSET_UNCOATED',
        basis_weight_gsm: 90,
        bulk_volume: 1.25,
        dimensions_json: {
            width_mm: 700,
            height_mm: 1000,
            grain_direction: 'LG',
            format_label: 'B1 (700×1000 mm)'
        },
        cost_per_kg_eur: 1.2800,
        certifications_json: ['FSC_MIX', 'PEFC'],
        in_stock_kg: 7600.00,
        min_order_kg: 500.00,
        status: 'ACTIVE'
    },
    {
        id: 'MAT-CORAL-BOOK-IVORY-80',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'Coral Book Ivory Ahuesado 1.65',
        manufacturer: 'Lecta / Torraspapel',
        material_type: 'SHEETFED_PAPER',
        category: 'BULKY_CREAM',
        basis_weight_gsm: 80,
        bulk_volume: 1.65,
        dimensions_json: {
            width_mm: 700,
            height_mm: 1000,
            grain_direction: 'LG',
            format_label: 'B1 (700×1000 mm)'
        },
        cost_per_kg_eur: 1.3600,
        certifications_json: ['FSC_MIX', 'PEFC'],
        in_stock_kg: 6200.00,
        min_order_kg: 500.00,
        status: 'ACTIVE'
    },
    {
        id: 'MAT-SAPPI-MAGNO-SATIN-135',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'Magno Satin Estucado Mate',
        manufacturer: 'Sappi Europe',
        material_type: 'SHEETFED_PAPER',
        category: 'COATED_MATTE',
        basis_weight_gsm: 135,
        bulk_volume: 0.92,
        dimensions_json: {
            width_mm: 700,
            height_mm: 1000,
            grain_direction: 'LG',
            format_label: 'B1 (700×1000 mm)'
        },
        cost_per_kg_eur: 1.2900,
        certifications_json: ['FSC_MIX', 'ECOLABEL'],
        in_stock_kg: 8400.00,
        min_order_kg: 750.00,
        status: 'ACTIVE'
    },
    {
        id: 'MAT-GARDA-GLOSS-B2-150',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'GardaGloss Art Brillante B2',
        manufacturer: 'Cartiere del Garda / Lecta',
        material_type: 'SHEETFED_PAPER',
        category: 'COATED_GLOSS',
        basis_weight_gsm: 150,
        bulk_volume: 0.88,
        dimensions_json: {
            width_mm: 500,
            height_mm: 700,
            grain_direction: 'SG',
            format_label: 'B2 (500×700 mm)'
        },
        cost_per_kg_eur: 1.3400,
        certifications_json: ['FSC_MIX', 'ECOLABEL'],
        in_stock_kg: 3150.00,
        min_order_kg: 400.00,
        status: 'ACTIVE'
    },
    {
        id: 'REEL-CREAM-80-BULK2',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'Stora Enso BookCream 2.0 Web Reel',
        manufacturer: 'Stora Enso',
        material_type: 'REEL_PAPER',
        category: 'BULKY_CREAM',
        basis_weight_gsm: 80,
        bulk_volume: 1.95,
        dimensions_json: {
            web_width_mm: 840,
            max_diameter_mm: 1200,
            core_diameter_mm: 76,
            format_label: 'Bobina 840 mm · Ø1200 mm · Cono 76 mm'
        },
        cost_per_kg_eur: 1.2400,
        certifications_json: ['FSC_MIX', 'PEFC', 'ECOLABEL'],
        in_stock_kg: 14500.00,
        min_order_kg: 2000.00,
        status: 'ACTIVE'
    },
    {
        id: 'REEL-UPM-JETSET-OFFSET-80',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'UPM ProFI Jet High-Speed Inkjet Reel',
        manufacturer: 'UPM Communication Papers',
        material_type: 'REEL_PAPER',
        category: 'OFFSET_UNCOATED',
        basis_weight_gsm: 80,
        bulk_volume: 1.28,
        dimensions_json: {
            web_width_mm: 630,
            max_diameter_mm: 1250,
            core_diameter_mm: 76,
            format_label: 'Bobina 630 mm · Ø1250 mm · Cono 76 mm'
        },
        cost_per_kg_eur: 1.1900,
        certifications_json: ['FSC_MIX', 'ECOLABEL'],
        in_stock_kg: 11200.00,
        min_order_kg: 1500.00,
        status: 'ACTIVE'
    },
    {
        id: 'BOARD-FEDRIGONI-SYMBOL-300',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'Fedrigoni Symbol Card 1S Cubierta',
        manufacturer: 'Fedrigoni Group',
        material_type: 'BOARD_CARTON',
        category: 'COATED_MATTE',
        basis_weight_gsm: 300,
        bulk_volume: 1.20,
        dimensions_json: {
            width_mm: 700,
            height_mm: 1000,
            grain_direction: 'SG',
            format_label: 'B1 (700×1000 mm)'
        },
        cost_per_kg_eur: 1.5800,
        certifications_json: ['FSC_MIX', 'CRADLE_TO_CRADLE'],
        in_stock_kg: 2450.00,
        min_order_kg: 300.00,
        status: 'ACTIVE'
    },
    {
        id: 'ENDPAPER-FEDRIGONI-SIRIO-140',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'Fedrigoni Sirio Color Guardas Cartoné',
        manufacturer: 'Fedrigoni Group',
        material_type: 'ENDPAPERS',
        category: 'SPECIALTY',
        basis_weight_gsm: 140,
        bulk_volume: 1.35,
        dimensions_json: {
            width_mm: 700,
            height_mm: 1000,
            grain_direction: 'LG',
            format_label: 'B1 (700×1000 mm)'
        },
        cost_per_kg_eur: 2.1500,
        certifications_json: ['FSC_MIX', 'CRADLE_TO_CRADLE'],
        in_stock_kg: 480.00,
        min_order_kg: 500.00,
        status: 'LOW_STOCK'
    },
    {
        id: 'FOIL-DERPROSA-SOFTTOUCH-30',
        printhouse_id: 'GLOBAL_MASTER',
        tenant_id: 'tenant-default',
        name: 'Derprosa Soft-Touch BOPP Lamination Film',
        manufacturer: 'Taghleef / Derprosa',
        material_type: 'LAMINATION_FOIL',
        category: 'SPECIALTY',
        basis_weight_gsm: 30,
        bulk_volume: 1.10,
        dimensions_json: {
            web_width_mm: 480,
            max_diameter_mm: 600,
            core_diameter_mm: 76,
            format_label: 'Bobina Película 480 mm · Ø600 mm'
        },
        cost_per_kg_eur: 3.8500,
        certifications_json: ['ECOLABEL'],
        in_stock_kg: 420.00,
        min_order_kg: 150.00,
        status: 'ACTIVE'
    }
];

// In-memory runtime store keyed by material ID (seeded with European Master Catalog)
const runtimeIndustrialMaterials = new Map();
let schemaEnsured = false;

function round2(n) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function round4(n) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 10000) / 10000;
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

/**
 * Computes physical & economic mechanics for a Sheetfed or Reel substrate:
 * - `sheetAreaM2`: `(width_mm / 1000) * (height_mm / 1000)` for sheets, or `1.0` m² reference for reels
 * - `sheetWeightGrams`: `sheetAreaM2 * basis_weight_gsm`
 * - `sheetWeightKg`: `sheetWeightGrams / 1000`
 * - `costPerSheetEur`: `round4(sheetWeightKg * cost_per_kg_eur)`
 * - `caliperMicrons`: `Math.round(basis_weight_gsm * bulk_volume)`
 * - `spinePer100PagesMm`: `round2((100 / 2) * (basis_weight_gsm / 1000) * bulk_volume)`
 * - `spine200PagesMm`: `round2((200 / 2) * (basis_weight_gsm / 1000) * bulk_volume)`
 */
function calculateSubstrateMechanics(raw = {}) {
    const materialType = normalizeIndustrialMaterialType(raw.material_type || raw.materialType, raw);
    const gsm = Math.max(15, Number(raw.basis_weight_gsm || raw.gsm || raw.grammageGsm || raw.paper_gsm || 90));
    const bulkVolume = round2(
        Math.max(
            0.5,
            Math.min(
                3.5,
                Number(raw.bulk_volume || raw.bulkVolume || raw.bulkFactor || raw.bulk_factor || 1.25)
            )
        )
    );
    const costPerKgEur = round4(
        Math.max(
            0.1,
            Number(
                raw.cost_per_kg_eur ||
                    raw.costPerKgEur ||
                    (raw.costPerTonEur ? Number(raw.costPerTonEur) / 1000 : 1.32)
            )
        )
    );

    const dims = normalizeDimensionsJson(materialType, raw.dimensions_json || raw.dimensions || raw);
    const isReel = materialType === 'REEL_PAPER' || materialType === 'LAMINATION_FOIL';

    const widthMm = isReel ? Number(dims.web_width_mm || 840) : Number(dims.width_mm || 700);
    const heightMm = isReel ? 1000 : Number(dims.height_mm || 1000);
    const sheetAreaM2 = round4((widthMm / 1000) * (heightMm / 1000));
    const sheetWeightGrams = round2(sheetAreaM2 * gsm);
    const sheetWeightKg = round4(sheetWeightGrams / 1000);
    const costPerSheetEur = round4(sheetWeightKg * costPerKgEur);
    const costPerM2Eur = round4((gsm / 1000) * costPerKgEur);
    const caliperMicrons = Math.round(gsm * bulkVolume);
    const spinePer100PagesMm = round2((100 / 2) * (gsm / 1000) * bulkVolume);
    const spine200PagesMm = round2((200 / 2) * (gsm / 1000) * bulkVolume);

    return {
        materialType,
        isReel,
        basisWeightGsm: gsm,
        bulkVolume,
        dimensionsJson: dims,
        sheetAreaM2,
        sheetWeightGrams,
        sheetWeightKg,
        costPerKgEur,
        costPerTonEur: round2(costPerKgEur * 1000),
        costPerSheetEur,
        costPerM2Eur,
        caliperMicrons,
        spinePer100PagesMm,
        spine200PagesMm
    };
}

function normalizeIndustrialMaterialType(inputType, raw = {}) {
    const upper = String(inputType || '').trim().toUpperCase();
    if (
        upper === 'SHEETFED_PAPER' ||
        upper === 'REEL_PAPER' ||
        upper === 'BOARD_CARTON' ||
        upper === 'ENDPAPERS' ||
        upper === 'LAMINATION_FOIL'
    ) {
        return upper;
    }

    const nameLower = String(raw.name || raw.material_name || '').toLowerCase();
    const gsm = Number(raw.basis_weight_gsm || raw.gsm || raw.paper_gsm || 90);
    const dims = safeParseJson(raw.dimensions_json || raw.metadata_json, {});

    if (upper === 'REEL' || dims.web_width_mm || nameLower.includes('reel') || nameLower.includes('bobina')) {
        return nameLower.includes('lamin') || nameLower.includes('foil') || nameLower.includes('film')
            ? 'LAMINATION_FOIL'
            : 'REEL_PAPER';
    }
    if (nameLower.includes('guarda') || nameLower.includes('endpaper') || nameLower.includes('sirio')) {
        return 'ENDPAPERS';
    }
    if (nameLower.includes('lamin') || nameLower.includes('foil') || nameLower.includes('bopp') || nameLower.includes('soft-touch')) {
        return 'LAMINATION_FOIL';
    }
    if (upper === 'BOARD' || gsm >= 240 || nameLower.includes('cartulina') || nameLower.includes('board') || nameLower.includes('symbol card') || nameLower.includes('eska')) {
        return 'BOARD_CARTON';
    }
    return 'SHEETFED_PAPER';
}

function normalizeIndustrialCategory(inputCategory, raw = {}) {
    const upper = String(inputCategory || raw.substrate_class || '').trim().toUpperCase();
    if (
        upper === 'OFFSET_UNCOATED' ||
        upper === 'COATED_GLOSS' ||
        upper === 'COATED_MATTE' ||
        upper === 'BULKY_CREAM' ||
        upper === 'SPECIALTY'
    ) {
        return upper;
    }

    const nameLower = String(raw.name || raw.material_name || '').toLowerCase();
    const finishUpper = String(raw.finish_type || raw.finish || '').toUpperCase();

    if (
        nameLower.includes('munken') ||
        nameLower.includes('ivory') ||
        nameLower.includes('cream') ||
        nameLower.includes('ahuesado') ||
        nameLower.includes('bulky') ||
        Number(raw.bulk_volume || raw.bulkFactor || 1.2) >= 1.45
    ) {
        return 'BULKY_CREAM';
    }
    if (finishUpper.includes('GLOSS') || nameLower.includes('gloss') || nameLower.includes('brill')) {
        return 'COATED_GLOSS';
    }
    if (
        upper === 'COATED' ||
        finishUpper.includes('MATTE') ||
        finishUpper.includes('SILK') ||
        finishUpper.includes('SATIN') ||
        nameLower.includes('satin') ||
        nameLower.includes('estucado') ||
        nameLower.includes('coated') ||
        nameLower.includes('symbol')
    ) {
        return 'COATED_MATTE';
    }
    if (
        nameLower.includes('sirio') ||
        nameLower.includes('derprosa') ||
        nameLower.includes('soft-touch') ||
        nameLower.includes('eska') ||
        raw.material_type === 'ENDPAPERS' ||
        raw.material_type === 'LAMINATION_FOIL'
    ) {
        return 'SPECIALTY';
    }
    return 'OFFSET_UNCOATED';
}

function normalizeDimensionsJson(materialType, rawDims = {}) {
    const parsed = safeParseJson(rawDims, {});
    const isReel = materialType === 'REEL_PAPER' || materialType === 'LAMINATION_FOIL';

    if (isReel) {
        const webWidthMm = Math.max(100, Number(parsed.web_width_mm || parsed.webWidthMm || parsed.width_mm || 840));
        const maxDiameterMm = Math.max(200, Number(parsed.max_diameter_mm || parsed.maxDiameterMm || 1200));
        const coreDiameterMm = Number(parsed.core_diameter_mm || parsed.coreDiameterMm || 76) === 152 ? 152 : 76;
        return {
            web_width_mm: webWidthMm,
            max_diameter_mm: maxDiameterMm,
            core_diameter_mm: coreDiameterMm,
            format_label:
                parsed.format_label ||
                `Bobina ${webWidthMm} mm · Ø${maxDiameterMm} mm · Cono ${coreDiameterMm} mm`
        };
    }

    let widthMm = Number(parsed.width_mm || parsed.widthMm || 0);
    let heightMm = Number(parsed.height_mm || parsed.heightMm || 0);

    if ((!widthMm || !heightMm) && parsed.sheet_format) {
        const sf = String(parsed.sheet_format).toUpperCase();
        if (sf.includes('70X100') || sf === 'B1') {
            widthMm = 700;
            heightMm = 1000;
        } else if (sf.includes('50X70') || sf === 'B2') {
            widthMm = 500;
            heightMm = 700;
        } else if (sf.includes('64X90') || sf.includes('65X92')) {
            widthMm = 650;
            heightMm = 920;
        } else if (sf.includes('SRA3') || sf.includes('32X45')) {
            widthMm = 320;
            heightMm = 450;
        } else {
            const match = sf.match(/(\d+)\s*[X×]\s*(\d+)/);
            if (match) {
                const a = Number(match[1]);
                const b = Number(match[2]);
                widthMm = a <= 120 ? a * 10 : a;
                heightMm = b <= 150 ? b * 10 : b;
            }
        }
    }

    widthMm = Math.max(100, widthMm || 700);
    heightMm = Math.max(100, heightMm || 1000);
    const grainDirection = String(parsed.grain_direction || parsed.grainDirection || 'LG').toUpperCase() === 'SG' ? 'SG' : 'LG';

    let stdPrefix = 'Pliego';
    if (widthMm === 700 && heightMm === 1000) stdPrefix = 'B1';
    else if (widthMm === 500 && heightMm === 700) stdPrefix = 'B2';
    else if (widthMm === 320 && heightMm === 450) stdPrefix = 'SRA3';

    return {
        width_mm: widthMm,
        height_mm: heightMm,
        grain_direction: grainDirection,
        format_label: parsed.format_label || `${stdPrefix} (${widthMm}×${heightMm} mm · ${grainDirection})`
    };
}

function normalizeCertificationsJson(rawCerts, meta = {}) {
    const source = rawCerts !== undefined ? rawCerts : meta.certifications_json || meta.certifications;
    const arr = Array.isArray(source) ? source : safeParseJson(source, ['FSC_MIX']);
    if (!Array.isArray(arr) || arr.length === 0) return ['FSC_MIX'];
    return arr
        .map((c) => String(c || '').trim().toUpperCase())
        .filter((c) => VALID_CERTIFICATIONS.has(c));
}

function normalizeIndustrialMaterialRecord(raw = {}) {
    const meta = safeParseJson(raw.metadata_json || raw.metadata, {});
    const merged = { ...meta, ...raw };

    const mechanics = calculateSubstrateMechanics(merged);
    const category = normalizeIndustrialCategory(merged.category || merged.substrate_class, merged);
    const certifications = normalizeCertificationsJson(merged.certifications_json || merged.certifications, meta);

    const inStockKg = round2(
        Number(
            merged.in_stock_kg ??
                merged.inStockKg ??
                meta.in_stock_kg ??
                (merged.current_stock_units !== undefined
                    ? Number(merged.current_stock_units) * Math.max(0.05, mechanics.sheetWeightKg)
                    : 3500)
        )
    );
    const minOrderKg = round2(Number(merged.min_order_kg ?? merged.minOrderKg ?? meta.min_order_kg ?? 500));

    let status = String(merged.status || meta.status || 'ACTIVE').toUpperCase();
    if (meta.archived === true || status === 'ARCHIVED' || status === 'DISCONTINUED') {
        status = 'DISCONTINUED';
    } else if (status === 'CRITICAL' || status === 'AT_RISK' || status === 'LOW_STOCK' || (inStockKg > 0 && inStockKg <= minOrderKg)) {
        status = 'LOW_STOCK';
    } else {
        status = 'ACTIVE';
    }

    const name = String(merged.name || merged.material_name || 'Sustrato Industrial').trim();
    const manufacturer = String(
        merged.manufacturer ||
            meta.manufacturer ||
            merged.supplier_name ||
            'European Mill Accredited'
    ).trim();

    const sheetFormatLegacy = mechanics.isReel
        ? `REEL-${mechanics.dimensionsJson.web_width_mm}MM`
        : `${Math.round(mechanics.dimensionsJson.width_mm / 10)}x${Math.round(mechanics.dimensionsJson.height_mm / 10)}`;

    const currentStockUnits = Math.max(
        0,
        Math.round(
            Number(
                merged.current_stock_units !== undefined
                    ? merged.current_stock_units
                    : mechanics.sheetWeightKg > 0
                      ? inStockKg / mechanics.sheetWeightKg
                      : inStockKg
            )
        )
    );
    const reservedStockUnits = Math.max(0, Math.round(Number(merged.reserved_stock_units || 0)));

    return {
        id: String(merged.id || merged.paperId || `MAT-${mechanics.basisWeightGsm}`),
        paperId: String(merged.id || merged.paperId || `MAT-${mechanics.basisWeightGsm}`),
        printhouse_id: String(merged.printhouse_id || merged.node_id || 'GLOBAL_MASTER'),
        node_id: String(merged.node_id || merged.printhouse_id || 'node-alpha-1'),
        tenant_id: String(merged.tenant_id || 'tenant-default'),
        name,
        material_name: name,
        manufacturer,
        supplier_name: manufacturer,
        material_type: mechanics.materialType,
        category,
        substrate_class:
            category === 'COATED_GLOSS' || category === 'COATED_MATTE'
                ? 'COATED'
                : mechanics.materialType === 'BOARD_CARTON'
                  ? 'BOARD'
                  : 'UNCOATED',
        basis_weight_gsm: mechanics.basisWeightGsm,
        gsm: mechanics.basisWeightGsm,
        paper_gsm: mechanics.basisWeightGsm,
        grammageGsm: mechanics.basisWeightGsm,
        bulk_volume: mechanics.bulkVolume,
        bulkFactor: mechanics.bulkVolume,
        dimensions_json: mechanics.dimensionsJson,
        sheet_format: sheetFormatLegacy,
        finish_type:
            category === 'COATED_GLOSS'
                ? 'GLOSS'
                : category === 'COATED_MATTE'
                  ? 'MATTE'
                  : 'UNCOATED',
        finish:
            category === 'COATED_GLOSS'
                ? 'GLOSS'
                : category === 'COATED_MATTE'
                  ? 'MATTE'
                  : 'UNCOATED',
        cost_per_kg_eur: mechanics.costPerKgEur,
        costPerKgEur: mechanics.costPerKgEur,
        costPerTonEur: mechanics.costPerTonEur,
        cost_per_sheet_eur: mechanics.costPerSheetEur,
        costPerSheetEur: mechanics.costPerSheetEur,
        cost_per_unit: mechanics.costPerSheetEur,
        cost_per_m2_eur: mechanics.costPerM2Eur,
        sheet_area_m2: mechanics.sheetAreaM2,
        sheet_weight_g: mechanics.sheetWeightGrams,
        caliper_microns: mechanics.caliperMicrons,
        caliper_um: mechanics.caliperMicrons,
        bulk_microns: mechanics.caliperMicrons,
        spine_per_100pp_mm: mechanics.spinePer100PagesMm,
        spine_200pp_mm: mechanics.spine200PagesMm,
        certifications_json: certifications,
        in_stock_kg: inStockKg,
        min_order_kg: minOrderKg,
        current_stock_units: currentStockUnits,
        reserved_stock_units: reservedStockUnits,
        available_units: Math.max(0, currentStockUnits - reservedStockUnits),
        status,
        operational_status: status === 'ACTIVE' ? 'STABLE' : status === 'LOW_STOCK' ? 'AT_RISK' : 'CRITICAL',
        shortage_risk: status === 'LOW_STOCK' ? 'LOW_STOCK' : 'NONE',
        metadata: {
            ...meta,
            manufacturer,
            material_type: mechanics.materialType,
            category,
            basis_weight_gsm: mechanics.basisWeightGsm,
            bulk_volume: mechanics.bulkVolume,
            dimensions_json: mechanics.dimensionsJson,
            cost_per_kg_eur: mechanics.costPerKgEur,
            cost_per_sheet_eur: mechanics.costPerSheetEur,
            certifications_json: certifications,
            in_stock_kg: inStockKg,
            min_order_kg: minOrderKg,
            caliper_microns: mechanics.caliperMicrons,
            spine_per_100pp_mm: mechanics.spinePer100PagesMm,
            spine_200pp_mm: mechanics.spine200PagesMm,
            status
        }
    };
}

/**
 * Validates physical and mechanical compatibility between a printing/finishing machine
 * and a target paper substrate or material.
 *
 * Rules:
 * 1. REEL_PAPER / LAMINATION_FOIL:
 *    - Machine must support continuous web/rotary or wide format printing.
 *    - Web width must fit within machine web clearance / max print width.
 * 2. SHEETFED_PAPER / BOARD_CARTON / ENDPAPERS:
 *    - Sheet width and height must be within machine limits [min_sheet_mm .. max_sheet_mm].
 *    - Grammage (GSM) must be supported by the machine type (e.g. Offset vs Digital vs Large Format).
 */
function validateMachineSubstrateCompatibility(machine = {}, substrate = {}) {
    const reasons = [];
    const warnings = [];

    const matType = normalizeIndustrialMaterialType(substrate.material_type || substrate.materialType, substrate);
    const isReel = matType === 'REEL_PAPER' || matType === 'LAMINATION_FOIL';
    const dims = normalizeDimensionsJson(matType, substrate.dimensions_json || substrate.dimensions || substrate);
    const gsm = Number(substrate.basis_weight_gsm || substrate.gsm || substrate.paper_gsm || 90);
    const caliperUm = Number(substrate.caliper_microns || substrate.caliper_um || (gsm * Number(substrate.bulk_volume || substrate.bulkFactor || 1.25)));

    const machineType = String(machine.machine_type || machine.machineType || 'OFFSET_PRESS').toUpperCase();
    const printMethods = Array.isArray(machine.supported_print_methods_json)
        ? machine.supported_print_methods_json
        : safeParseJson(machine.supported_print_methods_json, []);

    // 1. Reel Substrates (Rotary / Web Feed)
    if (isReel) {
        const isRotaryOrWeb =
            machineType.includes('ROT') ||
            machineType === 'LARGE_FORMAT' ||
            printMethods.includes('WEB_OFFSET') ||
            printMethods.includes('WIDE_FORMAT_INKJET');

        if (!isRotaryOrWeb) {
            reasons.push(`INCOMPATIBLE_MACHINE_FEED: Machine type ${machineType} does not support continuous web reels (requires ROTARY or WEB_OFFSET feeder).`);
        }

        const maxWebWidth = Number(machine.max_print_width_mm || machine.max_sheet_width_mm || 1000);
        const webWidth = Number(dims.web_width_mm || 840);

        if (webWidth > maxWebWidth) {
            reasons.push(`INCOMPATIBLE_WEB_WIDTH: Substrate reel width (${webWidth} mm) exceeds maximum machine web clearance (${maxWebWidth} mm).`);
        }
    } else {
        // 2. Sheetfed Substrates (Cut Sheets)
        if (machineType.includes('ROT') && !printMethods.includes('SHEETFED_OFFSET')) {
            reasons.push(`INCOMPATIBLE_FEED_TYPE: Rotary machine cannot feed cut sheets directly without inline sheeter.`);
        }

        const w = Number(dims.width_mm || 700);
        const h = Number(dims.height_mm || 1000);
        const minDim = Math.min(w, h);
        const maxDim = Math.max(w, h);

        const machineMaxWidth = Number(machine.max_sheet_width_mm || 720);
        const machineMaxHeight = Number(machine.max_sheet_height_mm || 1020);
        const machineMinDim = Math.min(machineMaxWidth, machineMaxHeight);
        const machineMaxDim = Math.max(machineMaxWidth, machineMaxHeight);

        if (minDim > machineMinDim || maxDim > machineMaxDim) {
            reasons.push(`SHEET_EXCEEDS_FEEDER_BOUNDS: Sheet dimensions ${w}×${h} mm exceed machine maximum feeder capacity ${machineMaxWidth}×${machineMaxHeight} mm.`);
        }

        const machineMinWidth = Number(machine.min_sheet_width_mm || 210);
        const machineMinHeight = Number(machine.min_sheet_height_mm || 297);
        const machineFeederMinDim = Math.min(machineMinWidth, machineMinHeight);

        if (minDim < machineFeederMinDim) {
            reasons.push(`SHEET_BELOW_MINIMUM_FEEDER: Sheet dimensions ${w}×${h} mm are smaller than machine minimum gripper boundary (${machineMinWidth}×${machineMinHeight} mm).`);
        }

        // Grammage / Board Caliper checks
        if (machineType === 'DIGITAL_PRESS' && gsm > 400) {
            reasons.push(`EXCESSIVE_GRAMMAGE_FOR_DIGITAL: Grammage ${gsm} g/m² exceeds maximum standard digital press toner/fuser limit (400 g/m²).`);
        } else if (machineType === 'OFFSET_PRESS' && gsm > 600) {
            reasons.push(`EXCESSIVE_GRAMMAGE_FOR_OFFSET: Grammage ${gsm} g/m² exceeds standard sheetfed offset cylinder clearance (max 600 g/m²).`);
        } else if (gsm < 45 && machineType === 'OFFSET_PRESS') {
            warnings.push(`LOW_GRAMMAGE_AIR_ASSIST_REQUIRED: Lightweight paper (${gsm} g/m²) requires calibrated suction heads and slow feeder speed.`);
        }
    }

    return {
        compatible: reasons.length === 0,
        reasons,
        warnings,
        caliperMicrons: Math.round(caliperUm),
        substrateType: matType,
        isReel,
        evaluatedAt: new Date().toISOString()
    };
}

/**
 * Synchronizes an industrial material record with MySQL `paper_products` and `paper_variants`
 * relational schema, maintaining SHA-256 fingerprint, caliper, and bulk factor.
 */
async function syncMaterialToPaperVariants(materialRecord = {}, dbClient = db) {
    if (!dbClient || typeof dbClient.query !== 'function') return null;

    const productId = `PROD-${crypto.createHash('md5').update(String(materialRecord.name || '').trim().toLowerCase()).digest('hex').substring(0, 16)}`;
    const category =
        materialRecord.material_type === 'BOARD_CARTON'
            ? 'CARTON'
            : materialRecord.category === 'COATED_GLOSS' || materialRecord.category === 'COATED_MATTE'
              ? 'COATED'
              : 'OFFSET';

    // 1. Upsert paper_products
    await dbClient.query(
        `INSERT INTO paper_products
         (id, name, brand, manufacturer, category, finish_summary, description, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            brand = VALUES(brand),
            manufacturer = VALUES(manufacturer),
            category = VALUES(category),
            finish_summary = VALUES(finish_summary),
            updated_at = CURRENT_TIMESTAMP`,
        [
            productId,
            materialRecord.name,
            materialRecord.manufacturer,
            materialRecord.manufacturer,
            category,
            materialRecord.finish_type || 'UNCOATED',
            `${materialRecord.name} - Calibrado PPOS Control Plane`,
            JSON.stringify(materialRecord.metadata || {})
        ]
    ).catch(() => {});

    // 2. Compute deterministic variant fingerprint
    const isReel = materialRecord.material_type === 'REEL_PAPER' || materialRecord.material_type === 'LAMINATION_FOIL';
    const dims = materialRecord.dimensions_json || {};
    const widthMm = isReel ? Number(dims.web_width_mm || 840) : Number(dims.width_mm || 700);
    const heightMm = isReel ? 1000 : Number(dims.height_mm || 1000);
    const gsm = Number(materialRecord.basis_weight_gsm || materialRecord.gsm || 90);
    const bulk = Number(materialRecord.bulk_volume || materialRecord.bulkFactor || 1.25);
    const caliperUm = Number(materialRecord.caliper_microns || Math.round(gsm * bulk));
    const grain = dims.grain_direction === 'SG' ? 'SHORT_GRAIN' : 'LONG_GRAIN';

    const fpString = `${(materialRecord.name || '').toLowerCase().trim()}|${gsm}|${widthMm}x${heightMm}|${materialRecord.finish_type || 'UNCOATED'}|${caliperUm}|${grain}`;
    const fingerprint = crypto.createHash('sha256').update(fpString).digest('hex').substring(0, 32);
    const variantId = `VAR-${fingerprint.substring(0, 16)}`;

    // 3. Upsert paper_variants
    await dbClient.query(
        `INSERT INTO paper_variants
         (id, product_id, gsm, caliper_um, caliper_mm, bulk_factor, width_mm, height_mm, is_reel, finish, grain_direction, fingerprint, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            caliper_um = VALUES(caliper_um),
            caliper_mm = VALUES(caliper_mm),
            bulk_factor = VALUES(bulk_factor),
            is_reel = VALUES(is_reel),
            metadata_json = VALUES(metadata_json),
            updated_at = CURRENT_TIMESTAMP`,
        [
            variantId,
            productId,
            gsm,
            caliperUm,
            caliperUm / 1000,
            bulk,
            widthMm,
            heightMm,
            isReel ? 1 : 0,
            materialRecord.finish_type || 'UNCOATED',
            grain,
            fingerprint,
            JSON.stringify(materialRecord.metadata || {})
        ]
    ).catch(() => {});

    return {
        productId,
        variantId,
        fingerprint,
        caliperUm,
        bulkFactor: bulk
    };
}

function initRuntimeCatalog() {
    if (runtimeIndustrialMaterials.size > 0) return;
    for (const item of EUROPEAN_MASTER_SUBSTRATES) {
        const normalized = normalizeIndustrialMaterialRecord(item);
        runtimeIndustrialMaterials.set(normalized.id, normalized);
    }
}

initRuntimeCatalog();

/**
 * Ensures the `printhouse_materials` table exists in MySQL with the exact Phase 1.1 DDL
 * when MySQL is connected and not running inside an isolated Phase I1 strict security test.
 */
async function ensurePrinthouseMaterialsSchema(dbClient = db) {
    if (schemaEnsured || !dbClient || typeof dbClient.query !== 'function') return;
    if (process.env.PPOS_CI_EPHEMERAL_FIXTURES === 'true') return;

    try {
        await dbClient.query(`
            CREATE TABLE IF NOT EXISTS printhouse_materials (
                id VARCHAR(64) PRIMARY KEY,
                printhouse_id VARCHAR(64) NOT NULL,
                tenant_id VARCHAR(64) NOT NULL DEFAULT 'tenant-default',
                name VARCHAR(128) NOT NULL,
                manufacturer VARCHAR(128) DEFAULT 'European Mill',
                material_type ENUM('SHEETFED_PAPER', 'REEL_PAPER', 'BOARD_CARTON', 'ENDPAPERS', 'LAMINATION_FOIL') NOT NULL DEFAULT 'SHEETFED_PAPER',
                category ENUM('OFFSET_UNCOATED', 'COATED_GLOSS', 'COATED_MATTE', 'BULKY_CREAM', 'SPECIALTY') NOT NULL DEFAULT 'OFFSET_UNCOATED',
                basis_weight_gsm INT NOT NULL DEFAULT 90,
                bulk_volume DECIMAL(4,2) NOT NULL DEFAULT 1.25,
                dimensions_json JSON NOT NULL,
                cost_per_kg_eur DECIMAL(8,4) NOT NULL DEFAULT 1.3200,
                cost_per_sheet_eur DECIMAL(8,4) NULL,
                certifications_json JSON NULL,
                in_stock_kg DECIMAL(10,2) DEFAULT 0.00,
                min_order_kg DECIMAL(8,2) DEFAULT 0.00,
                status ENUM('ACTIVE', 'LOW_STOCK', 'DISCONTINUED') DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_ph_mat_printhouse (printhouse_id, status),
                INDEX idx_ph_mat_type_cat (material_type, category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        schemaEnsured = true;
    } catch (_) {
        // Non-fatal in mock/ephemeral environments
    }
}

/**
 * Computes the 4 top KPI cards required by Phase 2.1:
 * 1. TOTAL SUBSTRATES (Active count)
 * 2. SHEETFED STOCKS (Homologated sheets B1, B2, SRA3)
 * 3. REEL INVENTORY (Continuous reels for Web Offset / High-Speed Inkjet)
 * 4. AVG. PAPER COST (Weighted average €/kg)
 */
function computeIndustrialCatalogKpis(materials = []) {
    const activeItems = materials.filter((m) => m.status !== 'DISCONTINUED');
    const sheetfedItems = activeItems.filter(
        (m) => m.material_type === 'SHEETFED_PAPER' || m.material_type === 'BOARD_CARTON' || m.material_type === 'ENDPAPERS'
    );
    const reelItems = activeItems.filter(
        (m) => m.material_type === 'REEL_PAPER' || m.material_type === 'LAMINATION_FOIL'
    );

    const totalWeightKg = activeItems.reduce((acc, m) => acc + Math.max(100, Number(m.in_stock_kg || 500)), 0);
    const weightedCostSum = activeItems.reduce(
        (acc, m) => acc + Number(m.cost_per_kg_eur || 1.32) * Math.max(100, Number(m.in_stock_kg || 500)),
        0
    );
    const avgPaperCostPerKgEur =
        activeItems.length > 0 && totalWeightKg > 0
            ? round4(weightedCostSum / totalWeightKg)
            : 1.34;

    const totalStockKg = round2(activeItems.reduce((acc, m) => acc + Number(m.in_stock_kg || 0), 0));
    const lowStockCount = activeItems.filter((m) => m.status === 'LOW_STOCK').length;

    return {
        totalSubstrates: activeItems.length,
        sheetfedCount: sheetfedItems.length,
        reelCount: reelItems.length,
        boardAndSpecialtyCount: activeItems.filter(
            (m) => m.material_type === 'BOARD_CARTON' || m.material_type === 'ENDPAPERS' || m.material_type === 'LAMINATION_FOIL'
        ).length,
        avgPaperCostPerKgEur,
        totalStockKg,
        lowStockCount
    };
}

/**
 * Lists all industrial materials combining MySQL (`printhouse_materials` + `materials_catalog`)
 * with the synchronized master catalog, applying optional filters (`?type=`, `?category=`, `?inStock=true`).
 */
async function listIndustrialMaterials(filters = {}, scope = {}, dbClient = db) {
    initRuntimeCatalog();
    await ensurePrinthouseMaterialsSchema(dbClient);

    const unwrap = (r) => (Array.isArray(r) ? (Array.isArray(r[0]) ? r[0] : r) : []);
    const byId = new Map();
    const targetTenantId = scope.tenantId || 'tenant-default';
    const targetPrinthouseId = scope.printhouseId || 'GLOBAL_MASTER';

    const isVisibleToTenant = (item) => {
        const itemTenant = String(item.tenant_id || 'tenant-default');
        const itemPh = String(item.printhouse_id || 'GLOBAL_MASTER');
        // Global master benchmark entries are visible as baseline
        if (itemTenant === 'tenant-default' && itemPh === 'GLOBAL_MASTER') return true;
        // Private tenant rates/agreements are strictly isolated to the owning tenant
        return itemTenant === targetTenantId || (targetPrinthouseId !== 'GLOBAL_MASTER' && itemPh === targetPrinthouseId);
    };

    // 1. Seed baseline from runtime map, strictly filtering out other tenants' custom overrides
    for (const [id, item] of runtimeIndustrialMaterials.entries()) {
        if (isVisibleToTenant(item)) {
            const baseId = String(item.base_material_id || id.replace(/^TENANT-[^:]+::/, ''));
            // Prefer tenant-specific override over global baseline for the same baseId
            if (!byId.has(baseId) || String(item.tenant_id) === targetTenantId) {
                byId.set(baseId, { ...item, id: baseId });
            }
        }
    }

    // 2. Hydrate from MySQL `printhouse_materials` and `materials_catalog` scoped to tenant + global baseline
    if (dbClient && typeof dbClient.query === 'function' && process.env.PPOS_CI_EPHEMERAL_FIXTURES !== 'true') {
        try {
            const phRows = unwrap(
                await dbClient.query(
                    `SELECT * FROM printhouse_materials
                     WHERE tenant_id IN (?, 'tenant-default') OR printhouse_id IN (?, 'GLOBAL_MASTER')
                     ORDER BY updated_at DESC`,
                    [targetTenantId, targetPrinthouseId]
                ).catch(() => [])
            );
            for (const row of phRows) {
                const norm = normalizeIndustrialMaterialRecord(row);
                if (!isVisibleToTenant(norm)) continue;
                const baseId = String(norm.id).replace(/^TENANT-[^:]+::/, '');
                if (!byId.has(baseId) || String(norm.tenant_id) === targetTenantId) {
                    byId.set(baseId, { ...norm, id: baseId });
                }
            }

            const catRows = unwrap(
                await dbClient.query(
                    `SELECT * FROM materials_catalog
                     WHERE tenant_id IN (?, 'tenant-default') OR printhouse_id IN (?, 'GLOBAL_MASTER')
                     ORDER BY created_at DESC`,
                    [targetTenantId, targetPrinthouseId]
                ).catch(() => [])
            );
            for (const row of catRows) {
                const norm = normalizeIndustrialMaterialRecord(row);
                if (!isVisibleToTenant(norm)) continue;
                const baseId = String(norm.id).replace(/^TENANT-[^:]+::/, '');
                if (!byId.has(baseId)) {
                    byId.set(baseId, { ...norm, id: baseId });
                }
            }
        } catch (_) {
            // Non-fatal fallback to in-memory catalog
        }
    }

    let allItems = Array.from(byId.values());

    // Calculate global KPI summary across active non-discontinued items before tab filtering
    const kpiSummary = computeIndustrialCatalogKpis(allItems);

    // Apply query filters
    const filterType = String(filters.type || filters.material_type || '').trim().toUpperCase();
    const filterCategory = String(filters.category || filters.substrate_class || '').trim().toUpperCase();
    const filterInStock = String(filters.inStock || filters.in_stock || '').trim().toLowerCase() === 'true';
    const includeDiscontinued = String(filters.includeDiscontinued || '').toLowerCase() === 'true';
    const searchQ = String(filters.q || filters.search || '').trim().toLowerCase();

    if (!includeDiscontinued) {
        allItems = allItems.filter((m) => m.status !== 'DISCONTINUED');
    }

    if (filterType && filterType !== 'ALL') {
        if (filterType === 'BOARD_AND_ENDPAPERS') {
            allItems = allItems.filter((m) => m.material_type === 'BOARD_CARTON' || m.material_type === 'ENDPAPERS');
        } else {
            allItems = allItems.filter((m) => m.material_type === filterType);
        }
    }

    if (filterCategory && filterCategory !== 'ALL') {
        allItems = allItems.filter((m) => m.category === filterCategory || m.substrate_class === filterCategory);
    }

    if (filterInStock) {
        allItems = allItems.filter((m) => Number(m.in_stock_kg || 0) > 0 && m.status !== 'DISCONTINUED');
    }

    if (searchQ) {
        allItems = allItems.filter(
            (m) =>
                m.name.toLowerCase().includes(searchQ) ||
                m.id.toLowerCase().includes(searchQ) ||
                m.manufacturer.toLowerCase().includes(searchQ) ||
                m.category.toLowerCase().includes(searchQ)
        );
    }

    return {
        ok: true,
        materials: allItems,
        kpiSummary
    };
}

/**
 * Validates and persists a new or updated industrial substrate in:
 * 1. `printhouse_materials` (MySQL)
 * 2. `materials_catalog` (MySQL)
 * 3. `predictive_material_inventory` (MySQL)
 * 4. Runtime catalog & Pricing Intelligence BPE cache
 * And emits `MATERIAL_PRICE_UPDATED` in `operational_events` on update.
 */
async function upsertIndustrialMaterial(payload = {}, scope = {}, dbClient = db, isUpdate = false) {
    initRuntimeCatalog();
    await ensurePrinthouseMaterialsSchema(dbClient);

    const existingId = payload.id || payload.paperId || null;
    const targetTenantId = scope.tenantId || payload.tenant_id || 'tenant-default';
    const existingItem = existingId
        ? runtimeIndustrialMaterials.get(`TENANT-${targetTenantId}::${existingId}`) || runtimeIndustrialMaterials.get(String(existingId))
        : null;

    const mergedPayload = {
        ...(existingItem || {}),
        ...payload,
        dimensions_json: payload.dimensions_json || payload.dimensions || existingItem?.dimensions_json
    };

    const rawName = String(mergedPayload.name || mergedPayload.material_name || '').trim();
    if (!rawName) {
        const err = new Error('INVALID_MATERIAL_NAME: El nombre comercial del sustrato es obligatorio.');
        err.statusCode = 400;
        throw err;
    }

    const gsm = Number(mergedPayload.basis_weight_gsm || mergedPayload.gsm || mergedPayload.grammageGsm || 0);
    if (!Number.isFinite(gsm) || gsm < 15 || gsm > 2500) {
        const err = new Error('INVALID_BASIS_WEIGHT_GSM: El gramaje (GSM) debe estar entre 15 y 2500 g/m².');
        err.statusCode = 400;
        throw err;
    }

    const bulk = Number(mergedPayload.bulk_volume || mergedPayload.bulkVolume || mergedPayload.bulkFactor || 1.25);
    if (!Number.isFinite(bulk) || bulk < 0.5 || bulk > 3.5) {
        const err = new Error('INVALID_BULK_VOLUME: La mano del papel (bulk cm³/g) debe estar entre 0.50 y 3.50.');
        err.statusCode = 400;
        throw err;
    }

    const generatedId =
        existingId ||
        `${normalizeIndustrialMaterialType(mergedPayload.material_type, mergedPayload) === 'REEL_PAPER' ? 'REEL' : 'MAT'}-${rawName
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 24)}-${gsm}`;

    const normalized = normalizeIndustrialMaterialRecord({
        ...mergedPayload,
        id: generatedId,
        printhouse_id: scope.printhouseId || mergedPayload.printhouse_id || 'GLOBAL_MASTER',
        tenant_id: scope.tenantId || mergedPayload.tenant_id || 'tenant-default'
    });

    const previousCostKg = existingItem ? Number(existingItem.cost_per_kg_eur) : null;
    const runtimeKey =
        normalized.tenant_id && normalized.tenant_id !== 'tenant-default'
            ? `TENANT-${normalized.tenant_id}::${normalized.id}`
            : normalized.id;
    runtimeIndustrialMaterials.set(runtimeKey, normalized);

    // Persist to MySQL tables if available
    if (dbClient && typeof dbClient.query === 'function') {
        try {
            await dbClient
                .query(
                    `INSERT INTO printhouse_materials
                     (id, printhouse_id, tenant_id, name, manufacturer, material_type, category, basis_weight_gsm, bulk_volume, dimensions_json, cost_per_kg_eur, cost_per_sheet_eur, certifications_json, in_stock_kg, min_order_kg, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        manufacturer = VALUES(manufacturer),
                        material_type = VALUES(material_type),
                        category = VALUES(category),
                        basis_weight_gsm = VALUES(basis_weight_gsm),
                        bulk_volume = VALUES(bulk_volume),
                        dimensions_json = VALUES(dimensions_json),
                        cost_per_kg_eur = VALUES(cost_per_kg_eur),
                        cost_per_sheet_eur = VALUES(cost_per_sheet_eur),
                        certifications_json = VALUES(certifications_json),
                        in_stock_kg = VALUES(in_stock_kg),
                        min_order_kg = VALUES(min_order_kg),
                        status = VALUES(status)`,
                    [
                        normalized.id,
                        normalized.printhouse_id,
                        normalized.tenant_id,
                        normalized.name,
                        normalized.manufacturer,
                        normalized.material_type,
                        normalized.category,
                        normalized.basis_weight_gsm,
                        normalized.bulk_volume,
                        JSON.stringify(normalized.dimensions_json),
                        normalized.cost_per_kg_eur,
                        normalized.cost_per_sheet_eur,
                        JSON.stringify(normalized.certifications_json),
                        normalized.in_stock_kg,
                        normalized.min_order_kg,
                        normalized.status
                    ]
                )
                .catch(() => {});

            const legacyMatType = normalized.material_type === 'BOARD_CARTON' ? 'BOARD' : 'PAPER';
            await dbClient
                .query(
                    `INSERT INTO materials_catalog
                     (id, tenant_id, printhouse_id, material_name, material_type, substrate_class, gsm, sheet_format, finish_type, supplier_name, cost_per_unit, metadata_json)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        material_name = VALUES(material_name),
                        material_type = VALUES(material_type),
                        substrate_class = VALUES(substrate_class),
                        gsm = VALUES(gsm),
                        sheet_format = VALUES(sheet_format),
                        finish_type = VALUES(finish_type),
                        supplier_name = VALUES(supplier_name),
                        cost_per_unit = VALUES(cost_per_unit),
                        metadata_json = VALUES(metadata_json)`,
                    [
                        normalized.id,
                        normalized.tenant_id,
                        normalized.printhouse_id === 'GLOBAL_MASTER' ? null : normalized.printhouse_id,
                        normalized.name,
                        legacyMatType,
                        normalized.substrate_class,
                        normalized.basis_weight_gsm,
                        normalized.sheet_format,
                        normalized.finish_type,
                        normalized.manufacturer,
                        normalized.cost_per_sheet_eur,
                        JSON.stringify(normalized.metadata)
                    ]
                )
                .catch(() => {});

            // Synchronize relational paper catalog: paper_products & paper_variants
            await syncMaterialToPaperVariants(normalized, dbClient).catch(() => {});
        } catch (_) {
            // Non-fatal in isolated test environments
        }
    }

    // Emit operational event on update / price modification
    if (isUpdate || (previousCostKg !== null && previousCostKg !== normalized.cost_per_kg_eur)) {
        try {
            await recordOperationalEvent({
                printhouseId: normalized.printhouse_id === 'GLOBAL_MASTER' ? 'node-primary' : normalized.printhouse_id,
                tenantId: normalized.tenant_id,
                domain: 'PRODUCTION',
                eventType: 'MATERIAL_PRICE_UPDATED',
                severity: 'INFO',
                title: `Catálogo de Sustratos Actualizado: ${normalized.name} (${normalized.basis_weight_gsm} g/m²)`,
                description: `Tarifa calibrada a €${normalized.cost_per_kg_eur.toFixed(4)}/kg (€${normalized.cost_per_sheet_eur.toFixed(4)}/pliego) · Mano ${normalized.bulk_volume.toFixed(2)} cm³/g · Stock ${normalized.in_stock_kg.toLocaleString()} kg.`,
                metadata: {
                    materialId: normalized.id,
                    materialType: normalized.material_type,
                    category: normalized.category,
                    basisWeightGsm: normalized.basis_weight_gsm,
                    bulkVolume: normalized.bulk_volume,
                    previousCostPerKgEur: previousCostKg,
                    newCostPerKgEur: normalized.cost_per_kg_eur,
                    costPerSheetEur: normalized.cost_per_sheet_eur,
                    spinePer100PagesMm: normalized.spine_per_100pp_mm
                },
                actorId: scope.operatorId || 'operator-materials',
                actorRole: scope.role || 'PRINTHOUSE_ADMIN'
            });
        } catch (_) {
            // Non-fatal
        }
    }

    return normalized;
}

/**
 * Soft-deletes / archives a substrate (`status = 'DISCONTINUED'`, `metadata.archived = true`)
 * so in-progress orders and existing pricing profiles do not break.
 */
async function archiveIndustrialMaterial(id, scope = {}, dbClient = db) {
    initRuntimeCatalog();
    const targetId = String(id || '').trim();
    const existing = runtimeIndustrialMaterials.get(targetId);

    if (existing) {
        const discontinued = {
            ...existing,
            status: 'DISCONTINUED',
            operational_status: 'CRITICAL',
            metadata: {
                ...(existing.metadata || {}),
                status: 'DISCONTINUED',
                archived: true,
                archived_at: new Date().toISOString()
            }
        };
        runtimeIndustrialMaterials.set(targetId, discontinued);
    }

    if (dbClient && typeof dbClient.query === 'function') {
        try {
            await dbClient
                .query("UPDATE printhouse_materials SET status = 'DISCONTINUED' WHERE id = ?", [targetId])
                .catch(() => {});
            await dbClient
                .query(
                    "UPDATE materials_catalog SET metadata_json = JSON_SET(COALESCE(metadata_json, '{}'), '$.archived', true, '$.status', 'DISCONTINUED') WHERE id = ?",
                    [targetId]
                )
                .catch(() => {});
        } catch (_) {}
    }

    return {
        ok: true,
        id: targetId,
        status: 'DISCONTINUED',
        archived: true
    };
}

/**
 * Seeds / rehydrates the European Master Substrates Catalog into MySQL and runtime memory.
 */
async function syncMasterIndustrialCatalog(scope = {}, dbClient = db) {
    initRuntimeCatalog();
    await ensurePrinthouseMaterialsSchema(dbClient);

    const unwrap = (r) => (Array.isArray(r) ? (Array.isArray(r[0]) ? r[0] : r) : []);
    const syncedItems = [];
    let variantsFromDb = [];

    // 1. Query the 1,524 technical variants from MySQL if connected
    if (dbClient && typeof dbClient.query === 'function' && process.env.PPOS_CI_EPHEMERAL_FIXTURES !== 'true') {
        try {
            const rawVariants = unwrap(
                await dbClient.query(`
                    SELECT 
                        v.id AS variant_id,
                        p.id AS product_id,
                        p.name AS product_name,
                        COALESCE(p.brand, p.manufacturer, 'European Certified Mill') AS manufacturer,
                        p.category AS raw_category,
                        v.gsm,
                        v.caliper_um,
                        v.bulk_factor,
                        v.width_mm,
                        v.height_mm,
                        v.is_reel,
                        v.finish,
                        v.grain_direction
                    FROM paper_variants v
                    JOIN paper_products p ON p.id = v.product_id
                    JOIN supplier_paper_catalog_variants sp ON sp.variant_id = v.id
                    WHERE sp.status = 'ACTIVE' OR sp.status IS NULL
                `).catch(() => [])
            );
            if (Array.isArray(rawVariants) && rawVariants.length > 0) {
                variantsFromDb = rawVariants;
            }
        } catch (_) {
            // Non-fatal, fallback to baseline
        }
    }

    if (variantsFromDb.length > 0) {
        for (const row of variantsFromDb) {
            const isReel = Boolean(row.is_reel);
            const rawCat = String(row.raw_category || '').toUpperCase();
            let materialType = 'SHEETFED_PAPER';
            if (isReel) {
                materialType = 'REEL_PAPER';
            } else if (rawCat === 'CARTON') {
                materialType = 'BOARD_CARTON';
            } else if (rawCat === 'DESIGN' || String(row.product_name).toLowerCase().includes('guarda')) {
                materialType = 'ENDPAPERS';
            }

            let category = 'OFFSET_UNCOATED';
            if (rawCat === 'COATED') {
                const fin = String(row.finish || '').toUpperCase();
                category = fin.includes('GLOSS') ? 'COATED_GLOSS' : 'COATED_MATTE';
            } else if (rawCat === 'CARTON') {
                category = 'SPECIALTY';
            } else if (Number(row.bulk_factor || 1.0) >= 1.4) {
                category = 'BULKY_CREAM';
            }

            const gsm = Number(row.gsm || 90);
            let rawBulk = Number(row.bulk_factor || 0);
            if (!Number.isFinite(rawBulk) || rawBulk < 0.5) {
                if (row.caliper_um && row.gsm && Number(row.gsm) > 0) {
                    const derived = Number((Number(row.caliper_um) / Number(row.gsm)).toFixed(2));
                    rawBulk = derived >= 0.5 && derived <= 3.5 ? derived : 1.0;
                } else {
                    rawBulk = 1.0;
                }
            } else if (rawBulk > 3.5) {
                rawBulk = 3.5;
            }
            const bulk = Number(rawBulk.toFixed(2));
            const widthMm = Number(row.width_mm || 700);
            const heightMm = Number(row.height_mm || 1000);
            const grain = String(row.grain_direction || '').toUpperCase().includes('SHORT') || row.grain_direction === 'SG' ? 'SG' : 'LG';
            const brand = deriveMillBrand(row.product_name, row.manufacturer);

            const item = {
                id: `MAT-${row.variant_id}`,
                printhouse_id: scope.printhouseId || 'GLOBAL_MASTER',
                tenant_id: scope.tenantId || 'tenant-default',
                name: row.product_name,
                manufacturer: brand,
                material_type: materialType,
                category,
                basis_weight_gsm: gsm,
                bulk_volume: bulk,
                dimensions_json: isReel
                    ? {
                          web_width_mm: widthMm,
                          max_diameter_mm: 1200,
                          core_diameter_mm: 76,
                          format_label: `Bobina ${widthMm} mm · Ø1200 mm`
                      }
                    : {
                          width_mm: widthMm,
                          height_mm: heightMm,
                          grain_direction: grain,
                          format_label: `${widthMm === 700 && heightMm === 1000 ? 'B1' : widthMm === 500 && heightMm === 700 ? 'B2' : 'Pliego'} (${widthMm}×${heightMm} mm · ${grain})`
                      },
                cost_per_kg_eur: 1.3400,
                certifications_json: ['FSC_MIX'],
                in_stock_kg: 5000.00,
                min_order_kg: 500.00,
                status: 'ACTIVE'
            };

            const upserted = await upsertIndustrialMaterial(item, scope, dbClient, false);
            syncedItems.push(upserted);
        }
    } else {
        // Fallback: Seed baseline European Master Substrates
        for (const masterItem of EUROPEAN_MASTER_SUBSTRATES) {
            const upserted = await upsertIndustrialMaterial(
                {
                    ...masterItem,
                    printhouse_id: scope.printhouseId || masterItem.printhouse_id || 'GLOBAL_MASTER',
                    tenant_id: scope.tenantId || masterItem.tenant_id || 'tenant-default'
                },
                scope,
                dbClient,
                false
            );
            syncedItems.push(upserted);
        }
    }

    return {
        ok: true,
        syncedCount: syncedItems.length,
        materials: syncedItems,
        kpiSummary: computeIndustrialCatalogKpis(Array.from(runtimeIndustrialMaterials.values()))
    };
}

function deriveMillBrand(productName, rawManufacturer) {
    const raw = String(rawManufacturer || '').trim();
    if (raw && raw !== 'European Certified Mill' && raw !== 'NULL' && raw.length > 2) {
        return raw;
    }
    const name = String(productName || '').toLowerCase();
    if (name.includes('munken') || name.includes('arctic')) return 'Arctic Paper';
    if (name.includes('coral') || name.includes('garda') || name.includes('torras') || name.includes('lecta')) return 'Lecta / Torraspapel';
    if (name.includes('magno') || name.includes('sappi') || name.includes('algro')) return 'Sappi Europe';
    if (name.includes('fedrigoni') || name.includes('symbol') || name.includes('sirio') || name.includes('freelife') || name.includes('woodstock') || name.includes('burano')) return 'Fedrigoni Group';
    if (name.includes('stora') || name.includes('enso') || name.includes('bookcream') || name.includes('performa')) return 'Stora Enso';
    if (name.includes('upm') || name.includes('profi')) return 'UPM Communication Papers';
    if (name.includes('metsa') || name.includes('metsä') || name.includes('carta') || name.includes('alaska')) return 'Metsä Board';
    if (name.includes('olin') || name.includes('rives') || name.includes('conqueror') || name.includes('antalis')) return 'Antalis / Arjowiggins';
    if (name.includes('invercote') || name.includes('iggesund') || name.includes('holmen')) return 'Holmen Iggesund';
    if (name.includes('derprosa') || name.includes('taghleef')) return 'Taghleef / Derprosa';
    if (name.includes('eska') || name.includes('kappaboard')) return 'Eska Graphic Board';
    if (name.includes('geltex')) return 'Guarro Casas / Fedrigoni';
    return raw || 'European Certified Mill';
}

/**
 * Bulk activates selected paper variants or sets rate card into tenant catalog.
 */
async function bulkActivateMasterVariants({ variantIds = [], ratePerKgEur = 1.34, scope = {}, dbClient = db }) {
    await ensurePrinthouseMaterialsSchema(dbClient);
    const tenantId = scope.tenantId || 'tenant-default';
    const printhouseId = scope.printhouseId || 'GLOBAL_MASTER';
    const targetRate = Number(ratePerKgEur) > 0 ? Number(ratePerKgEur) : 1.34;

    let rowsToActivate = [];
    if (dbClient && typeof dbClient.query === 'function' && process.env.PPOS_CI_EPHEMERAL_FIXTURES !== 'true') {
        try {
            let query = `
                SELECT 
                    v.id as variant_id,
                    p.name as product_name,
                    p.brand,
                    p.manufacturer,
                    p.category as raw_category,
                    v.gsm,
                    v.caliper_um,
                    v.bulk_factor,
                    v.width_mm,
                    v.height_mm,
                    v.is_reel,
                    v.finish,
                    v.grain_direction
                FROM paper_variants v
                JOIN paper_products p ON p.id = v.product_id
            `;
            const params = [];
            if (Array.isArray(variantIds) && variantIds.length > 0) {
                const placeholders = variantIds.map(() => '?').join(',');
                query += ` WHERE v.id IN (${placeholders}) OR CONCAT('MAT-', v.id) IN (${placeholders})`;
                params.push(...variantIds, ...variantIds);
            }
            const res = await dbClient.query(query, params).catch(() => []);
            const unwrap = (r) => (Array.isArray(r) ? (Array.isArray(r[0]) ? r[0] : r) : []);
            rowsToActivate = unwrap(res);
        } catch (_) {
            rowsToActivate = [];
        }
    }

    // Fallback if DB query returned nothing or unit test environment
    if (rowsToActivate.length === 0) {
        for (const [id, item] of runtimeIndustrialMaterials.entries()) {
            if (!variantIds.length || variantIds.includes(id) || variantIds.includes(id.replace(/^MAT-/, ''))) {
                rowsToActivate.push({
                    variant_id: id.replace(/^MAT-/, ''),
                    product_name: item.name,
                    manufacturer: item.manufacturer,
                    raw_category: item.category,
                    gsm: item.basis_weight_gsm,
                    bulk_factor: item.bulk_volume,
                    width_mm: item.dimensions_json?.width_mm || 700,
                    height_mm: item.dimensions_json?.height_mm || 1000,
                    is_reel: item.material_type === 'REEL_PAPER',
                    finish: item.finish_type || 'MATTE',
                    grain_direction: item.dimensions_json?.grain_direction || 'LG'
                });
            }
        }
    }

    const activated = [];
    for (const row of rowsToActivate) {
        const isReel = Boolean(row.is_reel);
        const rawCat = String(row.raw_category || '').toUpperCase();
        let materialType = 'SHEETFED_PAPER';
        if (isReel) materialType = 'REEL_PAPER';
        else if (rawCat === 'CARTON') materialType = 'BOARD_CARTON';
        else if (rawCat === 'DESIGN' || String(row.product_name).toLowerCase().includes('guarda')) materialType = 'ENDPAPERS';

        let category = 'OFFSET_UNCOATED';
        if (rawCat === 'COATED') {
            const fin = String(row.finish || '').toUpperCase();
            category = fin.includes('GLOSS') ? 'COATED_GLOSS' : 'COATED_MATTE';
        } else if (rawCat === 'CARTON') {
            category = 'SPECIALTY';
        } else if (Number(row.bulk_factor || 1.0) >= 1.4) {
            category = 'BULKY_CREAM';
        }

        const gsm = Number(row.gsm || 90);
        let rawBulk = Number(row.bulk_factor || 0);
        if (!Number.isFinite(rawBulk) || rawBulk < 0.5) {
            if (row.caliper_um && row.gsm && Number(row.gsm) > 0) {
                const derived = Number((Number(row.caliper_um) / Number(row.gsm)).toFixed(2));
                rawBulk = derived >= 0.5 && derived <= 3.5 ? derived : 1.0;
            } else {
                rawBulk = 1.0;
            }
        } else if (rawBulk > 3.5) {
            rawBulk = 3.5;
        }
        const bulk = Number(rawBulk.toFixed(2));
        const widthMm = Number(row.width_mm || 700);
        const heightMm = Number(row.height_mm || 1000);
        const grain = String(row.grain_direction || '').toUpperCase().includes('SHORT') || row.grain_direction === 'SG' ? 'SG' : 'LG';
        const brand = deriveMillBrand(row.product_name, row.manufacturer || row.brand);

        const item = {
            id: `MAT-${row.variant_id}`,
            printhouse_id: printhouseId,
            tenant_id: tenantId,
            name: row.product_name,
            manufacturer: brand,
            material_type: materialType,
            category,
            basis_weight_gsm: gsm,
            bulk_volume: bulk,
            dimensions_json: isReel
                ? {
                      web_width_mm: widthMm,
                      max_diameter_mm: 1200,
                      core_diameter_mm: 76,
                      format_label: `Bobina ${widthMm} mm · Ø1200 mm`
                  }
                : {
                      width_mm: widthMm,
                      height_mm: heightMm,
                      grain_direction: grain,
                      format_label: `${widthMm === 700 && heightMm === 1000 ? 'B1' : widthMm === 500 && heightMm === 700 ? 'B2' : 'Pliego'} (${widthMm}×${heightMm} mm · ${grain})`
                  },
            cost_per_kg_eur: targetRate,
            certifications_json: ['FSC_MIX'],
            in_stock_kg: 5000.00,
            min_order_kg: 500.00,
            status: 'ACTIVE'
        };

        const upserted = await upsertIndustrialMaterial(item, { tenantId, printhouseId }, dbClient, false);
        activated.push(upserted);
    }

    return {
        ok: true,
        activatedCount: activated.length,
        materials: activated,
        kpiSummary: computeIndustrialCatalogKpis(Array.from(runtimeIndustrialMaterials.values()))
    };
}

/**
 * Parses and imports CSV rate cards into printhouse active substrates.
 * Headers: brand_or_name, grammage, format, price_eur_kg
 */
async function importPaperRateCardCsv({ csvText = '', scope = {}, dbClient = db }) {
    if (!csvText || typeof csvText !== 'string') {
        throw new Error('CSV content is required.');
    }

    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
        throw new Error('CSV must contain a header row and at least one data row.');
    }

    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const brandIdx = header.findIndex(h => h.includes('brand') || h.includes('name') || h.includes('papel') || h.includes('molino') || h.includes('material'));
    const gsmIdx = header.findIndex(h => h.includes('grammage') || h.includes('gsm') || h.includes('gramaje'));
    const formatIdx = header.findIndex(h => h.includes('format') || h.includes('formato') || h.includes('dimension'));
    const priceIdx = header.findIndex(h => h.includes('price') || h.includes('cost') || h.includes('precio') || h.includes('eur') || h.includes('kg'));

    const itemsToProcess = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length === 0 || !cols[0]) continue;
        const brandOrName = brandIdx >= 0 ? cols[brandIdx] : cols[0];
        const gsm = gsmIdx >= 0 ? Number(cols[gsmIdx]) || 90 : 90;
        const formatStr = formatIdx >= 0 ? cols[formatIdx] : '';
        const priceEurKg = priceIdx >= 0 ? Number(cols[priceIdx].replace(',', '.')) || 1.34 : 1.34;

        itemsToProcess.push({
            brandOrName,
            gsm,
            formatStr,
            priceEurKg
        });
    }

    const tenantId = scope.tenantId || 'tenant-default';
    const printhouseId = scope.printhouseId || 'GLOBAL_MASTER';
    const updated = [];

    const allMaterials = await listIndustrialMaterials({}, { tenantId, printhouseId }, dbClient);
    for (const entry of itemsToProcess) {
        const queryTerm = entry.brandOrName.toLowerCase();
        const matches = allMaterials.materials.filter(m => {
            const nameMatch = m.name.toLowerCase().includes(queryTerm) || m.manufacturer.toLowerCase().includes(queryTerm);
            const gsmMatch = Math.abs(m.basis_weight_gsm - entry.gsm) <= 5;
            return nameMatch && gsmMatch;
        });

        if (matches.length > 0) {
            for (const match of matches) {
                const upserted = await upsertIndustrialMaterial(
                    {
                        ...match,
                        cost_per_kg_eur: entry.priceEurKg
                    },
                    { tenantId, printhouseId },
                    dbClient,
                    false
                );
                updated.push(upserted);
            }
        } else {
            const bespoke = {
                id: `MAT-BESPOKE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                printhouse_id: printhouseId,
                tenant_id: tenantId,
                name: entry.brandOrName,
                manufacturer: deriveMillBrand(entry.brandOrName, ''),
                material_type: 'SHEETFED_PAPER',
                category: entry.gsm > 150 ? 'COATED_MATTE' : 'OFFSET_UNCOATED',
                basis_weight_gsm: entry.gsm,
                bulk_volume: 1.25,
                dimensions_json: {
                    width_mm: 700,
                    height_mm: 1000,
                    grain_direction: 'LG',
                    format_label: entry.formatStr || 'B1 (700×1000 mm · LG)'
                },
                cost_per_kg_eur: entry.priceEurKg,
                certifications_json: ['FSC_MIX'],
                in_stock_kg: 5000.00,
                min_order_kg: 500.00,
                status: 'ACTIVE'
            };
            const upserted = await upsertIndustrialMaterial(bespoke, { tenantId, printhouseId }, dbClient, false);
            updated.push(upserted);
        }
    }

    return {
        ok: true,
        importedCount: updated.length,
        materials: updated,
        kpiSummary: computeIndustrialCatalogKpis(Array.from(runtimeIndustrialMaterials.values()))
    };
}

module.exports = {
    EUROPEAN_MASTER_SUBSTRATES,
    VALID_INDUSTRIAL_MATERIAL_TYPES,
    VALID_SUBSTRATE_CATEGORIES,
    VALID_CERTIFICATIONS,
    calculateSubstrateMechanics,
    normalizeIndustrialMaterialRecord,
    computeIndustrialCatalogKpis,
    ensurePrinthouseMaterialsSchema,
    listIndustrialMaterials,
    upsertIndustrialMaterial,
    archiveIndustrialMaterial,
    syncMasterIndustrialCatalog,
    bulkActivateMasterVariants,
    importPaperRateCardCsv,
    deriveMillBrand,
    validateMachineSubstrateCompatibility,
    syncMaterialToPaperVariants
};

