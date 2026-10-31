/**
 * src/api/services/economicDigitalTwinService.js
 * 
 * Extended Digital Twin snapshots for economic industrial observability.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('economic-digital-twin');

class EconomicDigitalTwinService {
    /**
     * Generates an economic industrial snapshot.
     */
    async generateEconomicSnapshot(type = 'PERIODIC') {
        logger.info({ event: 'economic_snapshot_start', type });

        const [utilRows] = await db.query("SELECT AVG(utilization_percent) as avgUtil FROM printer_capacity_state");
        const [marginRows] = await db.query("SELECT SUM(estimated_margin) as totalMargin FROM manufacturing_dispatches WHERE status != 'CANCELED'");
        
        const snapshot = {
            id: `edt_${Date.now()}`,
            snapshot_type: type,
            global_utilization_percent: utilRows.avgUtil || 0,
            total_estimated_margin: marginRows.totalMargin || 0,
            global_profitability_index: (marginRows.totalMargin > 0) ? 85 : 0, // Simplified index
            global_energy_efficiency_score: 92, // Baseline for snapshot
            network_imbalance_index: 10,
            economic_waste_prediction: 1250.00,
            telemetry_snapshot_json: JSON.stringify({
                timestamp: new Date().toISOString()
            })
        };

        await db.query(`
            INSERT INTO economic_digital_twin_snapshots 
            (id, snapshot_type, global_utilization_percent, global_profitability_index, global_energy_efficiency_score, network_imbalance_index, total_estimated_margin, economic_waste_prediction, telemetry_snapshot_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            snapshot.id, snapshot.snapshot_type, snapshot.global_utilization_percent, snapshot.global_profitability_index,
            snapshot.global_energy_efficiency_score, snapshot.network_imbalance_index, snapshot.total_estimated_margin,
            snapshot.economic_waste_prediction, snapshot.telemetry_snapshot_json
        ]);

        return snapshot;
    }

    /**
     * Retrieves latest economic snapshot.
     */
    async getLatestEconomicSnapshot() {
        const [row] = await db.query("SELECT * FROM economic_digital_twin_snapshots ORDER BY created_at DESC LIMIT 1");
        return row;
    }
}

module.exports = new EconomicDigitalTwinService();
