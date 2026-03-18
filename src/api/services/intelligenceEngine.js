/**
 * Intelligence Engine Orchestrator
 * Phase 10 — Batch C (Autonomous Guardrails)
 */

const anomalyDetectors = require('./anomalyDetectors');
const insightBuilder = require('./insightBuilder');
const recommendationBuilder = require('./recommendationBuilder');
const tenantRiskScorer = require('./tenantRiskScorer');
const deploymentRiskScorer = require('./deploymentRiskScorer');
const trendAnalyzer = require('./trendAnalyzer');
const circuitBreaker = require('./circuitBreaker');
const guardrailEngine = require('./guardrailEngine');

/**
 * Executes a full intelligence pass.
 */
async function getIntelligencePackage() {
    // 1. Detect Anomalies
    const anomalies = await anomalyDetectors.detectAll();
    
    // 2. Build Insights from Anomalies
    const insights = await insightBuilder.buildInsights(anomalies);
    
    // 3. Risk Scoring
    const tenantIds = [...new Set(anomalies.map(a => a.entityId).filter(id => id && !id.startsWith('dep_')))];
    const tenantRisks = await Promise.all(tenantIds.map(id => tenantRiskScorer.calculateTenantRisk(id)));
    
    const deploymentIds = [...new Set(anomalies.filter(a => a.entityType === 'deployment').map(a => a.entityId))];
    const deploymentRisks = await Promise.all(deploymentIds.map(id => deploymentRiskScorer.calculateDeploymentRisk(id)));

    // 4. Trend Analysis
    const trends = await Promise.all(tenantIds.map(id => trendAnalyzer.analyzeTrends('tenant', id)));

    // 5. Circuit Breaker Evaluation
    const failureRate = anomalies.filter(a => a.type === 'FAILURE_CLUSTER').length / 10; // Simple heuristic for now
    const cbStatus = await circuitBreaker.evaluate({ failureRate, queueDepth: 0 });

    // 6. Guardrail Generation
    const { decisions } = await guardrailEngine.produceDecisions({
        anomalies,
        tenantRisks,
        trends
    });

    // 7. Build Recommendations from Insights + Risk + Trends
    const recommendations = await recommendationBuilder.buildRecommendations(insights, {
        tenantRisks,
        deploymentRisks,
        trends
    });
    
    return {
        timestamp: new Date().toISOString(),
        summary: {
            anomalyCount: anomalies.length,
            insightCount: insights.length,
            recommendationCount: recommendations.length,
            guardrailCount: decisions.length,
            cbState: cbStatus.state,
            criticalCount: anomalies.filter(a => a.severity === 'CRITICAL').length,
            peakRiskScore: Math.max(0, ...tenantRisks.map(r => r.riskScore), ...deploymentRisks.map(r => r.riskScore))
        },
        anomalies,
        insights,
        tenantRisks,
        deploymentRisks,
        trends,
        cbStatus,
        guardrailDecisions: decisions,
        recommendations
    };
}

module.exports = {
    getIntelligencePackage
};
