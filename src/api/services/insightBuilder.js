/**
 * Insight Builder for PrintPrice OS Intelligence Layer
 * Phase 10 — Batch A
 */

const db = require('./db');

/**
 * Transforms anomalies into insights.
 * Account for deployment contract context for severity evaluation.
 */
async function buildInsights(anomalies = []) {
    const insights = [];
    
    // Group anomalies by entity to find patterns
    const anomaliesByEntity = anomalies.reduce((acc, curr) => {
        const key = `${curr.entityType}:${curr.entityId}`;
        acc[key] = acc[key] || [];
        acc[key].push(curr);
        return acc;
    }, {});

    for (const [key, entityAnomalies] of Object.entries(anomaliesByEntity)) {
        const [entityType, entityId] = key.split(':');
        
        // 1. Failure Concentration Insight
        const failureClusters = entityAnomalies.filter(a => a.type === 'FAILURE_CLUSTER');
        if (failureClusters.length > 0) {
            const totalFailures = failureClusters.reduce((sum, a) => sum + (a.evidence?.metrics?.clusters || 0), 0);
            
            // Fetch contract context
            let serviceTier = 'standard';
            const tenantId = entityType === 'tenant' ? entityId : failureClusters[0].tenant_id;
            
            if (tenantId) {
                try {
                    const { rows } = await db.query('SELECT service_tier FROM tenants WHERE id = ?', [tenantId]);
                    if (rows && rows[0]) serviceTier = rows[0].service_tier;
                } catch (e) {}
            }

            const severity = (totalFailures > 20 || serviceTier === 'strategic_managed') ? 'HIGH' : 'MEDIUM';

            insights.push({
                id: `insight_fail_${Date.now()}_${entityId}`,
                category: 'stability',
                summary: `Elevated failure concentration for ${entityId}`,
                explanation: `Detected ${totalFailures} failures in the last 30 minutes. This indicates a potential deployment issue or configuration drift.`,
                severity,
                entityType,
                entityId,
                relatedAnomalyIds: failureClusters.map(a => a.id),
                recommendedActionType: 'inspect',
                timestamp: new Date().toISOString(),
                contractContext: { serviceTier }
            });
        }

        // 2. Governance Pressure Insight
        const govAnomalies = entityAnomalies.filter(a => a.type === 'GOVERNANCE_PRESSURE');
        if (govAnomalies.length > 0) {
            insights.push({
                id: `insight_gov_${Date.now()}_${entityId}`,
                category: 'governance',
                summary: `Sustained governance pressure for ${entityId}`,
                explanation: `Repeated quota violations detected. This may suggest a mismatch between tenant plan and current workload.`,
                severity: 'MEDIUM',
                entityType,
                entityId,
                relatedAnomalyIds: govAnomalies.map(a => a.id),
                recommendedActionType: 'review-tenant',
                timestamp: new Date().toISOString()
            });
        }
    }

    // 3. System-wide Queue Insight
    const queueAnomalies = anomalies.filter(a => a.type === 'QUEUE_STALL');
    if (queueAnomalies.length > 0) {
        insights.push({
            id: `insight_queue_${Date.now()}`,
            category: 'capacity',
            summary: 'System queue backlog increasing',
            explanation: 'Queue backlog is growing faster than worker processing rate, leading to increased latency.',
            severity: 'HIGH',
            entityType: 'system',
            entityId: 'primary-queue',
            relatedAnomalyIds: queueAnomalies.map(a => a.id),
            recommendedActionType: 'scale-workers',
            timestamp: new Date().toISOString()
        });
    }

    return insights;
}

module.exports = {
    buildInsights
};
