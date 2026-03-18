/**
 * Deployment Risk Scorer for PrintPrice OS Intelligence Layer
 * Phase 10 — Batch B (Predictive Intelligence)
 */

const db = require('./db');

/**
 * Calculates risk for a specific deployment unit.
 */
async function calculateDeploymentRisk(deploymentId) {
    const signals = {
        queue_latency: 0,
        worker_health: 0,
        contraction: 0
    };

    let dominantFactor = 'NONE';
    let affectedTenants = [];

    try {
        // 1. Queue Latency (Backlog depth vs processing rate)
        const { rows: [queueStats] } = await db.query(`
            SELECT 
                COUNT(*) as backlog,
                EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 60 as oldest_job_mins
            FROM jobs 
            WHERE status = 'QUEUED'
        `);
        
        // Normalize: backlog > 200 or wait > 15m is high risk
        signals.queue_latency = Math.min(1, (queueStats?.backlog || 0) / 200 + (queueStats?.oldest_job_mins || 0) / 15);

        // 2. Worker Health (Heartbeat gaps)
        // In this implementation, we simulate worker health check
        const { rows: deadWorkers } = await db.query(`
            SELECT id FROM api_audit_log 
            WHERE action = 'WORKER_OFFLINE' AND created_at >= NOW() - INTERVAL 10 MINUTE
        `);
        signals.worker_health = Math.min(1, (deadWorkers?.length || 0) / 3);

        // 3. Affected Tenants
        const { rows: tenants } = await db.query(`
            SELECT DISTINCT tenant_id FROM jobs 
            WHERE status = 'QUEUED'
        `);
        affectedTenants = tenants.map(t => t.tenant_id);

    } catch (err) {
        console.error(`[DEPLOYMENT-RISK] Error for ${deploymentId}:`, err);
    }

    // 4. Final Scoring
    let riskScore = Math.round((signals.queue_latency * 0.6 + signals.worker_health * 0.4) * 100);

    // 5. Dominant Factor
    if (signals.queue_latency > signals.worker_health) dominantFactor = 'QUEUE_STALL';
    else if (signals.worker_health > 0) dominantFactor = 'RESOURCE_PRESSURE';

    let riskLevel = 'LOW';
    if (riskScore > 75) riskLevel = 'CRITICAL';
    else if (riskScore > 50) riskLevel = 'HIGH';
    else if (riskScore > 25) riskLevel = 'MEDIUM';

    return {
        deploymentId,
        riskScore: Math.min(100, riskScore),
        riskLevel,
        dominantFactor,
        affectedTenants,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    calculateDeploymentRisk
};
