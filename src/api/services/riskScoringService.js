/**
 * src/api/services/riskScoringService.js
 * 
 * Calculates industrial risk scores for dispatches based on multiple dimensions.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('risk-scoring');

class RiskScoringService {
    /**
     * Calculates the risk score for a single dispatch.
     */
    async calculateDispatchRisk(dispatchId) {
        const [dispatch] = await db.query("SELECT * FROM manufacturing_dispatches WHERE id = ?", [dispatchId]);
        if (!dispatch) return null;

        const metadata = typeof dispatch.metadata_json === 'string' ? JSON.parse(dispatch.metadata_json) : (dispatch.metadata_json || {});
        
        let riskScore = 0;
        const contributingFactors = [];

        // 1. SLA Urgency (Reactive context)
        if (dispatch.status === 'SLA_AT_RISK') {
            riskScore += 40;
            contributingFactors.push('EXISTING_SLA_RISK');
        }

        // 2. Reroute History
        const rerouteCount = metadata.reroute_count || 0;
        if (rerouteCount > 0) {
            riskScore += (rerouteCount * 15);
            contributingFactors.push(`REROUTE_HISTORY_${rerouteCount}`);
        }

        // 3. Machine Reliability (Mock prediction)
        const [reliability] = await db.query("SELECT reliability_score FROM printer_reliability_metrics WHERE printer_id = ?", [dispatch.node_id]);
        if (reliability && reliability.reliability_score < 70) {
            riskScore += 20;
            contributingFactors.push('LOW_MACHINE_RELIABILITY');
        }

        // 4. Rush Job
        if (metadata.is_rush) {
            riskScore += 10;
            contributingFactors.push('RUSH_PRIORITY');
        }

        // Normalize and level
        riskScore = Math.min(riskScore, 100);
        let riskLevel = 'LOW';
        if (riskScore >= 80) riskLevel = 'CRITICAL';
        else if (riskScore >= 50) riskLevel = 'HIGH';
        else if (riskScore >= 25) riskLevel = 'MODERATE';

        const result = {
            dispatchId,
            riskScore,
            riskLevel,
            contributingFactors,
            timestamp: new Date().toISOString()
        };

        logger.info({ 
            event: 'predictive_dispatch_risk', 
            dispatchId, 
            riskScore, 
            riskLevel 
        });

        // Persist
        await db.query(`
            INSERT INTO predictive_dispatch_risk (dispatch_id, job_id, risk_score, risk_level, contributing_factors_json)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                risk_score = VALUES(risk_score),
                risk_level = VALUES(risk_level),
                contributing_factors_json = VALUES(contributing_factors_json),
                last_scored_at = CURRENT_TIMESTAMP
        `, [
            dispatchId,
            dispatch.job_id,
            riskScore,
            riskLevel,
            JSON.stringify(contributingFactors)
        ]);

        return result;
    }
}

module.exports = new RiskScoringService();
