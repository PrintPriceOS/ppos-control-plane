'use strict';

/**
 * src/api/services/paperMaterialsNormalizationService.js
 *
 * PrintPrice OS — Phase 197C (PAPER-MATERIALS-RECOVERY-03):
 * Multilingual Paper Materials Technical Normalization & Deterministic Reconciliation Engine
 *
 * Enforces strict industrial invariants:
 * 1. Separates Paper Type (industrial family), Coating Status (coated/uncoated/one-side/unknown),
 *    Surface Finish (MATT/SILK/GLOSS/SEMI_GLOSS/UNCOATED/OTHER/UNKNOWN), and Grain Direction (LONG_GRAIN/SHORT_GRAIN/UNKNOWN).
 * 2. NEVER automatically equates `PAPER TYPE = Matt` with `COATED` when `COAT = nekrītots`
 *    (e.g. LuxCream 1.8, Munken Polar 240, Munken Pure Rough 100).
 * 3. NEVER defaults missing coating or finish to `UNCOATED`. Missing/ambiguous values remain `UNKNOWN`.
 * 4. NEVER infers `grain_direction` (`LONG_GRAIN` / `SHORT_GRAIN`) from sheet dimensions (`width_mm` vs `height_mm`).
 * 5. Preserves original supplier code (`CODE`), provider (`PROVISER`), sortiment (`SORTIMET`), and raw values
 *    for auditability and Spine Calculator / BPE traceability.
 */

const CANONICAL_PAPER_TYPES = Object.freeze([
    'OFFSET',
    'COATED',
    'DESIGN',
    'CARTON',
    'DIGITAL',
    'OTHER'
]);

const CANONICAL_COATING_STATUSES = Object.freeze([
    'COATED',
    'UNCOATED',
    'ONE_SIDE_COATED',
    'UNKNOWN'
]);

const CANONICAL_FINISHES = Object.freeze([
    'MATT',
    'SILK',
    'GLOSS',
    'SEMI_GLOSS',
    'UNCOATED',
    'OTHER',
    'UNKNOWN'
]);

const CANONICAL_GRAIN_DIRECTIONS = Object.freeze([
    'LONG_GRAIN',
    'SHORT_GRAIN',
    'UNKNOWN'
]);

const RECONCILIATION_CLASSIFICATIONS = Object.freeze({
    SAFE_UNIQUE_MATCH: 'SAFE_UNIQUE_MATCH',
    STRONG_MATCH_REVIEW: 'STRONG_MATCH_REVIEW',
    AMBIGUOUS_MATCH: 'AMBIGUOUS_MATCH',
    ATTRIBUTE_CONFLICT: 'ATTRIBUTE_CONFLICT',
    ALREADY_VERIFIED: 'ALREADY_VERIFIED',
    UNMATCHED: 'UNMATCHED'
});

/**
 * Decodes XML entities commonly found in ODS cell text.
 */
function decodeOdsCellText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

/**
 * Normalizes a product name for deterministic tuple matching.
 */
function normalizeCatalogProductName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Normalizes ODS dimension value (which in Paper data base.ods mixes cm like 70x100 and mm like 700x1000)
 * to canonical millimeters for tuple matching against paper_variants.
 */
function normalizeOdsDimensionToMm(val) {
    const n = Number(String(val || '').replace(',', '.')) || 0;
    if (n <= 0) return 0;
    return n < 200 ? Math.round(n * 10) : Math.round(n);
}

/**
 * Normalizes explicit grain direction tokens without ever guessing from sheet dimensions.
 */
function normalizeGrainDirectionToken(rawGrain) {
    if (!rawGrain || typeof rawGrain !== 'string') return 'UNKNOWN';
    const upper = rawGrain.trim().toUpperCase();
    if (!upper || upper === 'UNKNOWN' || upper === '-' || upper === '—') return 'UNKNOWN';
    if (
        /\bLONG_GRAIN\b/.test(upper) ||
        /\bLONG\s+GRAIN\b/.test(upper) ||
        /\bFIBRA\s+LARGA\b/.test(upper) ||
        /\bSCHMALBAHN\b/.test(upper) ||
        upper === 'LG' ||
        upper === 'BB'
    ) {
        return 'LONG_GRAIN';
    }
    if (
        /\bSHORT_GRAIN\b/.test(upper) ||
        /\bSHORT\s+GRAIN\b/.test(upper) ||
        /\bFIBRA\s+CORTA\b/.test(upper) ||
        /\bBREITBAHN\b/.test(upper) ||
        upper === 'SG' ||
        upper === 'SB'
    ) {
        return 'SHORT_GRAIN';
    }
    return 'UNKNOWN';
}

/**
 * Normalizes supplier / provider name from ODS `PROVISER` column.
 */
