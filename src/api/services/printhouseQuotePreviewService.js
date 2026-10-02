/**
 * src/api/services/printhouseQuotePreviewService.js
 *
 * Phase 193H — Canonical Governed Quote Smoke Test Service.
 *
 * Responsibilities:
 * 1. Resolves authenticated tenant and tenant-isolated printer node.
 * 2. Loads canonical active configuration (rates_json, limits, signatures, lead times).
 * 3. Validates requested job against enabled physical & capability constraints.
 * 4. Normalizes input and delegates 100% of forward pricing calculation to
 *    the canonical @ppos/pricing-engine buildPrice via buildPriceCalibrationAdapter.
 * 5. Resolves shipping region transit parameters and commercial price policies.
 * 6. Returns user-safe, structured pricing breakdown with configuration trace.
 *
 * INVARIANTS:
 * - ZERO DATABASE MUTATIONS (No orders, no jobs, no revisions, no rates writes).
 * - ZERO CLIENT-SIDE MATH (Backend owns totals, breakdown, and unit price).
 * - ZERO AI PRICING (Purely deterministic BPE evaluation).
 * - ZERO ACTIVATION GRANT MUTATIONS.
 */
const db = require('./mysqlClient');
const buildPriceAdapter = require('./buildPriceCalibrationAdapter');
const shippingRegionService = require('./printhouseShippingRegionService');
const priceBookService = require('./printhousePriceBookService');
const ruleService = require('./printhousePricingRuleService');
const { isValidIso2Country, normalizeIso2Country } = require('../../lib/countryCatalog');
const logger = require('./logger').child('quote-preview-service');

class PrinthouseQuotePreviewService {

