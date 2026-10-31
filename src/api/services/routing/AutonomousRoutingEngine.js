/**
 * src/api/services/routing/AutonomousRoutingEngine.js
 * 
 * Core Federation Decision Engine for PrintPrice OS.
 * Orchestrates scoring and selection of production nodes across the global grid.
 */
const db = require('../mysqlClient');
const logger = require('../logger').child('routing-engine');
const scoringService = require('./RoutingScoreService');

class AutonomousRoutingEngine {
    /**
     * Finds the optimal machine for a job.
     * @param {Object} jobSpecs - Technical requirements of the job.
     * @param {Object} origin - Client location { lat, lng }.
     */
    async findOptimalNode(jobSpecs, origin) {
        try {
            logger.info({ event: 'routing_request_start', specs: jobSpecs, origin });

            // 1. Fetch All Active Industrial Nodes
            const nodes = await db.query(`
                SELECT 
                    id, company_name, region, status, 
                    latitude, longitude, 
                    capabilities_json, supported_products, binding_capabilities,
                    throughput, uptime_score, economic_efficiency,
                    queue_depth, active_jobs
                FROM print_nodes
                WHERE status IN ('ONLINE', 'DEGRADED')
                AND api_enabled = 1
            `);

            if (!nodes.length) {
                throw new Error('NO_AVAILABLE_NODES_IN_FEDERATION');
            }

            // 2. Evaluate & Score All Candidates
            const evaluations = [];
            for (const node of nodes) {
                const evaluation = await scoringService.evaluateNode(node, jobSpecs, origin);
                if (!evaluation.ineligible) {
                    evaluations.push({
                        node_id: node.id,
                        company_name: node.company_name,
                        region: node.region,
                        ...evaluation
                    });
                }
            }

            if (!evaluations.length) {
                throw new Error('NO_ELIGIBLE_NODES_FOR_CAPABILITIES');
            }

            // 3. Sort by Total Score (Descending)
            evaluations.sort((a, b) => b.total_score - a.total_score);

            const winner = evaluations[0];
            const fallbacks = evaluations.slice(1, 4); // Top 3 fallbacks

            // 4. Persistence of Decision
            const decisionId = await this._persistDecision(winner, fallbacks, jobSpecs, origin);

            logger.info({ 
                event: 'routing_decision_made', 
                decision_id: decisionId,
                winner: winner.node_id, 
                score: winner.total_score 
            });

            return {
                decision_id: decisionId,
                selected_machine: winner.node_id,
                selected_printhouse: winner.company_name,
                routing_score: winner.total_score,
                breakdown: winner.breakdown,
                estimated_cost: this._estimateCost(winner, jobSpecs),
                estimated_lead_time: winner.metadata.sla_risk === 'LOW' ? '24-48h' : '72h+',
                carbon_score: winner.breakdown.geographic,
                risk_score: winner.breakdown.risk,
                routing_explanation: this._generateExplanation(winner),
                fallback_candidates: fallbacks.map(f => ({
                    node_id: f.node_id,
                    score: f.total_score,
                    reason: 'SCORE_THRESHOLD'
                }))
            };

        } catch (err) {
            logger.error({ event: 'routing_engine_failed', error: err.message });
            throw err;
        }
    }

    /**
     * Executes the dispatch by creating a manufacturing record and locking capacity.
     */
    async dispatchJob(jobId, decisionId, reason = 'AUTONOMOUS_ROUTING') {
        try {
            // 1. Retrieve Decision
            const [decision] = await db.query('SELECT * FROM routing_decisions WHERE id = ?', [decisionId]);
            if (!decision) throw new Error('DECISION_NOT_FOUND');

            const metadata = typeof decision.metadata_json === 'string' 
                ? JSON.parse(decision.metadata_json) 
                : decision.metadata_json;

            // 2. Create Manufacturing Dispatch
            const dispatchId = `disp_${Date.now()}_${jobId.slice(-5)}`;
            await db.query(`
                INSERT INTO manufacturing_dispatches (
                    id, job_id, federation_node_id, status, 
                    economic_score, routing_reason
                ) VALUES (?, ?, ?, 'ALLOCATED', ?, ?)
            `, [
                dispatchId, 
                jobId, 
                decision.selected_machine_id, 
                decision.routing_score,
                reason
            ]);

            // 3. Commit Decision Status
            await db.query('UPDATE routing_decisions SET status = "COMMITTED" WHERE id = ?', [decisionId]);

            // 4. Update Node Queue
            await db.query('UPDATE print_nodes SET queue_depth = queue_depth + 1 WHERE id = ?', [decision.selected_machine_id]);

            return {
                ok: true,
                dispatch_id: dispatchId,
                node_id: decision.selected_machine_id
            };

        } catch (err) {
            logger.error({ event: 'dispatch_execution_failed', job_id: jobId, error: err.message });
            throw err;
        }
    }

    async _persistDecision(winner, fallbacks, specs, origin) {
        const decisionId = `route_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        // 1. Create Decision Record
        await db.query(`
            INSERT INTO routing_decisions (
                id, selected_machine_id, routing_score, explanation, metadata_json
            ) VALUES (?, ?, ?, ?, ?)
        `, [
            decisionId, 
            winner.node_id, 
            winner.total_score, 
            this._generateExplanation(winner),
            JSON.stringify({ specs, origin, winner, fallbacks })
        ]);

        // 2. Log History
        await db.query(`
            INSERT INTO routing_history (job_id, action, details_json)
            VALUES (?, 'ROUTING_DECISION', ?)
        `, [specs.jobId || 'temp', JSON.stringify({ decision_id: decisionId, winner: winner.node_id })]);

        return decisionId;
    }

    _estimateCost(winner, specs) {
        // Heuristic: Base 100 * complexity / economic score
        const base = (specs.page_count || 100) * 0.1;
        return (base * (1 / (winner.breakdown.cost / 100))).toFixed(2);
    }

    _generateExplanation(winner) {
        const parts = [];
        if (winner.breakdown.time > 80) parts.push('optimal queue availability');
        if (winner.breakdown.geographic > 80) parts.push('minimal logistics distance');
        if (winner.breakdown.risk > 90) parts.push('high reliability history');
        
        return `Selected ${winner.company_name} in ${winner.region} due to ${parts.join(', ')}.`;
    }
}

module.exports = new AutonomousRoutingEngine();
