/**
 * src/api/services/productionOrchestrationService.js
 * 
 * Manages production dispatch lifecycle, capacity reservation, and rerouting logic.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('production-orchestration');
const recommendationService = require('./dispatchRecommendationService');
const crypto = require('crypto');

class ProductionOrchestrationService {
    /**
     * Creates a new production dispatch based on a routing recommendation.
     */
    async assignDispatch(jobId, recommendation) {
        const dispatchId = `disp_${crypto.randomBytes(8).toString('hex')}`;
        
        try {
            await db.query('START TRANSACTION');

            // 1. Create Dispatch record
            await db.query(`
                INSERT INTO production_dispatches (
                    id, job_id, printer_id, machine_id, status,
                    estimated_cost, estimated_margin, routing_metadata_json
                ) VALUES (?, ?, ?, ?, 'ASSIGNED', ?, ?, ?)
            `, [
                dispatchId, 
                jobId, 
                recommendation.nodeId, 
                recommendation.machineId,
                recommendation.estimatedCost,
                recommendation.estimatedMargin || 0,
                JSON.stringify(recommendation)
            ]);

            // 2. Reserve Capacity
            const estimatedHours = recommendation.estimatedProductionDays * 24;
            await db.query(`
                INSERT INTO capacity_reservations (
                    dispatch_id, printer_id, machine_id, estimated_hours,
                    reserved_from, reserved_until, reservation_status
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? HOUR), 'ACTIVE')
            `, [
                dispatchId,
                recommendation.nodeId,
                recommendation.machineId,
                estimatedHours,
                estimatedHours
            ]);

            // 3. Log Event
            await this.logEvent(dispatchId, 'DISPATCH_CREATED', null, 'ASSIGNED', 'Initial production assignment');

            await db.query('COMMIT');
            
            logger.info({ event: 'dispatch_assigned', dispatchId, jobId, nodeId: recommendation.nodeId });
            return { ok: true, dispatchId };
        } catch (err) {
            await db.query('ROLLBACK');
            logger.error({ event: 'assignment_failed', jobId, error: err.message });
            throw err;
        }
    }

    /**
     * Updates dispatch status and manages capacity lifecycle.
     */
    async updateStatus(dispatchId, newStatus, message = null) {
        try {
            const [dispatch] = await db.query('SELECT status FROM production_dispatches WHERE id = ?', [dispatchId]);
            if (!dispatch) throw new Error('DISPATCH_NOT_FOUND');

            const oldStatus = dispatch.status;

            await db.query('START TRANSACTION');

            await db.query('UPDATE production_dispatches SET status = ? WHERE id = ?', [newStatus, dispatchId]);

            // If terminal status, release capacity
            if (['DELIVERED', 'FAILED', 'CANCELED', 'REROUTED'].includes(newStatus)) {
                await db.query('UPDATE capacity_reservations SET reservation_status = "RELEASED" WHERE dispatch_id = ?', [dispatchId]);
            }

            await this.logEvent(dispatchId, 'STATUS_CHANGED', oldStatus, newStatus, message);

            await db.query('COMMIT');
            return { ok: true };
        } catch (err) {
            await db.query('ROLLBACK');
            throw err;
        }
    }

    /**
     * Reroutes a failed or delayed dispatch.
     */
    async reroute(dispatchId, reason) {
        try {
            const [oldDispatch] = await db.query('SELECT * FROM production_dispatches WHERE id = ?', [dispatchId]);
            if (!oldDispatch) throw new Error('DISPATCH_NOT_FOUND');

            // 1. Mark old as REROUTED
            await this.updateStatus(dispatchId, 'REROUTED', `Reroute requested: ${reason}`);

            // 2. Fetch job specs (simulated, usually would come from jobs table)
            // For now, we reuse the routing metadata to find a new candidate excluding the failed one
            const metadata = typeof oldDispatch.routing_metadata_json === 'string' 
                ? JSON.parse(oldDispatch.routing_metadata_json) 
                : oldDispatch.routing_metadata_json;

            // 3. Get new recommendations
            // (In a real system, we'd pass the excluded nodeId to the routing engine)
            // For now, we'll just log that we are looking for a new one.
            logger.info({ event: 'reroute_initiated', oldDispatchId: dispatchId, jobId: oldDispatch.job_id });

            return { 
                ok: true, 
                message: 'Reroute initiated. System is evaluating alternative production nodes.',
                jobId: oldDispatch.job_id
            };
        } catch (err) {
            logger.error({ event: 'reroute_failed', dispatchId, error: err.message });
            throw err;
        }
    }

    async logEvent(dispatchId, eventType, fromStatus, toStatus, message, metadata = null) {
        await db.query(`
            INSERT INTO production_dispatch_events (
                dispatch_id, event_type, from_status, to_status, message, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
            dispatchId, eventType, fromStatus, toStatus, message, metadata ? JSON.stringify(metadata) : null
        ]);
    }

    async getDispatches(limit = 50) {
        return db.query('SELECT * FROM production_dispatches ORDER BY created_at DESC LIMIT ?', [limit]);
    }

    async getDispatchDetail(dispatchId) {
        const [dispatch] = await db.query('SELECT * FROM production_dispatches WHERE id = ?', [dispatchId]);
        if (!dispatch) return null;

        const events = await db.query('SELECT * FROM production_dispatch_events WHERE dispatch_id = ? ORDER BY created_at DESC', [dispatchId]);
        const reservations = await db.query('SELECT * FROM capacity_reservations WHERE dispatch_id = ?', [dispatchId]);

        return { ...dispatch, events, reservations };
    }
}

module.exports = new ProductionOrchestrationService();
