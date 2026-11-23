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

export type CanonicalMissingField =
    | 'copies'
    | 'interior_pages'
    | 'book_width_mm'
    | 'book_height_mm'
    | 'interior_print'
    | 'cover_print'
    | 'paper_type_interior'
    | 'paper_weight_interior'
    | 'paper_type_cover'
    | 'paper_weight_cover'
    | 'binding_method'
    | 'delivery_country'
    | 'lamination'
    | 'target_manufacturing_price';

export interface CanonicalizationResult {
    valid: boolean;
    bookSpec?: Record<string, any>;
    targetManufacturingPrice?: number;
    errors: string[];
    missingFields: CanonicalMissingField[];
}

/**
 * Translates canonicalizer validation error messages cleanly into DE, EN, or ES
 * without mixing languages.
 */
export function localizeCanonicalizerError(rawError: string, locale: string = 'es'): string {
    const lang = (locale || 'es').toLowerCase().startsWith('de')
        ? 'de'
        : (locale || 'es').toLowerCase().startsWith('en')
            ? 'en'
            : 'es';

    if (rawError.startsWith('lamination must be explicitly specified')) {
        if (lang === 'de') return 'Laminierung / Veredelung muss ausdrücklich gewählt werden (Matt, Glänzend, Schutzlack oder Keine).';
        if (lang === 'en') return 'Cover lamination / finish must be explicitly specified (Matt, Gloss, Varnish, or None).';
        return 'El laminado / acabado de cubierta debe especificarse explícitamente (Mate, Brillo, Barniz o Sin laminado).';
    }
    if (rawError.startsWith('interior_print must be one of')) {
        if (lang === 'de') return 'Innendruckfarben müssen angegeben werden (1/1, 2/2 oder 4/4).';
        if (lang === 'en') return 'Interior print colors must be specified (1/1, 2/2, or 4/4).';
        return 'Las tintas del interior deben especificarse (1/1, 2/2 o 4/4).';
    }
    if (rawError.startsWith('cover_print must be one of')) {
        if (lang === 'de') return 'Umschlagdruckfarben müssen angegeben werden (z. B. 4/0 oder 4/4).';
        if (lang === 'en') return 'Cover print colors must be specified (e.g. 4/0 or 4/4).';
        return 'Las tintas de cubierta deben especificarse (ej. 4/0 o 4/4).';
    }
    if (rawError.startsWith('paper_type_interior')) {
        if (lang === 'de') return 'Innenpapiertyp fehlt oder wurde nicht erkannt (z. B. Offset, Bilderdruck, Werkdruck).';
        if (lang === 'en') return 'Interior paper type is required and must be recognized (e.g. Offset, Coated, Uncoated).';
        return 'El tipo de papel interior es obligatorio y debe ser reconocido (ej. Offset, Estucado, Ahuesado).';
    }
    if (rawError.startsWith('paper_weight_interior')) {
        if (lang === 'de') return 'Grammatur des Innenpapiers muss zwischen 40 und 400 g/m² liegen.';
        if (lang === 'en') return 'Interior paper weight must be between 40 and 400 gsm.';
        return 'El gramaje del papel interior debe estar entre 40 y 400 g/m².';
    }
    if (rawError.startsWith('paper_type_cover')) {
        if (lang === 'de') return 'Umschlagpapiertyp fehlt oder wurde nicht erkannt (z. B. Bilderdruckkarton, Offset).';
        if (lang === 'en') return 'Cover paper type is required and must be recognized (e.g. Artboard, Coated, Offset).';
        return 'El tipo de papel de cubierta es obligatorio y debe ser reconocido (ej. Cartulina, Estucado, Offset).';
    }
    if (rawError.startsWith('paper_weight_cover')) {
        if (lang === 'de') return 'Grammatur des Umschlagpapiers muss zwischen 100 und 600 g/m² liegen.';
        if (lang === 'en') return 'Cover paper weight must be between 100 and 600 gsm.';
        return 'El gramaje del papel de cubierta debe estar entre 100 y 600 g/m².';
    }
    if (rawError.startsWith('binding_method')) {
        if (lang === 'de') return 'Bindeart muss ausdrücklich angegeben werden (Klebebindung, Fadenheftung, Hardcover, Rückstichheftung oder Wire-O).';
        if (lang === 'en') return 'Binding method must be explicitly specified (Perfect bound, Thread sewn, Hardcover, Saddle stitch, or Wire-O).';
        return 'El método de encuadernación debe especificarse (Rústica fresada, Cosido hilo, Tapa dura, Grapa o Wire-O).';
    }
    if (rawError.startsWith('delivery_country')) {
        if (lang === 'de') return 'Lieferland muss ein gültiger ISO-2-Ländercode sein (z. B. DE, ES, LV).';
        if (lang === 'en') return 'Delivery country must be a valid ISO-2 country code (e.g. DE, ES, UK).';
        return 'El país de entrega debe ser un código ISO-2 válido (ej. ES, DE, FR).';
    }
    if (rawError.startsWith('copies must be')) {
        if (lang === 'de') return 'Auflagenmenge muss eine positive ganze Zahl sein.';
        if (lang === 'en') return 'Print run copies must be a positive integer.';
        return 'La tirada de ejemplares debe ser un número entero positivo.';
    }
    if (rawError.startsWith('interior_pages')) {
        if (lang === 'de') return 'Seitenzahl des Inhalts muss eine positive ganze Zahl sein.';
        if (lang === 'en') return 'Interior page count must be a positive integer.';
        return 'El número de páginas interiores debe ser un entero positivo.';
    }
    if (rawError.startsWith('book_width_mm')) {
        if (lang === 'de') return 'Buchbreite muss zwischen 50 und 500 mm liegen.';
        if (lang === 'en') return 'Book width must be between 50 and 500 mm.';
        return 'El ancho del libro debe estar entre 50 y 500 mm.';
    }
    if (rawError.startsWith('book_height_mm')) {
        if (lang === 'de') return 'Buchhöhe muss zwischen 50 und 700 mm liegen.';
        if (lang === 'en') return 'Book height must be between 50 and 700 mm.';
        return 'El alto del libro debe estar entre 50 y 700 mm.';
    }
    if (rawError.startsWith('target_manufacturing_price')) {
        if (lang === 'de') return 'Vorgegebener Fertigungspreis (ohne Transport) muss größer als 0 € sein.';
        if (lang === 'en') return 'Target manufacturing price (excluding freight) must be greater than €0.';
        return 'El precio objetivo de fabricación (sin transporte) debe ser superior a 0 €.';
    }

    return rawError;
}

