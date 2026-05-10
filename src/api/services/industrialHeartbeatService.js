/**
 * Industrial Heartbeat Service
 * 
 * Handles real-time node monitoring, operational telemetry ingestion, and SLA drift detection.
 * Phase 27 - Industrial Heartbeat Layer.
 */
const db = require('./mysqlClient');
const persistence = require('./productionPersistenceService');

const NODE_STATES = {
  ONLINE: 'ONLINE',
  DEGRADED: 'DEGRADED',
  SATURATED: 'SATURATED',
  OFFLINE: 'OFFLINE',
  MAINTENANCE: 'MAINTENANCE',
  RECOVERING: 'RECOVERING',
  DESYNCHRONIZED: 'DESYNCHRONIZED'
};

class IndustrialHeartbeatService {
  /**
   * Process a node heartbeat payload
   */
  async processNodeHeartbeat(payload) {
    const { 
      node_id, printhouse_id, timestamp, 
      queue_depth, active_jobs, utilization_pct,
      machine_state, worker_state, dispatches_active,
      dispatches_delayed, storage_pressure, sync_version
    } = payload;

    if (!node_id) throw new Error('MISSING_NODE_ID');

    // 1. Derive Deterministic State
    let derivedState = NODE_STATES.ONLINE;
    if (utilization_pct > 95) derivedState = NODE_STATES.SATURATED;
    else if (utilization_pct > 80 || dispatches_delayed > 0) derivedState = NODE_STATES.DEGRADED;
    if (machine_state === 'MAINTENANCE') derivedState = NODE_STATES.MAINTENANCE;

    // 2. Persist Heartbeat
    await db.query(`
      INSERT INTO node_heartbeats (
        node_id, printhouse_id, status, queue_depth, active_jobs, 
        utilization_pct, machine_state, worker_state, dispatches_active,
        dispatches_delayed, storage_pressure, sync_version, heartbeat_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      node_id, printhouse_id, derivedState, queue_depth || 0, active_jobs || 0,
      utilization_pct || 0, machine_state || 'IDLE', worker_state || 'READY',
      dispatches_active || 0, dispatches_delayed || 0, storage_pressure || 0,
      sync_version || '1.0'
    ]);

    // 3. Update Node Status in Registry
    await db.query(`
      UPDATE print_nodes 
      SET status = ?, last_heartbeat_at = CURRENT_TIMESTAMP, 
          capacity_utilization_pct = ?
      WHERE id = ?
    `, [derivedState, utilization_pct || 0, node_id]);
    
    // Phase 34: Immutable Evidence Ledger - Record Heartbeat
    try {
        const evidenceLedger = require('./ProductionEvidenceLedgerService');
        await evidenceLedger.appendEvidence({
            dispatch_id: `TELEMETRY-${node_id}`,
            node_id: node_id,
            evidence_type: 'NODE_HEARTBEAT',
            payload: {
                status: derivedState,
                utilization: utilization_pct,
                queue_depth: queue_depth,
                active_jobs: active_jobs,
                timestamp: timestamp
            }
        });
    } catch (e) {
        // Log but don't fail heartbeat
    }

    // 4. Check for SLA Drift on active dispatches
    if (dispatches_active > 0) {
      await this.auditDispatchSla(node_id, payload);
    }

    return { ok: true, state: derivedState };
  }

  /**
   * Audit active dispatches for SLA risk
   */
  async auditDispatchSla(nodeId, heartbeat) {
    const activeDispatches = await db.query(`
      SELECT * FROM production_dispatches 
      WHERE print_node_id = ? AND status IN ('RESERVED', 'QUEUED', 'IN_PRODUCTION')
    `, [nodeId]);

    for (const dispatch of activeDispatches) {
      const risk = this.detectDispatchSlaRisk(dispatch, heartbeat);
      if (risk.risk_level !== 'LOW') {
        await persistence.createEvent({
          tenantId: dispatch.sender_tenant_id,
          dispatchId: dispatch.id,
          eventType: 'SLA_DRIFT_DETECTED',
          actorType: 'SYSTEM',
          actorId: 'heartbeat-monitor',
          message: `SLA Drift Detected: ${risk.recommendation}`,
          metadata: risk
        });
      }
    }
  }

  /**
   * Detect SLA Risk for a specific dispatch
   */
  detectDispatchSlaRisk(dispatch, heartbeat) {
    let risk_level = 'LOW';
    let drift_minutes = 0;
    let recommendation = 'STABLE';
    let requires_operator_attention = false;

    // Logic: If queue depth is high and utilization is saturated
    if (heartbeat.utilization_pct > 95 && heartbeat.queue_depth > 100) {
      risk_level = 'HIGH';
      drift_minutes = 120;
      recommendation = 'CONSIDER_FAILOVER_OR_CAPACITY_EXPANSION';
      requires_operator_attention = true;
    } else if (heartbeat.dispatches_delayed > 0) {
      risk_level = 'MEDIUM';
      drift_minutes = 30;
      recommendation = 'MONITOR_NODE_THROUGHPUT';
    }

    return {
      risk_level,
      drift_minutes,
      recommendation,
      requires_operator_attention,
      timestamp: new Date()
    };
  }

  /**
   * Get global industrial telemetry overview
   */
  async getIndustrialTelemetryOverview() {
    const nodes = await db.query('SELECT id, status, last_heartbeat_at, capacity_utilization_pct FROM print_nodes');
    const now = Date.now();
    
    const stats = {
      active: 0,
      degraded: 0,
      offline: 0,
      saturated: 0,
      total_load: 0,
      sla_risks: 0,
      freshness_pct: 0
    };

    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    nodes.forEach(node => {
      const isStale = !node.last_heartbeat_at || (now - new Date(node.last_heartbeat_at).getTime()) > staleThreshold;
      
      if (isStale) stats.offline++;
      else if (node.status === 'SATURATED') stats.saturated++;
      else if (node.status === 'DEGRADED') stats.degraded++;
      else stats.active++;

      stats.total_load += node.capacity_utilization_pct || 0;
    });

    stats.avg_load = nodes.length > 0 ? Math.round(stats.total_load / nodes.length) : 0;
    stats.freshness_pct = nodes.length > 0 ? Math.round((stats.active + stats.degraded + stats.saturated) / nodes.length * 100) : 0;

    return stats;
  }
}

module.exports = new IndustrialHeartbeatService();
