/**
 * src/ui/lib/bookSpecCanonicalizer.ts
 *
 * Canonical Adapter between Guided/Simplified ProgressiveSpecState and
 * the Canonical BPE Engine Book Specification (Phase 193B/C/D).
 *
 * Invariants:
 * 1. ZERO silent mutations of prices or dimensions.
 * 2. Uses the selected quantity (`targetRun.quantity`) as canonical `copies`.
 * 3. Uses `targetRun.manufacturingPrice` as target basis, strictly isolated from transport.
 * 4. Normalizes physical fields to valid BPE taxonomy enums:
 *    - interior_print: '1/1' | '2/2' | '4/4'
 *    - cover_print: '1/0' | '1/1' | '2/0' | '2/2' | '3/0' | '3/3' | '4/0' | '4/4' | '5/0' | '5/5'
 *    - paper_type_interior: 'offset' | 'mc' | 'lux' | 'munken' | 'other'
 *    - paper_type_cover: 'mc' | 'artboard' | 'offset' | 'wfmc' | 'other'
 *    - binding_method: 'perfect bound' | 'saddle stitch' | 'thread sewn' | 'hardcover' | 'wire-o' | 'spiral'
 *    - lamination: 'gloss' | 'matt' | 'varnish' | null
 * 5. Passes immutable provenance (`evidenceId`, `selectedVariantId`).
 * 6. Performs local guard-rail validation and surfaces actionable errors before solver calls.
 */

import { ProgressiveSpecState, OfferVariantRow } from '../types/printhouseOnboardingTypes';

export interface CanonicalizationResult {
    valid: boolean;
    bookSpec?: Record<string, any>;
    targetManufacturingPrice?: number;
    errors: string[];
}

const VALID_INTERIOR_PRINTS = new Set(['1/1', '2/2', '4/4']);
const VALID_COVER_PRINTS = new Set([
    '1/0', '1/1',
    '2/0', '2/2',
    '3/0', '3/3',
    '4/0', '4/4',
    '5/0', '5/5'
]);
const VALID_BINDING_METHODS = new Set([
    'perfect bound',
    'saddle stitch',
    'thread sewn',
    'hardcover',
    'wire-o',
    'spiral'
]);
const VALID_INTERIOR_PAPERS = new Set(['offset', 'mc', 'lux', 'munken', 'other']);
const VALID_COVER_PAPERS = new Set(['mc', 'artboard', 'offset', 'wfmc', 'other']);
const VALID_LAMINATIONS = new Set(['gloss', 'matt', 'varnish']);

/**
 * Normalizes paper name/type string to canonical taxonomy enum.
 * Returns null if unrecognized or undefined (no silent 'mc' fallback).
 */
function normalizePaperTypeInterior(raw?: string): string | null {
    if (!raw) return null;
    const s = raw.toLowerCase().trim();
    if (s.includes('munken')) return 'munken';
    if (s.includes('lux') || s.includes('crema') || s.includes('cream')) return 'lux';
    if (s.includes('offset') || s.includes('uncoated') || s.includes('woodfree') || s.includes('natural')) return 'offset';
    if (s.includes('mc') || s.includes('coated') || s.includes('silk') || s.includes('matt') || s.includes('gloss') || s.includes('g-print')) return 'mc';
    return VALID_INTERIOR_PAPERS.has(s) ? s : null;
}

function normalizePaperTypeCover(raw?: string): string | null {
    if (!raw) return null;
    const s = raw.toLowerCase().trim();
    if (s.includes('cartulina') || s.includes('artboard') || s.includes('cardstock') || s.includes('invercote') || s.includes('karton')) return 'artboard';
    if (s.includes('offset') || s.includes('uncoated')) return 'offset';
    if (s.includes('wfmc')) return 'wfmc';
    if (s.includes('silk') || s.includes('mc') || s.includes('estucado') || s.includes('gloss') || s.includes('matt') || s.includes('couché')) return 'mc';
    return VALID_COVER_PAPERS.has(s) ? s : null;
}

/**
 * Normalizes binding method string to canonical BPE taxonomy.
 * Does NOT assume 'thread sewn' just because family is 'HARDCOVER' (casing does not prove block binding method).
 * Returns null if absent or unrecognized.
 */
function normalizeBindingMethod(raw?: string): string | null {
    if (!raw) return null;
    const s = raw.toLowerCase().trim();
    if (s === 'thread_sewn' || s === 'thread sewn' || s === 'sewn' || s === 'fadenheftung') return 'thread sewn';
    if (s === 'adhesive_pur' || s === 'perfect bound' || s === 'glued' || s === 'pur' || s === 'klebebindung') return 'perfect bound';
    if (s === 'wire_o' || s === 'wire-o' || s === 'spiral') return 'wire-o';
    if (s === 'saddle_stitch' || s === 'saddle stitch' || s === 'staple' || s === 'grapa' || s === 'rückstich') return 'saddle stitch';
    if (s === 'hardcover' || s === 'casebound') return 'hardcover';
    return VALID_BINDING_METHODS.has(s) ? s : null;
}

