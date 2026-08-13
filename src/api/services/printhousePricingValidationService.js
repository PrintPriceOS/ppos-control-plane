/**
 * src/api/services/printhousePricingValidationService.js
 * 
 * Performs pricing rule integrity checks: currency matching, quantity tier coverage, overlaps, gaps.
 */
const ruleService = require('./printhousePricingRuleService');
const priceBookService = require('./printhousePriceBookService');

class PrinthousePricingValidationService {
    /**
     * Run all validation audits on a price book.
     */
    async validatePriceBook(tenantId, priceBookId) {
        const pb = await priceBookService.getPriceBook(tenantId, priceBookId);
        if (!pb) {
            throw new Error('Price book not found');
        }

        const rules = await ruleService.getRules(tenantId, priceBookId);
        const errors = [];
        const advisories = [];

        // 1. Coverage Check: Check if there is at least one TENANT_DEFAULT rule
        const hasDefaultRule = rules.some(r => r.scope === 'TENANT_DEFAULT');
        if (!hasDefaultRule) {
            errors.push({
                code: 'MISSING_DEFAULT_PRICING_RULE',
                message: 'At least one TENANT_DEFAULT rule is required to define baseline prices.'
            });
        }

        // 1.1 Duplicate pricing rules detection
        const ruleKeys = new Set();
        for (const r of rules) {
            let key = r.scope;
            if (r.scope === 'SITE_OVERRIDE') {
                key += `:${r.site_id}`;
            } else if (r.scope === 'MACHINE_OVERRIDE') {
                key += `:${r.site_id}:${r.machine_id}`;
            } else if (r.scope === 'MATERIAL_RULE') {
                key += `:${r.site_id}:${r.material_catalog_id}`;
            } else if (r.scope === 'FINISHING_RULE') {
                key += `:${r.capability_name}`;
            }
            if (ruleKeys.has(key)) {
                errors.push({
                    code: 'DUPLICATE_PRICING_RULE',
                    message: `Duplicate pricing rule found for scope ${r.scope} targeting configuration: ${key}.`
                });
            } else {
                ruleKeys.add(key);
            }
        }

        // 1.2 Overlapping validity dates check
        try {
            const otherBooks = await priceBookService.listPriceBooks(tenantId);
            const activeBooks = otherBooks.filter(
                b => b.id !== priceBookId && (b.status === 'PUBLISHED' || b.status === 'APPROVED')
            );
            const currentFrom = pb.effective_from ? new Date(pb.effective_from).getTime() : 0;
            const currentTo = pb.effective_to ? new Date(pb.effective_to).getTime() : Infinity;

            for (const ob of activeBooks) {
                const otherFrom = ob.effective_from ? new Date(ob.effective_from).getTime() : 0;
                const otherTo = ob.effective_to ? new Date(ob.effective_to).getTime() : Infinity;

                if (currentFrom <= otherTo && otherFrom <= currentTo) {
                    advisories.push({
                        code: 'OVERLAPPING_EFFECTIVE_DATES',
                        message: `This price book's validity range overlaps with another approved/published book: "${ob.name}" (v${ob.version}).`
                    });
                }
            }
        } catch (e) {
            // degrade gracefully
        }

        // 2. Currency Consistency Check
        const mismatchedCurrencyRules = rules.filter(
            r => r.currency && r.currency.toUpperCase() !== pb.currency.toUpperCase()
        );
        if (mismatchedCurrencyRules.length > 0) {
            errors.push({
                code: 'PRICING_RULE_CURRENCY_MISMATCH',
                message: `All rules must match the price book currency (${pb.currency}). Found mismatched rules.`,
                ruleIds: mismatchedCurrencyRules.map(r => r.id)
            });
        }

        // 3. Quantity Tier Integrity Check
        for (const r of rules) {
            if (!r.tiers || r.tiers.length === 0) {
                // If it's a rule that requires quantity tiers (e.g. quantity-tier method), warn or block.
                // But in general, rules with no tiers just use the flat base_price.
                continue;
            }

            // Sort tiers by min_quantity
            const sortedTiers = [...r.tiers].sort((a, b) => a.min_quantity - b.min_quantity);

            // Fact A: Check starting point
            const firstMin = sortedTiers[0].min_quantity;
            if (firstMin > 1) {
                errors.push({
                    code: 'TIER_START_GAP',
                    message: `Pricing rule ${r.id} (${r.scope}) tiers must start at 0 or 1. Found start at ${firstMin}.`,
                    ruleId: r.id
                });
            }

            // Fact B: Check gaps, overlaps, and open-ended suffix
            for (let i = 0; i < sortedTiers.length; i++) {
                const current = sortedTiers[i];
                const next = sortedTiers[i + 1];

                if (current.max_quantity !== null) {
                    if (current.min_quantity > current.max_quantity) {
                        errors.push({
                            code: 'TIER_INVALID_RANGE',
                            message: `Pricing rule ${r.id} contains a tier where min quantity (${current.min_quantity}) exceeds max quantity (${current.max_quantity}).`,
                            ruleId: r.id
                        });
                    }

                    if (next) {
                        // Check for overlap or gap
                        const expectedNextMin = current.max_quantity + 1;
                        if (next.min_quantity < expectedNextMin) {
                            errors.push({
                                code: 'TIER_OVERLAP',
                                message: `Pricing rule ${r.id} contains overlapping quantity tiers: ${current.min_quantity}-${current.max_quantity} overlaps with ${next.min_quantity}-${next.max_quantity || '∞'}.`,
                                ruleId: r.id
                            });
                        } else if (next.min_quantity > expectedNextMin) {
                            errors.push({
                                code: 'TIER_GAP',
                                message: `Pricing rule ${r.id} contains a gap between tiers: gap found between ${current.min_quantity}-${current.max_quantity} and ${next.min_quantity}-${next.max_quantity || '∞'}.`,
                                ruleId: r.id
                            });
                        }
                    }
                } else {
                    // Current is open-ended.
                    // If it is NOT the last tier, it is an overlap error!
                    if (next) {
                        errors.push({
                            code: 'TIER_MID_OPEN_ENDED',
                            message: `Pricing rule ${r.id} contains an open-ended tier (${current.min_quantity}-∞) that is not the final tier.`,
                            ruleId: r.id
                        });
                    }
                }
            }

            // Check if suffix tier is open-ended
            const lastTier = sortedTiers[sortedTiers.length - 1];
            if (lastTier && lastTier.max_quantity !== null) {
                advisories.push({
                    code: 'TIER_SUFFIX_CLOSED',
                    message: `Pricing rule ${r.id} is closed at the final tier (${lastTier.min_quantity}-${lastTier.max_quantity}). Quantities exceeding ${lastTier.max_quantity} will not resolve rates.`,
                    ruleId: r.id
                });
            }
        }

        const isValid = errors.length === 0;

        return {
            isValid,
            errors,
            advisories,
            checkedAt: new Date().toISOString()
        };
    }
}

module.exports = new PrinthousePricingValidationService();
