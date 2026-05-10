/**
 * src/api/services/productionOrchestrationService.js
 * 
 * Manages production dispatch lifecycle, capacity reservation, and rerouting logic.
 * Uses manufacturing_* tables to avoid collision with legacy production_dispatches.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('production-orchestration');
const crypto = require('crypto');

class ProductionOrchestrationService {
    /**
     * Creates a new manufacturing dispatch based on a routing recommendation.
     */
    async assignDispatch(jobId, recommendation) {
        const dispatchId = `mfg_disp_${crypto.randomBytes(8).toString('hex')}`;
        const reservationId = `mfg_res_${crypto.randomBytes(8).toString('hex')}`;
        const eventId = `mfg_evt_${crypto.randomBytes(8).toString('hex')}`;
        
        try {
            await db.query('START TRANSACTION');

            // Calculate reservation window once
            const now = new Date();
            const estimatedHours = recommendation.estimatedProductionDays * 24;
            const reservedUntil = new Date(now.getTime() + estimatedHours * 60 * 60 * 1000);

            // 1. Create Manufacturing Dispatch record
            await db.query(`
                INSERT INTO manufacturing_dispatches (
                    id, job_id, node_id, machine_id, status,
                    estimated_cost, estimated_margin, 
                    reserved_from, reserved_until, metadata_json
                ) VALUES (?, ?, ?, ?, 'ASSIGNED', ?, ?, ?, ?, ?)
            `, [
                dispatchId, 
                jobId, 
                recommendation.nodeId, 
                recommendation.machineId,
                recommendation.estimatedCost,
                recommendation.estimatedMargin || 0,
                now,
                reservedUntil,
                JSON.stringify(recommendation)
            ]);

            // 2. Reserve Capacity
            await db.query(`
                INSERT INTO manufacturing_capacity_reservations (
                    id, dispatch_id, job_id, node_id, machine_id, reserved_units,
                    reserved_from, reserved_until, reservation_status
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'ACTIVE')
            `, [
                reservationId,
                dispatchId,
                jobId,
                recommendation.nodeId,
                recommendation.machineId,
                now,
                reservedUntil
            ]);

            // 3. Log Event
            await this.logEvent(dispatchId, 'DISPATCH_CREATED', null, 'ASSIGNED', 'Initial production assignment');

            await db.query('COMMIT');
            
            logger.info({ event: 'dispatch_assigned', dispatchId, jobId, nodeId: recommendation.nodeId });
            return { ok: true, dispatchId };
        } catch (err) {
            if (db.inTransaction) await db.query('ROLLBACK');
            logger.error({ event: 'assignment_failed', jobId, error: err.message });
            throw err;
        }
    }

    /**
     * Updates dispatch status and manages capacity lifecycle.
     */
    async updateStatus(dispatchId, newStatus, message = null) {
        try {
            const [dispatch] = await db.query('SELECT status FROM manufacturing_dispatches WHERE id = ?', [dispatchId]);
            if (!dispatch) throw new Error('DISPATCH_NOT_FOUND');

            const oldStatus = dispatch.status;

            await db.query('START TRANSACTION');

            await db.query('UPDATE manufacturing_dispatches SET status = ? WHERE id = ?', [newStatus, dispatchId]);

            // If terminal status, release capacity
            if (['DELIVERED', 'FAILED', 'CANCELED', 'REROUTED', 'AUTO_REROUTED'].includes(newStatus)) {
                await db.query('UPDATE manufacturing_capacity_reservations SET reservation_status = "RELEASED" WHERE dispatch_id = ?', [dispatchId]);
            }

            await this.logEvent(dispatchId, 'STATUS_CHANGED', oldStatus, newStatus, message);

            await db.query('COMMIT');
            return { ok: true };
        } catch (err) {
            if (db.inTransaction) await db.query('ROLLBACK');
            throw err;
        }
    }

    /**
     * Reroutes a failed or delayed dispatch.
     */
    async reroute(dispatchId, reason) {
        try {
            const [oldDispatch] = await db.query('SELECT * FROM manufacturing_dispatches WHERE id = ?', [dispatchId]);
            if (!oldDispatch) throw new Error('DISPATCH_NOT_FOUND');

            // 1. Mark old as REROUTED
            await this.updateStatus(dispatchId, 'REROUTED', `Reroute requested: ${reason}`);

            // 2. Fetch job specs from metadata
            const metadata = typeof oldDispatch.metadata_json === 'string' 
                ? JSON.parse(oldDispatch.metadata_json) 
                : oldDispatch.metadata_json;

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

    async logEvent(dispatchId, eventType, oldStatus, newStatus, message, metadata = null) {
        const eventId = `mfg_evt_${crypto.randomBytes(8).toString('hex')}`;
        await db.query(`
            INSERT INTO manufacturing_dispatch_events (
                id, dispatch_id, event_type, old_status, new_status, message, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            eventId, dispatchId, eventType, oldStatus, newStatus, message, metadata ? JSON.stringify(metadata) : null
        ]);
    }

    async getDispatches(limit = 50) {
        return db.query('SELECT * FROM manufacturing_dispatches ORDER BY created_at DESC LIMIT ?', [limit]);
    }

    async getDispatchDetail(dispatchId) {
        const [dispatch] = await db.query('SELECT * FROM manufacturing_dispatches WHERE id = ?', [dispatchId]);
        if (!dispatch) return null;

        const events = await db.query('SELECT * FROM manufacturing_dispatch_events WHERE dispatch_id = ? ORDER BY created_at DESC', [dispatchId]);
        const reservations = await db.query('SELECT * FROM manufacturing_capacity_reservations WHERE dispatch_id = ?', [dispatchId]);

        return { ...dispatch, events, reservations };
    }
}

module.exports = new ProductionOrchestrationService();
