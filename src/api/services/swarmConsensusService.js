/**
 * src/api/services/swarmConsensusService.js
 * 
 * Coordinates global industrial decisions across the federation using consensus logic.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('swarm-consensus');
const { v4: uuidv4 } = require('uuid');

class SwarmConsensusService {
    /**
     * Determines optimal factory allocation for a high-priority industrial request.
     */
    async determineAllocationConsensus(requestSpecs, candidateFactories) {
        logger.info({ event: 'consensus_start', type: requestSpecs.type });

        const rejected = [];
        const validCandidates = [];

        for (const factory of candidateFactories) {
            // Anti-centralization: Penalize factories already handling too much federation traffic
            const loadPenalty = (factory.capacity_index > 80) ? 20 : 0;
            const reliabilityBonus = (factory.reliability_index > 90) ? 10 : 0;
            
            const score = (factory.economic_score + factory.energy_score) / 2 - loadPenalty + reliabilityBonus;

            if (score < 40) {
                rejected.push({ id: factory.id, factory_name: factory.factory_name, reason: 'LOW_CONSENSUS_SCORE', score });
                continue;
            }

            validCandidates.push({ ...factory, consensusScore: score });
        }

        validCandidates.sort((a, b) => b.consensusScore - a.consensusScore);

        const topCandidate = validCandidates[0];
        const consensusScore = topCandidate ? topCandidate.consensusScore : 0;
        const confidence = validCandidates.length > 0 ? (1 - (rejected.length / candidateFactories.length)) * 100 : 0;

        const decision = {
            id: uuidv4(),
            decision_type: 'ALLOCATION',
            consensus_score: consensusScore,
            confidence_score: confidence,
            decision_json: JSON.stringify({ 
                winner: topCandidate?.id, 
                specs: requestSpecs 
            }),
            rejected_factories_json: JSON.stringify(rejected)
        };

        await db.query(`
            INSERT INTO swarm_consensus_events 
            (id, decision_type, consensus_score, confidence_score, decision_json, rejected_factories_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [decision.id, decision.decision_type, decision.consensus_score, decision.confidence_score, decision.decision_json, decision.rejected_factories_json]);

        return {
            consensusScore,
            federationConfidence: confidence,
            allocationDecision: topCandidate?.id,
            rejectedFactories: rejected
        };
    }
}

module.exports = new SwarmConsensusService();
