/**
 * src/api/services/buildPriceCalibrationAdapter.js
 *
 * Phase 193C — Pure In-Memory Forward Pricing Adapter for Calibration.
 *
 * Responsibilities:
 * 1. Consumes the immutable reference book physical spec.
 * 2. Translates physical taxonomy (e.g. '1/1', 'perfect bound', '4/0') into
 *    the exact canonical structure consumed by forward pricing.
 * 3. Takes a cloned rate snapshot and applies candidate patch overrides strictly in memory.
 * 4. DELEGATES 100% of forward pricing calculations to canonical buildPrice(params, house)
 *    from @ppos/pricing-engine (git-pinned dependency).
 * 5. Returns lines, sub-totals, and predicted total cost without mutating any persistent state.
 * 6. NO duplicate formulas: sheets, printing, binding, lamination, and waste calculations
 *    belong exclusively to canonical buildPrice.
 * 7. ZERO development fallbacks: strictly requires @ppos/pricing-engine with fail-closed semantics.
 */

// Load canonical BPE package (git-pinned to 8d324290d64b5bf17325ff1098db7ebb5f646b5d)
let canonicalPricingEngine = null;
const enginePackage = '@ppos/pricing-engine';
const engineVersion = '1.0.0';
const engineCommit = '8d324290d64b5bf17325ff1098db7ebb5f646b5d';
const engineSource = 'git-pinned';

try {
    canonicalPricingEngine = require('@ppos/pricing-engine');
} catch (err) {
    canonicalPricingEngine = null;
}

// Pure deep clone for isolation
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
}

// Deterministic safe deep merge into clone
function applyPatchInMemory(target, source) {
    if (!target || typeof target !== 'object') target = {};
    if (!source || typeof source !== 'object') return target;

    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        const sVal = source[key];
        const tVal = target[key];
        if (sVal !== null && typeof sVal === 'object' && !Array.isArray(sVal) &&
            tVal !== null && typeof tVal === 'object' && !Array.isArray(tVal)) {
            result[key] = applyPatchInMemory(tVal, sVal);
        } else {
            result[key] = sVal;
        }
    }
    return result;
}

class BuildPriceCalibrationAdapter {

    constructor() {
        this.enginePackage = enginePackage;
        this.engineVersion = engineVersion;
        this.engineCommit = engineCommit;
        this.engineSource = engineSource;
    }

    /**
     * Translates physical reference book spec to BPE forward calculation parameters.
     *
     * @param {Object} bookSpec - Physical job specification from calibration session
     * @returns {Object} Normalized parameters for BPE buildPrice
     */
    adaptBookSpec(bookSpec, options = {}) {
        if (!bookSpec || typeof bookSpec !== 'object') {
            throw new Error('INVALID_BOOK_SPEC_FOR_ADAPTER');
        }

        const copies = Number(bookSpec.copies) || 1;
        const interiorPages = Number(bookSpec.interior_pages) || 1;
        const signatureSize = Number(options.signatureSize) || 16; // Dynamic signature from BPE evaluation or canonical 16p
        const sectionsCount = Number(options.sectionsCount) || Math.max(1, Math.ceil(interiorPages / signatureSize));

        // Physical color mapping to internal rate selectors
        let interiorColorKey = 'one';
        if (bookSpec.interior_print === '2/2') interiorColorKey = 'two';
        if (bookSpec.interior_print === '4/4') interiorColorKey = 'full';

        // Cover colors: '4/0' or '4/4' -> '4'; '1/0' or '1/1' -> '1'; '2/0' or '2/2' -> '2'
        const coverPrintStr = String(bookSpec.cover_print || '4/0');
        const frontColors = coverPrintStr.split('/')[0] || '4';
        const coverColorKey = frontColors;

        // Binding method mapping
        const bindingMap = {
            'perfect bound': 'pb',
            'saddle stitch': 'ss',
            'thread sewn': 'ts',
            'hardcover': 'hc',
            'wire-o': 'wo',
            'spiral': 'sp'
        };
        const bindingCode = bindingMap[bookSpec.binding_method] || 'pb';

        // Lamination
        const laminationType = bookSpec.lamination || null; // 'gloss' | 'matt' | 'varnish' | null
        const uvVarnishActive = Boolean(bookSpec.uv_varnish);

        // Destination country mapping: supports lowercase ISO-2 and canonical BPE country names
        const rawCountry = String(bookSpec.delivery_country || 'ES').trim();
        const countryIsoUpper = rawCountry.toUpperCase();
        
        const COUNTRY_NAME_MAP = {
            'ES': 'es',
            'DE': 'de',
            'FR': 'fr',
            'IT': 'it',
            'BE': 'be',
            'NL': 'nl',
            'AT': 'at',
            'PL': 'poland',
            'HU': 'hungary',
            'FI': 'finland',
            'GB': 'gb',
            'UK': 'gb',
            'PT': 'pt'
        };

        const countryCode = COUNTRY_NAME_MAP[countryIsoUpper] || countryIsoUpper.toLowerCase();

        // Endpaper semantics
        let endpapers = bookSpec.endpapers !== undefined ? bookSpec.endpapers : null;
        let endpapersPrint = bookSpec.endpapers_print !== undefined ? bookSpec.endpapers_print : null;
        let paperTypeEndpaper = bookSpec.paper_type_endpaper || 'offset';
        let paperWeightEndpapers = Number(bookSpec.paper_weight_endpapers) || 115;

        // Hardcover defaults matching canonical PriceEngine / Normalizer
        if (bindingCode === 'hc') {
            if (endpapers === null || endpapers === undefined) endpapers = 'standard';
            if (!endpapersPrint) endpapersPrint = '4/0';
        } else if (endpapers === null || endpapers === undefined) {
            endpapers = 'none';
            if (!endpapersPrint) endpapersPrint = 'none';
        }

        return {
            copies,
            interiorPages,
            signatureSize,
            sectionsCount,
            interiorColorKey,
            coverColorKey,
            bindingCode,
            laminationType,
            uvVarnishActive,
            endpapers,
            endpapersPrint,
            paperTypeInterior: bookSpec.paper_type_interior || 'offset',
            paperTypeCover: bookSpec.paper_type_cover || 'mc',
            paperTypeEndpaper,
            paperWeightEndpapers,
            deliveryCountry: countryCode,
            deliveryCountryIso: countryIsoUpper
        };
    }

