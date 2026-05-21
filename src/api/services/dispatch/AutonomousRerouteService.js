/**
 * src/api/services/dispatch/AutonomousRerouteService.js
 * 
 * Industrial rerouting engine that automatically redistributes dispatches 
 * when nodes degrade or SLA risks exceed thresholds.
 */
const db = require('../mysqlClient');
const executionService = require('./DispatchExecutionService');
const eligibilityService = require('./NodeEligibilityService');
const logger = require('../logger').child('autonomous-reroute');
const { v4: uuidv4 } = require('uuid');

class AutonomousRerouteService {
  /**
   * Scans for dispatches that need autonomous rerouting.
   */
  async runAutonomousRerouteLoop() {
    logger.info({ event: 'reroute_loop_start', message: 'Scanning for reroute candidates' });

    try {
      // 1. Find dispatches on OFFLINE or SATURATED nodes
      const candidates = await db.query(`
        SELECT d.*, n.status as node_status, n.capacity_utilization_pct,
               p.book_spec_json
        FROM manufacturing_dispatches d
        JOIN print_nodes n ON d.print_node_id = n.id
        JOIN production_packages p ON d.production_package_id = p.id
        WHERE d.status IN ('QUEUED', 'ALLOCATED')
          AND (n.status IN ('OFFLINE', 'SATURATED', 'DEGRADED') OR n.capacity_utilization_pct > 90)
      `);

      const results = {
        totalFound: candidates.length,
        successfullyRerouted: 0,
        failedToReroute: 0
      };

      for (const dispatch of candidates) {
        try {
          const ok = await this.executeAutonomousReroute(dispatch);
          if (ok) results.successfullyRerouted++;
          else results.failedToReroute++;
        } catch (err) {
          logger.warn({ event: 'max_reroutes_exceeded', dispatchId: dispatch.id });
          results.failedToReroute++;
        }
      }

      return results;
    } catch (err) {
      logger.error({ event: 'reroute_loop_failed', error: err.message });
      throw err;
    }
  }

  /**
   * Executes a reroute for a single dispatch.
   */
  async executeAutonomousReroute(dispatch) {
    const jobInput = JSON.parse(dispatch.orchestration_metadata_json || '{}').job_input || {};
    
    // 1. Find new eligible nodes
    const { eligible } = await eligibilityService.evaluateNodeEligibility(jobInput);
    
    // Filter out current node
    const alternatives = eligible.filter(n => n.id !== dispatch.print_node_id);
    
    if (alternatives.length === 0) {
      logger.warn({ event: 'no_alternatives_found', dispatchId: dispatch.id });
      return false;
    }

    // Pick best alternative (lowest utilization for now)
    const bestAlternative = alternatives.sort((a, b) => a.utilization - b.utilization)[0];

    const connection = await db.getPool().getConnection();
    await connection.beginTransaction();

    try {
      // 2. Rollback current dispatch
      await connection.query('UPDATE manufacturing_dispatches SET status = ? WHERE id = ?', ['REROUTED', dispatch.id]);
      await connection.query('UPDATE manufacturing_reservations SET status = ?, released_at = CURRENT_TIMESTAMP WHERE dispatch_id = ?', ['ROLLED_BACK', dispatch.id]);

      // 3. Create new dispatch via Execution Service logic (inlined for transaction safety)
      const newDispatchId = uuidv4();
      
      await connection.query(`
        INSERT INTO manufacturing_dispatches 
        (id, production_package_id, print_node_id, sender_tenant_id, receiver_tenant_id, status, orchestration_metadata_json, operator_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newDispatchId, dispatch.production_package_id, bestAlternative.id, dispatch.sender_tenant_id, bestAlternative.id, 'ALLOCATED',
        JSON.stringify({
          rerouted_from: dispatch.id,
          reroute_reason: `Autonomous reroute from node ${dispatch.print_node_id} (Status: ${dispatch.node_status}, Load: ${dispatch.capacity_utilization_pct}%)`,
          job_input: jobInput
        }),
        'SYSTEM_AUTONOMOUS_REROUTE'
      ]);

      // 4. Log Event
      await connection.query(`
        INSERT INTO production_events 
        (id, tenant_id, production_package_id, dispatch_id, event_type, actor_type, actor_id, message, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        uuidv4(), dispatch.sender_tenant_id, dispatch.production_package_id, newDispatchId, 'AUTONOMOUS_REROUTE', 'SYSTEM', 'REROUTE_ENGINE',
        `Autonomous reroute executed from ${dispatch.print_node_id} to ${bestAlternative.id}`,
        JSON.stringify({ sourceDispatchId: dispatch.id, targetNodeId: bestAlternative.id })
      ]);

      await connection.commit();

      // Phase 34: Immutable Evidence Ledger - Record Autonomous Reroute
      try {
        const evidenceLedger = require('../ProductionEvidenceLedgerService');
        await evidenceLedger.appendEvidence({
          dispatch_id: newDispatchId,
          node_id: bestAlternative.id,
          tenant_id: dispatch.sender_tenant_id,
          evidence_type: 'AUTONOMOUS_REROUTE',
          payload: {
            source_dispatch_id: dispatch.id,
            target_node_id: bestAlternative.id,
            reason: `Autonomous reroute from node ${dispatch.print_node_id}`
          }
        });
      } catch (e) {
        logger.warn({ event: 'reroute_evidence_failed', dispatchId: newDispatchId, error: e.message });
      }

      logger.info({ event: 'autonomous_reroute_success', from: dispatch.id, to: newDispatchId });
      return true;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = new AutonomousRerouteService();
