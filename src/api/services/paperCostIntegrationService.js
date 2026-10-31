'use strict';

/**
 * src/api/services/paperCostIntegrationService.js
 * 
 * Phase I6 — Paper Cost Integration & BPE Pricing Engine Rate Adapter.
 * 
 * Responsibilities:
 * 1. Physical Paper Calculation:
 *    - Calculates sheet area, sheet weight in kg, and conversions between price bases
 *      (KG, TONNE, SHEET, THOUSAND_SHEETS, PACK).
 * 2. Market Rate Resolution:
 *    - Finds active authorized supplier offers matching physical specs (GSM, finish, category, format).
 *    - Resolves the most competitive or preferred market paper rate normalized to price_per_kg.
 * 3. Industrial Job Paper Estimation:
 *    - Estimates required paper sheets, net kilograms, press setup scrap, and gross kilograms
 *      for book and commercial print jobs according to standard industrial curves.
 * 4. BPE Forward Pricing Rate Adapter:
 *    - Generates candidate rate patches (e.g. paper_price_interior_by_kilo, paper_price_cover_by_kilo)
 *      with immutable snapshot provenance metadata (supplierId, offerId, sku, resolvedAt).
 *    - Invariant: Zero alteration to @ppos/pricing-engine (pinned to 1f8997e).
 */

const crypto = require('crypto');
const db = require('./mysqlClient');
const logger = require('./logger').child('paper-cost-integration');

const unwrapRows = (result) => {
    if (!result) return [];
    if (Array.isArray(result)) {
        if (result.length > 0 && Array.isArray(result[0])) {
            return result[0];
        }
        return result;
    }
    return [result];
};

class PaperCostIntegrationService {

    /**
     * Calculates the physical weight of a single paper sheet in kilograms.
     * @param {number} widthMm 
     * @param {number} heightMm 
     * @param {number} gsm 
     * @returns {number} Weight in kg per sheet
     */
    calculateSheetWeightKg(widthMm, heightMm, gsm) {
        const w = Number(widthMm);
        const h = Number(heightMm);
        const g = Number(gsm);

        if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0 || !Number.isFinite(g) || g <= 0) {
            throw new Error('Invalid sheet dimensions or GSM for weight calculation');
        }

