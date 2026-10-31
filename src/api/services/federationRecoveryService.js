/**
 * src/api/services/federationRecoveryService.js
 * 
 * Manages industrial resilience by isolating unstable factories and redirecting production.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('federation-recovery');
const registry = require('./federationRegistryService');
const { v4: uuidv4 } = require('uuid');

class FederationRecoveryService {
    /**
     * Isolates a degraded factory from the federation to prevent cascading failures.
     */
    async isolateFactory(factoryId, reason = 'HEALTH_DEGRADATION') {
        const eventId = uuidv4();
        
        await db.query(`
            INSERT INTO federation_recovery_events 
            (id, factory_id, event_type, severity, action_taken, recovery_status)
            VALUES (?, ?, ?, 'HIGH', ?, 'ACTIVE')
        `, [eventId, factoryId, 'ISOLATION', `Factory isolated due to: ${reason}`]);

        await registry.updateFactoryHeartbeat(factoryId, 'OFFLINE');

        logger.warn({ event: 'factory_isolated', factoryId, eventId });
        return eventId;
    }

    /**
     * Initiates recovery for an isolated or degraded factory.
     */
    async recoverFactory(factoryId) {
        await registry.updateFactoryHeartbeat(factoryId, 'RECOVERING');
        
        await db.query(
            'UPDATE federation_recovery_events SET recovery_status = "RESOLVED" WHERE factory_id = ? AND recovery_status = "ACTIVE"',
            [factoryId]
        );

        logger.info({ event: 'factory_recovery_started', factoryId });
    }

    async getActiveRecoveryEvents() {
        return await db.query('SELECT * FROM federation_recovery_events WHERE recovery_status != "RESOLVED"');
    }
}

module.exports = new FederationRecoveryService();
