/**
 * src/api/services/economicRoutingService.js
 * 
 * Handles technical compatibility and economic cost calculations for routing.
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
            const machines = await machineRegistry.findMatchingMachines({
                paper_type: paper,
                sheet_size,
                colour_mode: colour === 'full' ? '4/4' : '1/1',
                binding,
                gsm,
                run_length: copies
            });

            if (machines.length === 0) {
                return [];
            }

            const candidates = [];

            for (const machine of machines) {
                // 2. Resolve pricing profile
                const pricingProfile = await pricingIntelligence.resolvePricingProfile(machine.node_id, machine.id);
                
                if (!pricingProfile) {
                    logger.warn({ event: 'no_pricing_profile', nodeId: machine.node_id, machineId: machine.id });
                    continue;
                }

                // 3. Calculate estimated cost
                const estimatedCost = pricingIntelligence.calculateProductionCost({
                    estimated_sheet_count: copies, // Simplified mapping
                    color_factor: colour === 'full' ? 1.0 : 0.0,
                    is_rush
                }, pricingProfile);

                // 4. Calculate Economic Score (Higher is better, normalized 0-100)
                // Logic: lower cost relative to a baseline or fixed scale
                // For now, let's use a dynamic normalization if multiple candidates exist, 
                // but here we provide the raw components.
                
                candidates.push({
                    nodeId: machine.node_id,
                    machineId: machine.id,
                    technicalScore: 100, // They matched the registry filter
                    estimatedCost,
                    pricingProfileId: pricingProfile.id,
                    specsMatched: {
                        binding,
                        paper,
                        colour
                    }
                });
            }

            return candidates;
        } catch (err) {
            logger.error({ event: 'evaluation_failed', error: err.message });
            throw err;
        }
    }
}

module.exports = new EconomicRoutingService();
