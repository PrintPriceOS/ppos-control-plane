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
     * Converts a price from any supported basis into canonical price_per_kg.
     * Supported bases: KG, TONNE, SHEET, THOUSAND_SHEETS, PACK.
     * 
     * @param {Object} params
     * @param {number} params.priceAmount
     * @param {string} params.priceBasis
     * @param {number} params.widthMm
     * @param {number} params.heightMm
     * @param {number} params.gsm
     * @param {number} [params.sheetsPerPack]
     * @returns {number} Normalized price in EUR/kg (rounded to 4 decimal places)
     */
    convertPriceToKg({ priceAmount, priceBasis, widthMm, heightMm, gsm, sheetsPerPack = null }) {
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

        return Number(pricePerKg.toFixed(4));
    }

    /**
     * Resolves the market paper rate for given physical specifications from active,
     * authorized supplier offers for the tenant.
     * 
     * @param {string} tenantId - Printhouse tenant
     * @param {Object} criteria - Search criteria (gsm, finish, category, widthMm, heightMm)
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

        // Calculate normalized price_per_kg for each candidate offer and sort ascending (best price first)
        const candidates = rows.map(r => {
            try {
                const pricePerKg = this.convertPriceToKg({
                    priceAmount: r.price_amount,
                    priceBasis: r.price_basis,
                    widthMm: r.width_mm,
                    heightMm: r.height_mm,
                    gsm: r.gsm,
                    sheetsPerPack: r.sheets_per_pack
                });
                return {
                    ...r,
                    pricePerKg
                };
            } catch (err) {
                logger.warn({ event: 'offer_price_conversion_failed', offerId: r.id, error: err.message });
                return null;
            }
        }).filter(Boolean);

        if (candidates.length === 0) {
            return null;
        }

        // Sort by lowest price per kg
        candidates.sort((a, b) => a.pricePerKg - b.pricePerKg);
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
            resolvedAt: new Date().toISOString()
        };
    }

    /**
     * Estimates paper requirements and costs for a commercial book/print job.
     * Uses standard industrial signature imposition and scrap curves.
     * 
     * @param {Object} jobSpec
     * @param {number} jobSpec.copies - Run length (number of books / prints)
     * @param {number} jobSpec.interior_pages - Total page count for interior
     * @param {number} [jobSpec.book_width_mm=148] - Finished trim width
     * @param {number} [jobSpec.book_height_mm=210] - Finished trim height
     * @param {number} [jobSpec.paper_weight_interior=80] - Interior GSM
     * @param {number} [jobSpec.paper_weight_cover=250] - Cover GSM
     * @param {string} [jobSpec.paper_type_interior='offset'] - Interior paper type
     * @param {string} [jobSpec.paper_type_cover='mc'] - Cover paper type
     * @param {number} [jobSpec.signature_size=16] - Pages per signature (16, 8, 4)
     * @param {number} [jobSpec.press_sheet_width_mm=700] - Press sheet width
     * @param {number} [jobSpec.press_sheet_height_mm=1000] - Press sheet height
     * @param {number} [jobSpec.rate_per_kg_interior=null] - Optional override price/kg
     * @param {number} [jobSpec.rate_per_kg_cover=null] - Optional override price/kg
     * @returns {Object} Estimated sheets, kg, scrap, and procurement costs
     */
    calculateJobPaperRequirements(jobSpec) {
        const copies = Math.max(1, Number(jobSpec.copies) || 1);
        const interiorPages = Math.max(1, Number(jobSpec.interior_pages ?? jobSpec.interiorPages) || 1);
        const signatureSize = Number(jobSpec.signature_size ?? jobSpec.signatureSize) || 16;
        const interiorGsm = Number(jobSpec.paper_weight_interior ?? jobSpec.interiorWeightGsm) || 80;
        const coverGsm = Number(jobSpec.paper_weight_cover ?? jobSpec.coverWeightGsm) || 250;

        const pressWidthMm = Number(jobSpec.press_sheet_width_mm) || 700;
        const pressHeightMm = Number(jobSpec.press_sheet_height_mm) || 1000;

        // Interior Signatures calculation
        // For a 16-page signature on a full press sheet (700x1000 or similar), 1 sheet = 1 signature (16 pages)
        const signaturesCount = Math.max(1, Math.ceil(interiorPages / signatureSize));
        const netInteriorSheets = copies * signaturesCount;

        // Cover Sheets calculation
        // Typically 2 to 4 covers fit on one press sheet; assume 2 covers per press sheet
        const netCoverSheets = Math.ceil(copies / 2);

        // Industrial scrap allowances (makeready setup + running waste)
        // Setup waste: 100 sheets per signature setup; 50 sheets for cover setup
        const interiorMakereadySheets = signaturesCount * 100;
        const coverMakereadySheets = 50;

        // Run waste: 2.5% of net run
        const runWasteRate = 0.025;
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
            pressSheetDimensions: `${pressWidthMm}x${pressHeightMm} mm`,
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
                estimatedCost: interiorCost
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
                estimatedCost: coverCost
            },
            totals: {
                totalNetSheets: netInteriorSheets + netCoverSheets,
                totalGrossSheets: totalInteriorSheets + totalCoverSheets,
                totalNetKg,
                totalGrossKg,
                totalWasteKg,
                wastePercentage: totalGrossKg > 0 ? Number(((totalWasteKg / totalGrossKg) * 100).toFixed(1)) : 0,
                totalEstimatedCost
            }
        };
    }

    /**
     * Builds a canonical BPE candidate override patch from market supplier paper rates.
     * Compatible with buildPriceCalibrationAdapter and canonical buildPrice(params, house).
     * 
     * @param {string} tenantId 
     * @param {Object} options
     * @param {string} [options.interiorPaperType='offset']
     * @param {number} [options.interiorGsm=80]
     * @param {string} [options.coverPaperType='mc']
     * @param {number} [options.coverGsm=250]
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

        const [resolvedInterior, resolvedCover] = await Promise.all([
            this.resolveMarketPaperRate(tenantId, { gsm: interiorGsm }),
            this.resolveMarketPaperRate(tenantId, { gsm: coverGsm })
        ]);

        const candidateOverrides = {};
        const snapshotMetadata = {
            source: 'PPOS_PAPER_SUPPLIER_HUB',
            tenantId,
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
                gsm: resolvedInterior.gsm,
                finish: resolvedInterior.finish
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
                gsm: resolvedCover.gsm,
                finish: resolvedCover.finish
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
}

module.exports = new PaperCostIntegrationService();