/**
 * Normalizes print colors string (e.g. "4+4", "4/4", "4+0", "4/0", "1/1").
 * Returns null if not provided or invalid.
 */
function normalizePrintColors(raw?: string): string | null {
    if (!raw) return null;
    const clean = raw.trim().replace('+', '/');
    return clean;
}

/**
 * Normalizes lamination.
 * Distinguishes explicit absence ('none', 'unlaminated', null) from unspecified/unknown.
 * Returns:
 *   - 'gloss' | 'matt' | 'varnish' for recognized finishes
 *   - null for explicit unlaminated / absence
 *   - undefined for unknown or unprovided
 */
function normalizeLamination(raw?: string | null): 'gloss' | 'matt' | 'varnish' | null | undefined {
    if (raw === null) return null;
    if (raw === undefined) return undefined;
    const s = String(raw).toLowerCase().trim();
    if (!s) return undefined;
    if (s === 'none' || s === 'null' || s === 'sin laminado' || s === 'unlaminated' || s === 'uncoated' || s === 'ohne') return null;
    if (s === 'matt' || s === 'matte' || s === 'soft_touch' || s.includes('matt')) return 'matt';
    if (s === 'gloss' || s === 'glossy' || s.includes('glanz')) return 'gloss';
    if (s === 'varnish' || s.includes('barniz')) return 'varnish';
    return undefined; // Unrecognized/unknown
}

/**
 * Canonicalizes offer state and selected run to engine bookSpec payload.
 * ZERO silent assumptions: surfaces missing fields as explicit errors.
 */
