/**
 * src/api/services/distributedOrchestrationService.js
 * 
 * Orchestrates industrial dispatches across the federated factory network.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('distributed-orchestration');
const registry = require('./federationRegistryService');
const consensus = require('./swarmConsensusService');
const { v4: uuidv4 } = require('uuid');

class DistributedOrchestrationService {
    /**
     * Delegates a dispatch to a remote factory within the federation.
     */
    async delegateDispatch(dispatchId, targetFactoryId, reason = 'LOAD_REBALANCING') {
        const dispatch = await db.query('SELECT * FROM manufacturing_dispatches WHERE id = ?', [dispatchId]);
        if (!dispatch[0]) throw new Error('Dispatch not found');

        const delegationId = uuidv4();
        await db.query(`
            INSERT INTO distributed_dispatch_delegations 
            (id, dispatch_id, from_factory_id, to_factory_id, delegation_reason)
            VALUES (?, ?, ?, ?, ?)
        `, [delegationId, dispatchId, 'local-factory', targetFactoryId, reason]);

        await db.query(
            'UPDATE manufacturing_dispatches SET delegated_to_factory = ?, federation_id = ? WHERE id = ?',
            [targetFactoryId, delegationId, dispatchId]
        );

        logger.info({ event: 'dispatch_delegated', dispatchId, targetFactoryId, delegationId });
        return delegationId;
    }

    /**
     * Rebalances industrial pressure across the federation.
     */
    async rebalanceFederationLoad() {
        const activeFactories = await registry.getActiveFactories();
        if (activeFactories.length < 2) return false;

        const overloaded = activeFactories.filter(f => f.capacity_index > 90);
        const underloaded = activeFactories.filter(f => f.capacity_index < 50);

        if (overloaded.length === 0 || underloaded.length === 0) return false;

        let rebalancedCount = 0;
        for (const source of overloaded) {
            const target = underloaded[0]; // Simple selection for now
            
            // Find a candidate dispatch to delegate
            const candidates = await db.query(
                'SELECT id FROM manufacturing_dispatches WHERE status = "QUEUED" AND delegated_to_factory IS NULL LIMIT 5'
            );

            for (const c of candidates) {
                await this.delegateDispatch(c.id, target.id, 'FEDERATION_REBALANCE');
                rebalancedCount++;
            }
        }

        return rebalancedCount > 0;
    }
}

module.exports = new DistributedOrchestrationService();
