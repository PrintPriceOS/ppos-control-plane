const { 
  publishIndustrialEvent, 
  INDUSTRIAL_EVENT_TYPES, 
  createIndustrialEventWorker,
  INDUSTRIAL_QUEUE_NAMES
} = require('@ppos/shared-infra');
const logger = require('./logger');

/**
 * IndustrialEventOrchestrationService
 * 
 * Orchestrates industrial events between the Control Plane and the Industrial Event Transport Layer.
 */
class IndustrialEventOrchestrationService {
  constructor() {
    this.workers = [];
  }

  /**
   * Initialize workers for consuming events.
   */
  async init() {
    if (process.env.PPOS_ENABLE_INDUSTRIAL_EVENT_WORKERS !== 'true' && !process.env.REDIS_URL && !process.env.AMQP_URL) {
      logger.warn('[INDUSTRIAL-EVENT-ORCHESTRATION] Consumers skipped: worker connection not configured.');
      return;
    }

    logger.info('[INDUSTRIAL-ORCHESTRATION] Initializing industrial event consumers...');

    // Consume Telemetry Heartbeats
    const telemetryWorker = createIndustrialEventWorker(
      INDUSTRIAL_QUEUE_NAMES.INDUSTRIAL_TELEMETRY,
      this.consumeTelemetryHeartbeat.bind(this),
      { concurrency: 5 }
    );
    this.workers.push(telemetryWorker);

    // Consume Dispatch Requests
    const dispatchWorker = createIndustrialEventWorker(
      INDUSTRIAL_QUEUE_NAMES.MANUFACTURING_DISPATCH,
      this.consumeDispatchRequested.bind(this),
      { concurrency: 2 }
    );
    this.workers.push(dispatchWorker);

    logger.info('[INDUSTRIAL-ORCHESTRATION] Industrial event consumers active.');
  }

  // --- PUBLISHERS ---

  async publishDispatchRequested(dispatchData, options = {}) {
    return this._publish(INDUSTRIAL_EVENT_TYPES.MANUFACTURING_DISPATCH_REQUESTED, dispatchData, options);
  }

  async publishDispatchAssigned(dispatchData, options = {}) {
    return this._publish(INDUSTRIAL_EVENT_TYPES.MANUFACTURING_DISPATCH_ASSIGNED, dispatchData, options);
  }

  async publishDispatchStatusChanged(dispatchData, options = {}) {
    return this._publish(INDUSTRIAL_EVENT_TYPES.MANUFACTURING_DISPATCH_STATUS_CHANGED, dispatchData, options);
  }

  async publishDispatchCompleted(dispatchData, options = {}) {
    return this._publish(INDUSTRIAL_EVENT_TYPES.MANUFACTURING_DISPATCH_COMPLETED, dispatchData, options);
  }

  async publishDispatchFailed(dispatchData, options = {}) {
    return this._publish(INDUSTRIAL_EVENT_TYPES.MANUFACTURING_DISPATCH_FAILED, dispatchData, options);
  }

  async publishCapacityReserved(reservationData, options = {}) {
    return this._publish(INDUSTRIAL_EVENT_TYPES.MANUFACTURING_CAPACITY_RESERVED, reservationData, options);
  }

  async publishCapacityReleased(reservationData, options = {}) {
    return this._publish(INDUSTRIAL_EVENT_TYPES.MANUFACTURING_CAPACITY_RELEASED, reservationData, options);
  }

  async publishPreflightRequired(preflightData, options = {}) {
    return this._publish(INDUSTRIAL_EVENT_TYPES.PREFLIGHT_JOB_REQUESTED, preflightData, options);
  }

  async publishTelemetrySnapshot(snapshotData, options = {}) {
    return this._publish(INDUSTRIAL_EVENT_TYPES.TELEMETRY_HEARTBEAT, snapshotData, options);
  }

  /**
   * Internal publish helper with fail-soft behavior.
   */
  async _publish(type, payload, options = {}) {
    try {
      const result = await publishIndustrialEvent(type, payload, {
        trace_id: options.trace_id || options.traceId,
        correlation_id: options.correlation_id || options.correlationId,
        dispatch_id: options.dispatch_id || options.dispatchId,
        node_id: options.node_id || options.nodeId,
        ...options
      });
      
      logger.info({ 
        type: 'INDUSTRIAL-EVENT-PUBLISHED', 
        eventType: type, 
        eventId: result.eventId,
        trace_id: result.envelope.trace_id 
      }, `[INDUSTRIAL-EVENT-PUBLISHED] ${type}`);
      
      return result;
    } catch (error) {
      logger.error({ 
        type: 'INDUSTRIAL-EVENT-PUBLISH-FAILED', 
        eventType: type, 
        error: error.message 
      }, `[INDUSTRIAL-EVENT-PUBLISH-FAILED] ${type}: ${error.message}`);
      
      // Fail-soft: never block pipeline
      return { ok: false, error: error.message };
    }
  }

  // --- CONSUMERS ---

  async consumeTelemetryHeartbeat(event) {
    const { type, payload, trace_id } = event;
    logger.info({ type: 'INDUSTRIAL-EVENT-CONSUMED', eventType: type, trace_id }, `[INDUSTRIAL-EVENT-CONSUMED] ${type}`);

    try {
      const IndustrialTelemetryService = require('./IndustrialTelemetryService');
      await IndustrialTelemetryService.handleHeartbeat(payload, { trace_id });
    } catch (error) {
      logger.error({ type: 'TELEMETRY-INGESTION-FAILED', error: error.message, trace_id }, `[TELEMETRY-INGESTION-FAILED] ${error.message}`);
    }
  }

  async consumeDispatchRequested(event) {
    const { type, payload, trace_id } = event;
    if (type !== INDUSTRIAL_EVENT_TYPES.MANUFACTURING_DISPATCH_REQUESTED) return;

    logger.info({ type: 'INDUSTRIAL-EVENT-CONSUMED', eventType: type, trace_id }, `[INDUSTRIAL-EVENT-CONSUMED] ${type}`);

    try {
      const manufacturingOrchestrationService = require('./ManufacturingOrchestrationService');
      await manufacturingOrchestrationService.handleExternalDispatchRequest(payload, { trace_id });
    } catch (error) {
      logger.error({ type: 'DISPATCH-ORCHESTRATION-FAILED', error: error.message, trace_id }, `[DISPATCH-ORCHESTRATION-FAILED] ${error.message}`);
    }
  }
}

module.exports = new IndustrialEventOrchestrationService();
