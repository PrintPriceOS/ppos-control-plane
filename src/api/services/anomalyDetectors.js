/**
 * Anomaly Detectors for PrintPrice OS Intelligence Layer
 * Phase 10 — Batch A
 */

const db = require('./db');

/**
 * Detects clusters of job failures.
 * Returns anomalies if a tenant or deployment exceeds failure thresholds.
 */
async function detectJobFailureClusters() {
    const anomalies = [];
    
    // In a real system, we would query:
    // SELECT tenant_id, deployment_id, COUNT(*) as fail_count 
    // FROM jobs WHERE status = 'FAILED' AND updated_at > NOW() - INTERVAL 15 MINUTE
    // GROUP BY tenant_id, deployment_id HAVING fail_count > 5
    
    // For Batch A, we use deterministic thresholds on recent window
    try {
        const { rows } = await db.query(`
            SELECT 
                tenant_id, 
                deployment_id, 
                COUNT(*) as count
            FROM jobs
            WHERE status = 'FAILED'
            AND updated_at >= NOW() - INTERVAL 30 MINUTE
            GROUP BY tenant_id, deployment_id
        `);

        for (const row of (rows || [])) {
            if (row.count >= 3) {
                anomalies.push({
                    id: `anom_fail_${Date.now()}_${row.tenant_id}`,
                    type: 'FAILURE_CLUSTER',
                    severity: row.count > 10 ? 'CRITICAL' : 'HIGH',
                    entityType: row.deployment_id ? 'deployment' : 'tenant',
                    entityId: row.deployment_id || row.tenant_id,
                    tenant_id: row.tenant_id,
                    summary: `Concentrated failures detected (${row.count} events)`,
                    reason: `Job failure rate exceeded threshold for ${row.tenant_id} in the last 30m.`,
                    evidence: {
                        window: '30m',
                        metrics: { clusters: row.count },
                        threshold: 3
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (err) {
        console.error('[INTEL-DETECTOR] Error detecting failure clusters:', err);
    }

    return anomalies;
}

/**
 * Detects queue/processing stalls.
 */
async function detectQueueAnomalies() {
    const anomalies = [];
    
    try {
        // Query backlog vs throughput
        const { rows: [stats] } = await db.query(`
            SELECT 
                COUNT(*) as backlog,
                MIN(created_at) as oldest_job
            FROM jobs 
            WHERE status = 'QUEUED'
        `);

        if (stats && stats.backlog > 100) {
            anomalies.push({
                id: `anom_queue_${Date.now()}`,
                type: 'QUEUE_STALL',
                severity: 'MEDIUM',
                entityType: 'system',
                entityId: 'primary-queue',
                summary: 'Unusual backlog growth',
                reason: `Queue size reached ${stats.backlog} jobs.`,
                evidence: {
                    backlog: stats.backlog,
                    oldestJob: stats.oldest_job
                },
                timestamp: new Date().toISOString()
            });
        }
    } catch (err) {
        console.error('[INTEL-DETECTOR] Error detecting queue anomalies:', err);
    }

    return anomalies;
}

/**
 * Detects governance pressure (repeated quota exceeded).
 */
async function detectGovernanceAnomalies() {
    const anomalies = [];
    
    try {
        const { rows } = await db.query(`
            SELECT 
                tenant_id, 
                COUNT(*) as count
            FROM api_audit_log
            WHERE action = 'QUOTA_EXCEEDED'
            AND created_at >= NOW() - INTERVAL 1 HOUR
            GROUP BY tenant_id
        `);

        for (const row of (rows || [])) {
            if (row.count >= 5) {
                anomalies.push({
                    id: `anom_gov_${Date.now()}_${row.tenant_id}`,
                    type: 'GOVERNANCE_PRESSURE',
                    severity: 'MEDIUM',
                    entityType: 'tenant',
                    entityId: row.tenant_id,
                    summary: 'Repeated quota violations',
                    reason: `Tenant ${row.tenant_id} hit quota limits ${row.count} times in the last hour.`,
                    evidence: {
                        window: '1h',
                        count: row.count
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (err) {
        console.error('[INTEL-DETECTOR] Error detecting governance anomalies:', err);
    }

    return anomalies;
}

module.exports = {
    detectAll: async () => {
        const results = await Promise.all([
            detectJobFailureClusters(),
            detectQueueAnomalies(),
            detectGovernanceAnomalies()
        ]);
        return results.flat();
    }
};