    /**
     * Generates a governed, capability-aware quote preview using canonical BPE.
     *
     * @param {string} tenantId - From authenticated JWT
     * @param {Object} jobSpec - Physical book specification
     * @param {string} [printerNodeId] - Optional node selection (scoped to tenant)
     * @returns {Promise<Object>} User-safe quote breakdown
     */
    async generateQuotePreview(tenantId, jobSpec, printerNodeId = null) {
        if (!tenantId) {
            const err = new Error('UNAUTHORIZED_TENANT');
            err.statusCode = 401;
            throw err;
        }

        if (!jobSpec || typeof jobSpec !== 'object') {
            const err = new Error('INVALID_JOB_SPEC: Job specification object is required.');
            err.statusCode = 400;
            throw err;
        }

        // 1. Resolve Printer Node (Tenant Isolated)
        let nodeQuery = 'SELECT id, tenant_id, name, rates_json, signatures, limits, production_lead_days, delivery_time FROM printer_nodes WHERE tenant_id = ? AND status != "DELETED"';
        const nodeParams = [tenantId];

        if (printerNodeId) {
            nodeQuery += ' AND id = ?';
            nodeParams.push(printerNodeId);
        }
        nodeQuery += ' LIMIT 1';

        const [node] = await db.query(nodeQuery, nodeParams);
        if (!node) {
            const err = new Error('PRINTER_NODE_NOT_FOUND: No active printer node found for tenant.');
            err.statusCode = 404;
            throw err;
        }

        // 2. Parse Node Rates Snapshot
        let ratesSnapshot = {};
        if (node.rates_json) {
            try {
                ratesSnapshot = typeof node.rates_json === 'string' ? JSON.parse(node.rates_json) : node.rates_json;
            } catch (e) {
                ratesSnapshot = {};
            }
        }

        if (!ratesSnapshot || Object.keys(ratesSnapshot).length === 0) {
            const err = new Error('MANUFACTURING_RATES_NOT_CONFIGURED: Printer node has no industrial rates configured.');
            err.statusCode = 400;
            err.code = 'MANUFACTURING_RATES_NOT_CONFIGURED';
            throw err;
        }

        // 3. Parse Limits & Signatures
        let limits = { min_copies: 1, max_copies: 100000, min_pages: 8, max_pages: 2000 };
        if (node.limits) {
            try {
                const parsed = typeof node.limits === 'string' ? JSON.parse(node.limits) : node.limits;
                limits = { ...limits, ...parsed };
            } catch (e) { /* use defaults */ }
        }

        let signatures = [16, 24, 32, 8, 4];
        if (node.signatures) {
            try {
                const parsedSig = typeof node.signatures === 'string' ? JSON.parse(node.signatures) : node.signatures;
                if (Array.isArray(parsedSig) && parsedSig.length > 0) signatures = parsedSig;
            } catch (e) { /* use defaults */ }
        }

        // 4. Validate Requested Job against Capability Limits
        const copies = parseInt(jobSpec.copies, 10) || 1;
        const interiorPages = parseInt(jobSpec.interior_pages, 10) || 1;
        const widthMm = parseFloat(jobSpec.book_width_mm) || 148;
        const heightMm = parseFloat(jobSpec.book_height_mm) || 210;

        const warnings = [];
        if (copies < (limits.min_copies || 1)) {
            warnings.push(`Quantity (${copies}) is below node minimum (${limits.min_copies || 1}).`);
        }
        if (limits.max_copies && copies > limits.max_copies) {
            warnings.push(`Quantity (${copies}) exceeds node maximum (${limits.max_copies}).`);
        }
        if (interiorPages < (limits.min_pages || 8)) {
            warnings.push(`Interior pages (${interiorPages}) is below minimum (${limits.min_pages || 8}).`);
        }
        if (limits.max_pages && interiorPages > limits.max_pages) {
            warnings.push(`Interior pages (${interiorPages}) exceeds maximum (${limits.max_pages}).`);
        }

        // 5. Evaluate Forward Manufacturing Cost via Canonical BPE
        const nodeConfig = {
            id: node.id,
            name: node.name,
            signatures,
            production_lead_days: node.production_lead_days || 7,
            shipping_days: 2
        };

        const bpeResult = buildPriceAdapter.evaluateForwardPrice(
            jobSpec,
            ratesSnapshot,
            {},
            nodeConfig
        );

        const manufacturingCost = bpeResult.predictedManufacturingPrice;
        let transportCost = bpeResult.predictedTransportPrice;

        // 5b. Validate completeness & validity of mandatory interior manufacturing rates
        const uncalibratedRates = [];
        const rateDetails = [];
        const paperTypeInt = String(jobSpec.paper_type_interior || 'offset').toLowerCase().trim();
        const interiorPrintRaw = String(jobSpec.interior_print || '1/1').trim();

        const printModeMap = { '4/4': 'full', '2/2': 'two', '1/1': 'one', 'none': 'none' };
        const printModeKey = printModeMap[interiorPrintRaw];

        if (interiorPages > 0) {
            // 1. Paper Interior
            if (paperTypeInt !== 'none') {
                const paperKiloRates = ratesSnapshot.paper_price_interior_by_kilo;
                const keyName = `paper_price_interior_by_kilo.${paperTypeInt}`;

                if (!paperKiloRates || !(paperTypeInt in paperKiloRates)) {
                    uncalibratedRates.push(keyName);
                    rateDetails.push({ key: keyName, status: 'MISSING' });
                } else {
                    const rawVal = paperKiloRates[paperTypeInt];
                    const numVal = Number(rawVal);
                    if (!Number.isFinite(numVal)) {
                        uncalibratedRates.push(keyName);
                        rateDetails.push({ key: keyName, status: 'NON_FINITE' });
                    } else if (numVal === 0) {
                        uncalibratedRates.push(keyName);
                        rateDetails.push({ key: keyName, status: 'EXPLICIT_ZERO' });
                    }
                }
            }

            // 2. Interior Print
            if (interiorPrintRaw !== 'none') {
                if (!printModeKey) {
                    const keyName = `interior_print.${interiorPrintRaw}`;
                    uncalibratedRates.push(keyName);
                    rateDetails.push({ key: keyName, status: 'UNKNOWN_MODE' });
                } else if (printModeKey !== 'none') {
                    const activeSig = bpeResult.signature || 24;

                    /**
                     * 1:1 replica of internal un-exported sectionsArray() from @ppos/pricing-engine
                     * (git-pinned to 8d324290d64b5bf17325ff1098db7ebb5f646b5d).
                     * Decomposes pages into section counts for signature 24 or standard signatures (32/16/8/4).
                     */
                    function getSectionsArray(pages, sig) {
                        if (pages === 0) return [0, 0, 0, 0];
                        if (sig === 24) {
                            return [
                                Math.trunc(pages / 24),
                                Math.trunc((pages % 24) / 16),
                                Math.trunc((pages % 24 % 16) / 12),
                                Math.trunc((pages % 24 % 16 % 12) / 8),
                                Math.trunc((pages % 24 % 16 % 12 % 8) / 4),
                            ];
                        }
                        return [
                            Math.trunc(pages / 32),
                            Math.trunc((pages % 32) / 16),
                            Math.trunc((pages % 16) / 8),
                            Math.trunc((pages % 8) / 4),
                        ];
                    }

                    const sectArr = getSectionsArray(interiorPages, activeSig);
                    const sectionKeys = activeSig === 24
                        ? ['24p', '16p', '12p', '8p', '4p']
                        : ['32p', '16p', '8p', '4p'];

                    const fixedRatesDict = ratesSnapshot[`interior_${printModeKey}_colour_fixed`];
                    const varRatesDict = ratesSnapshot[`interior_${printModeKey}_colour_var`];

                    for (let i = 0; i < sectArr.length; i++) {
                        if (sectArr[i] === 0) continue;
                        const secKey = sectionKeys[i];
                        const fixedKeyName = `interior_${printModeKey}_colour_fixed.${secKey}`;
                        const varKeyName = `interior_${printModeKey}_colour_var.${secKey}`;

                        let isFixedOk = true;
                        let isVarOk = true;

                        if (!fixedRatesDict || !(secKey in fixedRatesDict)) {
                            uncalibratedRates.push(fixedKeyName);
                            rateDetails.push({ key: fixedKeyName, status: 'MISSING' });
                            isFixedOk = false;
                        } else {
                            const numF = Number(fixedRatesDict[secKey]);
                            if (!Number.isFinite(numF)) {
                                uncalibratedRates.push(fixedKeyName);
                                rateDetails.push({ key: fixedKeyName, status: 'NON_FINITE' });
                                isFixedOk = false;
                            }
                        }

                        if (!varRatesDict || !(secKey in varRatesDict)) {
                            uncalibratedRates.push(varKeyName);
                            rateDetails.push({ key: varKeyName, status: 'MISSING' });
                            isVarOk = false;
                        } else {
                            const numV = Number(varRatesDict[secKey]);
                            if (!Number.isFinite(numV)) {
                                uncalibratedRates.push(varKeyName);
                                rateDetails.push({ key: varKeyName, status: 'NON_FINITE' });
                                isVarOk = false;
                            }
                        }

                        if (isFixedOk && isVarOk) {
                            const numF = Number(fixedRatesDict[secKey]);
                            const numV = Number(varRatesDict[secKey]);
                            if (numF === 0 && numV === 0) {
                                uncalibratedRates.push(fixedKeyName);
                                rateDetails.push({ key: fixedKeyName, status: 'EXPLICIT_ZERO' });
                            }
                        }
                    }
                }
            }
        }

        let isValidCommercialQuote = true;
        let quoteStatus = 'VALID_COMMERCIAL_QUOTE';

        if (uncalibratedRates.length > 0) {
            isValidCommercialQuote = false;
            quoteStatus = 'INVALID_INCOMPLETE_RATES';
            warnings.push(`INVALID_INCOMPLETE_RATES: Mandatory manufacturing rates (${uncalibratedRates.join(', ')}) evaluate to zero or are uncalibrated for printer node ${node.id}. Quote cannot be presented as a valid commercial price.`);
        }

        // 6. Resolve Shipping Region & Transit Times (Canonical Shipping Service)
        const rawCountry = jobSpec.delivery_country;
        let deliveryCountry = null;
        let shippingStatus = 'CONFIGURED';
        let estimatedDeliveryDays = 2;

        if (!rawCountry) {
            shippingStatus = 'DESTINATION_COUNTRY_REQUIRED';
            warnings.push('Destination country is required for quote preview.');
        } else if (!isValidIso2Country(rawCountry)) {
            shippingStatus = 'INVALID_DESTINATION_COUNTRY';
            warnings.push(`Invalid destination country code '${rawCountry}'. Must be a valid ISO 3166-1 alpha-2 code.`);
        } else {
            deliveryCountry = normalizeIso2Country(rawCountry);
            try {
                const regions = await shippingRegionService.listShippingRegions(tenantId, node.id);
                const matchingRegions = (regions || []).filter(r => r.enabled && Array.isArray(r.countries) && r.countries.map(c => c.toUpperCase()).includes(deliveryCountry));
                if (matchingRegions.length === 1) {
                    estimatedDeliveryDays = matchingRegions[0].standardTransitDays || 2;
                } else if (matchingRegions.length > 1) {
                    shippingStatus = 'AMBIGUOUS_SHIPPING_REGION';
                    warnings.push(`Destination country '${deliveryCountry}' is configured in multiple active regions (${matchingRegions.map(r => r.name).join(', ')}).`);
                    estimatedDeliveryDays = matchingRegions[0].standardTransitDays || 2;
                } else {
                    shippingStatus = 'DESTINATION_NOT_IN_ACTIVE_SHIPPING_REGIONS';
                    warnings.push(`Destination country '${deliveryCountry}' is not explicitly mapped in active shipping regions.`);
                }
            } catch (e) {
                shippingStatus = 'SHIPPING_SERVICE_UNAVAILABLE';
            }
        }

        // 7. Resolve Commercial Pricing Policy (Optional Markup)
        let commercialMarkup = 0.0;
        let commercialPolicyName = 'Default Industrial Cost Policy';

        try {
            const priceBooks = await priceBookService.listPriceBooks(tenantId);
            const activeBook = (priceBooks || []).find(pb => pb.status === 'ACTIVE' || pb.status === 'PUBLISHED');
            if (activeBook) {
                const rules = await ruleService.getRules(tenantId, activeBook.id);
                const baseRule = rules.find(r => r.scope === 'TENANT_DEFAULT' || (r.scope === 'SITE_OVERRIDE' && r.site_id === node.id));
                if (baseRule && baseRule.markup_percent) {
                    commercialMarkup = Number((manufacturingCost * (baseRule.markup_percent / 100)).toFixed(4));
                    commercialPolicyName = `${activeBook.name || 'Commercial Policy'} (${baseRule.markup_percent}% Markup)`;
                }
            }
        } catch (e) {
            // Default to 0 markup if no commercial price book exists
        }

        // 8. Tax / VAT Policy (Non-invented: label as not applied in preview)
        const taxAmount = 0.0;
        const taxStatus = 'NOT_APPLIED_IN_PREVIEW';

        // 9. Compose Final Governed Selling Price
        const subtotalProduction = Number((manufacturingCost).toFixed(4));
        const finalSellingPrice = Number((subtotalProduction + transportCost + commercialMarkup + taxAmount).toFixed(2));
        const unitPrice = Number((finalSellingPrice / copies).toFixed(4));

        // 10. Extract Decomposition Breakdown
        const breakdown = [];
        let finishingCost = 0.0;
        let bindingCost = 0.0;
        let packagingCost = 0.0;
        let paperCost = 0.0;
        let printCost = 0.0;

        for (const ln of (bpeResult.lines || [])) {
            const itemLower = String(ln.item || '').toLowerCase();
            const amt = Number(ln.line_total || 0);

            if (itemLower.includes('binding') || itemLower.includes('stitch') || itemLower.includes('sewn') || itemLower.includes('hardcover') || itemLower.includes('softcover')) {
                bindingCost += amt;
            } else if (itemLower.includes('paper') || itemLower.includes('substrate')) {
                paperCost += amt;
            } else if (itemLower.includes('print') || itemLower.includes('interior') || itemLower.includes('cover')) {
                printCost += amt;
            } else if (itemLower.includes('lamination') || itemLower.includes('varnish') || itemLower.includes('finishing')) {
                finishingCost += amt;
            } else if (itemLower.includes('packaging') || itemLower.includes('box')) {
                packagingCost += amt;
            }
        }

        breakdown.push({ label: 'Manufacturing & Print', amount: Number((manufacturingCost - finishingCost - bindingCost - packagingCost).toFixed(2)) });
        if (finishingCost > 0) breakdown.push({ label: 'Finishing & Lamination', amount: Number(finishingCost.toFixed(2)) });
        if (bindingCost > 0) breakdown.push({ label: 'Binding', amount: Number(bindingCost.toFixed(2)) });
        if (packagingCost > 0) breakdown.push({ label: 'Packaging', amount: Number(packagingCost.toFixed(2)) });
        if (transportCost > 0) breakdown.push({ label: 'Transport Reference', amount: Number(transportCost.toFixed(2)) });
        if (commercialMarkup > 0) breakdown.push({ label: 'Commercial Markup', amount: Number(commercialMarkup.toFixed(2)) });

        function parseEffectiveBoolean(val) {
            if (val === true) return true;
            if (val === false || val === null || val === undefined) return false;
            if (typeof val === 'string') {
                const s = val.trim().toLowerCase();
                if (s === 'none' || s === 'false' || s === 'no' || s === 'null' || s === 'undefined' || s === '0' || s === '') {
                    return false;
                }
                return true;
            }
            return Boolean(val);
        }

        function parseMeaningfulText(val) {
            if (!val) return null;
            const s = String(val).trim();
            const lower = s.toLowerCase();
            if (lower === '' || lower === 'none' || lower === 'false' || lower === 'null' || lower === 'undefined' || lower === 'no' || lower === 'n/a') {
                return null;
            }
            return s;
        }

        const hasEffectiveMixedInterior = parseEffectiveBoolean(jobSpec.has_mixed_interior) || Boolean(parseMeaningfulText(jobSpec.mixed_interior_details));
        const hasEffectiveSpotUv = parseEffectiveBoolean(jobSpec.has_spot_uv) || parseEffectiveBoolean(jobSpec.spot_uv) || Boolean(parseMeaningfulText(jobSpec.spot_uv_details));
        const hasEffectiveEndpapers = parseEffectiveBoolean(jobSpec.has_endpapers) || parseEffectiveBoolean(jobSpec.endpapers) || Boolean(parseMeaningfulText(jobSpec.endpapers_details));
        const hasEffectiveHardcoverBoard = parseEffectiveBoolean(jobSpec.has_hardcover_board);

        const unsupportedFeaturesList = Array.isArray(jobSpec.unsupported_features)
            ? jobSpec.unsupported_features.filter(f => parseMeaningfulText(f) !== null)
            : [];
        const hasEffectiveUnsupportedFeatures = unsupportedFeaturesList.length > 0;

        const isComplexSpec = Boolean(
            hasEffectiveMixedInterior ||
            hasEffectiveSpotUv ||
            hasEffectiveEndpapers ||
            hasEffectiveHardcoverBoard ||
            hasEffectiveUnsupportedFeatures
        );

        const textSources = [
            parseMeaningfulText(jobSpec.mixed_interior_details),
            parseMeaningfulText(jobSpec.endpapers_details),
            parseMeaningfulText(jobSpec.spot_uv_details),
            parseMeaningfulText(jobSpec.raw_text),
            parseMeaningfulText(jobSpec.rawText),
            parseMeaningfulText(jobSpec.explanation),
            Array.isArray(jobSpec.warnings) ? parseMeaningfulText(jobSpec.warnings.join(' ')) : null,
            parseMeaningfulText(jobSpec.unsupportedDetails),
            parseMeaningfulText(jobSpec.notes),
            parseMeaningfulText(jobSpec.comments),
            parseMeaningfulText(jobSpec.referenceBookName)
        ];

        const rawTextCombined = textSources.filter(Boolean).join(' ').toLowerCase();

        let hasComplexTextSignal = false;
        if (rawTextCombined) {
            const keywords = ['pantone', 'guardas', 'endpapers', 'cartón', 'carton', 'relieve', 'spot uv', 'barniz', 'mixed interior', 'interior mixto'];
            for (const kw of keywords) {
                if (rawTextCombined.includes(kw)) {
                    const negationRegex = new RegExp(`(${kw}|endpapers?|guardas?|spot_?uv|barniz|mixed_?interior)\\s*[:=]\\s*(none|false|no|null)|(sin|no)\\s+(${kw})`, 'i');
                    if (!negationRegex.test(rawTextCombined)) {
                        hasComplexTextSignal = true;
                        break;
                    }
                }
            }
        }

        const isSimplifiedApproximation = isComplexSpec || hasComplexTextSignal;

        if (isSimplifiedApproximation) {
            const complexDetailsParts = [];
            if (parseMeaningfulText(jobSpec.mixed_interior_details)) complexDetailsParts.push(jobSpec.mixed_interior_details);
            if (parseMeaningfulText(jobSpec.endpapers_details)) complexDetailsParts.push(`Guardas: ${jobSpec.endpapers_details}`);
            else if (hasEffectiveEndpapers) complexDetailsParts.push('Guardas / endpapers');
            if (parseMeaningfulText(jobSpec.spot_uv_details)) complexDetailsParts.push(`Barniz/UV: ${jobSpec.spot_uv_details}`);
            else if (hasEffectiveSpotUv) complexDetailsParts.push('Barniz / Spot UV');

            const details = complexDetailsParts.length > 0 ? complexDetailsParts.join('; ') : 'Complex interior, guardas or spot UV/barniz features';
            warnings.push(`SIMPLIFIED_INTERIOR_APPROXIMATION: Spec has complex features (${details}) calculated using single-pass approximation.`);
        }

        // 11. Build User-Safe Configuration Trace
        const configurationTrace = [
            `Printer Node: ${node.name} (${node.id})`,
            jobSpec.mixed_interior_details
                ? `Interior Details (Complex): ${jobSpec.mixed_interior_details}`
                : `Interior: ${jobSpec.interior_pages || 128}p, Print ${jobSpec.interior_print || '4/4'}, Paper ${jobSpec.paper_weight_interior || 80}gsm ${jobSpec.paper_type_interior || 'offset'}`,
            `Cover: Print ${jobSpec.cover_print || '4/0'}, Paper ${jobSpec.paper_weight_cover || 300}gsm ${jobSpec.paper_type_cover || 'mc'}`,
            `Binding: ${jobSpec.binding_method || 'perfect bound'}`,
            jobSpec.lamination ? `Lamination: ${jobSpec.lamination}` : 'Lamination: None',
            `Commercial Policy: ${commercialPolicyName}`,
            `Shipping Region: ${deliveryCountry} (${shippingStatus})`
        ];

        return {
            ok: true,
            currency: 'EUR',
            quantity: copies,
            isValidCommercialQuote,
            quoteStatus,
            uncalibratedRates,
            rateDetails,
            isSimplifiedApproximation,
            originalJobSpec: jobSpec,
            totals: {
                manufacturing: Number(manufacturingCost.toFixed(2)),
                finishing: Number(finishingCost.toFixed(2)),
                binding: Number(bindingCost.toFixed(2)),
                packaging: Number(packagingCost.toFixed(2)),
                transport: Number(transportCost.toFixed(2)),
                commercialMarkup: Number(commercialMarkup.toFixed(2)),
                tax: taxAmount,
                finalSellingPrice
            },
            unitPrice,
            breakdown,
            productionLeadDays: node.production_lead_days || 7,
            estimatedDeliveryDays,
            shippingStatus,
            taxStatus: 'NOT_APPLIED_IN_PREVIEW',
            configurationTrace,
            warnings,
            engine: {
                package: bpeResult.enginePackage || '@ppos/pricing-engine',
                version: bpeResult.engineVersion || 'git-pinned',
                forwardMethod: 'canonical buildPrice()'
            }
        };
    }
}

module.exports = new PrinthouseQuotePreviewService();
