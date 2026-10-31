/**
 * src/api/services/federationRegistryService.js
 * 
 * Manages the registry of federated factories and their operational health.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('federation-registry');
const { v4: uuidv4 } = require('uuid');

class FederationRegistryService {
    async registerFactory(factoryDef) {
        const id = factoryDef.id || uuidv4();
        const sql = `
            INSERT INTO federation_factories (
                id, company_name, factory_name, region, timezone, specialization, 
                capacity_index, reliability_index, latency_score, 
                economic_score, energy_score, federation_state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                company_name = VALUES(company_name),
                factory_name = VALUES(factory_name),
                region = VALUES(region),
                timezone = VALUES(timezone),
                specialization = VALUES(specialization),
                capacity_index = VALUES(capacity_index),
                reliability_index = VALUES(reliability_index),
                latency_score = VALUES(latency_score),
                economic_score = VALUES(economic_score),
                energy_score = VALUES(energy_score),
                federation_state = VALUES(federation_state),
                last_heartbeat = CURRENT_TIMESTAMP
        `;

        await db.query(sql, [
            id, factoryDef.company_name, factoryDef.factory_name, factoryDef.region, factoryDef.timezone || 'UTC',
            factoryDef.specialization, factoryDef.capacity_index || 0, 
            factoryDef.reliability_index || 0, factoryDef.latency_score || 0,
            factoryDef.economic_score || 0, factoryDef.energy_score || 0,
            factoryDef.federation_state || 'ACTIVE'
        ]);

        logger.info({ event: 'factory_registered', id, factory_name: factoryDef.factory_name });
        return { id, ...factoryDef };
    }

    async updateFactoryHeartbeat(id, state = 'ACTIVE') {
        await db.query(
            'UPDATE federation_factories SET federation_state = ?, last_heartbeat = CURRENT_TIMESTAMP WHERE id = ?',
            [state, id]
        );
    }

    async getFederationHealth() {
        try {
            const rows = await db.query('SELECT federation_state, COUNT(*) as count FROM federation_factories GROUP BY federation_state');
            return {
                timestamp: new Date().toISOString(),
                distribution: rows.reduce((acc, r) => {
                    acc[r.federation_state] = r.count;
                    return acc;
                }, {}),
                is_healthy: !rows.some(r => r.federation_state === 'OFFLINE' || r.federation_state === 'DEGRADED')
            };
        } catch (err) {
            logger.error({ event: 'health_query_failed', error: err.message });
            return { timestamp: new Date().toISOString(), distribution: {}, is_healthy: true, degraded: true };
        }
    }

    async getActiveFactories() {
        try {
            return await db.query('SELECT * FROM federation_factories WHERE federation_state IN ("ACTIVE", "RECOVERING")');
        } catch (err) {
            logger.error({ event: 'active_factories_query_failed', error: err.message });
            return [];
        }
    }

    async getFactoryById(id) {
        const [row] = await db.query('SELECT * FROM federation_factories WHERE id = ?', [id]);
        return row;
    }
}

module.exports = new FederationRegistryService();
