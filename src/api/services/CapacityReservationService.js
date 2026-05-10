/**
 * src/api/services/CapacityReservationService.js
 * 
 * Manages industrial capacity locking and reservation lifecycle.
 * Prevents over-allocation in the manufacturing grid and ensures deterministic scheduling.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('capacity-reservation');
const crypto = require('crypto');

class CapacityReservationService {
    /**
     * Attempts to reserve capacity on a specific node/machine.
     * Rejects if node is saturated (>98% utilization).
     */
    async reserveCapacity(nodeId, machineId, dispatchId, jobId, units = 1, durationHours = 24) {
        const reservationId = `mfg_res_${crypto.randomBytes(8).toString('hex')}`;
        const now = new Date();
        const reservedUntil = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

        try {
            // 1. Check current utilization to prevent over-allocation
            const [node] = await db.query('SELECT capacity_utilization_pct FROM print_nodes WHERE id = ?', [nodeId]);
            const currentUtil = node?.capacity_utilization_pct || 0;

            if (currentUtil >= 98) {
                logger.warn({ event: 'reservation_rejected_saturated', nodeId, utilization: currentUtil });
                throw new Error('NODE_SATURATED');
            }

            // 2. Create reservation record
            await db.query(`
                INSERT INTO manufacturing_capacity_reservations (
                    id, dispatch_id, job_id, node_id, machine_id, reserved_units,
                    reserved_from, reserved_until, reservation_status, utilization_snapshot
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
            `, [
                reservationId, 
                dispatchId, 
                jobId, 
                nodeId, 
                machineId, 
                units,
                now, 
                reservedUntil, 
                currentUtil
            ]);

            logger.info({ event: 'capacity_reserved', reservationId, nodeId, machineId, dispatchId });
            return { ok: true, reservationId, reservedUntil };
        } catch (err) {
            logger.error({ event: 'capacity_reservation_failed', nodeId, dispatchId, error: err.message });
            throw err;
        }
    }

    /**
     * Confirms a reservation when a dispatch moves into production.
     */
    async confirmReservation(dispatchId) {
        try {
            await db.query(
                "UPDATE manufacturing_capacity_reservations SET reservation_status = 'CONFIRMED' WHERE dispatch_id = ?",
                [dispatchId]
            );
            logger.info({ event: 'reservation_confirmed', dispatchId });
        } catch (err) {
            logger.error({ event: 'reservation_confirmation_failed', dispatchId, error: err.message });
        }
    }

    /**
     * Releases capacity back to the pool (e.g. on completion or cancellation).
     */
    async releaseCapacity(dispatchId) {
        try {
            await db.query(
                "UPDATE manufacturing_capacity_reservations SET reservation_status = 'RELEASED' WHERE dispatch_id = ?",
                [dispatchId]
            );
            logger.info({ event: 'capacity_released', dispatchId });
        } catch (err) {
            logger.error({ event: 'capacity_release_failed', dispatchId, error: err.message });
        }
    }

    /**
     * Expires stale reservations that were never confirmed or released.
     */
    async expireReservations() {
        try {
            const result = await db.query(`
                UPDATE manufacturing_capacity_reservations 
                SET reservation_status = 'EXPIRED' 
                WHERE reservation_status = 'ACTIVE' AND reserved_until < NOW()
            `);
            if (result.affectedRows > 0) {
                logger.info({ event: 'reservations_expired', count: result.affectedRows });
            }
            return result.affectedRows;
        } catch (err) {
            logger.error({ event: 'reservation_expiry_failed', error: err.message });
            return 0;
        }
    }

    /**
     * Calculates live utilization for a node based on active reservations.
     */
    async calculateLiveUtilization(nodeId) {
        try {
            const [stats] = await db.query(`
                SELECT COUNT(*) as active_count, SUM(reserved_units) as total_units
                FROM manufacturing_capacity_reservations
                WHERE node_id = ? AND reservation_status IN ('ACTIVE', 'CONFIRMED')
            `, [nodeId]);

            return {
                activeReservations: stats.active_count || 0,
                totalUnitsReserved: stats.total_units || 0
            };
        } catch (err) {
            logger.error({ event: 'utilization_calculation_failed', nodeId, error: err.message });
            return { activeReservations: 0, totalUnitsReserved: 0 };
        }
    }
}

module.exports = new CapacityReservationService();