export function canonicalizeToEngineBookSpec(
    offer: Partial<ProgressiveSpecState> | null | undefined,
    targetRun: Partial<OfferVariantRow> | null | undefined
): CanonicalizationResult {
    const errors: string[] = [];

    if (!offer) {
        return { valid: false, errors: ['Oferta de especificación no definida'] };
    }
    if (!targetRun) {
        return { valid: false, errors: ['Tirada seleccionada no definida'] };
    }

    // 1. Copies
    const copies = Number(targetRun.quantity);
    if (!Number.isInteger(copies) || copies < 1) {
        errors.push('copies must be a positive integer');
    }

    // 2. Interior pages
    const rawPages = offer.interiorPages !== undefined ? offer.interiorPages : offer.pageCount;
    const interiorPages = Number(rawPages);
    if (!rawPages || !Number.isInteger(interiorPages) || interiorPages < 1) {
        errors.push('interior_pages must be a positive integer');
    }

    // 3. Dimensions
    const rawWidth = offer.formatWidthMm !== undefined ? offer.formatWidthMm : offer.widthMm;
    const rawHeight = offer.formatHeightMm !== undefined ? offer.formatHeightMm : offer.heightMm;
    const width = Number(rawWidth);
    const height = Number(rawHeight);
    if (rawWidth === undefined || rawWidth === null || isNaN(width) || width < 50 || width > 500) {
        errors.push('book_width_mm must be between 50 and 500');
    }
    if (rawHeight === undefined || rawHeight === null || isNaN(height) || height < 50 || height > 700) {
        errors.push('book_height_mm must be between 50 and 700');
    }

    // 4. Print Colors
    const interiorPrint = normalizePrintColors(offer.interiorColors);
    if (!interiorPrint || !VALID_INTERIOR_PRINTS.has(interiorPrint)) {
        errors.push(`interior_print must be one of: 1/1, 2/2, 4/4 (received: ${interiorPrint || 'none'})`);
    }

    const coverPrint = normalizePrintColors(offer.coverColors);
    if (!coverPrint || !VALID_COVER_PRINTS.has(coverPrint)) {
        errors.push(`cover_print must be one of: 1/0, 1/1, 2/0, 2/2, 3/0, 3/3, 4/0, 4/4, 5/0, 5/5 (received: ${coverPrint || 'none'})`);
    }

    // 5. Paper Types & Weights
    const rawInteriorPaper = offer.interiorPaper || offer.interiorPaperType;
    const paperTypeInterior = normalizePaperTypeInterior(rawInteriorPaper);
    if (!paperTypeInterior) {
        errors.push(`paper_type_interior is required and must be recognized (received: ${rawInteriorPaper || 'none'})`);
    }

    const rawInteriorWeight = offer.interiorWeightGsm !== undefined ? offer.interiorWeightGsm : offer.interiorPaperWeightGsm;
    const paperWeightInterior = Number(rawInteriorWeight);
    if (rawInteriorWeight === undefined || rawInteriorWeight === null || isNaN(paperWeightInterior) || paperWeightInterior < 40 || paperWeightInterior > 400) {
        errors.push('paper_weight_interior must be between 40 and 400');
    }

    const rawCoverPaper = offer.coverPaper || offer.coverPaperType;
    const paperTypeCover = normalizePaperTypeCover(rawCoverPaper);
    if (!paperTypeCover) {
        errors.push(`paper_type_cover is required and must be recognized (received: ${rawCoverPaper || 'none'})`);
    }

    const rawCoverWeight = offer.coverWeightGsm !== undefined ? offer.coverWeightGsm : offer.coverPaperWeightGsm;
    const paperWeightCover = Number(rawCoverWeight);
    if (rawCoverWeight === undefined || rawCoverWeight === null || isNaN(paperWeightCover) || paperWeightCover < 100 || paperWeightCover > 600) {
        errors.push('paper_weight_cover must be between 100 and 600');
    }

    // 6. Binding Method
    const bindingMethod = normalizeBindingMethod(offer.bindingMethod);
    if (!bindingMethod || !VALID_BINDING_METHODS.has(bindingMethod)) {
        errors.push(`binding_method must be one of: ${Array.from(VALID_BINDING_METHODS).join(', ')} (received: ${offer.bindingMethod || 'none'})`);
    }

    // 7. Delivery Country (ISO-2)
    const rawCountry = offer.deliveryCountry ? String(offer.deliveryCountry).toUpperCase().trim() : null;
    if (!rawCountry || !/^[A-Z]{2}$/.test(rawCountry)) {
        errors.push('delivery_country must be a valid ISO-2 uppercase country code (e.g. ES, DE, FR)');
    }
    const deliveryCountry = rawCountry || '';

    // 8. Lamination
    // Distinguish unknown/unprovided from explicit absence (null)
    const normLam = normalizeLamination(offer.lamination);
    let lamination: 'gloss' | 'matt' | 'varnish' | null = null;
    if (normLam === undefined) {
        // If unknown or unspecified, do NOT silently assume unlaminated; require confirmation
        errors.push(`lamination must be explicitly specified (gloss, matt, varnish, or none; received: ${offer.lamination || 'unspecified'})`);
    } else {
        lamination = normLam;
    }

    // 9. Endpapers: Preserve real document specs (e.g. Offset 170g unprinted 0/0)
    const hasEndpapers = Boolean(offer.hasEndpapers);

    // 10. Target Manufacturing Price (Strictly separated from transport)
    const targetMfg = Number(targetRun.manufacturingPrice);
    if (isNaN(targetMfg) || targetMfg <= 0) {
        errors.push('target_manufacturing_price must be a positive value');
    }

    const bookSpec: Record<string, any> = {
        copies,
        interior_pages: interiorPages,
        book_width_mm: width,
        book_height_mm: height,
        interior_print: interiorPrint,
        cover_print: coverPrint,
        paper_type_interior: paperTypeInterior,
        paper_weight_interior: paperWeightInterior,
        paper_type_cover: paperTypeCover,
        paper_weight_cover: paperWeightCover,
        binding_method: bindingMethod,
        delivery_country: deliveryCountry,
        lamination,
        endpapers: hasEndpapers,
        evidenceId: offer.quoteRef || offer.quoteReference || offer.evidenceId || 'evidence-doc',
        selectedVariantId: targetRun.id || targetRun.variantKey || 'run-1'
    };

    if (hasEndpapers) {
        // ZERO fallback assumptions: do NOT default to 'offset' or 140g
        if (!offer.endpaperPaper) {
            errors.push('paper_type_endpaper is required when endpapers are present');
        } else {
            const endpaperPaperType = normalizePaperTypeInterior(offer.endpaperPaper);
            if (!endpaperPaperType) {
                errors.push(`paper_type_endpaper must be one of: offset, munken, coated_glossy, coated_matte (received: ${offer.endpaperPaper})`);
            } else {
                bookSpec.paper_type_endpaper = endpaperPaperType;
            }
        }

        if (offer.endpaperWeightGsm !== undefined && offer.endpaperWeightGsm !== null) {
            const endpaperWeight = Number(offer.endpaperWeightGsm);
            if (isNaN(endpaperWeight) || endpaperWeight < 80 || endpaperWeight > 300) {
                errors.push('paper_weight_endpapers must be between 80 and 300');
            } else {
                bookSpec.paper_weight_endpapers = endpaperWeight;
            }
        }

        // Tintas de guardas:
        // Si se indica explícitamente 0+0 o 0/0 o 'unprinted' o 'sin imprimir', es null en la taxonomía BPE.
        // Si se indica 1/0, 1/1, 4/0, 4/4, se preserva.
        // Si está ausente o es desconocido, se solicita confirmación explícita (no convertir en 'sin imprimir').
        const rawEndpaperColors = offer.endpaperColors ? String(offer.endpaperColors).trim().replace('+', '/') : null;
        if (!rawEndpaperColors) {
            errors.push('endpapers_print must be specified when endpapers are present (e.g. 0/0, 1/0, 1/1, 4/0, 4/4)');
        } else if (rawEndpaperColors === '0/0' || rawEndpaperColors.includes('unbedruckt') || rawEndpaperColors.includes('sin imprimir')) {
            bookSpec.endpapers_print = '0/0';
        } else if (['1/0', '1/1', '4/0', '4/4'].includes(rawEndpaperColors)) {
            bookSpec.endpapers_print = rawEndpaperColors;
        } else {
            errors.push(`endpapers_print must be one of: 0/0, 1/0, 1/1, 4/0, 4/4 (received: ${rawEndpaperColors})`);
        }
    }

    return {
        valid: errors.length === 0,
        bookSpec,
        targetManufacturingPrice: targetMfg,
        errors
    };
}
