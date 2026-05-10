/**
 * src/api/services/predictiveBottleneckService.js
 * 
 * Forecasts machine saturation and queue pressure before they become conflicts.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('bottleneck-service');

class PredictiveBottleneckService {
    /**
     * Forecasts saturation for all machines in a node.
     */
    async forecastSaturation(nodeId) {
        logger.info({ event: 'saturation_forecast_start', nodeId });
        
        const machines = await db.query(
            "SELECT * FROM print_node_machine_profiles WHERE node_id = ? AND status = 'ACTIVE'",
            [nodeId]
        );

        const forecasts = [];

        for (const machine of machines) {
            // Count active reservations
            const [res] = await db.query(
                "SELECT COUNT(*) as activeCount FROM manufacturing_capacity_reservations WHERE machine_id = ? AND reservation_status = 'ACTIVE'",
                [machine.id]
            );
            
            const activeCount = res.activeCount || 0;
            const threshold = 3; // Industrial standard for this mock
            const saturationPercent = (activeCount / threshold) * 100;

            let risk = 'STABLE';
            if (saturationPercent >= 80) risk = 'SATURATED';
            else if (saturationPercent >= 50) risk = 'STRESSED';

            if (risk !== 'STABLE') {
                logger.info({ 
                    event: 'predictive_bottleneck_detected', 
                    machineId: machine.id, 
                    saturationPercent, 
                    risk 
                });
            }

            forecasts.push({
                machineId: machine.id,
                saturationPercent,
                riskLevel: risk,
                activeJobs: activeCount
            });

            // Persist for history/UI
            await db.query(`
                INSERT INTO predictive_capacity_forecasts (id, node_id, machine_id, forecast_date, projected_saturation_percent, bottleneck_risk_level)
                VALUES (?, ?, ?, CURDATE(), ?, ?)
                ON DUPLICATE KEY UPDATE 
                    projected_saturation_percent = VALUES(projected_saturation_percent),
                    bottleneck_risk_level = VALUES(bottleneck_risk_level)
            `, [
                `f_${machine.id}_${new Date().toISOString().split('T')[0]}`,
                nodeId,
                machine.id,
                saturationPercent,
                risk
            ]);
        }

        return forecasts;
    }
}

module.exports = new PredictiveBottleneckService();
