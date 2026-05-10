/**
 * src/api/services/federatedDigitalTwinService.js
 * 
 * Aggregates industrial telemetry to generate a global federation-wide digital twin.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('federated-digital-twin');
const { v4: uuidv4 } = require('uuid');

class FederatedDigitalTwinService {
    async generateFederationSnapshot(type = 'PERIODIC') {
        try {
            const factories = await db.query('SELECT * FROM federation_factories');
            
            const globalUtil = factories.reduce((acc, f) => acc + f.capacity_index, 0) / (factories.length || 1);
            const globalEconomic = factories.reduce((acc, f) => acc + f.economic_score, 0) / (factories.length || 1);
            
            // Compute imbalance: Difference between max and min utilization
            const utils = factories.map(f => f.capacity_index);
            const imbalance = factories.length > 0 ? Math.max(...utils) - Math.min(...utils) : 0;

            const snapshot = {
                id: `fdt_${Date.now()}`,
                snapshot_type: type,
                global_utilization: globalUtil,
                federation_stability: 100 - (imbalance / 2),
                inter_factory_imbalance: imbalance,
                economic_efficiency: globalEconomic,
                swarm_resilience_index: factories.filter(f => f.federation_state === 'ACTIVE').length / (factories.length || 1) * 100,
                telemetry_snapshot_json: JSON.stringify({
                    factory_count: factories.length,
                    timestamp: new Date().toISOString()
                })
            };

            await db.query(`
                INSERT INTO federated_digital_twin_snapshots 
                (id, snapshot_type, global_utilization, federation_stability, inter_factory_imbalance, economic_efficiency, swarm_resilience_index, telemetry_snapshot_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                snapshot.id, snapshot.snapshot_type, snapshot.global_utilization, snapshot.federation_stability,
                snapshot.inter_factory_imbalance, snapshot.economic_efficiency, snapshot.swarm_resilience_index,
                snapshot.telemetry_snapshot_json
            ]);

            logger.info({ event: 'federation_snapshot_generated', id: snapshot.id });
            return snapshot;
        } catch (err) {
            logger.error({ event: 'snapshot_generation_failed', error: err.message });
            return {
                id: `fdt_fallback_${Date.now()}`,
                snapshot_type: type,
                factory_count: 0,
                degraded: true,
                error: err.message
            };
        }
    }

    async getLatestSnapshot() {
        try {
            const [row] = await db.query('SELECT * FROM federated_digital_twin_snapshots ORDER BY created_at DESC LIMIT 1');
            return row;
        } catch (err) {
            return { degraded: true };
        }
    }

    async getSnapshots() {
        try {
            return await db.query('SELECT * FROM federated_digital_twin_snapshots ORDER BY created_at DESC LIMIT 50');
        } catch (err) {
            logger.error({ event: 'snapshots_query_failed', error: err.message });
            return [{ id: 'mock_snapshot', snapshot_type: 'DEGRADED_MOCK', global_utilization: 0, federation_stability: 100, inter_factory_imbalance: 0 }];
        }
    }
}

module.exports = new FederatedDigitalTwinService();