function normalizeSupplierProviser(rawProviser) {
    const raw = String(rawProviser || '').trim();
    if (!raw) {
        return { proviserRaw: '', supplierCodeNormalized: 'UNSPECIFIED', supplierLabel: 'Unspecified' };
    }
    const upper = raw.toUpperCase();
    if (upper.includes('ANTALIS')) {
        return { proviserRaw: raw, supplierCodeNormalized: 'ANTALIS', supplierLabel: 'Antalis' };
    }
    if (upper.includes('DARDEDZE')) {
        return { proviserRaw: raw, supplierCodeNormalized: 'DARDEDZE', supplierLabel: 'Dardedze hologrāfija' };
    }
    if (upper.includes('POLAP')) {
        return { proviserRaw: raw, supplierCodeNormalized: 'POLAP', supplierLabel: 'Polap' };
    }
    if (upper.includes('PAPYRUS')) {
        return { proviserRaw: raw, supplierCodeNormalized: 'PAPYRUS', supplierLabel: 'Papyrus' };
    }
    if (upper.includes('OLDI')) {
        return { proviserRaw: raw, supplierCodeNormalized: 'OLDI', supplierLabel: 'Oldi' };
    }
    if (upper.includes('CITS')) {
        return { proviserRaw: raw, supplierCodeNormalized: 'OTHER_SUPPLIER', supplierLabel: 'Cits DEF' };
    }
    return { proviserRaw: raw, supplierCodeNormalized: 'OTHER_SUPPLIER', supplierLabel: raw };
}

/**
 * Evaluates and normalizes a raw technical row from `Paper data base.ods` (or equivalent multilingual import)
 * into canonical Paper Type, Coating Status, Surface Finish, Grain Direction, and Provenance metadata.
 *
 * @param {Object} rawRow
 * @param {string} [rawRow.name] - Commercial product name (`NAME`)
 * @param {string} [rawRow.paperType] - Raw paper type (`PAPER TYPE`: Ofset, Silk, Dizaina, Matt, Kartons, Group 1, Kappa)
 * @param {string} [rawRow.coat] - Raw coating/finish string (`COAT`: krītots, nekrītots, vienpus. krītots, Matt, Silk, Gloss, etc.)
 * @param {string} [rawRow.grain] - Explicit grain string if any
 * @param {string} [rawRow.code] - Supplier / original code (`CODE`)
 * @param {string} [rawRow.proviser] - Raw provider (`PROVISER`)
 * @param {string} [rawRow.sortiment] - Raw sortiment (`SORTIMET`)
 */
