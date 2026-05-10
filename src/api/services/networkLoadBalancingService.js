/**
 * src/api/services/networkLoadBalancingService.js
 * 
 * Manages global industrial equilibrium and queue distribution.
 */
const logger = require('./logger').child('network-load-balancing');

class NetworkLoadBalancingService {
    /**
     * Identifies industrial imbalance in the network.
     */
    detectImbalance(nodes) {
        if (!nodes || nodes.length < 2) return 0;
        
        const utilizations = nodes.map(n => n.utilization || 0);
        const max = Math.max(...utilizations);
        const min = Math.min(...utilizations);
        
        const imbalance = max - min;
        
        if (imbalance > 50) {
            logger.warn({ event: 'industrial_imbalance_detected', imbalance, max, min });
        }
        
        return imbalance;
    }

    /**
     * Calculates balancing penalty for high-load nodes.
     */
    calculateBalancingPenalty(utilization) {
        if (utilization > 80) return (utilization - 80) * 2;
        return 0;
    }
}

module.exports = new NetworkLoadBalancingService();
