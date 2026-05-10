/**
 * src/api/services/autonomousDispatchService.js
 * 
 * Evaluates queued jobs and performs autonomous assignments based on routing intelligence.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('autonomous-dispatch');
const recommendationService = require('./dispatchRecommendationService');
const productionOrchestration = require('./productionOrchestrationService');

class AutonomousDispatchService {
    /**
     * Scans for QUEUED dispatches and attempts autonomous assignment.
     */
    async evaluateQueuedJobs() {
        logger.info({ event: 'eval_loop_start' });
        
        // Find QUEUED dispatches (or RECOMMENDED)
        const queued = await db.query("SELECT * FROM manufacturing_dispatches WHERE status IN ('QUEUED', 'RECOMMENDED')");
        
        const summary = { evaluated: queued.length, assigned: 0, rejected: 0, failures: [] };
        
        for (const dispatch of queued) {
            try {
                const result = await this.processDispatch(dispatch);
                if (result.ok) {
                    summary.assigned++;
                }
            } catch (err) {
                logger.warn({ event: 'dispatch_rejected', dispatchId: dispatch.id, reason: err.message });
                summary.rejected++;
                summary.failures.push({ id: dispatch.id, error: err.message });
            }
        }
        
        return summary;
    }

    async processDispatch(dispatch) {
        // 1. Get recommendation from Industrial Decision Engine
        const recommendation = await recommendationService.getRecommendation(dispatch.job_id);
        
        if (!recommendation || !recommendation.best_node) {
            throw new Error('NO_COMPATIBLE_PRODUCTION_NODES');
        }

        const confidence = recommendation.confidence_score || 0.85;
        
        // 2. Safety Check: Threshold for Autonomous Action
        if (confidence < 0.75) {
            throw new Error(`LOW_CONFIDENCE_THRESHOLD: ${confidence}`);
        }

        // 3. Prevent Double Assignment
        const [active] = await db.query(
            "SELECT id FROM manufacturing_dispatches WHERE job_id = ? AND status NOT IN ('FAILED', 'REROUTED', 'CANCELED')", 
            [dispatch.job_id]
        );
        if (active && active.id !== dispatch.id) {
            throw new Error('DUPLICATE_ACTIVE_DISPATCH_DETECTED');
        }

        // 4. Autonomous Assignment
        logger.info({ event: 'auto_assign_executing', dispatchId: dispatch.id, confidence });
        
        // Create the new assignment details
        const assignmentData = {
            nodeId: recommendation.best_node.id,
            machineId: recommendation.best_machine?.id,
            estimatedCost: recommendation.estimated_cost,
            estimatedMargin: recommendation.estimated_margin,
            estimatedProductionDays: recommendation.estimated_days || 2,
            autonomous: true,
            decision_logic: 'AUTONOMOUS_LOOP_v1',
            confidence
        };

        // We update the existing dispatch instead of creating a new one to keep trace
        await db.query('START TRANSACTION');
        try {
            const now = new Date();
            const reservedUntil = new Date(now.getTime() + (assignmentData.estimatedProductionDays * 24 * 60 * 60 * 1000));

            await db.query(`
                UPDATE manufacturing_dispatches 
                SET 
                    node_id = ?, 
                    machine_id = ?, 
                    status = 'AUTO_ASSIGNED',
                    estimated_cost = ?,
                    estimated_margin = ?,
                    reserved_from = ?,
                    reserved_until = ?,
                    metadata_json = JSON_SET(COALESCE(metadata_json, '{}'), '$.autonomous_eval', ?)
                WHERE id = ?
            `, [
                assignmentData.nodeId,
                assignmentData.machineId,
                assignmentData.estimatedCost,
                assignmentData.estimatedMargin,
                now,
                reservedUntil,
                JSON.stringify({
                    confidence,
                    timestamp: now.toISOString(),
                    reason: 'SLA_OPTIMIZED_ROUTING'
                }),
                dispatch.id
            ]);

            // Create reservation
            const reservationId = `mfg_res_auto_${dispatch.id.slice(-8)}`;
            await db.query(`
                INSERT INTO manufacturing_capacity_reservations (
                    id, dispatch_id, job_id, node_id, machine_id, reserved_units,
                    reserved_from, reserved_until, reservation_status
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'ACTIVE')
                ON DUPLICATE KEY UPDATE reservation_status = 'ACTIVE'
            `, [
                reservationId, dispatch.id, dispatch.job_id, assignmentData.nodeId, 
                assignmentData.machineId, now, reservedUntil
            ]);

            await productionOrchestration.logEvent(
                dispatch.id, 
                'AUTO_ASSIGNMENT_EXECUTED', 
                dispatch.status, 
                'AUTO_ASSIGNED', 
                `Autonomous assignment confirmed with ${Math.round(confidence * 100)}% confidence`,
                { recommendation_id: recommendation.id }
            );

            await db.query('COMMIT');
            return { ok: true };
        } catch (err) {
            await db.query('ROLLBACK');
            throw err;
        }
    }
}

module.exports = new AutonomousDispatchService();
