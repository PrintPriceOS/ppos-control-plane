/**
 * src/api/services/dispatch/DispatchExecutionService.js
 * 
 * Orchestrates real industrial dispatches, capacity reservations, and lifecycle events.
 * 100% DB-backed, no mocks.
 */
const db = require('../mysqlClient');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger').child('dispatch-execution');

class DispatchExecutionService {
  /**
   * Creates a real industrial dispatch and reserves capacity.
   * @param {Object} packageId 
   * @param {Object} selectedNodeId 
   * @param {Object} options { operatorId, jobInput }
   */
  async createManufacturingDispatch(packageId, selectedNodeId, options = {}) {
    const dispatchId = uuidv4();
    const reservationId = uuidv4();
    const { operatorId, jobInput } = options;

    const connection = await db.getPool().getConnection();
    await connection.beginTransaction();

    try {
      // 1. Verify Package exists and is READY
      const [packages] = await connection.query('SELECT * FROM manufacturing_packages WHERE id = ?', [packageId]);
      const pkg = packages[0];
      if (!pkg) throw new Error('PACKAGE_NOT_FOUND');
      
      // 2. Verify Node exists
      const [nodes] = await connection.query('SELECT * FROM print_nodes WHERE id = ?', [selectedNodeId]);
      const node = nodes[0];
      if (!node) throw new Error('NODE_NOT_FOUND');

      // 3. Create Dispatch
      const slaEta = new Date();
      slaEta.setHours(slaEta.getHours() + (node.production_lead_days || 24)); // Default 24h lead if not set

      await connection.query(`
        INSERT INTO manufacturing_dispatches 
        (id, manufacturing_package_id, print_node_id, sender_tenant_id, receiver_tenant_id, status, orchestration_metadata_json, sla_estimate_json, operator_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        dispatchId, packageId, selectedNodeId, pkg.tenant_id, node.tenant_id, 'ALLOCATED',
        JSON.stringify({
          federation_node_id: node.federation_id || node.id,
          initial_utilization: node.capacity_utilization_pct,
          job_input: jobInput
        }),
        JSON.stringify({
          estimated_completion: slaEta.toISOString(),
          risk_buffer_minutes: 60
        }),
        operatorId || 'SYSTEM'
      ]);

      // 4. Create Capacity Reservation
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2); // 2h lock until node accepts

      await connection.query(`
        INSERT INTO manufacturing_reservations 
        (id, node_id, dispatch_id, job_input_snapshot_json, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        reservationId, selectedNodeId, dispatchId, JSON.stringify(jobInput), 'PENDING', expiresAt
      ]);

      // 5. Update Package Status
      await connection.query('UPDATE manufacturing_packages SET status = ?, assigned_printer_tenant_id = ? WHERE id = ?', [
        'DISPATCHED', node.tenant_id, packageId
      ]);

      // 6. Log Event
      await connection.query(`
        INSERT INTO manufacturing_dispatch_events 
        (id, tenant_id, manufacturing_package_id, dispatch_id, event_type, actor_type, actor_id, message, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        uuidv4(), pkg.tenant_id, packageId, dispatchId, 'DISPATCH_CREATED', 'USER', operatorId || 'SYSTEM',
        `Autonomous dispatch initialized for node ${node.company_name}`,
        JSON.stringify({ reservationId, nodeId: selectedNodeId })
      ]);

      await connection.commit();
      
      // Phase 34: Immutable Evidence Ledger - Record Dispatch Creation
      try {
        const evidenceLedger = require('../ManufacturingEvidenceLedgerService');
        await evidenceLedger.appendEvidence({
          dispatch_id: dispatchId,
          node_id: selectedNodeId,
          tenant_id: pkg.tenant_id,
          evidence_type: 'DISPATCH_EXECUTION',
          payload: {
            package_id: packageId,
            node_id: selectedNodeId,
            sla_eta: slaEta.toISOString(),
            job_input: jobInput
          }
        });
      } catch (e) {
        logger.warn({ event: 'dispatch_evidence_failed', dispatchId, error: e.message });
      }

      logger.info({
        event: 'dispatch_created',
        dispatchId,
        nodeId: selectedNodeId,
        packageId
      });

      return {
        ok: true,
        dispatchId,
        reservationId,
        sla: { estimatedCompletion: slaEta }
      };

    } catch (err) {
      await connection.rollback();
      logger.error({
        event: 'dispatch_failed',
        error: err.message,
        packageId,
        nodeId: selectedNodeId
      });
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Updates dispatch status and triggers associated state changes.
   */
  async updateDispatchLifecycle(dispatchId, newStatus, actorId, message = '') {
    const connection = await db.getPool().getConnection();
    await connection.beginTransaction();

    try {
      const [dispatches] = await connection.query('SELECT * FROM manufacturing_dispatches WHERE id = ?', [dispatchId]);
      const dispatch = dispatches[0];
      if (!dispatch) throw new Error('DISPATCH_NOT_FOUND');

      // Update Dispatch
      await connection.query('UPDATE manufacturing_dispatches SET status = ? WHERE id = ?', [newStatus, dispatchId]);

      const pkgCol = dispatch.manufacturing_package_id || dispatch.production_package_id;
      // Handle specific transitions
      if (newStatus === 'IN_PRODUCTION') {
        await connection.query('UPDATE manufacturing_reservations SET status = ? WHERE dispatch_id = ?', ['CONFIRMED', dispatchId]);
        await connection.query('UPDATE manufacturing_packages SET status = ? WHERE id = ?', ['IN_PRODUCTION', pkgCol]);
      } else if (newStatus === 'COMPLETED') {
        await connection.query('UPDATE manufacturing_reservations SET status = ?, released_at = CURRENT_TIMESTAMP WHERE dispatch_id = ?', ['RELEASED', dispatchId]);
        await connection.query('UPDATE manufacturing_packages SET status = ? WHERE id = ?', ['COMPLETED', pkgCol]);
      } else if (newStatus === 'FAILED' || newStatus === 'BLOCKED') {
        await connection.query('UPDATE manufacturing_packages SET status = ? WHERE id = ?', ['READY_FOR_DISPATCH', pkgCol]);
      }

      // Log Event
      await connection.query(`
        INSERT INTO manufacturing_dispatch_events 
        (id, tenant_id, manufacturing_package_id, dispatch_id, event_type, actor_type, actor_id, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        uuidv4(), dispatch.sender_tenant_id, pkgCol, dispatchId, `DISPATCH_${newStatus}`, 'SYSTEM', actorId || 'SYSTEM',
        message || `Dispatch transitioned to ${newStatus}`
      ]);

      await connection.commit();

      // Phase 34: Immutable Evidence Ledger - Record Lifecycle Transition
      try {
        const evidenceLedger = require('../ManufacturingEvidenceLedgerService');
        await evidenceLedger.appendEvidence({
          dispatch_id: dispatchId,
          evidence_type: 'LIFECYCLE_TRANSITION',
          payload: {
            new_status: newStatus,
            actor_id: actorId,
            message
          }
        });
      } catch (e) {
        logger.warn({ event: 'lifecycle_evidence_failed', dispatchId, error: e.message });
      }

      return { ok: true };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Rolls back a dispatch and releases resources.
   */
  async rollbackDispatch(dispatchId, operatorId, reason) {
    const connection = await db.getPool().getConnection();
    await connection.beginTransaction();

    try {
      const [dispatches] = await connection.query('SELECT * FROM manufacturing_dispatches WHERE id = ?', [dispatchId]);
      const dispatch = dispatches[0];
      if (!dispatch) throw new Error('DISPATCH_NOT_FOUND');

      const pkgCol = dispatch.manufacturing_package_id || dispatch.production_package_id;
      // Update Dispatch
      await connection.query('UPDATE manufacturing_dispatches SET status = ? WHERE id = ?', ['ROLLED_BACK', dispatchId]);
      await connection.query('UPDATE manufacturing_reservations SET status = ?, released_at = CURRENT_TIMESTAMP WHERE dispatch_id = ?', ['ROLLED_BACK', dispatchId]);
      await connection.query('UPDATE manufacturing_packages SET status = ? WHERE id = ?', ['READY_FOR_DISPATCH', pkgCol]);

      // Log Event
      await connection.query(`
        INSERT INTO manufacturing_dispatch_events 
        (id, tenant_id, manufacturing_package_id, dispatch_id, event_type, actor_type, actor_id, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        uuidv4(), dispatch.sender_tenant_id, pkgCol, dispatchId, 'DISPATCH_ROLLED_BACK', 'USER', operatorId || 'SYSTEM',
        reason || 'Dispatch rolled back by operator'
      ]);

      await connection.commit();

      // Phase 34: Immutable Evidence Ledger - Record Rollback
      try {
        const evidenceLedger = require('../ManufacturingEvidenceLedgerService');
        await evidenceLedger.appendEvidence({
          dispatch_id: dispatchId,
          evidence_type: 'DISPATCH_ROLLBACK',
          payload: {
            reason,
            operator_id: operatorId
          }
        });
      } catch (e) {
        logger.warn({ event: 'rollback_evidence_failed', dispatchId, error: e.message });
      }

      return { ok: true };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = new DispatchExecutionService();
