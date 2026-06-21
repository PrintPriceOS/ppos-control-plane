'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const observationService = require('./controlledBetaRuntimeActivityObservationService').serviceInstance || require('./controlledBetaRuntimeActivityObservationService');

class RuntimeActivityReviewAggregatorService {
  async aggregateCohortObservations(tenantId, cohortId, windowStart, windowEnd) {
    const startStr = new Date(windowStart).toISOString().slice(0, 19).replace('T', ' ');
    const endStr = new Date(windowEnd).toISOString().slice(0, 19).replace('T', ' ');

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let events = [];
    let blockedAttempts = [];
    let anomalies = [];
    let healthSignals = [];
    let dailyCounters = [];

    if (!isProdLike) {
      // Pull mock state from Phase 136 service
      const obsGates = Array.from(observationService._mockState.gates.values())
        .filter(g => g.tenant_id === tenantId && g.cohort_id === cohortId);

      for (const gate of obsGates) {
        const gateEvs = observationService._mockState.events.get(gate.observation_gate_id) || [];
        events.push(...gateEvs.filter(e => {
          const d = new Date(e.occurred_at);
          return d >= new Date(windowStart) && d <= new Date(windowEnd);
        }));

        const gateBlk = observationService._mockState.blockedAttempts.get(gate.observation_gate_id) || [];
        blockedAttempts.push(...gateBlk.filter(b => {
          const d = new Date(b.occurred_at);
          return d >= new Date(windowStart) && d <= new Date(windowEnd);
        }));

        const gateAnm = Array.from(observationService._mockState.anomalySignals.values())
          .filter(a => a.observation_gate_id === gate.observation_gate_id);
        anomalies.push(...gateAnm.filter(a => {
          const d = new Date(a.created_at);
          return d >= new Date(windowStart) && d <= new Date(windowEnd);
        }));

        const gateHlth = Array.from(observationService._mockState.healthSignals.values())
          .filter(h => h.observation_gate_id === gate.observation_gate_id);
        healthSignals.push(...gateHlth.filter(h => {
          const d = new Date(h.observed_at);
          return d >= new Date(windowStart) && d <= new Date(windowEnd);
        }));

        const gateCounters = Array.from(observationService._mockState.dailyCounters.values())
          .filter(c => c.observation_gate_id === gate.observation_gate_id);
        dailyCounters.push(...gateCounters.filter(c => {
          const d = new Date(c.usage_date);
          return d >= new Date(windowStart) && d <= new Date(windowEnd);
        }));
      }
    } else {
      // Pull real production rows
      events = await db.query(
        `SELECT * FROM controlled_beta_runtime_activity_events 
         WHERE tenant_id = ? AND cohort_id = ? AND occurred_at BETWEEN ? AND ?`,
        [tenantId, cohortId, startStr, endStr]
      );
      blockedAttempts = await db.query(
        `SELECT * FROM controlled_beta_runtime_activity_blocked_attempts 
         WHERE tenant_id = ? AND cohort_id = ? AND occurred_at BETWEEN ? AND ?`,
        [tenantId, cohortId, startStr, endStr]
      );
      anomalies = await db.query(
        `SELECT * FROM controlled_beta_runtime_activity_anomaly_signals 
         WHERE tenant_id = ? AND cohort_id = ? AND created_at BETWEEN ? AND ?`,
        [tenantId, cohortId, startStr, endStr]
      );
      healthSignals = await db.query(
        `SELECT * FROM controlled_beta_runtime_activity_health_signals 
         WHERE tenant_id = ? AND cohort_id = ? AND observed_at BETWEEN ? AND ?`,
        [tenantId, cohortId, startStr, endStr]
      );
      dailyCounters = await db.query(
        `SELECT * FROM controlled_beta_runtime_activity_daily_counters 
         WHERE tenant_id = ? AND cohort_id = ? AND usage_date BETWEEN ? AND ?`,
        [tenantId, cohortId, startStr, endStr]
      );
    }

    const payload = {
      tenant_id: tenantId,
      cohort_id: cohortId,
      window_start: windowStart,
      window_end: windowEnd,
      summary: {
        total_events: events.length,
        blocked_attempts_count: blockedAttempts.length,
        anomalies_count: anomalies.length,
        health_signals_count: healthSignals.length,
        daily_counters_count: dailyCounters.length
      },
      events: events.map(e => ({
        activity_event_id: e.activity_event_id,
        event_type: e.event_type,
        event_status: e.event_status,
        feature_key: e.feature_key,
        action_key: e.action_key,
        event_severity: e.event_severity,
        occurred_at: e.occurred_at
      })),
      blocked_attempts: blockedAttempts,
      anomalies: anomalies,
      health_signals: healthSignals,
      daily_counters: dailyCounters
    };

    // Calculate input snapshot hash
    const serialized = JSON.stringify(payload);
    const inputSnapshotHash = crypto.createHash('sha256').update(serialized).digest('hex');

    return {
      payload,
      inputSnapshotHash
    };
  }
}

const serviceInstance = new RuntimeActivityReviewAggregatorService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
