/**
 * src/api/services/routing/CarbonRoutingService.js
 * 
 * Industrial Logistics Intelligence for Carbon-Neutral Manufacturing.
 * Calculates environmental impact based on transport distance and regional energy profiles.
 */
const logger = require('../logger').child('carbon-routing');

class CarbonRoutingService {
    /**
     * Calculates the carbon score for a potential route.
     * Higher score = Better (Lower Carbon)
     */
    async calculateCarbonScore(origin, destinationNode) {
        try {
            // 1. Calculate Distance (Haversine)
            const distanceKm = this._calculateDistance(
                origin.lat, origin.lng, 
                destinationNode.latitude, destinationNode.longitude
            );

            // 2. Transport Impact (Standard CO2 per km for freight)
            // Approx 150g CO2 per tonne-km for truck, 50g for rail, 500g for air
            const transportType = distanceKm > 1500 ? 'AIR' : distanceKm > 500 ? 'TRUCK' : 'LOCAL';
            const co2PerKm = transportType === 'AIR' ? 0.5 : transportType === 'TRUCK' ? 0.15 : 0.05;
            const estimatedCo2Kg = (distanceKm * co2PerKm).toFixed(2);

            // 3. Regional Energy Profile (Green Energy Index)
            // Heuristic: Some regions are "greener" than others
            const regionalGreenIndex = this._getRegionalGreenIndex(destinationNode.region);

            // 4. Final Carbon Score (0-100)
            // 100 = Perfect (Local, Green Energy)
            // 0 = Worst (Transatlantic Air, Coal Energy)
            let baseScore = 100;
            
            // Distance penalty
            baseScore -= (distanceKm / 50); // -1 point per 50km
            
            // Energy boost/penalty
            baseScore = baseScore * (regionalGreenIndex / 100);

            const finalScore = Math.max(0, Math.min(100, baseScore)).toFixed(2);

            return {
                score: parseFloat(finalScore),
                distance_km: parseFloat(distanceKm.toFixed(2)),
                estimated_co2_kg: parseFloat(estimatedCo2Kg),
                transport_type: transportType,
                regional_index: regionalGreenIndex
            };

        } catch (err) {
            logger.error({ event: 'carbon_calculation_failed', error: err.message });
            return { score: 50, error: 'CALCULATION_ERROR' };
        }
    }

    _calculateDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 500; // Default fallback
        const R = 6371; // Radius of the earth in km
        const dLat = this._deg2rad(lat2 - lat1);
        const dLon = this._deg2rad(lon2 - lon1);
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this._deg2rad(lat1)) * Math.cos(this._deg2rad(lat2)) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2); 
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
        return R * c; 
    }

    _deg2rad(deg) {
        return deg * (Math.PI / 180);
    }

    _getRegionalGreenIndex(region) {
        const energyProfiles = {
            'eu-west': 85, // High wind/hydro
            'eu-north': 95, // High geothermal/hydro
            'eu-central': 65, // Mixed
            'eu-south': 75, // High solar
            'us-east': 60,
            'us-west': 80,
            'asia-east': 40
        };
        return energyProfiles[region?.toLowerCase()] || 50;
    }
}

module.exports = new CarbonRoutingService();
