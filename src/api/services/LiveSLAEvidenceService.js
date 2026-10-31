/**
 * src/api/services/LiveSLAEvidenceService.js
 * 
 * Phase 34 - Live Federation Activation.
 * Derives evidence-backed live SLA tracking from multiple industrial data streams.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('live-sla-evidence');

class LiveSLAEvidenceService {
    /**
     * Refreshes SLA evidence snapshots for all active dispatches.
     */
    async refreshSLASnapshots() {
        try {
            // 1. Get all active dispatches
            const activeDispatches = await db.query(`
                SELECT d.*, n.status as node_status, n.last_heartbeat_at
                FROM manufacturing_dispatches d
                JOIN print_nodes n ON d.print_node_id = n.id
                WHERE d.status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'REROUTED', 'ROLLED_BACK')
            `);

            const snapshots = [];
            for (const dispatch of activeDispatches) {
                const snapshot = await this.calculateDispatchSLA(dispatch);
                await this.persistSnapshot(snapshot);
                snapshots.push(snapshot);
            }

            return { ok: true, count: snapshots.length };
        } catch (err) {
            logger.error({ event: 'refresh_sla_snapshots_failed', error: err.message });
            throw err;
        }
    }

    /**
     * Calculates live SLA metrics for a single dispatch.
     */
    async calculateDispatchSLA(dispatch) {
        // 1. Determine promised date
        const slaEstimate = typeof dispatch.sla_estimate_json === 'string' 
            ? JSON.parse(dispatch.sla_estimate_json) 
            : (dispatch.sla_estimate_json || {});
        
        const promised_delivery_at = slaEstimate.estimated_completion 
            ? new Date(slaEstimate.estimated_completion) 
            : new Date(new Date(dispatch.created_at).getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days fallback

        // 2. Determine evidence count
        const [evidence] = await db.query(`
            SELECT COUNT(*) as count 
            FROM production_evidence_ledger 
            WHERE dispatch_id = ?
        `, [dispatch.id]);

        // 3. Calculate drift from heartbeats and events
        let sla_drift_minutes = 0;
        
        // Node Offline penalty
        if (dispatch.node_status === 'OFFLINE') {
            const lastSeen = new Date(dispatch.last_heartbeat_at || dispatch.created_at);
            const offlineDuration = (Date.now() - lastSeen.getTime()) / (1000 * 60);
            sla_drift_minutes += Math.round(offlineDuration);
        }

        // Delay events penalty
        const [delayEvents] = await db.query(`
            SELECT * FROM production_events 
            WHERE dispatch_id = ? AND event_type IN ('DELAY_REPORTED', 'SLA_DRIFT_DETECTED')
        `, [dispatch.id]);
        
        delayEvents.forEach(e => {
            const metadata = typeof e.metadata_json === 'string' ? JSON.parse(e.metadata_json) : (e.metadata_json || {});
            sla_drift_minutes += (metadata.drift_minutes || 60);
        });

        // 4. Determine estimated completion
        const estimated_completion_at = new Date(promised_delivery_at.getTime() + (sla_drift_minutes * 60 * 1000));

        // 5. Determine risk level
        let risk_level = 'LOW';
        if (sla_drift_minutes > 1440) risk_level = 'CRITICAL'; // > 24h
        else if (sla_drift_minutes > 240) risk_level = 'HIGH'; // > 4h
        else if (sla_drift_minutes > 60) risk_level = 'MEDIUM'; // > 1h
        
        if (dispatch.node_status === 'OFFLINE' && sla_drift_minutes > 30) risk_level = 'CRITICAL';

        return {
            dispatch_id: dispatch.id,
            promised_delivery_at,
            estimated_completion_at,
            sla_drift_minutes,
            risk_level,
            evidence_count: evidence[0].count,
            last_node_seen_at: dispatch.last_heartbeat_at
        };
    }

    async persistSnapshot(snapshot) {
        await db.query(`
            INSERT INTO sla_evidence_snapshots (
                dispatch_id, promised_delivery_at, estimated_completion_at, 
                sla_drift_minutes, risk_level, evidence_count, last_node_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            snapshot.dispatch_id, snapshot.promised_delivery_at, snapshot.estimated_completion_at,
            snapshot.sla_drift_minutes, snapshot.risk_level, snapshot.evidence_count, snapshot.last_node_seen_at
        ]);
    }

    async getLiveSLARisks() {
        return db.query(`
            SELECT s.*, d.print_node_id, n.company_name as node_name
            FROM sla_evidence_snapshots s
            JOIN manufacturing_dispatches d ON s.dispatch_id = d.id
            JOIN print_nodes n ON d.print_node_id = n.id
            WHERE s.captured_at IN (
                SELECT MAX(captured_at) 
                FROM sla_evidence_snapshots 
                GROUP BY dispatch_id
            )
            ORDER BY s.sla_drift_minutes DESC
        `);
    }

    async getDispatchSLAEvidence(dispatchId) {
        const [snapshot] = await db.query(`
            SELECT * FROM sla_evidence_snapshots 
            WHERE dispatch_id = ? 
            ORDER BY captured_at DESC LIMIT 1
        `, [dispatchId]);
        
        const evidence = await db.query(`
            SELECT * FROM production_evidence_ledger 
            WHERE dispatch_id = ? 
            ORDER BY created_at DESC
        `, [dispatchId]);

        return { snapshot, evidence };
    }
}

module.exports = new LiveSLAEvidenceService();
