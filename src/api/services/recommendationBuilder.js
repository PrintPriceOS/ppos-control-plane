/**
 * Builds advisory recommendations from insights, risk scores, and trends.
 * Phase 10 — Batch B (Predictive Intelligence)
 */
async function buildRecommendations(insights = [], context = {}) {
    const { tenantRisks = [], deploymentRisks = [], trends = [] } = context;
    const recommendations = [];
    
    for (const insight of insights) {
        const entityTrend = trends.find(t => t.entityId === insight.entityId && t.entityType === insight.entityType);
        const tenantRisk = tenantRisks.find(r => r.tenantId === insight.entityId);
        const deployRisk = deploymentRisks.find(r => r.deploymentId === insight.entityId);

        const riskScore = tenantRisk?.riskScore || deployRisk?.riskScore || 0;
        const trend = entityTrend?.trend || 'STABLE';

        // 1. Recommendation for Capacity Scaling
        if (insight.category === 'capacity') {
            recommendations.push({
                id: `rec_scale_${Date.now()}_${insight.entityId}`,
                type: 'CAPACITY_INTERVENTION',
                summary: 'Review worker pool capacity',
                priority: riskScore > 75 ? 'HIGH' : 'MEDIUM',
                rationale: {
                    baseExplanation: insight.explanation,
                    riskScore,
                    trend
                },
                entityType: insight.entityType,
                entityId: insight.entityId,
                actionMode: 'manual_only',
                relatedInsightId: insight.id,
                suggestedActions: [
                    'Scale workers in affected region',
                    'Inspect for large job backlog acceleration',
                    'Check worker heartbeat consistency'
                ],
                safe: true,
                timestamp: new Date().toISOString()
            });
        }

        // 2. Recommendation for Tenant Review
        if (insight.category === 'governance' || insight.category === 'stability') {
            const isAccelerating = trend === 'UP_FAST' || trend === 'UP';
            
            recommendations.push({
                id: `rec_review_${Date.now()}_${insight.entityId}`,
                type: 'TENANT_INTERVENTION',
                summary: `Investigate ${insight.entityId} operational posture`,
                priority: (riskScore > 60 || isAccelerating) ? 'HIGH' : 'MEDIUM',
                rationale: {
                    baseExplanation: insight.explanation,
                    riskScore,
                    trend
                },
                entityType: insight.entityType,
                entityId: insight.entityId,
                actionMode: 'manual_only',
                relatedInsightId: insight.id,
                suggestedActions: [
                    'Review recent job payloads',
                    'Check print house compatibility',
                    'Inspect quota compliance trajectory'
                ],
                safe: true,
                timestamp: new Date().toISOString()
            });
        }
    }

    return recommendations;
}

module.exports = {
    buildRecommendations
};