    /**
     * Executes canonical forward pricing calculation purely in memory by invoking
     * the canonical buildPrice() function from @ppos/pricing-engine.
     *
     * @param {Object} bookSpec - Physical job specification
     * @param {Object} ratesSnapshot - Immutable baseline rates_json snapshot
     * @param {Object} [candidateOverrides] - Optional candidate patch to overlay in memory
     * @param {Object} [nodeConfig] - Optional printer node configuration
     * @returns {Object} Predicted costs and line-by-line decomposition
     */
    evaluateForwardPrice(bookSpec, ratesSnapshot, candidateOverrides = {}, nodeConfig = {}) {
        if (!canonicalPricingEngine || typeof canonicalPricingEngine.buildPrice !== 'function') {
            const err = new Error('CALIBRATION_ENGINE_UNAVAILABLE');
            err.code = 'CALIBRATION_ENGINE_UNAVAILABLE';
            throw err;
        }

        // Guarantee in-memory isolation
        const mergedRates = applyPatchInMemory(deepClone(ratesSnapshot || {}), candidateOverrides);

        // 1. Build canonical BPE params from bookSpec
        const bpeParams = {
            copies: Number(bookSpec.copies) || 1,
            interior_pages: Number(bookSpec.interior_pages) || 1,
            cover_pages: 4,
            book_width_mm: Number(bookSpec.book_width_mm) || 148,
            book_height_mm: Number(bookSpec.book_height_mm) || 210,
            paper_weight_interior: Number(bookSpec.paper_weight_interior) || 80,
            paper_weight_cover: Number(bookSpec.paper_weight_cover) || 250,
            paper_type_interior: bookSpec.paper_type_interior || 'offset',
            paper_type_cover: bookSpec.paper_type_cover || 'mc',
            interior_print: bookSpec.interior_print || '1/1',
            cover_print: bookSpec.cover_print || '4/0',
            binding_method: bookSpec.binding_method || 'perfect bound',
            finishing_options: bookSpec.lamination ? `${bookSpec.lamination} lamination` : 'none',
            uv_varnish: Boolean(bookSpec.uv_varnish),
            endpapers: bookSpec.endpapers !== undefined ? bookSpec.endpapers : (bookSpec.binding_method === 'hardcover' ? 'standard' : 'none'),
            endpapers_print: bookSpec.endpapers_print !== undefined ? bookSpec.endpapers_print : (bookSpec.binding_method === 'hardcover' ? '4/0' : 'none'),
            paper_type_endpaper: bookSpec.paper_type_endpaper || 'offset',
            paper_weight_endpapers: Number(bookSpec.paper_weight_endpapers) || 115,
            delivery_country: bookSpec.delivery_country || 'ES'
        };

        // 2. Build canonical synthetic house from node config and merged rates
        const syntheticHouse = {
            id: nodeConfig.id || 'calibration-node',
            name: nodeConfig.name || 'Calibration Node',
            signatures: Array.isArray(nodeConfig.signatures) && nodeConfig.signatures.length > 0 ? nodeConfig.signatures : null,
            production_lead_days: nodeConfig.production_lead_days || 7,
            shipping_days: nodeConfig.shipping_days || 2,
            rates: mergedRates
        };

        // 3. Invoke Canonical Forward Function buildPrice(params, house)
        const offer = canonicalPricingEngine.buildPrice(bpeParams, syntheticHouse);

        if (!offer || typeof offer.total_cost === 'undefined') {
            throw new Error('CANONICAL_BPE_INVOCATION_FAILED');
        }

        // 4. Extract decomposition and separate Shipping from Manufacturing total
        const lines = offer.lines || [];
        let shippingCost = 0.0;
        let manufacturingCost = 0.0;

        for (const ln of lines) {
            if (ln.line_total != null) {
                if (ln.item === 'Shipping' || String(ln.item).toLowerCase().includes('shipping')) {
                    shippingCost += Number(ln.line_total);
                } else {
                    manufacturingCost += Number(ln.line_total);
                }
            }
        }

        // If components debug is available, prefer debug subtotal
        if (offer.debug && offer.debug.components) {
            const c = offer.debug.components;
            shippingCost = Number(c.cost_ship || 0);
            manufacturingCost = Number((c.subtotal - shippingCost).toFixed(4));
        }

        return {
            predictedManufacturingPrice: Number(manufacturingCost.toFixed(4)),
            predictedTransportPrice: Number(shippingCost.toFixed(4)),
            totalPredictedPrice: Number((manufacturingCost + shippingCost).toFixed(4)),
            signature: offer.signature,
            sections: offer.sections,
            lines,
            debug: offer.debug,
            enginePackage: this.enginePackage,
            engineVersion: this.engineVersion,
            engineCommit: this.engineCommit,
            engineSource: this.engineSource
        };
    }
}

module.exports = new BuildPriceCalibrationAdapter();

