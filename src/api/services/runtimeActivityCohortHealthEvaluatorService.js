'use strict';

const crypto = require('crypto');

class RuntimeActivityCohortHealthEvaluatorService {
  async evaluateCohortHealth(snapshot) {
    const findings = [];
    let riskLevel = 'LOW';
    let recommendedDecision = 'CONTINUE_COHORT';

    const { summary, anomalies, health_signals, blocked_attempts } = snapshot;

    // Rule 1: High number of blocked attempts
    if (summary.blocked_attempts_count > 5) {
      findings.push({
        finding_key: 'HIGH_RATE_OF_BLOCKED_ATTEMPTS',
        severity: 'MEDIUM',
        details_json: { count: summary.blocked_attempts_count, threshold: 5 }
      });
      riskLevel = 'MEDIUM';
      recommendedDecision = 'REQUEST_MORE_OBSERVATION';
    }

    // Rule 2: Active anomalies detected
    const openAnoms = anomalies.filter(a => a.anomaly_status === 'OPEN' || !a.resolved_at);
    if (openAnoms.length > 0) {
      findings.push({
        finding_key: 'UNRESOLVED_ANOMALIES_PRESENT',
        severity: 'HIGH',
        details_json: { count: openAnoms.length, anomaly_keys: openAnoms.map(a => a.anomaly_key) }
      });
      riskLevel = 'HIGH';
      recommendedDecision = 'REQUIRE_MANUAL_INTERVENTION';
    }

    // Rule 3: Degraded health signals (heartbeat, lag, errors)
    const criticalHealth = health_signals.filter(h => h.severity === 'CRITICAL' || h.signal_status === 'ERROR');
    if (criticalHealth.length > 0) {
      findings.push({
        finding_key: 'CRITICAL_OPERATIONAL_HEALTH_DEGRADATION',
        severity: 'CRITICAL',
        details_json: { count: criticalHealth.length, signals: criticalHealth.map(h => h.signal_key) }
      });
      riskLevel = 'CRITICAL';
      recommendedDecision = 'PAUSE_COHORT';
    }

    // Rule 4: Repeated feature block signals
    const featureBlocks = blocked_attempts.filter(b => b.blocked_severity === 'HIGH');
    if (featureBlocks.length > 3) {
      findings.push({
        finding_key: 'REPEATED_HIGH_SEVERITY_FEATURE_BLOCKS',
        severity: 'HIGH',
        details_json: { count: featureBlocks.length }
      });
      if (riskLevel !== 'CRITICAL') {
        riskLevel = 'HIGH';
        recommendedDecision = 'MARK_OPERATIONAL_RISK';
      }
    }

    // Rule 5: No event coverage / incomplete evidence
    if (summary.total_events === 0) {
      findings.push({
        finding_key: 'ZERO_OBSERVED_EVENTS_IN_WINDOW',
        severity: 'MEDIUM',
        details_json: { message: 'No events registered in this observation window.' }
      });
      if (riskLevel === 'LOW') {
        recommendedDecision = 'REQUEST_MORE_OBSERVATION';
      }
    }

    const evaluationResult = {
      findings,
      riskLevel,
      confidenceLevel: findings.length > 3 ? 'MEDIUM' : 'HIGH',
      recommendedDecision
    };

    const serialized = JSON.stringify(evaluationResult);
    const evaluationResultHash = crypto.createHash('sha256').update(serialized).digest('hex');

    return {
      evaluationResult,
      evaluationResultHash
    };
  }
}

const serviceInstance = new RuntimeActivityCohortHealthEvaluatorService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
