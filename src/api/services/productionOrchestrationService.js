/**
 * src/api/services/productionOrchestrationService.js
 * 
 * Manages production dispatch lifecycle, capacity reservation, and rerouting logic.
 * Uses manufacturing_* tables to avoid collision with legacy production_dispatches.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('production-orchestration');
const crypto = require('crypto');
const reservationService = require('./CapacityReservationService');

const DISPATCH_LIFECYCLE = {
    PENDING: 'PENDING',
    QUEUED: 'QUEUED',
    ASSIGNED: 'ASSIGNED',
    IN_PRODUCTION: 'IN_PRODUCTION',
    POST_PROCESSING: 'POST_PROCESSING',
    CERTIFICATION: 'CERTIFICATION',
    READY_TO_SHIP: 'READY_TO_SHIP',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED'
};

class ProductionOrchestrationService {
    /**
     * Creates a new manufacturing dispatch based on a routing recommendation.
     */
    async assignDispatch(jobId, recommendation) {
        const dispatchId = `mfg_disp_${crypto.randomBytes(8).toString('hex')}`;
        
        try {
            // 0. Verification of Live Node Health (Industrial Requirement)
            const [node] = await db.query('SELECT status, last_heartbeat_at, capacity_utilization_pct FROM print_nodes WHERE id = ?', [recommendation.nodeId]);
            if (!node) throw new Error('NODE_NOT_FOUND');

            const now = new Date();
            const heartbeatAgeMinutes = node.last_heartbeat_at ? (now - new Date(node.last_heartbeat_at)) / (1000 * 60) : 9999;

            if (node.status === 'OFFLINE' || heartbeatAgeMinutes > 15) {
                throw new Error('NODE_STALE_OR_OFFLINE');
            }
            if (node.capacity_utilization_pct > 98) {
                throw new Error('NODE_SATURATED');
            }

            await db.query('START TRANSACTION');

            // 1. Calculate reservation window
            const estimatedHours = (recommendation.estimatedProductionDays || 1) * 24;
            const reservedUntil = new Date(now.getTime() + estimatedHours * 60 * 60 * 1000);

            // 2. Create Manufacturing Dispatch record with Industrial Evidence
            await db.query(`
                INSERT INTO manufacturing_dispatches (
                    id, job_id, node_id, machine_id, status,
                    estimated_cost, estimated_margin, 
                    reserved_from, reserved_until, 
                    economic_score, profitability_score, energy_efficiency_score,
                    federation_node_id, governance_policy_score,
                    evidence_snapshot_json, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                dispatchId, 
                jobId, 
                recommendation.nodeId, 
                recommendation.machineId,
                DISPATCH_LIFECYCLE.PENDING,
                recommendation.estimatedCost || 0,
                recommendation.estimatedMargin || 0,
                now,
                reservedUntil,
                recommendation.industrial_metrics?.economic_efficiency || 1.0,
                recommendation.score_total || 0,
                recommendation.energy_score || 80,
                recommendation.nodeId,
                recommendation.governance_score || 95,
                JSON.stringify({
                    scoring: recommendation,
                    telemetry_at_dispatch: node,
                    timestamp: now.toISOString()
                }),
                JSON.stringify(recommendation)
            ]);

            // 3. Reserve Capacity through Service
            await reservationService.reserveCapacity(
                recommendation.nodeId, 
                recommendation.machineId, 
                dispatchId, 
                jobId, 
                1, 
                estimatedHours
            );

            // 4. Log Industrial Lifecycle Event
            await this.logEvent(dispatchId, 'DISPATCH_CREATED', null, DISPATCH_LIFECYCLE.PENDING, 'Initial production assignment with industrial evidence.');

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

            // If entering production, confirm reservation
            if (newStatus === DISPATCH_LIFECYCLE.IN_PRODUCTION) {
                await reservationService.confirmReservation(dispatchId);
            }

            // If terminal status, release capacity
            if ([DISPATCH_LIFECYCLE.COMPLETED, DISPATCH_LIFECYCLE.FAILED, 'CANCELED', 'REROUTED', 'AUTO_REROUTED'].includes(newStatus)) {
                await reservationService.releaseCapacity(dispatchId);
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
        const [dispatch] = await db.query(`
            SELECT d.*, r.reliability_score, r.avg_turnaround_hours
            FROM manufacturing_dispatches d
            LEFT JOIN printer_reliability_metrics r ON d.node_id = r.printer_id
            WHERE d.id = ?
        `, [dispatchId]);
        
        if (!dispatch) return null;

        const events = await db.query('SELECT * FROM manufacturing_dispatch_events WHERE dispatch_id = ? ORDER BY created_at DESC', [dispatchId]);
        const reservations = await db.query('SELECT * FROM manufacturing_capacity_reservations WHERE dispatch_id = ?', [dispatchId]);

        return { ...dispatch, events, reservations };
    }

    async getDispatchTimeline(dispatchId) {
        return db.query('SELECT * FROM manufacturing_dispatch_events WHERE dispatch_id = ? ORDER BY created_at ASC', [dispatchId]);
    }
}

module.exports = new ProductionOrchestrationService();
