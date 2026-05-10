/**
 * src/api/services/digitalTwinService.js
 * 
 * Operational Digital Twin snapshot layer for industrial observability.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('digital-twin');

class DigitalTwinService {
    /**
     * Generates a full operational snapshot.
     */
    async generateSnapshot(type = 'PERIODIC') {
        logger.info({ event: 'digital_twin_snapshot_start', type });

        const [dispatchStats] = await db.query("SELECT COUNT(*) as count FROM manufacturing_dispatches WHERE status NOT IN ('DELIVERED', 'FAILED')");
        const [capacityStats] = await db.query("SELECT AVG(utilization_percent) as avgUtil FROM printer_capacity_state");
        const [anomalyStats] = await db.query("SELECT AVG(anomaly_score) as avgAnomaly FROM manufacturing_dispatches");

        const snapshot = {
            id: `dt_${Date.now()}`,
            snapshot_type: type,
            active_dispatches_count: dispatchStats.count || 0,
            avg_saturation_percent: capacityStats.avgUtil || 0,
            avg_anomaly_score: anomalyStats.avgAnomaly || 0,
            global_stability_index: 100 - (anomalyStats.avgAnomaly || 0),
            telemetry_snapshot_json: JSON.stringify({
                timestamp: new Date().toISOString(),
                node_count: (await db.query("SELECT COUNT(*) as c FROM print_nodes"))[0].c
            })
        };

        await db.query(`
            INSERT INTO industrial_digital_twin_snapshots 
            (id, snapshot_type, active_dispatches_count, avg_saturation_percent, avg_anomaly_score, global_stability_index, telemetry_snapshot_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            snapshot.id,
            snapshot.snapshot_type,
            snapshot.active_dispatches_count,
            snapshot.avg_saturation_percent,
            snapshot.avg_anomaly_score,
            snapshot.global_stability_index,
            snapshot.telemetry_snapshot_json
        ]);

        return snapshot;
    }

    /**
     * Retrieves the latest snapshot.
     */
    async getLatestSnapshot() {
        const [row] = await db.query("SELECT * FROM industrial_digital_twin_snapshots ORDER BY created_at DESC LIMIT 1");
        return row;
    }
}

module.exports = new DigitalTwinService();
