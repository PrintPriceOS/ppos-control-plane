/**
 * src/api/services/routing/RoutingScoreService.js
 * 
 * Component-based scoring logic for industrial routing decisions.
 * Evaluates nodes across five primary dimensions: Cost, Time, Capability, Risk, and Geography.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('routing-score');
const slaPredictor = require('./SlaPredictionService');
const carbonService = require('./CarbonRoutingService');

class RoutingScoreService {
    /**
     * Evaluates a single node for a given job.
     */
    async evaluateNode(node, jobSpecs, origin) {
        try {
            // 1. CAPABILITY SCORE (0 or 100 - Hard Gate)
            const capabilityResult = this._calculateCapabilityScore(node, jobSpecs);
            if (capabilityResult.score === 0) {
                return { total_score: 0, ineligible: true, reason: capabilityResult.reason };
            }

            // 2. COST SCORE
            const costScore = this._calculateCostScore(node, jobSpecs);

            // 3. TIME SCORE (Reliability + Queue)
            const timePrediction = await slaPredictor.predictSlaLikelihood(node.id, jobSpecs.deadline, jobSpecs.complexity || 1);
            const timeScore = timePrediction.likelihood;

            // 4. RISK SCORE (Uptime + Incident History)
            const riskScore = this._calculateRiskScore(node);

            // 5. GEOGRAPHIC & CARBON SCORE
            const carbonResult = await carbonService.calculateCarbonScore(origin, node);
            const geographicScore = carbonResult.score; // Geographic efficiency is tied to carbon in this model

            // Weighted Aggregation
            // Default Weights: Cost(25%), Time(30%), Capability(Pass/Fail), Risk(20%), Geo(25%)
            const totalScore = (
                (costScore * 0.25) + 
                (timeScore * 0.30) + 
                (riskScore * 0.20) + 
                (geographicScore * 0.25)
            ).toFixed(2);

            return {
                total_score: parseFloat(totalScore),
                breakdown: {
                    capability: capabilityResult.score,
                    cost: costScore,
                    time: timeScore,
                    risk: riskScore,
                    geographic: geographicScore
                },
                metadata: {
                    sla_risk: timePrediction.risk,
                    distance_km: carbonResult.distance_km,
                    estimated_co2: carbonResult.estimated_co2_kg
                }
            };

        } catch (err) {
            logger.error({ event: 'node_evaluation_failed', node_id: node.id, error: err.message });
            return { total_score: 0, ineligible: true, error: 'EVALUATION_ERROR' };
        }
    }

    _calculateCapabilityScore(node, specs) {
        // Hard Gates: Trim Size, Binding, Paper
        const caps = node.capabilities_json || {};
        const supportedProducts = node.supported_products || [];

        // Example check: Binding
        if (specs.binding && !node.binding_capabilities?.includes(specs.binding)) {
            return { score: 0, reason: `UNSUPPORTED_BINDING: ${specs.binding}` };
        }

        // Example check: Paper
        if (specs.paper_weight && caps.max_paper_weight < specs.paper_weight) {
            return { score: 0, reason: `PAPER_WEIGHT_EXCEEDED: ${specs.paper_weight}g` };
        }

        return { score: 100 };
    }

    _calculateCostScore(node, specs) {
        // Higher score = Lower Cost
        // Use economic_efficiency from telemetry
        const efficiency = node.economic_efficiency || 1.0;
        
        // Base score 100, penalized by high costs
        // If efficiency is 1.5, it's 50% more expensive than average -> score 66
        // If efficiency is 0.8, it's 20% cheaper than average -> score 120 (capped at 100)
        return Math.min(100, (100 / (efficiency || 1))).toFixed(2);
    }

    _calculateRiskScore(node) {
        // Uptime score is a direct proxy for reliability
        // We can also penalize for 'DEGRADED' or 'OFFLINE' states
        let score = node.uptime_score || 100;
        
        if (node.status === 'DEGRADED') score *= 0.5;
        if (node.status === 'CRITICAL') score *= 0.2;
        
        return parseFloat(score.toFixed(2));
    }
}

module.exports = new RoutingScoreService();