function normalizeMultilingualPaperAttributes(rawRow = {}) {
    const pt = String(rawRow.paperType || '').trim();
    const coat = String(rawRow.coat || '').trim();
    const name = String(rawRow.name || '').trim();
    const nameUpper = name.toUpperCase();
    const coatLower = coat.toLowerCase();
    const ptLower = pt.toLowerCase();

    const rulesApplied = [];
    const flags = [];

    // -------------------------------------------------------------------------
    // 1. PAPER TYPE (Industrial Family: OFFSET, COATED, DESIGN, CARTON, DIGITAL, OTHER)
    // -------------------------------------------------------------------------
    let paperTypeNorm = 'OTHER';

    if (ptLower === 'ofset' || ptLower === 'offset') {
        paperTypeNorm = 'OFFSET';
        rulesApplied.push('PT_OFSET->OFFSET');
    } else if (ptLower === 'silk' || ptLower === 'gloss' || ptLower === 'coated') {
        paperTypeNorm = 'COATED';
        rulesApplied.push('PT_SILK_OR_COATED->COATED');
    } else if (ptLower === 'dizaina' || ptLower === 'design') {
        paperTypeNorm = 'DESIGN';
        rulesApplied.push('PT_DIZAINA->DESIGN');
    } else if (ptLower === 'kartons' || ptLower === 'carton' || ptLower === 'board') {
        paperTypeNorm = 'CARTON';
        rulesApplied.push('PT_KARTONS->CARTON');
    } else if (ptLower === 'kappa') {
        paperTypeNorm = 'CARTON';
        rulesApplied.push('PT_KAPPA->CARTON_GREYBOARD');
    } else if (ptLower === 'matt') {
        // INVARIANT: Do NOT automatically equate Paper Type = Matt with Coating = COATED!
        if (
            coatLower === 'nekrītots' ||
            coatLower === 'nekrītota' ||
            coatLower === 'nektītots' ||
            coatLower === 'uncoated'
        ) {
            if (/\bMUNKEN\b/.test(nameUpper)) {
                paperTypeNorm = 'DESIGN';
                rulesApplied.push('PT_MATT_UNCOATED_MUNKEN->DESIGN');
            } else {
                paperTypeNorm = 'OFFSET';
                rulesApplied.push('PT_MATT_UNCOATED->OFFSET');
            }
            flags.push('SOURCE_TYPE_MATT_WITH_NEKRITOTS_COAT');
        } else {
            paperTypeNorm = 'COATED';
            rulesApplied.push('PT_MATT_COATED_FAMILY->COATED');
        }
    } else if (ptLower === 'group 1') {
        if (/\bALGRO\s+DESIGN\b|\bCARTON\b|\bKARTON\b|\bGC1\b|\bGC2\b/.test(nameUpper)) {
            paperTypeNorm = 'CARTON';
            rulesApplied.push('PT_GROUP1_ALGRO_OR_BOARD->CARTON');
        } else if (
            /\bGALERIE\b/.test(nameUpper) &&
            (coatLower === 'krītots' || /\bSILK\b|\bGLOSS\b|\bMATT\b/.test(nameUpper))
        ) {
            paperTypeNorm = 'COATED';
            rulesApplied.push('PT_GROUP1_GALERIE->COATED');
        } else if (/\bKEAYKOLOUR\b|\bMUNKEN\s+PURE\b|\bMULTIDESIGN\b/.test(nameUpper)) {
            paperTypeNorm = 'DESIGN';
            rulesApplied.push('PT_GROUP1_DESIGN_BRAND->DESIGN');
        } else if (
            /\bMULTIOFFSET\b|\bIMAGE\s+DIGICOLOR\b/.test(nameUpper) &&
            (coatLower === 'nekrītots' || coatLower === 'uncoated')
        ) {
            paperTypeNorm = 'OFFSET';
            rulesApplied.push('PT_GROUP1_UNCOATED_OFFSET->OFFSET');
        } else {
            paperTypeNorm = 'OTHER';
            rulesApplied.push('PT_GROUP1->OTHER');
        }
    } else if (pt === '') {
        // When PAPER TYPE column is absent (e.g. 4-column CSV), only classify when explicit in COAT or unambiguous token
        if (/\bKARTONS\b|\bCARTON\b|\bGC1\b|\bGC2\b/.test(nameUpper)) {
            paperTypeNorm = 'CARTON';
            rulesApplied.push('EMPTY_PT_NAME_CARTON->CARTON');
        } else if (/\bDIZAINA\b|\bDESIGN\b/.test(nameUpper)) {
            paperTypeNorm = 'DESIGN';
            rulesApplied.push('EMPTY_PT_NAME_DESIGN->DESIGN');
        } else if (/\bDIGITAL\b|\bDIGITĀL/.test(nameUpper)) {
            paperTypeNorm = 'DIGITAL';
            rulesApplied.push('EMPTY_PT_NAME_DIGITAL->DIGITAL');
        } else if (coatLower === 'nekrītots' || coatLower === 'uncoated' || /\bOFFSET\b|\bOFSET\b|\bUNCOATED\b/.test(nameUpper)) {
            paperTypeNorm = 'OFFSET';
            rulesApplied.push('EMPTY_PT_EXPLICIT_UNCOATED->OFFSET');
        } else if (
            coatLower === 'krītots' ||
            coatLower === 'coated' ||
            coatLower === 'matt' ||
            coatLower === 'silk' ||
            coatLower === 'gloss' ||
            /\bCOATED\b|\bSILK\b|\bGLOSS\b|\bMATT\b/.test(nameUpper)
        ) {
            paperTypeNorm = 'COATED';
            rulesApplied.push('EMPTY_PT_EXPLICIT_COATED->COATED');
        } else {
            paperTypeNorm = 'OTHER';
        }
    }

    // -------------------------------------------------------------------------
    // 2. COATING STATUS (COATED, UNCOATED, ONE_SIDE_COATED, UNKNOWN)
    // -------------------------------------------------------------------------
    let coatingStatus = 'UNKNOWN';
    let coatingConfidence = 'EXPLICIT_SOURCE';

    if (
        coatLower === 'vienpus. krītots' ||
        coatLower === 'krītots 1s' ||
        coatLower === 'gc1' ||
        coatLower === 'krītot/nekrītot' ||
        coatLower === 'kritots/nekritot' ||
        coatLower === 'one_side_coated' ||
        coatLower === '1s coated'
    ) {
        if (/\bDUO\b|\b2S\b/.test(nameUpper) && (coatLower === 'krītot/nekrītot' || coatLower === 'kritots/nekritot')) {
            coatingStatus = 'COATED';
            coatingConfidence = 'CONFLICT_REVIEW';
            flags.push('COAT_KRITOT_NEKRITOT_ON_DUO');
            rulesApplied.push('COAT_DUO->COATED');
        } else {
            coatingStatus = 'ONE_SIDE_COATED';
            rulesApplied.push(`COAT_${coat}->ONE_SIDE_COATED`);
        }
    } else if (
        coatLower === 'krītots' ||
        coatLower === 'krītots,' ||
        coatLower === 'coated' ||
        coatLower === 'silk' ||
        coatLower === 'gloss' ||
        coatLower === 'satin' ||
        coatLower === 'pusglancēts' ||
        coatLower === 'semigloss' ||
        coatLower === 'pusmatēts' ||
        coatLower === 'glancēta' ||
        coatLower === 'plastikāts gloss' ||
        coatLower === 'matt'
    ) {
        coatingStatus = 'COATED';
        rulesApplied.push(`COAT_${coat}->COATED`);
    } else if (
        coatLower === 'nekrītots' ||
        coatLower === 'nekrītota' ||
        coatLower === 'nektītots' ||
        coatLower === 'nekrītota, matēt' ||
        coatLower === 'uncoated'
    ) {
        coatingStatus = 'UNCOATED';
        rulesApplied.push(`COAT_${coat}->UNCOATED`);
    } else if (coat === '') {
        // COAT is empty: never blindly default to UNCOATED!
        if (ptLower === 'ofset' || ptLower === 'offset') {
            if (/\bGELTEX\b/.test(nameUpper)) {
                coatingStatus = 'UNKNOWN';
                coatingConfidence = 'NEEDS_REVIEW';
                flags.push('OFSET_EMPTY_COAT_GELTEX');
            } else {
                coatingStatus = 'UNCOATED';
                coatingConfidence = 'DOCUMENTED_FAMILY';
                rulesApplied.push('EMPTY_COAT+PT_OFSET->UNCOATED');
            }
        } else if (ptLower === 'silk') {
            coatingStatus = 'COATED';
            coatingConfidence = 'DOCUMENTED_FAMILY';
            rulesApplied.push('EMPTY_COAT+PT_SILK->COATED');
        } else if (ptLower === 'matt') {
            if (/\b(ARCTIC\s+VOLUME|G-PRINT|GALERIE\s+ART|MATT\s+MAXIMA|MAXIMA\s+VOLUME|VOLUME\s+MAXIMA|NOVATECH\s+MATT|SORA\s+MATT)\b/.test(nameUpper)) {
                coatingStatus = 'COATED';
                coatingConfidence = 'DOCUMENTED_FAMILY';
                rulesApplied.push('EMPTY_COAT+PT_MATT_KNOWN_COATED_MILL_BRAND->COATED');
            } else {
                coatingStatus = 'UNKNOWN';
                coatingConfidence = 'NEEDS_REVIEW';
            }
        } else if (ptLower === 'kartons') {
            if (/\bGC1\b|\b1S\b|\bALLYKING\s+CREAM\s+GC2\b|\bGC2\b|\bARTBOARD\b|\bATELIER\b/.test(nameUpper)) {
                coatingStatus = /\b1S\b|\bGC1\b|\bGC2\b/.test(nameUpper) ? 'ONE_SIDE_COATED' : 'COATED';
                coatingConfidence = 'DOCUMENTED_FAMILY';
                rulesApplied.push('EMPTY_COAT+PT_KARTONS_GC->COATED');
            } else if (/\bBEERMAT\b/.test(nameUpper)) {
                coatingStatus = 'UNCOATED';
                coatingConfidence = 'DOCUMENTED_FAMILY';
                rulesApplied.push('EMPTY_COAT+PT_KARTONS_BEERMAT->UNCOATED');
            } else {
                coatingStatus = 'UNKNOWN';
                coatingConfidence = 'NEEDS_REVIEW';
            }
        } else if (ptLower === 'dizaina') {
            if (/\bSPLENDORLUX\b/.test(nameUpper)) {
                coatingStatus = 'ONE_SIDE_COATED';
                coatingConfidence = 'DOCUMENTED_FAMILY';
                rulesApplied.push('EMPTY_COAT+PT_DIZAINA_SPLENDORLUX->ONE_SIDE_COATED');
            } else if (
                /\b(MUNKEN|ARENA|BURANO|COLORIT|OLIN|POP'SET|KEAYKOLOUR|CONQUEROR|CRUSH|RIVES|WILD|MATERICA|FREELIFE|SIRIO|TINTORETTO|ACQUEREL|NETTUNO|SAVILE\s+ROW)\b/.test(nameUpper)
            ) {
                coatingStatus = 'UNCOATED';
                coatingConfidence = 'DOCUMENTED_FAMILY';
                rulesApplied.push('EMPTY_COAT+PT_DIZAINA_UNCOATED_MILL_LINE->UNCOATED');
            } else {
                coatingStatus = 'UNKNOWN';
                coatingConfidence = 'NEEDS_REVIEW';
                flags.push('EMPTY_COAT_DIZAINA_UNSPECIFIED');
            }
        } else if (ptLower === 'kappa') {
            coatingStatus = 'UNCOATED';
            coatingConfidence = 'DOCUMENTED_FAMILY';
            rulesApplied.push('PT_KAPPA_GREYBOARD->UNCOATED');
        } else {
            // Both COAT and PAPER TYPE are empty or generic -> check only explicit English/Latvian words in name
            if (/\bUNCOATED\b|\bNEKRĪTOTS\b/.test(nameUpper)) {
                coatingStatus = 'UNCOATED';
                coatingConfidence = 'DOCUMENTED_FAMILY';
            } else if (/\bCOATED\b|\bKRĪTOTS\b/.test(nameUpper)) {
                coatingStatus = 'COATED';
                coatingConfidence = 'DOCUMENTED_FAMILY';
            } else {
                coatingStatus = 'UNKNOWN';
                coatingConfidence = 'NEEDS_REVIEW';
            }
        }
    } else {
        // Anomalous / non-coating tokens in COAT: "Jautāt", "dizaina", "Nr.108...", "POLAP", "70", "mitrumizturīgs", "caurspīdīgs", "cits", "Sintētiskais"
        if (coat === 'POLAP' && ptLower === 'ofset' && /\bMAESTRO\s+PRINT\b/.test(nameUpper)) {
            coatingStatus = 'UNCOATED';
            coatingConfidence = 'CONFLICT_REVIEW';
            flags.push('COAT_HAS_PROVIDER_POLAP');
        } else if (coatLower === 'dizaina' && /\b(BURANO|COLORIT|CONQUEROR|EFALIN)\b/.test(nameUpper)) {
            coatingStatus = 'UNCOATED';
            coatingConfidence = 'DOCUMENTED_FAMILY';
            rulesApplied.push('COAT_DIZAINA_UNCOATED_BRAND->UNCOATED');
        } else if (coat.startsWith('Nr.') && /\bEFALIN\b/.test(nameUpper)) {
            coatingStatus = 'UNCOATED';
            coatingConfidence = 'DOCUMENTED_FAMILY';
            flags.push('COAT_HAS_SHADE_NR');
        } else if (coatLower === 'semigloss' || coatLower === 'pusglancēts' || /\bSEMIGLOSS\b/.test(nameUpper)) {
            coatingStatus = 'COATED';
            coatingConfidence = 'DOCUMENTED_FAMILY';
        } else {
            coatingStatus = 'UNKNOWN';
            coatingConfidence = 'NEEDS_REVIEW';
            flags.push(`AMBIGUOUS_COAT_VALUE:${coat}`);
        }
    }

    // -------------------------------------------------------------------------
    // 3. SURFACE FINISH (MATT, SILK, GLOSS, SEMI_GLOSS, UNCOATED, OTHER, UNKNOWN)
    // -------------------------------------------------------------------------
    let finishNorm = 'UNKNOWN';

    const hasGlossInName = /\bGLOSS\b|\bFINE\s+G\b|\bSPLENDORLUX\b|\bCAST\s+GLOSS\b/.test(nameUpper);
    const hasSemiGlossInName = /\bSEMIGLOSS\b|\bSEMI-GLOSS\b/.test(nameUpper);
    const hasSilkInName = /\bSILK\b|\bSATIN\b|\bG-SILK\b/.test(nameUpper);
    const hasMattInName = /\bMATT\b|\bG-PRINT\b|\bARCTIC\s+VOLUME\b|\bMAXIMA\s+VOLUME\b|\bVOLUME\s+MAXIMA\b|\bMAXIMA\s+VOULE\b/.test(nameUpper);

    if (coatLower === 'pusglancēts' || coatLower === 'semigloss' || hasSemiGlossInName) {
        finishNorm = 'SEMI_GLOSS';
        rulesApplied.push('FINISH->SEMI_GLOSS');
    } else if (coatLower === 'gloss' || coatLower === 'glancēta' || coatLower === 'plastikāts gloss' || hasGlossInName) {
        if (ptLower === 'silk' && hasGlossInName) {
            flags.push('PT_SILK_WITH_GLOSS_PRODUCT_NAME');
        }
        finishNorm = 'GLOSS';
        rulesApplied.push('FINISH->GLOSS');
    } else if (
        coatLower === 'silk' ||
        coatLower === 'satin' ||
        hasSilkInName ||
        (ptLower === 'silk' && !hasGlossInName && !hasMattInName)
    ) {
        if (ptLower === 'matt' && coatLower === 'silk') {
            flags.push('PT_MATT_WITH_COAT_SILK_CONFLICT');
        }
        finishNorm = (ptLower === 'matt' && coatLower === 'silk') ? 'MATT' : 'SILK';
        rulesApplied.push(`FINISH->${finishNorm}`);
    } else if (
        coatLower === 'matt' ||
        coatLower === 'pusmatēts' ||
        (ptLower === 'matt' && coatingStatus === 'COATED') ||
        (coatingStatus === 'COATED' && hasMattInName)
    ) {
        finishNorm = 'MATT';
        rulesApplied.push('FINISH->MATT');
    } else if (coatingStatus === 'UNCOATED') {
        finishNorm = 'UNCOATED';
        rulesApplied.push('FINISH->UNCOATED');
    } else if (coatingStatus === 'ONE_SIDE_COATED' || coatingStatus === 'COATED') {
        if (hasMattInName) finishNorm = 'MATT';
        else if (hasSilkInName) finishNorm = 'SILK';
        else if (hasGlossInName) finishNorm = 'GLOSS';
        else finishNorm = 'OTHER';
        rulesApplied.push(`FINISH_COATED_GENERIC->${finishNorm}`);
    } else {
        finishNorm = 'UNKNOWN';
    }

    // -------------------------------------------------------------------------
    // 4. GRAIN DIRECTION (LONG_GRAIN, SHORT_GRAIN, UNKNOWN)
    // Strictly from explicit grain token only — NEVER inferred from dimensions!
    // -------------------------------------------------------------------------
    const grainDirection = normalizeGrainDirectionToken(rawRow.grain || '');

    // -------------------------------------------------------------------------
    // 5. SUPPLIER / ORIGINAL CODE & PROVISER
    // -------------------------------------------------------------------------
    const originalCode = String(rawRow.code || '').trim();
    const sortiment = String(rawRow.sortiment || '').trim();
    const supplierInfo = normalizeSupplierProviser(rawRow.proviser);

    return {
        paperType: paperTypeNorm,
        coatingStatus,
        coatingConfidence,
        finish: finishNorm,
        grainDirection,
        originalCode: originalCode || null,
        sortiment: sortiment || null,
        proviserRaw: supplierInfo.proviserRaw || null,
        supplierCodeNormalized: supplierInfo.supplierCodeNormalized,
        supplierLabel: supplierInfo.supplierLabel,
        rulesApplied,
        flags
    };
}

/**
 * Resolves the technical attributes of a `paper_variants` + `paper_products` row for API/UI consumption,
 * eliminating silent `UNKNOWN · UNCOATED` defaults and exposing structured provenance.
 */
function resolveVariantTechnicalAttributes(row = {}) {
    const varMeta = typeof row.variant_metadata_json === 'string'
        ? (() => { try { return JSON.parse(row.variant_metadata_json); } catch (_) { return {}; } })()
        : (row.variant_metadata_json || row.metadata_json || {});

    const prodMeta = typeof row.product_metadata_json === 'string'
        ? (() => { try { return JSON.parse(row.product_metadata_json); } catch (_) { return {}; } })()
        : (row.product_metadata_json || {});

    const odsRec = varMeta.ods_materials_recovery || varMeta.ods_caliper_recovery || null;
    const rawCategory = String(row.category || '').toUpperCase() || 'OTHER';
    const rawFinish = String(row.finish || row.finish_summary || '').toUpperCase();
    const grainDirection = normalizeGrainDirectionToken(row.grain_direction || row.grainDirection || 'UNKNOWN');

    // If the variant has explicit ODS recovery metadata or explicit ODS columns in metadata_json, evaluate them:
    if (odsRec && (odsRec.ods_paper_type || odsRec.ods_coat !== undefined)) {
        const norm = normalizeMultilingualPaperAttributes({
            name: row.product_name || row.productName || row.name || '',
            paperType: odsRec.ods_paper_type || '',
            coat: odsRec.ods_coat || '',
            grain: grainDirection,
            code: odsRec.ods_code || varMeta.original_code || prodMeta.original_code || '',
            proviser: odsRec.ods_provider || prodMeta.provider_label || '',
            sortiment: odsRec.ods_sortiment || ''
        });

        // Respect already-accredited DB category/finish if explicitly verified beyond synthetic OTHER/UNCOATED default
        const effectivePaperType = (rawCategory && rawCategory !== 'OTHER') ? rawCategory : norm.paperType;
        const isSyntheticUncoatedDefault = (rawFinish === 'UNCOATED' && rawCategory === 'OTHER') ||
            (rawFinish === 'UNCOATED' && norm.coatingStatus === 'COATED') ||
            (rawFinish === 'UNCOATED' && norm.coatingStatus === 'ONE_SIDE_COATED') ||
            (rawFinish === 'UNCOATED' && norm.coatingStatus === 'UNKNOWN');

        const effectiveFinish = isSyntheticUncoatedDefault ? norm.finish : (rawFinish || norm.finish);

        return {
            paperType: effectivePaperType,
            coatingStatus: norm.coatingStatus,
            coatingConfidence: norm.coatingConfidence,
            finish: effectiveFinish,
            grainDirection,
            originalCode: norm.originalCode,
            proviserRaw: norm.proviserRaw,
            supplierLabel: norm.supplierLabel,
            isSyntheticUncoatedResolved: isSyntheticUncoatedDefault
        };
    }

    // When no ODS recovery metadata is attached (e.g. demo rows or newly imported rows):
    const isLegacyOtherUncoated = rawCategory === 'OTHER' && rawFinish === 'UNCOATED' && grainDirection === 'UNKNOWN' && !odsRec;
    let coatingStatus = row.coating_status || row.coatingStatus || null;
    if (!coatingStatus) {
        if (isLegacyOtherUncoated) {
            coatingStatus = 'UNKNOWN';
        } else if (rawFinish === 'UNCOATED' || rawCategory === 'OFFSET') {
            coatingStatus = 'UNCOATED';
        } else if (['SILK', 'MATT', 'GLOSS', 'SEMI_GLOSS', 'COATED'].includes(rawFinish) || rawCategory === 'COATED') {
            coatingStatus = 'COATED';
        } else {
            coatingStatus = 'UNKNOWN';
        }
    }

    const effectiveFinish = isLegacyOtherUncoated ? 'UNKNOWN' : (rawFinish || 'UNKNOWN');

    return {
        paperType: rawCategory,
        coatingStatus,
        coatingConfidence: isLegacyOtherUncoated ? 'UNVERIFIED_DEFAULT' : 'CATALOG_STORED',
        finish: effectiveFinish,
        grainDirection,
        originalCode: varMeta.original_code || prodMeta.original_code || null,
        proviserRaw: prodMeta.provider_label || null,
        supplierLabel: prodMeta.provider_label || null,
        isSyntheticUncoatedResolved: isLegacyOtherUncoated
    };
}

/**
 * Reconciles a list of catalog variants against the parsed ODS rows (`Paper data base.ods.zip`)
 * and classifies each variant deterministically into:
 * - SAFE_UNIQUE_MATCH
 * - STRONG_MATCH_REVIEW
 * - AMBIGUOUS_MATCH
 * - ATTRIBUTE_CONFLICT
 * - ALREADY_VERIFIED
 * - UNMATCHED
 */
function reconcileVariantsWithOdsSource(catalogVariants = [], odsRawRows = []) {
    const classifiedOds = odsRawRows.map((r, idx) => {
        const gsm = Number(String(r.grams || r.gsm || '').replace(',', '.')) || 0;
        const wMm = normalizeOdsDimensionToMm(r.width || r.w);
        const hMm = normalizeOdsDimensionToMm(r.height || r.h);
        const normAttrs = normalizeMultilingualPaperAttributes({
            name: r.name,
            paperType: r.paperType,
            coat: r.coat,
            grain: r.grain || '',
            code: r.code,
            proviser: r.proviser,
            sortiment: r.sortiment
        });

        return {
            sourceRow: r.sourceRow || (idx + 1),
            fileRowNumber: r.fileRowNumber || (idx + 5),
            code: r.code || '',
            name: r.name || '',
            gsm,
            wMm,
            hMm,
            microns: r.microns || '',
            thicknessMm: r.thicknessMm || '',
            format: r.format || '',
            coatRaw: r.coat || '',
            sortimentRaw: r.sortiment || '',
            paperTypeRaw: r.paperType || '',
            proviser: r.proviser || '',
            aktiv: r.aktiv || '',
            ...normAttrs
        };
    });

    const odsByTuple = new Map();
    for (const r of classifiedOds) {
        const key = `${normalizeCatalogProductName(r.name)}|${r.gsm}|${r.wMm}|${r.hMm}`;
        if (!odsByTuple.has(key)) odsByTuple.set(key, []);
        odsByTuple.get(key).push(r);
    }

    const matrix = [];
    const counts = {
        SAFE_UNIQUE_MATCH: 0,
        STRONG_MATCH_REVIEW: 0,
        AMBIGUOUS_MATCH: 0,
        ATTRIBUTE_CONFLICT: 0,
        ALREADY_VERIFIED: 0,
        UNMATCHED: 0
    };

    for (const pv of catalogVariants) {
        const variantId = pv.variant_id || pv.variantId || pv.id;
        const productId = pv.product_id || pv.productId;
        const productName = pv.product_name || pv.productName || pv.name || '';
        const gsm = Number(pv.gsm || 0);
        const widthMm = Math.round(Number(pv.width_mm || pv.widthMm || 0));
        const heightMm = Math.round(Number(pv.height_mm || pv.heightMm || 0));
        const existingCategory = pv.category || 'OTHER';
        const existingFinish = pv.finish || 'UNKNOWN';
        const existingGrain = pv.grain_direction || pv.grainDirection || 'UNKNOWN';

        const key = `${normalizeCatalogProductName(productName)}|${gsm}|${widthMm}|${heightMm}`;
        const matches = odsByTuple.get(key) || [];

        let classification = RECONCILIATION_CLASSIFICATIONS.UNMATCHED;
        let subClassification = 'NO_ODS_MATCH';
        let eligibleForAutoUpdate = false;
        let chosenOds = null;
        let notes = '';

        if (existingGrain === 'LONG_GRAIN' || existingGrain === 'SHORT_GRAIN') {
            classification = RECONCILIATION_CLASSIFICATIONS.ALREADY_VERIFIED;
            subClassification = 'ACCREDITED_DEMO_OR_MANUAL_VARIANT';
            eligibleForAutoUpdate = false;
            notes = `Variant already has explicit grain_direction=${existingGrain} and finish=${existingFinish}; preserved without overwrite.`;
        } else if (matches.length === 0) {
            classification = RECONCILIATION_CLASSIFICATIONS.UNMATCHED;
            subClassification = 'NO_ODS_TUPLE_MATCH';
            eligibleForAutoUpdate = false;
            notes = 'No matching (product_name, gsm, width_mm, height_mm) tuple found in Paper data base.ods.';
        } else if (matches.length > 1) {
            classification = RECONCILIATION_CLASSIFICATIONS.AMBIGUOUS_MATCH;
            subClassification = 'DUPLICATE_ODS_TUPLE';
            eligibleForAutoUpdate = false;
            chosenOds = matches[0];
            const desc = matches
                .map(m => `Row#${m.sourceRow}[code=${m.code || 'NONE'},type=${m.paperTypeRaw},coat=${m.coatRaw || '<EMPTY>'},mic=${m.microns}]`)
                .join('; ');
            notes = `Multiple ODS rows (${matches.length}) share identical tuple: ${desc}`;
        } else {
            chosenOds = matches[0];
            const hasHardConflictFlag = chosenOds.flags.some(f =>
                f === 'PT_MATT_WITH_COAT_SILK_CONFLICT' ||
                f === 'SOURCE_TYPE_MATT_WITH_NEKRITOTS_COAT' ||
                f === 'COAT_KRITOT_NEKRITOT_ON_DUO' ||
                f === 'COAT_HAS_PROVIDER_POLAP' ||
                f === 'OFSET_EMPTY_COAT_GELTEX' ||
                f.startsWith('AMBIGUOUS_COAT_VALUE:')
            );

            if (hasHardConflictFlag) {
                classification = RECONCILIATION_CLASSIFICATIONS.ATTRIBUTE_CONFLICT;
                subClassification = chosenOds.flags[0];
                eligibleForAutoUpdate = false;
                notes = `Single ODS match (Row#${chosenOds.sourceRow}), but source attributes conflict or contain anomalous tokens: ${chosenOds.flags.join(', ')}`;
            } else if (chosenOds.coatingConfidence === 'EXPLICIT_SOURCE') {
                if (chosenOds.flags.includes('PT_SILK_WITH_GLOSS_PRODUCT_NAME')) {
                    classification = RECONCILIATION_CLASSIFICATIONS.STRONG_MATCH_REVIEW;
                    subClassification = 'PT_SILK_WITH_GLOSS_PRODUCT_NAME';
                    eligibleForAutoUpdate = false;
                    notes = `Unique 1:1 ODS match (Row#${chosenOds.sourceRow}) with explicit COAT='${chosenOds.coatRaw}', but PAPER TYPE='Silk' while product name specifies Gloss.`;
                } else {
                    classification = RECONCILIATION_CLASSIFICATIONS.SAFE_UNIQUE_MATCH;
                    subClassification = 'EXPLICIT_ODS_TYPE_AND_COAT';
                    eligibleForAutoUpdate = true;
                    notes = `Unique 1:1 ODS match (Row#${chosenOds.sourceRow}) with explicit PAPER TYPE='${chosenOds.paperTypeRaw}' and COAT='${chosenOds.coatRaw}'.`;
                }
            } else if (chosenOds.coatingConfidence === 'DOCUMENTED_FAMILY') {
                classification = RECONCILIATION_CLASSIFICATIONS.STRONG_MATCH_REVIEW;
                subClassification = 'DOCUMENTED_MILL_FAMILY_RULE';
                eligibleForAutoUpdate = false;
                notes = `Unique 1:1 ODS match (Row#${chosenOds.sourceRow}) with PAPER TYPE='${chosenOds.paperTypeRaw}' and COAT='${chosenOds.coatRaw || '<EMPTY>'}' resolved via documented family rule (${chosenOds.rulesApplied.join(', ')}).`;
            } else {
                classification = RECONCILIATION_CLASSIFICATIONS.STRONG_MATCH_REVIEW;
                subClassification = 'UNSPECIFIED_COAT_KEPT_UNKNOWN';
                eligibleForAutoUpdate = false;
                notes = `Unique 1:1 ODS match (Row#${chosenOds.sourceRow}) with PAPER TYPE='${chosenOds.paperTypeRaw}' and COAT='${chosenOds.coatRaw || '<EMPTY>'}'; coating/finish kept as UNKNOWN.`;
            }
        }

        counts[classification] = (counts[classification] || 0) + 1;

        matrix.push({
            variant_id: variantId,
            product_id: productId,
            product_name: productName,
            gsm,
            width_mm: widthMm,
            height_mm: heightMm,
            existing_category: existingCategory,
            existing_finish: existingFinish,
            existing_grain_direction: existingGrain,
            ods_source_row: chosenOds ? chosenOds.sourceRow : '',
            ods_xml_row: chosenOds ? chosenOds.fileRowNumber : '',
            ods_code: chosenOds ? chosenOds.code : '',
            ods_provider: chosenOds ? chosenOds.proviser : '',
            ods_sortiment: chosenOds ? chosenOds.sortimentRaw : '',
            ods_paper_type_raw: chosenOds ? chosenOds.paperTypeRaw : '',
            ods_coat_raw: chosenOds ? chosenOds.coatRaw : '',
            proposed_paper_type: chosenOds ? chosenOds.paperType : existingCategory,
            proposed_coating_status: chosenOds ? chosenOds.coatingStatus : 'UNKNOWN',
            proposed_coating_confidence: chosenOds ? chosenOds.coatingConfidence : 'NONE',
            proposed_finish: chosenOds ? chosenOds.finish : existingFinish,
            proposed_grain_direction: existingGrain,
            proposed_original_code: chosenOds ? (chosenOds.originalCode || '') : '',
            proposed_supplier_code: chosenOds ? chosenOds.supplierCodeNormalized : '',
            classification,
            sub_classification: subClassification,
            eligible_for_auto_update: eligibleForAutoUpdate,
            rules_applied: chosenOds ? chosenOds.rulesApplied.join('|') : '',
            flags: chosenOds ? chosenOds.flags.join('|') : '',
            notes
        });
    }

    return {
        counts,
        totalVariants: catalogVariants.length,
        matrix
    };
}

module.exports = {
    CANONICAL_PAPER_TYPES,
    CANONICAL_COATING_STATUSES,
    CANONICAL_FINISHES,
    CANONICAL_GRAIN_DIRECTIONS,
    RECONCILIATION_CLASSIFICATIONS,
    decodeOdsCellText,
    normalizeCatalogProductName,
    normalizeOdsDimensionToMm,
    normalizeGrainDirectionToken,
    normalizeSupplierProviser,
    normalizeMultilingualPaperAttributes,
    resolveVariantTechnicalAttributes,
    reconcileVariantsWithOdsSource
};
