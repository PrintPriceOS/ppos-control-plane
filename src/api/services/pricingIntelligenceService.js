const db = require('./db');

class PricingIntelligenceService {
    /**
     * Resolves the best pricing profile for a printer/machine combination.
     * machine_id is nullable.
     */
    async resolvePricingProfile(printerId, machineId = null) {
        try {
            // 1. Try Machine-specific profile
            if (machineId) {
                const { rows: machineProfiles } = await db.query(
                    "SELECT * FROM printer_pricing_profiles WHERE printer_id = ? AND machine_id = ? AND active = TRUE",
                    [printerId, machineId]
                );
                if (machineProfiles.length > 0) return machineProfiles[0];
            }

            // 2. Try Printer-wide profile
            const { rows: printerProfiles } = await db.query(
                "SELECT * FROM printer_pricing_profiles WHERE printer_id = ? AND pricing_scope = 'PRINTER' AND active = TRUE",
                [printerId]
            );
            if (printerProfiles.length > 0) return printerProfiles[0];

            return null;
        } catch (err) {
            console.error('[PRICING-INTEL] Failed to resolve profile:', err.message);
            return null;
        }
    }

    /**
     * Applies commercial strategy to the canonical operational cost.
     */
    applyCommercialStrategy(operationalCost, profile, inputs = {}) {
        const {
            is_rush = false,
            lead_time_days = 3
        } = inputs;

        const MAX_PLATFORM_MARKUP_PCT = 100;
        const MAX_ROUTING_PREMIUM_PCT = 100;

        let platformMarkupPct = Number(profile.platform_markup_pct ?? 15);
        let targetMarginPct = Number(profile.target_margin_pct ?? 20);
        let routingPremiumPct = Number(profile.dynamic_routing_premium ?? 0);

        if (isNaN(platformMarkupPct) || platformMarkupPct < 0) platformMarkupPct = 0;
        if (platformMarkupPct > MAX_PLATFORM_MARKUP_PCT) platformMarkupPct = MAX_PLATFORM_MARKUP_PCT;

        if (isNaN(targetMarginPct) || targetMarginPct < 0) targetMarginPct = 0;
        if (targetMarginPct >= 100) throw new Error("Target margin must be less than 100%");

        if (isNaN(routingPremiumPct) || routingPremiumPct < 0) routingPremiumPct = 0;
        if (routingPremiumPct > MAX_ROUTING_PREMIUM_PCT) routingPremiumPct = MAX_ROUTING_PREMIUM_PCT;

        // 1. Apply Markup and Premium
        const priceAfterMarkup = operationalCost * (1 + platformMarkupPct / 100);
        const priceAfterPremium = priceAfterMarkup * (1 + routingPremiumPct / 100);

        // 2. Apply Target Margin
        let commercialPrice = priceAfterPremium / (1 - targetMarginPct / 100);

        // 3. Multipliers
        if (is_rush) {
            commercialPrice *= Number(profile.rush_multiplier || 1.2);
        }

        // Simple lead time discount: if lead time > default(3), apply discount
        if (lead_time_days > 5) {
            commercialPrice *= Number(profile.lead_time_discount_multiplier || 0.95);
        }

        // 4. Apply Selling Price Minimum (from commercial strategy)
        // Assume profile.minimum_job_fee acts as the minimum selling price
        const minimumSellingPrice = Number(profile.minimum_job_fee ?? 0);
        const finalSuggestedPriceRaw = Math.max(commercialPrice, minimumSellingPrice);

        return {
            operationalCost: operationalCost.toFixed(4),
            priceAfterMarkup: priceAfterMarkup.toFixed(4),
            priceAfterPremium: priceAfterPremium.toFixed(4),
            finalSuggestedPriceRaw: finalSuggestedPriceRaw.toFixed(4),
            finalSuggestedPrice: Number(finalSuggestedPriceRaw.toFixed(2)).toFixed(2),
            platformMarkupPct: platformMarkupPct.toFixed(4),
            targetMarginPct: targetMarginPct.toFixed(4),
            routingPremiumPct: routingPremiumPct.toFixed(4),
            minimumSellingPrice: minimumSellingPrice.toFixed(4)
        };
    }

    /**
     * Builds a detailed breakdown for audit/inspection.
     */
    buildBreakdown(inputs, profile, strategyResult) {
        return {
            inputs,
            profile_id: profile.id,
            formula_v: 'commercial-strategy-v2',
            components: {
                operational_cost: strategyResult.operationalCost,
                platform_markup_pct: strategyResult.platformMarkupPct,
                target_margin_pct: strategyResult.targetMarginPct,
                routing_premium_pct: strategyResult.routingPremiumPct,
                min_fee_applied: strategyResult.finalSuggestedPriceRaw === strategyResult.minimumSellingPrice
            },
            economic_summary: {
                production_cost: strategyResult.operationalCost,
                price_after_markup: strategyResult.priceAfterMarkup,
                price_after_premium: strategyResult.priceAfterPremium,
                suggested_price_raw: strategyResult.finalSuggestedPriceRaw,
                suggested_price: strategyResult.finalSuggestedPrice
            }
        };
    }
}

module.exports = new PricingIntelligenceService();
