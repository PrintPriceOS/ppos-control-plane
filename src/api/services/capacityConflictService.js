/**
 * src/api/services/capacityConflictService.js
 * 
 * Detects overlapping reservations and overbooked machines to prevent industrial bottlenecking.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('capacity-conflict');

class CapacityConflictService {
    /**
     * Scans for scheduling conflicts and calculates machine saturation levels.
     */
    async detectConflicts() {
        logger.info({ event: 'conflict_scan_start' });
        
        const summary = {
            overlappingReservations: [],
            saturationLevels: [],
            overbookedMachines: 0
        };

        try {
            // 1. Detect Overlapping Active Reservations
            const overlapQuery = `
                SELECT 
                    r1.machine_id, 
                    r1.dispatch_id as dispatch_a, 
                    r2.dispatch_id as dispatch_b,
                    r1.reserved_from as from_a, 
                    r1.reserved_until as until_a,
                    r2.reserved_from as from_b, 
                    r2.reserved_until as until_b
                FROM manufacturing_capacity_reservations r1
                JOIN manufacturing_capacity_reservations r2 
                    ON r1.machine_id = r2.machine_id 
                    AND r1.id < r2.id
                WHERE r1.reservation_status = 'ACTIVE' 
                  AND r2.reservation_status = 'ACTIVE'
                  AND r1.reserved_from < r2.reserved_until 
                  AND r1.reserved_until > r2.reserved_from
            `;
            summary.overlappingReservations = await db.query(overlapQuery);

            // 2. Estimate Machine Saturation %
            const machines = await db.query("SELECT id, profile_name FROM print_node_machine_profiles WHERE status = 'ACTIVE'");
            for (const machine of machines) {
                const [usage] = await db.query(`
                    SELECT COUNT(*) as active_count, SUM(DATEDIFF(reserved_until, reserved_from)) as total_days
                    FROM manufacturing_capacity_reservations 
                    WHERE machine_id = ? AND reservation_status = 'ACTIVE'
                `, [machine.id]);

                const saturation = Math.min(100, (usage.active_count / 3) * 100); // Heuristic: 3 active jobs = 100% saturation
                
                summary.saturationLevels.push({
                    machineId: machine.id,
                    name: machine.profile_name,
                    activeJobs: usage.active_count,
                    saturationPercent: Math.round(saturation)
                });

                if (saturation > 90) summary.overbookedMachines++;
            }

            // 3. Update printer_capacity_state for telemetry
            for (const sat of summary.saturationLevels) {
                await db.query(`
                    INSERT INTO printer_capacity_state (printer_id, active_jobs, utilization_percent)
                    VALUES ((SELECT node_id FROM print_node_machine_profiles WHERE id = ?), ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        active_jobs = VALUES(active_jobs),
                        utilization_percent = VALUES(utilization_percent)
                `, [sat.machineId, sat.activeJobs, sat.saturationPercent]);
            }

        } catch (err) {
            logger.error({ event: 'conflict_scan_failed', error: err.message });
        }

        return summary;
    }
}

module.exports = new CapacityConflictService();
