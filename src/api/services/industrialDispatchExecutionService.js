/**
 * Industrial Dispatch Execution Service
 * 
 * Handles real dispatch creation, capacity locking, and manufacturing queue orchestration.
 * Phase 26 - Autonomous Dispatch Execution Layer.
 */
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const persistence = require('./productionPersistenceService');
const scoringService = require('./industrialDispatchScoringService');

const DISPATCH_LIFECYCLE = {
  PENDING: 'PENDING',
  RESERVED: 'RESERVED',
  QUEUED: 'QUEUED',
  ASSIGNED: 'ASSIGNED',
  IN_PRODUCTION: 'IN_PRODUCTION',
  SHIPPING: 'SHIPPING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  ROLLED_BACK: 'ROLLED_BACK'
};

class IndustrialDispatchExecutionService {
  /**
   * Create a manufacturing dispatch
   */
  async createManufacturingDispatch(jobInput, selectedCandidate, options = {}) {
    console.log(`[DISPATCH-EXECUTION] Creating dispatch for node: ${selectedCandidate.node_id}`);

    // 1. Re-validate candidate eligibility (Fail-Loud)
    const scoringResult = await scoringService.scoreCandidates(jobInput, { 
      allowedNodes: [selectedCandidate.node_id],
      weights: options.weights 
    });

    const validatedCandidate = scoringResult.candidates.find(c => c.node_id === selectedCandidate.node_id);
    if (!validatedCandidate) {
      const rejected = scoringResult.rejected.find(r => r.node_id === selectedCandidate.node_id);
      throw new Error(`Candidate no longer eligible: ${rejected ? rejected.reason : 'Validation Failed'}`);
    }

    // 2. Start Orchestration Transaction
    const dispatchId = uuidv4();
    const reservationId = uuidv4();

    try {
      // 3. Lock Production Capacity
      await this.reserveNodeCapacity(selectedCandidate.node_id, jobInput, dispatchId, reservationId);

      // 4. Create Dispatch Record (Immutable Snapshot)
      await db.query(`
        INSERT INTO manufacturing_dispatches (
          id, production_package_id, print_node_id, sender_tenant_id, receiver_tenant_id,
          status, score_snapshot_json, routing_state_json, sla_estimate_json,
          orchestration_metadata_json, operator_id, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        dispatchId,
        jobInput.package_id || 'manual-dispatch', // Handle manual dispatches or linked packages
        selectedCandidate.node_id,
        options.senderTenantId || 'SYSTEM',
        selectedCandidate.receiver_tenant_id || 'UNKNOWN',
        DISPATCH_LIFECYCLE.RESERVED,
        JSON.stringify(validatedCandidate),
        JSON.stringify({ mode: 'DETERMINISTIC', strategy: 'LEAST_PRESSURE' }),
        JSON.stringify({ estimated_days: jobInput.required_delivery_days || 7 }),
        JSON.stringify({ reservation_id: reservationId, ...options.metadata }),
        options.operatorId || 'system',
        new Date(Date.now() + (options.expiryMs || 3600000)) // Default 1 hour
      ]);

      // 5. Create Timeline Event
      await persistence.createEvent({
        tenantId: options.senderTenantId || 'SYSTEM',
        dispatchId: dispatchId,
        eventType: 'DISPATCH_CREATED',
        actorType: options.operatorId ? 'USER' : 'SYSTEM',
        actorId: options.operatorId || 'system',
        message: `Industrial dispatch initialized for node ${selectedCandidate.display_name}. Capacity reserved.`,
        metadata: { reservationId, score: validatedCandidate.score_total }
      });

      return {
        dispatchId,
        reservationId,
        status: DISPATCH_LIFECYCLE.RESERVED,
        candidate: validatedCandidate
      };

    } catch (err) {
      console.error(`[DISPATCH-EXECUTION] Orchestration failed: ${err.message}`);
      // Rollback if needed (though DB transaction would be better, using manual cleanup for now to match current patterns)
      if (reservationId) await this.releaseNodeCapacity(reservationId);
      throw err;
    }
  }

  /**
   * Reserve manufacturing capacity
   */
  async reserveNodeCapacity(nodeId, jobInput, dispatchId, reservationId = uuidv4()) {
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes reservation TTL

    await db.query(`
      INSERT INTO manufacturing_reservations (
        id, node_id, dispatch_id, job_input_snapshot_json, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, 'PENDING')
    `, [
      reservationId, nodeId, dispatchId, JSON.stringify(jobInput), expiry
    ]);

    return reservationId;
  }

  /**
   * Release reserved capacity
   */
  async releaseNodeCapacity(reservationId, reason = 'RELEASED') {
    await db.query(`
      UPDATE manufacturing_reservations 
      SET status = ?, released_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [reason, reservationId]);
  }

  /**
   * Rollback a dispatch
   */
  async rollbackDispatch(dispatchId, operatorId, reason) {
    const dispatch = await persistence.getDispatch(dispatchId);
    if (!dispatch) throw new Error('Dispatch not found');

    const metadata = typeof dispatch.orchestration_metadata_json === 'string' 
      ? JSON.parse(dispatch.orchestration_metadata_json) 
      : dispatch.orchestration_metadata_json;

    if (metadata?.reservation_id) {
      await this.releaseNodeCapacity(metadata.reservation_id, 'ROLLED_BACK');
    }

    await db.query(`
      UPDATE manufacturing_dispatches 
      SET status = ?, message = ?
      WHERE id = ?
    `, [DISPATCH_LIFECYCLE.ROLLED_BACK, reason, dispatchId]);

    await persistence.createEvent({
      tenantId: dispatch.sender_tenant_id,
      dispatchId: dispatchId,
      eventType: 'DISPATCH_ROLLED_BACK',
      actorType: 'USER',
      actorId: operatorId,
      message: `Dispatch rolled back: ${reason}`,
      metadata: { previousStatus: dispatch.status }
    });

    return { ok: true };
  }
}

module.exports = new IndustrialDispatchExecutionService();
