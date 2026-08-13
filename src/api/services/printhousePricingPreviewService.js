/**
 * src/api/services/printhousePricingPreviewService.js
 * 
 * Non-binding commercial pricing simulation preview builder.
 * Resolves rule precedence deterministically and maps component provenance.
 * Hardened with decimal safety intermediate rounding to avoid binary floats drift.
 */
const ruleService = require('./printhousePricingRuleService');
const priceBookService = require('./printhousePriceBookService');

function roundDecimal(num, decimals = 4) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

class PrinthousePricingPreviewService {
    /**
     * Compute a dynamic pricing preview.
     */
    async generatePreview(tenantId, {
        priceBookId, quantity, siteId, machineId, materialCatalogId, capabilities, expedited
    }) {
        if (!priceBookId || !quantity || quantity <= 0) {
            throw new Error('priceBookId and positive quantity are required');
        }

        const pb = await priceBookService.getPriceBook(tenantId, priceBookId);
        if (!pb) {
            throw new Error('Price book not found');
        }

        const rules = await ruleService.getRules(tenantId, priceBookId);
        const components = [];
        let netTotal = 0;

        // 1. Resolve Base Rule: Precedence = MACHINE_OVERRIDE → SITE_OVERRIDE → TENANT_DEFAULT
        let baseRule = null;

        if (machineId) {
            baseRule = rules.find(r => r.scope === 'MACHINE_OVERRIDE' && r.machine_id === machineId);
        }
        if (!baseRule && siteId) {
            baseRule = rules.find(r => r.scope === 'SITE_OVERRIDE' && r.site_id === siteId);
        }
        if (!baseRule) {
            baseRule = rules.find(r => r.scope === 'TENANT_DEFAULT');
        }

        if (!baseRule) {
            throw new Error('No baseline pricing rule found in the selected price book');
        }

        // Calculate Base Rate and Setup Charge
        const baseResult = this._calculateRuleCost(baseRule, quantity);
        components.push({
            code: 'BASE_PRODUCTION',
            name: `Base Production Rate (${baseRule.scope})`,
            amount: baseResult.rateAmount.toFixed(4),
            provenance: baseRule.provenance,
            ruleId: baseRule.id
        });
        netTotal = roundDecimal(netTotal + baseResult.rateAmount, 4);

        if (baseResult.setupAmount > 0) {
            components.push({
                code: 'SETUP_CHARGE',
                name: `Production Setup Fee (${baseRule.scope})`,
                amount: baseResult.setupAmount.toFixed(4),
                provenance: baseRule.provenance,
                ruleId: baseRule.id
            });
            netTotal = roundDecimal(netTotal + baseResult.setupAmount, 4);
        }

        // 2. Resolve Material Surcharge
        if (materialCatalogId) {
            const materialRule = rules.find(
                r => r.scope === 'MATERIAL_RULE' && r.material_catalog_id === materialCatalogId
            );
            if (materialRule) {
                const matResult = this._calculateRuleCost(materialRule, quantity);
                components.push({
                    code: 'MATERIAL_SURCHARGE',
                    name: `Substrate Surcharge`,
                    amount: matResult.rateAmount.toFixed(4),
                    provenance: materialRule.provenance,
                    ruleId: materialRule.id
                });
                netTotal = roundDecimal(netTotal + matResult.rateAmount, 4);

                if (matResult.setupAmount > 0) {
                    components.push({
                        code: 'MATERIAL_SETUP',
                        name: `Material Preparation Fee`,
                        amount: matResult.setupAmount.toFixed(4),
                        provenance: materialRule.provenance,
                        ruleId: materialRule.id
                    });
                    netTotal = roundDecimal(netTotal + matResult.setupAmount, 4);
                }
            }
        }

        // 3. Resolve Finishing / Capability Surcharges
        if (Array.isArray(capabilities)) {
            for (const capName of capabilities) {
                const finishingRule = rules.find(
                    r => r.scope === 'FINISHING_RULE' && r.capability_name === capName
                );
                if (finishingRule) {
                    const finResult = this._calculateRuleCost(finishingRule, quantity);
                    components.push({
                        code: 'FINISHING_SURCHARGE',
                        name: `Finishing Operation: ${capName}`,
                        amount: finResult.rateAmount.toFixed(4),
                        provenance: finishingRule.provenance,
                        ruleId: finishingRule.id
                    });
                    netTotal = roundDecimal(netTotal + finResult.rateAmount, 4);

                    if (finResult.setupAmount > 0) {
                        components.push({
                            code: 'FINISHING_SETUP',
                            name: `Finishing Setup: ${capName}`,
                            amount: finResult.setupAmount.toFixed(4),
                            provenance: finishingRule.provenance,
                            ruleId: finishingRule.id
                        });
                        netTotal = roundDecimal(netTotal + finResult.setupAmount, 4);
                    }
                }
            }
        }

        // 4. Expedited production surcharge
        if (expedited) {
            // Check if there is an explicit surcharge rule, else default to +20%
            const surchargeRule = rules.find(r => r.scope === 'SURCHARGE');
            let expediteAmount = 0;
            let ruleIdUsed = 'default';
            let provenanceUsed = 'SYSTEM_DEFAULT';

            if (surchargeRule) {
                const surResult = this._calculateRuleCost(surchargeRule, quantity);
                expediteAmount = surResult.rateAmount;
                ruleIdUsed = surchargeRule.id;
                provenanceUsed = surchargeRule.provenance;
            } else {
                expediteAmount = roundDecimal(netTotal * 0.20, 4); // 20% default markup
            }

            if (expediteAmount > 0) {
                components.push({
                    code: 'EXPEDITE_SURCHARGE',
                    name: 'Expedited Schedule compression Surcharge',
                    amount: expediteAmount.toFixed(4),
                    provenance: provenanceUsed,
                    ruleId: ruleIdUsed
                });
                netTotal = roundDecimal(netTotal + expediteAmount, 4);
            }
        }

        // 5. Minimum Order Value Adjustment
        const minOrderValue = Number(baseRule.minimum_order_value || 0);
        if (netTotal < minOrderValue) {
            const adjustment = roundDecimal(minOrderValue - netTotal, 4);
            components.push({
                code: 'MINIMUM_ORDER_ADJUSTMENT',
                name: `Minimum Job Value Adjustment (Floor: ${minOrderValue.toFixed(2)})`,
                amount: adjustment.toFixed(4),
                provenance: baseRule.provenance,
                ruleId: baseRule.id
            });
            netTotal = minOrderValue;
        }

        // 6. Tax / VAT Separation (10% default mock VAT, kept explicit and separate)
        const mockTaxRate = 0.10;
        const taxAmount = roundDecimal(netTotal * mockTaxRate, 4);
        const totalWithTax = roundDecimal(netTotal + taxAmount, 4);

        return {
            priceBookId,
            currency: pb.currency,
            quantity,
            netTotal: netTotal.toFixed(2),
            taxTotal: taxAmount.toFixed(2),
            grossTotal: totalWithTax.toFixed(2),
            components,
            taxLabels: {
                netLabel: 'NET PRICE (TAX EXCLUDED)',
                taxLabel: 'VAT / TAX (10.0%)',
                grossLabel: 'GROSS PRICE (TAX INCLUDED)'
            }
        };
    }

