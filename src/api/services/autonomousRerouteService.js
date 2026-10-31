/**
 * src/api/services/autonomousRerouteService.js
 * 
 * Automatically recovers failed or high-risk dispatches by rerouting to alternative nodes.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('auto-reroute');
const productionOrchestration = require('./ManufacturingOrchestrationService');
const recommendationService = require('./dispatchRecommendationService');

class AutonomousRerouteService {
    /**
     * Scans for reroute candidates and executes recovery logic.
     */
    async evaluateReroutes() {
        logger.info({ event: 'reroute_eval_start' });
        
        // Candidates are failed dispatches or those with high SLA risk
        const candidates = await db.query(
            "SELECT * FROM manufacturing_dispatches WHERE status IN ('FAILED', 'SLA_AT_RISK', 'CAPACITY_BLOCKED')"
        );
        
        const summary = { candidates: candidates.length, rerouted: 0, failures: [] };

        for (const d of candidates) {
            try {
                // Prevent infinite reroute loops: check if already rerouted multiple times
                const metadata = typeof d.metadata_json === 'string' ? JSON.parse(d.metadata_json) : (d.metadata_json || {});
                if (metadata.reroute_count >= 3) {
                    logger.error({ event: 'max_reroutes_exceeded', dispatchId: d.id });
                    continue;
                }

                const result = await this.executeReroute(d, metadata);
                if (result.ok) {
                    summary.rerouted++;
                }
            } catch (err) {
                logger.error({ 
                    event: 'reroute_failed', 
                    dispatchId: d.id, 
                    originalNode: d.node_id,
                    message: err.message || 'Reroute execution failed',
                    diagnostics: err.diagnostics || {}
                });
                summary.failures.push({ 
                    id: d.id, 
                    error: err.message || 'UNKNOWN_ERROR',
                    diagnostics: err.diagnostics 
                });
            }
        }
        
        return summary;
    }

    async executeReroute(oldDispatch, oldMetadata) {
        logger.info({ event: 'auto_reroute_executing', oldDispatchId: oldDispatch.id });

        // 1. Get a fresh recommendation (excluding the current failed node)
        const recommendation = await recommendationService.getRecommendation(oldDispatch.job_id, {
            excludeNodeIds: [oldDispatch.node_id],
            preferredNodeId: oldMetadata.validation_recovery_node || null
        });

        if (!recommendation || !recommendation.ok) {
            const error = new Error('RECOVERY_FAILED: NO_ALTERNATE_PRODUCTION_CAPACITY');
            error.diagnostics = recommendation || { error: 'UNKNOWN_RECOMMENDATION_FAILURE' };
            throw error;
        }

        // 2. Execute new assignment
        const newAssignment = {
            nodeId: recommendation.best_node.id,
            machineId: recommendation.best_machine?.id,
            estimatedCost: recommendation.estimated_cost,
            estimatedMargin: recommendation.estimated_margin,
            estimatedProductionDays: recommendation.estimated_days || 2,
            previous_dispatch_id: oldDispatch.id,
            reroute_count: (oldMetadata.reroute_count || 0) + 1,
            autonomous: true,
            reason: `AUTONOMOUS_RECOVERY: ${oldMetadata.sla_alert?.code || 'UNSPECIFIED_FAILURE'}`
        };

        const result = await productionOrchestration.assignDispatch(oldDispatch.job_id, newAssignment);

        // 3. Update metadata with recovery info
        const recoveryMetadata = {
            reason: newAssignment.reason,
            old_node: oldDispatch.node_id,
            new_node: recommendation.best_node.id,
            confidence: recommendation.confidence,
            recovered_at: new Date().toISOString(),
            source_alert: oldMetadata.sla_alert
        };

        await db.query(`
            UPDATE manufacturing_dispatches 
            SET metadata_json = JSON_SET(COALESCE(metadata_json, '{}'), '$.autonomous_recovery', ?)
            WHERE id = ?
        `, [JSON.stringify(recoveryMetadata), result.dispatchId]);

        // 4. Update old dispatch status and release reservations
        await productionOrchestration.updateStatus(
            oldDispatch.id, 
            'AUTO_REROUTED', 
            `Recovered via autonomous reroute to ${result.dispatchId}. Reason: ${recoveryMetadata.reason}`
        );

        // 5. Log cross-link event
        await productionOrchestration.logEvent(
            result.dispatchId, 
            'AUTO_REROUTE_EXECUTED', 
            null, 
            'ASSIGNED', 
            `Autonomous recovery from previous dispatch ${oldDispatch.id}`,
            { 
                source_dispatch_id: oldDispatch.id,
                recovery_confidence: recommendation.confidence,
                score: recommendation.score
            }
        );

        return { ok: true, newDispatchId: result.dispatchId };
    }
}

module.exports = new AutonomousRerouteService();