        const areaM2 = (w * h) / 1000000;
        const kgPerSheet = areaM2 * (g / 1000);
        return kgPerSheet;
    }

    /**
     * Converts a price from any supported basis into canonical price_per_kg in original currency.
     * Supported bases: KG, TONNE, SHEET, THOUSAND_SHEETS, PACK.
     * 
     * Invariants:
     * - Preserves original currency (never converts or labels USD/GBP as EUR).
     * - Backward-compatible: returns number if currency is not passed; returns { pricePerKg, currency } if currency is passed.
     * 
     * @param {Object} params
     * @param {number} params.priceAmount
     * @param {string} params.priceBasis
     * @param {number} params.widthMm
     * @param {number} params.heightMm
     * @param {number} params.gsm
     * @param {number} [params.sheetsPerPack]
     * @param {string} [params.currency]
     * @returns {number|Object} Normalized price in original currency per kg (rounded to 4 decimal places)
     */
    convertPriceToKg({ priceAmount, priceBasis, widthMm, heightMm, gsm, sheetsPerPack = null, currency = null }) {
        const price = Number(priceAmount);
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error('Price amount must be a positive finite number');
        }

        const kgPerSheet = this.calculateSheetWeightKg(widthMm, heightMm, gsm);

        let pricePerKg = 0;
        switch (priceBasis) {
            case 'KG':
                pricePerKg = price;
                break;
            case 'TONNE':
                pricePerKg = price / 1000;
                break;
            case 'SHEET':
                pricePerKg = price / kgPerSheet;
                break;
            case 'THOUSAND_SHEETS':
                pricePerKg = price / (1000 * kgPerSheet);
                break;
            case 'PACK': {
                const pack = Number(sheetsPerPack);
                if (!Number.isInteger(pack) || pack <= 0) {
                    throw new Error("sheetsPerPack must be a positive integer when priceBasis is 'PACK'");
                }
                pricePerKg = price / (pack * kgPerSheet);
                break;
            }
            default:
                throw new Error(`Unsupported price basis: '${priceBasis}'`);
        }

        const normalizedPrice = Number(pricePerKg.toFixed(4));
        if (currency) {
            return {
                pricePerKg: normalizedPrice,
                currency: String(currency).toUpperCase()
            };
        }
        return normalizedPrice;
    }

    /**
     * Resolves the market paper rate for given physical specifications from active,
     * authorized supplier offers for the tenant.
     * 
     * Currency Invariants:
     * - Preserves original currency.
     * - Never compares offers with different currencies without an explicit and traceable conversion rate map.
     * - If no authorized conversion is provided, requires targetCurrency and filters offers by that currency.
     * - Does not label USD/GBP as EUR.
     * 
     * @param {string|Object} tenantIdOrCriteria - Printhouse tenant or combined criteria
     * @param {Object} [criteria] - Search criteria
     * @param {number} [criteria.gsm]
     * @param {string} [criteria.finish]
     * @param {string} [criteria.category]
     * @param {number} [criteria.widthMm]
     * @param {number} [criteria.heightMm]
     * @param {string} [criteria.variantId]
     * @param {string} [criteria.targetCurrency] - Desired target currency (e.g. 'EUR', 'USD')
     * @param {string} [criteria.currency] - Alias for targetCurrency
     * @param {Object} [criteria.exchangeRates] - Optional explicit authorized conversion rates to targetCurrency (e.g. { USD: 0.92, EUR: 1.0 })
     * @returns {Promise<Object|null>} Resolved best offer rate with normalized pricePerKg
     */
    async resolveMarketPaperRate(tenantIdOrCriteria, criteria = {}) {
        let tenantId = tenantIdOrCriteria;
        let crit = criteria;
        if (typeof tenantIdOrCriteria === 'object' && tenantIdOrCriteria !== null) {
            tenantId = tenantIdOrCriteria.tenantId || tenantIdOrCriteria.buyerTenantId;
            crit = tenantIdOrCriteria;
        }

        if (!tenantId) {
            throw new Error('TENANT_ID_REQUIRED');
        }

        const {
            gsm = null,
            finish = null,
            category = null,
            widthMm = null,
            heightMm = null,
            variantId = null
        } = crit;

        const targetCurrency = (crit.targetCurrency || crit.currency)
            ? String(crit.targetCurrency || crit.currency).trim().toUpperCase()
            : null;
        const exchangeRates = crit.exchangeRates || crit.currencyConversions || null;

        let whereClauses = [
            "o.deleted_at IS NULL",
            "o.status = 'ACTIVE'",
            "(o.valid_from IS NULL OR o.valid_from <= CURRENT_TIMESTAMP)",
            "(o.valid_until IS NULL OR o.valid_until >= CURRENT_TIMESTAMP)",
            "(o.visibility = 'MARKETPLACE' OR (o.visibility = 'APPROVED_CUSTOMERS' AND JSON_CONTAINS(COALESCE(o.metadata_json->'$.approved_customer_ids', '[]'), JSON_QUOTE(?))) OR (o.visibility = 'PRIVATE' AND o.tenant_id = ?))"
        ];
        let params = [tenantId, tenantId];

        if (variantId) {
            whereClauses.push("o.variant_id = ?");
            params.push(variantId);
        }

        if (gsm) {
            whereClauses.push("v.gsm = ?");
            params.push(Number(gsm));
        }

        if (finish) {
            whereClauses.push("v.finish = ?");
            params.push(String(finish).toUpperCase());
        }

        if (category) {
            whereClauses.push("p.category = ?");
            params.push(String(category).toUpperCase());
        }

        if (widthMm && heightMm) {
            whereClauses.push("v.width_mm = ? AND v.height_mm = ?");
            params.push(Number(widthMm), Number(heightMm));
        }

        // If target currency specified and no multi-currency exchange rate map provided, filter in SQL
        if (targetCurrency && !exchangeRates) {
            whereClauses.push("o.currency = ?");
            params.push(targetCurrency);
        }

        const sql = `
            SELECT 
                o.*,
                v.product_id,
                v.gsm,
                v.width_mm,
                v.height_mm,
                v.finish,
                v.caliper_um,
                v.grain_direction,
                p.name AS product_name,
                p.brand,
                p.category,
                s.name AS supplier_name,
                o.currency AS supplier_currency
            FROM supplier_paper_offers o
            JOIN paper_variants v ON o.variant_id = v.id
            JOIN paper_products p ON v.product_id = p.id
            JOIN paper_suppliers s ON o.supplier_id = s.id
            WHERE ${whereClauses.join(' AND ')}
        `;

        const rows = unwrapRows(await db.query(sql, params));
        if (!rows || rows.length === 0) {
            return null;
        }

        // If no target currency and no exchange rates specified, check currency uniformity across candidates
        let effectiveTargetCurrency = targetCurrency;
        if (!effectiveTargetCurrency && !exchangeRates) {
            const distinctCurrencies = [...new Set(rows.map(r => (r.currency || '').toUpperCase()))].filter(Boolean);
            if (distinctCurrencies.length > 1) {
                const err = new Error(`TARGET_CURRENCY_REQUIRED: Multiple currencies (${distinctCurrencies.join(', ')}) found in active market offers without an authorized exchange rate. Specify targetCurrency to filter offers.`);
                err.statusCode = 400;
                err.code = 'TARGET_CURRENCY_REQUIRED';
                throw err;
            }
            effectiveTargetCurrency = distinctCurrencies[0] || 'EUR';
        }

        // Calculate normalized price_per_kg for each candidate offer preserving currency
        const candidates = rows.map(r => {
            try {
                const conversion = this.convertPriceToKg({
                    priceAmount: r.price_amount,
                    priceBasis: r.price_basis,
                    widthMm: r.width_mm,
                    heightMm: r.height_mm,
                    gsm: r.gsm,
                    sheetsPerPack: r.sheets_per_pack,
                    currency: r.currency
                });
                const originalPricePerKg = typeof conversion === 'object' ? conversion.pricePerKg : conversion;
                const offerCurrency = (r.currency || '').toUpperCase();

                let comparablePricePerKg = originalPricePerKg;
                let conversionTrace = null;

                if (exchangeRates && effectiveTargetCurrency) {
                    if (offerCurrency !== effectiveTargetCurrency) {
                        const rateKey = offerCurrency;
                        const rate = Number(exchangeRates[rateKey] ?? exchangeRates[`${offerCurrency}_TO_${effectiveTargetCurrency}`]);
                        if (!Number.isFinite(rate) || rate <= 0) {
                            throw new Error(`Missing authorized exchange rate for currency '${offerCurrency}' to '${effectiveTargetCurrency}'`);
                        }
                        comparablePricePerKg = Number((originalPricePerKg * rate).toFixed(4));
                        conversionTrace = {
                            originalCurrency: offerCurrency,
                            originalPricePerKg,
                            exchangeRate: rate,
                            targetCurrency: effectiveTargetCurrency,
                            convertedPricePerKg: comparablePricePerKg
                        };
                    } else {
                        conversionTrace = {
                            originalCurrency: offerCurrency,
                            originalPricePerKg,
                            exchangeRate: 1.0,
                            targetCurrency: effectiveTargetCurrency,
                            convertedPricePerKg: originalPricePerKg
                        };
                    }
                } else if (effectiveTargetCurrency && offerCurrency !== effectiveTargetCurrency) {
                    // Filter out candidates not matching effectiveTargetCurrency
                    return null;
                }

                return {
                    ...r,
                    pricePerKg: originalPricePerKg,
                    comparablePricePerKg,
                    conversionTrace
                };
            } catch (err) {
                logger.warn({ event: 'offer_price_conversion_failed', offerId: r.id, error: err.message });
                return null;
            }
        }).filter(Boolean);

        if (candidates.length === 0) {
            return null;
        }

        // Sort by lowest comparable price per kg
        candidates.sort((a, b) => a.comparablePricePerKg - b.comparablePricePerKg);
        const bestOffer = candidates[0];

        return {
            offerId: bestOffer.id,
            supplierId: bestOffer.supplier_id,
            supplierName: bestOffer.supplier_name,
            supplierSku: bestOffer.supplier_sku,
            sku: bestOffer.supplier_sku,
            variantId: bestOffer.variant_id,
            productName: bestOffer.product_name,
            brand: bestOffer.brand,
            category: bestOffer.category,
            finish: bestOffer.finish,
            gsm: bestOffer.gsm,
            widthMm: bestOffer.width_mm,
            heightMm: bestOffer.height_mm,
            caliperUm: bestOffer.caliper_um,
            grainDirection: bestOffer.grain_direction,
            currency: bestOffer.currency,
            originalPriceAmount: Number(bestOffer.price_amount),
            originalPriceBasis: bestOffer.price_basis,
            sheetsPerPack: bestOffer.sheets_per_pack,
            moq: Number(bestOffer.moq),
            orderMultiple: Number(bestOffer.order_multiple),
            pricePerKg: bestOffer.pricePerKg,
            pricePerKgCurrency: bestOffer.currency,
            conversionTrace: bestOffer.conversionTrace,
            resolvedAt: new Date().toISOString()
        };
    }

    /**
     * Estimates paper requirements and costs for a commercial book/print job.
     * Incorporates real machine, imposition, and scrap parameters without imposing
     * hardcoded universal assumptions.
     * 
     * Invariants:
     * - Imposition: Uses machine/job signatureSize if provided, or derives geometrically
     *   from sheet and trim dimensions.
     * - Makeready & Run Waste: Uses machine profile or explicit parameters; does NOT
     *   inject universal hardcoded constants (100 sheets / 2.5%) unless explicitly provided.
     * 
     * @param {Object} jobSpec
     * @param {number} jobSpec.copies - Run length (number of books / prints)
     * @param {number} jobSpec.interior_pages - Total page count for interior
     * @param {number} [jobSpec.signature_size] - Explicit signature size (e.g. 16, 8, 4)
     * @param {number} [jobSpec.covers_per_sheet=2] - Number of covers per press sheet
     * @param {number} [jobSpec.book_width_mm] - Trim width for geometric imposition
     * @param {number} [jobSpec.book_height_mm] - Trim height for geometric imposition
     * @param {number} [jobSpec.press_sheet_width_mm=700] - Press sheet width
     * @param {number} [jobSpec.press_sheet_height_mm=1000] - Press sheet height
     * @param {number} [jobSpec.interior_makeready_sheets] - Makeready setup waste sheets for interior
     * @param {number} [jobSpec.makeready_sheets_per_signature] - Makeready setup sheets per interior signature
     * @param {number} [jobSpec.cover_makeready_sheets] - Makeready setup waste sheets for cover
     * @param {number} [jobSpec.run_waste_rate] - Running scrap percentage (e.g. 0.025 for 2.5%)
     * @param {number} [jobSpec.run_waste_percentage] - Running scrap as percentage (e.g. 2.5)
     * @param {number} [jobSpec.rate_per_kg_interior=null] - Optional price/kg in specified currency
     * @param {number} [jobSpec.rate_per_kg_cover=null] - Optional price/kg in specified currency
     * @param {string} [jobSpec.currency='EUR'] - Currency label
     * @returns {Object} Estimated sheets, kg, scrap, and procurement costs
     */
    calculateJobPaperRequirements(jobSpec) {
        const copies = Math.max(1, Number(jobSpec.copies) || 1);
        const interiorPages = Math.max(1, Number(jobSpec.interior_pages ?? jobSpec.interiorPages) || 1);
        const interiorGsm = Number(jobSpec.paper_weight_interior ?? jobSpec.interiorWeightGsm) || 80;
        const coverGsm = Number(jobSpec.paper_weight_cover ?? jobSpec.coverWeightGsm) || 250;
        const currency = jobSpec.currency || 'EUR';

        const pressWidthMm = Number(jobSpec.press_sheet_width_mm) || 700;
        const pressHeightMm = Number(jobSpec.press_sheet_height_mm) || 1000;
        const bookWidthMm = Number(jobSpec.book_width_mm || 0);
        const bookHeightMm = Number(jobSpec.book_height_mm || 0);

        // 1. Signature Size derivation and source tracking
        let signatureSize = Number(jobSpec.signature_size ?? jobSpec.signatureSize ?? jobSpec.pages_per_signature ?? jobSpec.pagesPerSignature);
        let signatureSource = 'explicit';
        let isGeometricApproximation = false;
        let impositionWarning = null;

        if (Number.isFinite(signatureSize) && signatureSize > 0) {
            signatureSource = 'explicit';
        } else if (jobSpec.canonical_imposition || jobSpec.machine_profile?.impositionScheme || jobSpec.impositionScheme) {
            signatureSize = Number(jobSpec.canonical_imposition || jobSpec.machine_profile?.impositionScheme || jobSpec.impositionScheme);
            signatureSource = 'canonical_machine';
        } else if (bookWidthMm > 0 && bookHeightMm > 0 && pressWidthMm > 0 && pressHeightMm > 0) {
            // Geometric derivation: pages fitting per press sheet side
            const horizFit = Math.floor(pressWidthMm / bookWidthMm) * Math.floor(pressHeightMm / bookHeightMm);
            const rotFit = Math.floor(pressWidthMm / bookHeightMm) * Math.floor(pressHeightMm / bookWidthMm);
            const pagesPerSide = Math.max(horizFit, rotFit);
            const rawCapacity = pagesPerSide > 0 ? pagesPerSide * 2 : 16;
            // Industrial signature folding sections fold in halves: 32, 16, 8, 4 pages
            const binarySections = [32, 16, 8, 4];
            signatureSize = binarySections.find(s => s <= rawCapacity) || 16;
            signatureSource = 'geometric_derivation';
            isGeometricApproximation = true;
            impositionWarning = 'Geometric imposition is an unconfirmed approximation and does not replace canonical machine imposition.';
        } else {
            signatureSize = 16;
            signatureSource = 'nominal_standard_fallback';
            isGeometricApproximation = true;
            impositionWarning = 'Nominal standard 16pp fallback applied; machine imposition scheme was not provided.';
        }

        const signaturesCount = Math.max(1, Math.ceil(interiorPages / signatureSize));
        const netInteriorSheets = copies * signaturesCount;

        // Cover Sheets calculation: default 2 covers per press sheet unless specified
        const coversPerSheet = Math.max(1, Number(jobSpec.covers_per_sheet ?? jobSpec.coversPerSheet) || 2);
        const netCoverSheets = Math.ceil(copies / coversPerSheet);

        // 2. Makeready & Scrap Parameter Resolution (Distinguish missing from explicit zero)
        const missingParameters = [];
        let interiorMakereadySheets = 0;
        let isInteriorMakereadyExplicit = false;

        const rawIntMakeready = jobSpec.interior_makeready_sheets ?? jobSpec.interiorMakereadySheets ?? jobSpec.machine_profile?.interiorMakereadySheets;
        const rawMakereadyPerSig = jobSpec.makeready_sheets_per_signature ?? jobSpec.makereadySheetsPerSignature ?? jobSpec.machine_profile?.makereadySheetsPerSignature;

        if (rawIntMakeready !== undefined && rawIntMakeready !== null && rawIntMakeready !== '') {
            interiorMakereadySheets = Math.max(0, Number(rawIntMakeready) || 0);
            isInteriorMakereadyExplicit = true;
        } else if (rawMakereadyPerSig !== undefined && rawMakereadyPerSig !== null && rawMakereadyPerSig !== '') {
            const sheetsPerSig = Number(rawMakereadyPerSig) || 0;
            interiorMakereadySheets = Math.max(0, signaturesCount * sheetsPerSig);
            isInteriorMakereadyExplicit = true;
        } else {
            missingParameters.push('interior_makeready_sheets');
        }

        let coverMakereadySheets = 0;
        let isCoverMakereadyExplicit = false;
        const rawCovMakeready = jobSpec.cover_makeready_sheets ?? jobSpec.coverMakereadySheets ?? jobSpec.machine_profile?.coverMakereadySheets;

        if (rawCovMakeready !== undefined && rawCovMakeready !== null && rawCovMakeready !== '') {
            coverMakereadySheets = Math.max(0, Number(rawCovMakeready) || 0);
            isCoverMakereadyExplicit = true;
        } else {
            missingParameters.push('cover_makeready_sheets');
        }

        let runWasteRate = 0;
        let isRunWasteExplicit = false;
        const rawRunWasteRate = jobSpec.run_waste_rate ?? jobSpec.runWasteRate ?? jobSpec.machine_profile?.runWasteRate;
        const rawRunWastePct = jobSpec.run_waste_percentage ?? jobSpec.runWastePercentage ?? jobSpec.machine_profile?.runWastePercentage;

        if (rawRunWasteRate !== undefined && rawRunWasteRate !== null && rawRunWasteRate !== '') {
            runWasteRate = Math.max(0, Number(rawRunWasteRate) || 0);
            isRunWasteExplicit = true;
        } else if (rawRunWastePct !== undefined && rawRunWastePct !== null && rawRunWastePct !== '') {
            runWasteRate = Math.max(0, (Number(rawRunWastePct) || 0) / 100);
            isRunWasteExplicit = true;
        } else {
            missingParameters.push('run_waste_rate');
        }

        const isIncomplete = missingParameters.length > 0;
        const isExplicitZeroScrap = !isIncomplete && interiorMakereadySheets === 0 && coverMakereadySheets === 0 && runWasteRate === 0;
        const isDefinitiveCost = !isIncomplete && !isGeometricApproximation;
        const calculationType = isIncomplete
            ? 'PARTIAL_NET_ESTIMATE'
            : (isGeometricApproximation ? 'GEOMETRIC_PROVISIONAL_ESTIMATE' : 'CONFIRMED_INDUSTRIAL_ESTIMATE');

        const warnings = [];
        if (isIncomplete) {
            warnings.push(`Missing required industrial scrap parameters: [${missingParameters.join(', ')}]. Estimate reflects unconfirmed partial net sheets and must not be presented as a definitive commercial cost.`);
        }
        if (impositionWarning) {
            warnings.push(impositionWarning);
        }
        if (!isIncomplete && isGeometricApproximation) {
            warnings.push('Geometric imposition is an unconfirmed approximation. Canonical folding imposition rule required before cost can be certified as definitive.');
        }

        const interiorRunWasteSheets = Math.ceil(netInteriorSheets * runWasteRate);
        const coverRunWasteSheets = Math.ceil(netCoverSheets * runWasteRate);

        const totalInteriorSheets = netInteriorSheets + interiorMakereadySheets + interiorRunWasteSheets;
        const totalCoverSheets = netCoverSheets + coverMakereadySheets + coverRunWasteSheets;

        // Physical Weights
        const interiorKgPerSheet = this.calculateSheetWeightKg(pressWidthMm, pressHeightMm, interiorGsm);
        const coverKgPerSheet = this.calculateSheetWeightKg(pressWidthMm, pressHeightMm, coverGsm);

        const netInteriorKg = Number((netInteriorSheets * interiorKgPerSheet).toFixed(2));
        const grossInteriorKg = Number((totalInteriorSheets * interiorKgPerSheet).toFixed(2));
        const wasteInteriorKg = Number((grossInteriorKg - netInteriorKg).toFixed(2));

        const netCoverKg = Number((netCoverSheets * coverKgPerSheet).toFixed(2));
        const grossCoverKg = Number((totalCoverSheets * coverKgPerSheet).toFixed(2));
        const wasteCoverKg = Number((grossCoverKg - netCoverKg).toFixed(2));

        const totalNetKg = Number((netInteriorKg + netCoverKg).toFixed(2));
        const totalGrossKg = Number((grossInteriorKg + grossCoverKg).toFixed(2));
        const totalWasteKg = Number((wasteInteriorKg + wasteCoverKg).toFixed(2));

        // Cost estimation if rates provided
        const rateInt = Number(jobSpec.rate_per_kg_interior || 0);
        const rateCov = Number(jobSpec.rate_per_kg_cover || 0);

        const interiorCost = Number((grossInteriorKg * rateInt).toFixed(2));
        const coverCost = Number((grossCoverKg * rateCov).toFixed(2));
        const totalEstimatedCost = Number((interiorCost + coverCost).toFixed(2));

        return {
            copies,
            interiorPages,
            signaturesCount,
            signatureSize,
            signatureSource,
            isGeometricApproximation,
            impositionWarning,
            coversPerSheet,
            pressSheetDimensions: `${pressWidthMm}x${pressHeightMm} mm`,
            currency,
            isIncomplete,
            isDefinitiveCost,
            isExplicitZeroScrap,
            calculationType,
            missingParameters,
            warnings,
            interior: {
                gsm: interiorGsm,
                netSheets: netInteriorSheets,
                makereadySheets: interiorMakereadySheets,
                runWasteSheets: interiorRunWasteSheets,
                totalSheets: totalInteriorSheets,
                netKg: netInteriorKg,
                grossKg: grossInteriorKg,
                wasteKg: wasteInteriorKg,
                ratePerKg: rateInt,
                estimatedCost: interiorCost,
                isMakereadyOmitted: !isInteriorMakereadyExplicit
            },
            cover: {
                gsm: coverGsm,
                netSheets: netCoverSheets,
                makereadySheets: coverMakereadySheets,
                runWasteSheets: coverRunWasteSheets,
                totalSheets: totalCoverSheets,
                netKg: netCoverKg,
                grossKg: grossCoverKg,
                wasteKg: wasteCoverKg,
                ratePerKg: rateCov,
                estimatedCost: coverCost,
                isMakereadyOmitted: !isCoverMakereadyExplicit
            },
            totals: {
                totalNetSheets: netInteriorSheets + netCoverSheets,
                totalGrossSheets: totalInteriorSheets + totalCoverSheets,
                totalNetKg,
                totalGrossKg,
                totalWasteKg,
                wastePercentage: totalGrossKg > 0 ? Number(((totalWasteKg / totalGrossKg) * 100).toFixed(1)) : 0,
                totalEstimatedCost,
                isRunWasteOmitted: !isRunWasteExplicit
            }
        };
    }

    /**
     * Builds a canonical BPE candidate override patch from market supplier paper rates.
     * Compatible with buildPriceCalibrationAdapter and canonical buildPrice(params, house).
     * 
     * Invariants:
     * - Pure in-memory calculation; zero alteration to printer_nodes.rates_json or orders.
     * - Preserves and attaches target currency metadata.
     * 
     * @param {string} tenantId 
     * @param {Object} options
     * @param {string} [options.interiorPaperType='offset']
     * @param {number} [options.interiorGsm=80]
     * @param {string} [options.coverPaperType='mc']
     * @param {number} [options.coverGsm=250]
     * @param {string} [options.targetCurrency='EUR']
     * @param {string} [options.currency='EUR']
     * @returns {Promise<Object>} Object containing candidateOverrides and metadata
     */
    async buildBpePaperPatch(tenantIdOrOptions, options = {}) {
        let tenantId = tenantIdOrOptions;
        let opts = options;
        if (typeof tenantIdOrOptions === 'object' && tenantIdOrOptions !== null) {
            tenantId = tenantIdOrOptions.tenantId || tenantIdOrOptions.buyerTenantId;
            opts = tenantIdOrOptions;
        }

        const interiorType = opts.interiorPaperType || 'offset';
        const interiorGsm = Number(opts.interiorGsm) || 80;
        const coverType = opts.coverPaperType || 'mc';
        const coverGsm = Number(opts.coverGsm) || 250;
        const targetCurrency = String(opts.targetCurrency || opts.currency || 'EUR').toUpperCase();
        const exchangeRates = opts.exchangeRates || opts.currencyConversions || null;

        const [resolvedInterior, resolvedCover] = await Promise.all([
            this.resolveMarketPaperRate(tenantId, { gsm: interiorGsm, targetCurrency, exchangeRates }),
            this.resolveMarketPaperRate(tenantId, { gsm: coverGsm, targetCurrency, exchangeRates })
        ]);

        const candidateOverrides = {};
        const snapshotMetadata = {
            source: 'PPOS_PAPER_SUPPLIER_HUB',
            tenantId,
            currency: targetCurrency,
            resolvedAt: new Date().toISOString(),
            interior: null,
            cover: null
        };

        if (resolvedInterior) {
            candidateOverrides.paper_price_interior_by_kilo = {
                [interiorType]: resolvedInterior.pricePerKg
            };
            snapshotMetadata.interior = {
                offerId: resolvedInterior.offerId,
                supplierId: resolvedInterior.supplierId,
                supplierName: resolvedInterior.supplierName,
                sku: resolvedInterior.supplierSku,
                pricePerKg: resolvedInterior.pricePerKg,
                currency: resolvedInterior.currency,
                gsm: resolvedInterior.gsm,
                finish: resolvedInterior.finish,
                signature: this.generateSnapshotSignature(
                    tenantId,
                    resolvedInterior.offerId,
                    resolvedInterior.pricePerKg,
                    resolvedInterior.currency,
                    snapshotMetadata.resolvedAt
                )
            };
        }

        if (resolvedCover) {
            candidateOverrides.paper_price_cover_by_kilo = {
                [coverType]: resolvedCover.pricePerKg
            };
            snapshotMetadata.cover = {
                offerId: resolvedCover.offerId,
                supplierId: resolvedCover.supplierId,
                supplierName: resolvedCover.supplierName,
                sku: resolvedCover.supplierSku,
                pricePerKg: resolvedCover.pricePerKg,
                currency: resolvedCover.currency,
                gsm: resolvedCover.gsm,
                finish: resolvedCover.finish,
                signature: this.generateSnapshotSignature(
                    tenantId,
                    resolvedCover.offerId,
                    resolvedCover.pricePerKg,
                    resolvedCover.currency,
                    snapshotMetadata.resolvedAt
                )
            };
        }

        return {
            ...candidateOverrides,
            candidateOverrides,
            snapshotMetadata,
            _metadata: snapshotMetadata,
            hasResolvedInterior: Boolean(resolvedInterior),
            hasResolvedCover: Boolean(resolvedCover)
        };
    }

    /**
     * Generates a deterministic cryptographic HMAC signature for a paper rate snapshot.
     */
    generateSnapshotSignature(tenantId, offerId, pricePerKg, currency, resolvedAt) {
        const secret = process.env.JWT_SECRET || 'ppos_default_secret_for_snapshot';
        const payload = `${tenantId}:${offerId}:${Number(pricePerKg).toFixed(4)}:${String(currency).toUpperCase()}:${resolvedAt}`;
        return crypto.createHmac('sha256', secret).update(payload).digest('hex');
    }

    /**
     * Cryptographically verifies whether a paper rate snapshot was issued by this server and untampered.
     */
    verifySnapshot(tenantId, snapshotMetadata) {
        if (!snapshotMetadata || typeof snapshotMetadata !== 'object') return false;
        if (snapshotMetadata.tenantId && snapshotMetadata.tenantId !== tenantId) return false;

        if (snapshotMetadata.interior) {
            const { offerId, pricePerKg, currency, signature } = snapshotMetadata.interior;
            if (!signature || !offerId) return false;
            const expected = this.generateSnapshotSignature(
                tenantId,
                offerId,
                pricePerKg,
                currency,
                snapshotMetadata.resolvedAt
            );
            if (signature !== expected) return false;
        }

        if (snapshotMetadata.cover) {
            const { offerId, pricePerKg, currency, signature } = snapshotMetadata.cover;
            if (!signature || !offerId) return false;
            const expected = this.generateSnapshotSignature(
                tenantId,
                offerId,
                pricePerKg,
                currency,
                snapshotMetadata.resolvedAt
            );
            if (signature !== expected) return false;
        }

        return true;
    }

    /**
     * Resolves an authorized supplier offer by ID for a given tenant, computing its canonical price_per_kg.
     */
    async resolveOfferById(tenantId, offerId) {
        if (!tenantId || !offerId) return null;
        try {
            const rows = await db.query(`
                SELECT o.*, s.name as supplier_name, p.name as product_name, p.brand, p.category,
                       v.finish, v.gsm, v.width_mm, v.height_mm, v.caliper_um, v.grain_direction
                FROM supplier_paper_offers o
                JOIN paper_suppliers s ON s.id = o.supplier_id
                JOIN paper_variants v ON v.id = o.variant_id
                JOIN paper_products p ON p.id = v.product_id
                WHERE o.id = ? AND o.deleted_at IS NULL AND o.status = 'ACTIVE'
                  AND (o.valid_from IS NULL OR o.valid_from <= CURRENT_TIMESTAMP)
                  AND (o.valid_until IS NULL OR o.valid_until >= CURRENT_TIMESTAMP)
                  AND (o.visibility = 'MARKETPLACE' OR (o.visibility = 'APPROVED_CUSTOMERS' AND JSON_CONTAINS(COALESCE(o.metadata_json->'$.approved_customer_ids', '[]'), JSON_QUOTE(?))) OR (o.visibility = 'PRIVATE' AND o.tenant_id = ?))
            `, [offerId, tenantId, tenantId]);
            const unwrapped = unwrapRows(rows);
            if (!unwrapped || unwrapped.length === 0) return null;
            const r = unwrapped[0];
            const conversion = this.convertPriceToKg({
                priceAmount: r.price_amount,
                priceBasis: r.price_basis,
                widthMm: r.width_mm,
                heightMm: r.height_mm,
                gsm: r.gsm,
                sheetsPerPack: r.sheets_per_pack,
                currency: r.currency
            });
            const pricePerKg = typeof conversion === 'object' ? conversion.pricePerKg : conversion;
            return {
                offerId: r.id,
                supplierId: r.supplier_id,
                supplierName: r.supplier_name,
                sku: r.supplier_sku,
                pricePerKg,
                currency: r.currency,
                gsm: r.gsm,
                finish: r.finish
            };
        } catch (err) {
            logger.warn({ event: 'resolve_offer_by_id_failed', offerId, tenantId, error: err.message });
            return null;
        }
    }
}

module.exports = new PaperCostIntegrationService();