    /**
     * Compute rates using the matched rule's base_price, setup_charge, and quantity tiers.
     */
    _calculateRuleCost(rule, quantity) {
        let rateAmount = 0;
        let setupAmount = Number(rule.setup_charge || 0);

        // Try to match quantity tier
        const matchedTier = rule.tiers && rule.tiers.find(
            t => quantity >= t.min_quantity && (t.max_quantity === null || quantity <= t.max_quantity)
        );

        if (matchedTier) {
            const unitRate = Number(matchedTier.unit_rate || 0);
            const flatCharge = Number(matchedTier.flat_charge || 0);

            if (matchedTier.method === 'UNIT_PRICE') {
                rateAmount = roundDecimal(unitRate * quantity, 4);
            } else if (matchedTier.method === 'FLAT_PRICE') {
                rateAmount = flatCharge;
            } else if (matchedTier.method === 'BASE_PLUS_UNIT') {
                rateAmount = roundDecimal(flatCharge + roundDecimal(unitRate * quantity, 4), 4);
            }
        } else {
            // Fallback to base_price on the rule
            const basePrice = Number(rule.base_price || 0);
            if (rule.pricing_unit === 'PER_SHEET' || rule.pricing_unit === 'PER_UNIT' || rule.pricing_unit === 'PER_IMPRESSION') {
                rateAmount = roundDecimal(basePrice * quantity, 4);
            } else {
                // PER_JOB or PER_SETUP
                rateAmount = basePrice;
            }
        }

        return {
            rateAmount,
            setupAmount
        };
    }
}

module.exports = new PrinthousePricingPreviewService();
