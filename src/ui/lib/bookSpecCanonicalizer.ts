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
 */
function normalizePaperTypeInterior(raw?: string): string {
    if (!raw) return 'mc';
    const s = raw.toLowerCase().trim();
    if (s.includes('munken')) return 'munken';
    if (s.includes('lux') || s.includes('crema') || s.includes('cream')) return 'lux';
    if (s.includes('offset') || s.includes('uncoated') || s.includes('woodfree') || s.includes('natural')) return 'offset';
    if (s.includes('mc') || s.includes('coated') || s.includes('silk') || s.includes('matt') || s.includes('gloss') || s.includes('g-print')) return 'mc';
    return VALID_INTERIOR_PAPERS.has(s) ? s : 'mc';
}

function normalizePaperTypeCover(raw?: string): string {
    if (!raw) return 'mc';
    const s = raw.toLowerCase().trim();
    if (s.includes('cartulina') || s.includes('artboard') || s.includes('cardstock') || s.includes('invercote')) return 'artboard';
    if (s.includes('offset') || s.includes('uncoated')) return 'offset';
    if (s.includes('wfmc')) return 'wfmc';
    if (s.includes('silk') || s.includes('mc') || s.includes('estucado') || s.includes('gloss') || s.includes('matt') || s.includes('couché')) return 'mc';
    return VALID_COVER_PAPERS.has(s) ? s : 'mc';
}

/**
 * Normalizes binding method string to canonical BPE taxonomy.
 */
function normalizeBindingMethod(raw?: string, family?: string): string {
    if (!raw && family) {
        if (family === 'HARDCOVER') return 'thread sewn';
        if (family === 'SOFTCOVER') return 'perfect bound';
        if (family === 'WIRE_O') return 'wire-o';
        if (family === 'SADDLE_STITCH') return 'saddle stitch';
    }
    const s = (raw || '').toLowerCase().trim();
    if (s === 'thread_sewn' || s === 'thread sewn' || s === 'sewn' || s === 'fadenheftung') return 'thread sewn';
    if (s === 'adhesive_pur' || s === 'perfect bound' || s === 'glued' || s === 'pur' || s === 'klebebindung') return 'perfect bound';
    if (s === 'wire_o' || s === 'wire-o' || s === 'spiral') return 'wire-o';
    if (s === 'saddle_stitch' || s === 'saddle stitch' || s === 'staple' || s === 'grapa' || s === 'rückstich') return 'saddle stitch';
    if (s === 'hardcover' || s === 'casebound') return 'thread sewn';
    return VALID_BINDING_METHODS.has(s) ? s : 'perfect bound';
}

/**
 * Normalizes print colors string (e.g. "4+4", "4/4", "4+0", "4/0", "1/1").
 */
function normalizePrintColors(raw?: string, defaultFallback = '4/4'): string {
    if (!raw) return defaultFallback;
    const clean = raw.trim().replace('+', '/');
    return clean;
}

/**
 * Normalizes lamination.
 */
function normalizeLamination(raw?: string): string | null {
    if (!raw) return null;
    const s = raw.toLowerCase().trim();
    if (s === 'none' || s === 'null' || s === 'sin laminado' || s === 'unlaminated') return null;
    if (s === 'matt' || s === 'matte' || s === 'soft_touch' || s.includes('matt')) return 'matt';
    if (s === 'gloss' || s === 'glossy' || s.includes('glanz')) return 'gloss';
    if (s === 'varnish' || s.includes('barniz')) return 'varnish';
    return VALID_LAMINATIONS.has(s) ? s : null;
}

/**
 * Canonicalizes offer state and selected run to engine bookSpec payload.
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
    const interiorPages = Number(offer.interiorPages || offer.pageCount);
    if (!Number.isInteger(interiorPages) || interiorPages < 1) {
        errors.push('interior_pages must be a positive integer');
    }

    // 3. Dimensions
    const width = Number(offer.formatWidthMm || offer.widthMm);
    const height = Number(offer.formatHeightMm || offer.heightMm);
    if (isNaN(width) || width < 50 || width > 500) {
        errors.push('book_width_mm must be between 50 and 500');
    }
    if (isNaN(height) || height < 50 || height > 700) {
        errors.push('book_height_mm must be between 50 and 700');
    }

    // 4. Print Colors
    const interiorPrint = normalizePrintColors(offer.interiorColors, '4/4');
    if (!VALID_INTERIOR_PRINTS.has(interiorPrint)) {
        errors.push(`interior_print must be one of: 1/1, 2/2, 4/4 (received: ${interiorPrint})`);
    }

    const coverPrint = normalizePrintColors(offer.coverColors, '4/0');
    if (!VALID_COVER_PRINTS.has(coverPrint)) {
        errors.push(`cover_print must be one of: 1/0, 1/1, 2/0, 2/2, 3/0, 3/3, 4/0, 4/4, 5/0, 5/5 (received: ${coverPrint})`);
    }

    // 5. Paper Types & Weights
    const paperTypeInterior = normalizePaperTypeInterior(offer.interiorPaper || offer.interiorPaperType);
    const paperWeightInterior = Number(offer.interiorWeightGsm || offer.interiorPaperWeightGsm || 90);
    if (isNaN(paperWeightInterior) || paperWeightInterior < 40 || paperWeightInterior > 400) {
        errors.push('paper_weight_interior must be between 40 and 400');
    }

    const paperTypeCover = normalizePaperTypeCover(offer.coverPaper || offer.coverPaperType);
    const paperWeightCover = Number(offer.coverWeightGsm || offer.coverPaperWeightGsm || 250);
    if (isNaN(paperWeightCover) || paperWeightCover < 100 || paperWeightCover > 600) {
        errors.push('paper_weight_cover must be between 100 and 600');
    }

    // 6. Binding Method
    const bindingMethod = normalizeBindingMethod(offer.bindingMethod, offer.family);
    if (!VALID_BINDING_METHODS.has(bindingMethod)) {
        errors.push(`binding_method must be one of: ${Array.from(VALID_BINDING_METHODS).join(', ')}`);
    }

    // 7. Delivery Country
    let deliveryCountry = (offer.deliveryCountry || 'DE').toUpperCase().trim();
    if (!/^[A-Z]{2}$/.test(deliveryCountry)) {
        deliveryCountry = 'DE';
    }

    // 8. Lamination
    const lamination = normalizeLamination(offer.lamination);

    // 9. Hardcover specifics
    const isHardcover = offer.family === 'HARDCOVER' || bindingMethod === 'hardcover' || bindingMethod === 'thread sewn';
    const endpapers = Boolean(offer.hasEndpapers || (isHardcover && offer.family === 'HARDCOVER'));

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
        endpapers,
        evidenceId: offer.quoteRef || offer.quoteReference || offer.evidenceId || 'evidence-doc',
        selectedVariantId: targetRun.id || targetRun.variantKey || 'run-1'
    };

    if (endpapers) {
        bookSpec.paper_type_endpaper = 'offset';
        bookSpec.paper_weight_endpapers = 140;
        // In BPE taxonomy, if endpapers are unprinted (0/0), endpapers_print is null/omitted.
        // If printed, must be one of: '1/0', '1/1', '4/0', '4/4'
        if (offer.endpaperColors && ['1/0', '1/1', '4/0', '4/4'].includes(offer.endpaperColors)) {
            bookSpec.endpapers_print = offer.endpaperColors;
        } else {
            bookSpec.endpapers_print = null;
        }
    }

    return {
        valid: errors.length === 0,
        bookSpec,
        targetManufacturingPrice: targetMfg,
        errors
    };
}
