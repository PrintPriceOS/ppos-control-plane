/**
 * src/api/services/slaMonitoringService.js
 * 
 * Monitors active dispatches for SLA violations, delays, and production anomalies.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('sla-monitor');
const manufacturingOrchestration = require('./ManufacturingOrchestrationService');

class SLAMonitoringService {
    /**
     * Scans all non-terminal dispatches for SLA risk.
     */
    async scanActiveDispatches() {
        logger.info({ event: 'sla_scan_start' });
        
        // Monitor non-terminal, non-failed statuses
        const activeStatuses = ['ASSIGNED', 'AUTO_ASSIGNED', 'ACCEPTED', 'PREPARING', 'PRINTING', 'BINDING', 'PACKAGING'];
        const dispatches = await db.query(
            "SELECT * FROM manufacturing_dispatches WHERE status IN (?)", 
            [activeStatuses]
        );
        
        const summary = { scanned: dispatches.length, riskDetected: 0, alerts: [] };
        const now = new Date();

        for (const d of dispatches) {
            try {
                const risk = await this.evaluateRisk(d, now);
                if (risk) {
                    await this.flagAtRisk(d, risk.code, risk.message);
                    summary.riskDetected++;
                    summary.alerts.push({ id: d.id, code: risk.code });
                }
            } catch (err) {
                logger.error({ event: 'sla_eval_error', dispatchId: d.id, error: err.message });
            }
        }
        
        return summary;
    }

    async evaluateRisk(d, now) {
        // 1. Reservation Expiry Check
        if (d.reserved_until && new Date(d.reserved_until) < now) {
            return {
                code: 'RESERVATION_EXPIRED',
                message: `Industrial reservation window exceeded. Reserved until: ${new Date(d.reserved_until).toLocaleString()}`
            };
        }

        const createdAt = new Date(d.created_at);
        const updatedAt = new Date(d.updated_at);
        const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

        // 2. Node Non-Response Check
        if ((d.status === 'ASSIGNED' || d.status === 'AUTO_ASSIGNED') && hoursSinceCreation > 12) {
            return {
                code: 'NODE_NON_RESPONSE',
                message: `Node has not accepted dispatch within 12-hour industrial window.`
            };
        }

        // 3. Prepress Delay Check
        if (d.status === 'PREPARING' && hoursSinceUpdate > 24) {
            return {
                code: 'PREPRESS_DELAY',
                message: `Dispatch stuck in PREPARING for > 24 hours. Preflight or material prep delay suspected.`
            };
        }

        // 4. Production Stalled Check
        if (d.status === 'PRINTING' && hoursSinceUpdate > 72) {
            return {
                code: 'PRODUCTION_STALLED',
                message: `Production stuck in PRINTING for > 72 hours. Potential machine failure or resource shortage.`
            };
        }

        // 5. General Stagnation Check (Fallback)
        if (hoursSinceUpdate > 96) {
            return {
                code: 'GENERAL_STAGNATION',
                message: `No state transition detected for > 96 hours. Critical production oversight.`
            };
        }

        return null;
    }

    async flagAtRisk(dispatch, code, message) {
        logger.warn({ event: 'sla_risk_flagged', dispatchId: dispatch.id, code });
        
        const now = new Date().toISOString();
        const alertMetadata = {
            code,
            message,
            detected_at: now
        };

        await db.query(`
            UPDATE manufacturing_dispatches 
            SET status = 'SLA_AT_RISK',
                metadata_json = JSON_SET(COALESCE(metadata_json, '{}'), '$.sla_alert', ?)
            WHERE id = ?
        `, [JSON.stringify(alertMetadata), dispatch.id]);

        await manufacturingOrchestration.logEvent(
            dispatch.id, 
            'SLA_ANOMALY_DETECTED', 
            dispatch.status, 
            'SLA_AT_RISK', 
            message,
            { alert_code: code }
        );
    }
}

module.exports = new SLAMonitoringService();
