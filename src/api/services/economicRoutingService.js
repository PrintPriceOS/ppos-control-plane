/**
 * src/api/services/economicRoutingService.js
 * 
 * Handles technical compatibility and economic cost calculations for routing.
 * Returns both valid candidates and rejected ones for transparency.
 */
const machineRegistry = require('./machineRegistryService');
const pricingIntelligence = require('./pricingIntelligenceService');
const logger = require('./logger').child('economic-routing');

class EconomicRoutingService {
    /**
     * Finds candidates and calculates technical + economic base scores.
     */
    async evaluateCandidates(specs) {
        const {
            binding,
            paper,
            copies = 1,
            colour,
            sheet_size,
            gsm,
            is_rush = false
        } = specs;

        try {
            // 1. Find technically compatible machines
            const { matched: machines, rejected } = await machineRegistry.findMatchingMachines({
                paper_type: paper,
                sheet_size,
                colour_mode: colour,
                binding,
                gsm,
                run_length: copies
            });

            const candidates = [];
            const rejectedWithPricing = [...rejected];

            for (const machine of machines) {
                // 2. Resolve pricing profile
                const pricingProfile = await pricingIntelligence.resolvePricingProfile(machine.node_id, machine.id);
                
                if (!pricingProfile) {
                    rejectedWithPricing.push({
                        id: machine.id,
                        nodeId: machine.node_id,
                        reason: 'NO_PRICING_PROFILE'
                    });
                    continue;
                }

                // 3. Calculate estimated cost
                const estimatedCost = pricingIntelligence.calculateProductionCost({
                    estimated_sheet_count: copies,
                    color_factor: (colour === 'full' || colour === '4/4') ? 1.0 : 0.0,
                    is_rush
                }, pricingProfile);

                candidates.push({
                    nodeId: machine.node_id,
                    machineId: machine.id,
                    technicalScore: 100,
                    estimatedCost,
                    pricingProfileId: pricingProfile.id,
                    specsMatched: {
                        binding,
                        paper,
                        colour
                    }
                });
            }

            return {
                candidates,
                rejectedCandidates: rejectedWithPricing
            };
        } catch (err) {
            logger.error({ event: 'evaluation_failed', error: err.message });
            throw err;
        }
    }
}

module.exports = new EconomicRoutingService();