export function formatCanonicalizerErrors(errors: string[], locale: string = 'es'): string {
    return errors.map((e) => localizeCanonicalizerError(e, locale)).join(' ');
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
export function normalizeLamination(raw?: string | null): 'gloss' | 'matt' | 'varnish' | null | undefined {
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
    const missingFields: CanonicalMissingField[] = [];

    if (!offer) {
        return { valid: false, errors: ['Oferta de especificación no definida'], missingFields: [] };
    }
    if (!targetRun) {
        return { valid: false, errors: ['Tirada seleccionada no definida'], missingFields: [] };
    }

    // 1. Copies
    const copies = Number(targetRun.quantity);
    if (!Number.isInteger(copies) || copies < 1) {
        errors.push('copies must be a positive integer');
        missingFields.push('copies');
    }

    // 2. Interior pages
    const rawPages = offer.interiorPages !== undefined ? offer.interiorPages : offer.pageCount;
    const interiorPages = Number(rawPages);
    if (!rawPages || !Number.isInteger(interiorPages) || interiorPages < 1) {
        errors.push('interior_pages must be a positive integer');
        missingFields.push('interior_pages');
    }

    // 3. Dimensions
    const rawWidth = offer.formatWidthMm !== undefined ? offer.formatWidthMm : offer.widthMm;
    const rawHeight = offer.formatHeightMm !== undefined ? offer.formatHeightMm : offer.heightMm;
    const width = Number(rawWidth);
    const height = Number(rawHeight);
    if (rawWidth === undefined || rawWidth === null || isNaN(width) || width < 50 || width > 500) {
        errors.push('book_width_mm must be between 50 and 500');
        missingFields.push('book_width_mm');
    }
    if (rawHeight === undefined || rawHeight === null || isNaN(height) || height < 50 || height > 700) {
        errors.push('book_height_mm must be between 50 and 700');
        missingFields.push('book_height_mm');
    }

    // 4. Print Colors
    const interiorPrint = normalizePrintColors(offer.interiorColors);
    if (!interiorPrint || !VALID_INTERIOR_PRINTS.has(interiorPrint)) {
        errors.push(`interior_print must be one of: 1/1, 2/2, 4/4 (received: ${interiorPrint || 'none'})`);
        missingFields.push('interior_print');
    }

    const coverPrint = normalizePrintColors(offer.coverColors);
    if (!coverPrint || !VALID_COVER_PRINTS.has(coverPrint)) {
        errors.push(`cover_print must be one of: 1/0, 1/1, 2/0, 2/2, 3/0, 3/3, 4/0, 4/4, 5/0, 5/5 (received: ${coverPrint || 'none'})`);
        missingFields.push('cover_print');
    }

    // 5. Paper Types & Weights
    const rawInteriorPaper = offer.interiorPaper || offer.interiorPaperType;
    const paperTypeInterior = normalizePaperTypeInterior(rawInteriorPaper);
    if (!paperTypeInterior) {
        errors.push(`paper_type_interior is required and must be recognized (received: ${rawInteriorPaper || 'none'})`);
        missingFields.push('paper_type_interior');
    }

    const rawInteriorWeight = offer.interiorWeightGsm !== undefined ? offer.interiorWeightGsm : offer.interiorPaperWeightGsm;
    const paperWeightInterior = Number(rawInteriorWeight);
    if (rawInteriorWeight === undefined || rawInteriorWeight === null || isNaN(paperWeightInterior) || paperWeightInterior < 40 || paperWeightInterior > 400) {
        errors.push('paper_weight_interior must be between 40 and 400');
        missingFields.push('paper_weight_interior');
    }

    const rawCoverPaper = offer.coverPaper || offer.coverPaperType;
    const paperTypeCover = normalizePaperTypeCover(rawCoverPaper);
    if (!paperTypeCover) {
        errors.push(`paper_type_cover is required and must be recognized (received: ${rawCoverPaper || 'none'})`);
        missingFields.push('paper_type_cover');
    }

    const rawCoverWeight = offer.coverWeightGsm !== undefined ? offer.coverWeightGsm : offer.coverPaperWeightGsm;
    const paperWeightCover = Number(rawCoverWeight);
    if (rawCoverWeight === undefined || rawCoverWeight === null || isNaN(paperWeightCover) || paperWeightCover < 100 || paperWeightCover > 600) {
        errors.push('paper_weight_cover must be between 100 and 600');
        missingFields.push('paper_weight_cover');
    }

    // 6. Binding Method
    const bindingMethod = normalizeBindingMethod(offer.bindingMethod);
    if (!bindingMethod || !VALID_BINDING_METHODS.has(bindingMethod)) {
        errors.push(`binding_method must be one of: ${Array.from(VALID_BINDING_METHODS).join(', ')} (received: ${offer.bindingMethod || 'none'})`);
        missingFields.push('binding_method');
    }

    // 7. Delivery Country (ISO-2)
    const rawCountry = offer.deliveryCountry ? String(offer.deliveryCountry).toUpperCase().trim() : null;
    if (!rawCountry || !/^[A-Z]{2}$/.test(rawCountry)) {
        errors.push('delivery_country must be a valid ISO-2 uppercase country code (e.g. ES, DE, FR)');
        missingFields.push('delivery_country');
    }
    const deliveryCountry = rawCountry || '';

    // 8. Lamination
    // Distinguish unknown/unprovided from explicit absence (null)
    const normLam = normalizeLamination(offer.lamination);
    let lamination: 'gloss' | 'matt' | 'varnish' | null = null;
    if (normLam === undefined) {
        // If unknown or unspecified, do NOT silently assume unlaminated; require confirmation
        errors.push(`lamination must be explicitly specified (gloss, matt, varnish, or none; received: ${offer.lamination || 'unspecified'})`);
        missingFields.push('lamination');
    } else {
        lamination = normLam;
    }

    // 9. Endpapers: Preserve real document specs (e.g. Offset 170g unprinted 0/0)
    const hasEndpapers = Boolean(offer.hasEndpapers);

    // 10. Target Manufacturing Price (Strictly separated from transport)
    const targetMfg = Number(targetRun.manufacturingPrice);
    if (isNaN(targetMfg) || targetMfg <= 0) {
        errors.push('target_manufacturing_price must be a positive value');
        missingFields.push('target_manufacturing_price');
    }

    const isHardcover = offer.family === 'HARDCOVER' || offer.product_family === 'HARDCOVER' || (offer as any).construction === 'hardcover' || bindingMethod === 'hardcover';

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
        product_family: isHardcover ? 'HARDCOVER' : 'SOFTCOVER',
        family: isHardcover ? 'HARDCOVER' : 'SOFTCOVER',
        construction: isHardcover ? 'hardcover' : 'softcover',
        block_binding_method: bindingMethod || (isHardcover ? 'thread sewn' : 'perfect bound'),
        binding_method: isHardcover ? 'hardcover' : (bindingMethod || 'perfect bound'),
        delivery_country: deliveryCountry,
        lamination,
        endpapers: hasEndpapers,
        evidenceId: offer.quoteRef || offer.quoteReference || offer.evidenceId || 'evidence-doc',
        selectedVariantId: targetRun.id || targetRun.variantKey || 'run-1'
    };

    if (offer.boardThicknessMm) {
        bookSpec.board_thickness_mm = Number(offer.boardThicknessMm);
    }

    if (hasEndpapers) {
        bookSpec.endpaper_provenance = offer.endpaperProvenance || (offer.endpaperPaper ? 'document_extracted' : 'user_supplied');
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
        } else if (offer.endpaperPaper) {
            const mWeight = String(offer.endpaperPaper).match(/\b(\d{2,3})\s*g\b/i);
            if (mWeight) {
                const parsedWeight = parseInt(mWeight[1], 10);
                if (parsedWeight >= 80 && parsedWeight <= 300) {
                    bookSpec.paper_weight_endpapers = parsedWeight;
                }
            }
        }

        // Tintas de guardas:
        // Si se indica explícitamente 0+0 o 0/0 o 'unprinted' o 'sin imprimir', es '0/0' en la taxonomía BPE.
        // Si se indica 1/0, 1/1, 4/0, 4/4, se preserva.
        // Si está ausente o es desconocido, se solicita confirmación explícita (no convertir en 'sin imprimir').
        let rawEndpaperColors = offer.endpaperColors ? String(offer.endpaperColors).trim().replace('+', '/') : null;
        if (!rawEndpaperColors && offer.endpaperPaper) {
            const paperStr = String(offer.endpaperPaper).toLowerCase();
            if (paperStr.includes('sin imprimir') || paperStr.includes('unbedruckt') || paperStr.includes('0/0') || paperStr.includes('0+0') || paperStr.includes('unprinted')) {
                rawEndpaperColors = '0/0';
            } else if (/\b([14]\/[014]|[14]\+[014])\b/.test(paperStr)) {
                const m = paperStr.match(/\b([14]\/[014]|[14]\+[014])\b/);
                if (m) rawEndpaperColors = m[1].replace('+', '/');
            }
        }

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
        errors,
        missingFields
    };
}
