/**
 * Tenant Risk Scorer for PrintPrice OS Intelligence Layer
 * Phase 10 — Batch B (Predictive Intelligence)
 */

const db = require('./db');

/**
 * Calculates a 0-100 risk score for a tenant based on multiple signals.
 * Decomposable logic for explainability.
 */
async function calculateTenantRisk(tenantId, options = {}) {
    const signals = {
        failure_rate: 0,
        anomaly_frequency: 0,
        quota_pressure: 0
    };

    const weights = {
        failure_rate: 0.5,
        anomaly_frequency: 0.3,
        quota_pressure: 0.2
    };

    let serviceTier = 'standard';

    try {
        // 1. Fetch Contract Context
        const { rows: [tenant] } = await db.query('SELECT service_tier FROM tenants WHERE id = ?', [tenantId]);
        if (tenant) serviceTier = tenant.service_tier;

        // 2. Failure Rate Signal (Last 100 jobs)
        const { rows: [failStats] } = await db.query(`
            SELECT 
                COUNT(*) filter (WHERE status = 'FAILED') as fails,
                COUNT(*) as total
            FROM (SELECT status FROM jobs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100)
        `, [tenantId]);
        
        if (failStats && failStats.total > 0) {
            signals.failure_rate = failStats.fails / failStats.total;
        }

        // 3. Anomaly Frequency (Last 24h)
        // In Batch A/B, we check the anomaly count from the last hour for simplicity
        const { rows: [anomStats] } = await db.query(`
            SELECT COUNT(*) as count 
            FROM jobs 
            WHERE tenant_id = ? AND status = 'FAILED' 
            AND updated_at >= NOW() - INTERVAL 1 HOUR
        `, [tenantId]);
        
        // Normalize: 5+ clusters in an hour is 100% risk for this signal
        signals.anomaly_frequency = Math.min(1, (anomStats?.count || 0) / 5);

        // 4. Quota Pressure (Last 1h)
        const { rows: [quotaStats] } = await db.query(`
            SELECT COUNT(*) as count 
            FROM api_audit_log 
            WHERE tenant_id = ? AND action = 'QUOTA_EXCEEDED'
            AND created_at >= NOW() - INTERVAL 1 HOUR
        `, [tenantId]);
        
        // Normalize: 10+ violations in an hour is 100% risk for this signal
        signals.quota_pressure = Math.min(1, (quotaStats?.count || 0) / 10);

    } catch (err) {
        console.error(`[RISK-SCORER] Error for tenant ${tenantId}:`, err);
    }

    // 5. Calculate Raw Weighted Score
    let rawScore = (
        (signals.failure_rate * weights.failure_rate) +
        (signals.anomaly_frequency * weights.anomaly_frequency) +
        (signals.quota_pressure * weights.quota_pressure)
    ) * 100;

    // 6. Contract-Aware Multiplier
    // Strategic tenants reach thresholds faster. 
    // We apply a steeper curve for Enterprise/Strategic tiers.
    if (serviceTier === 'strategic_managed' || serviceTier === 'enterprise_plus') {
        rawScore = Math.min(100, rawScore * 1.5);
    }

    const riskScore = Math.round(rawScore);

    // 7. Determine risk level
    let riskLevel = 'LOW';
    if (riskScore > 80) riskLevel = 'CRITICAL';
    else if (riskScore > 60) riskLevel = 'HIGH';
    else if (riskScore > 30) riskLevel = 'MEDIUM';

    return {
        tenantId,
        riskScore,
        riskLevel,
        drivers: [
            { type: 'FAILURE_RATE', weight: weights.failure_rate, value: signals.failure_rate },
            { type: 'ANOMALY_FREQUENCY', weight: weights.anomaly_frequency, value: signals.anomaly_frequency },
            { type: 'QUOTA_PRESSURE', weight: weights.quota_pressure, value: signals.quota_pressure }
        ],
        timestamp: new Date().toISOString(),
        contractContext: { serviceTier }
    };
}

module.exports = {
    calculateTenantRisk
};
