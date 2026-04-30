/**
 * Production Dispatch Service
 * 
 * Manages the transactional flow of production packages to print nodes.
 */
const persistence = require('./productionPersistenceService');
const auditLogger = require('./auditLoggerService');
const eventService = require('./productionEventService');

class ProductionDispatchService {
  /**
   * Dispatch a package to a specific node
   * @param {string} packageId
   * @param {string} nodeId
   * @param {Object} options { message, expiresAt }
   * @param {Object} context { userId, tenantId, role }
   */
  async createDispatch(packageId, nodeId, options, context) {
    // 1. Fetch Package and Node
    const pkg = await persistence.getPackage(packageId);
    if (!pkg) throw new Error('NOT_FOUND: Production package not found');

    const node = await persistence.getNode(nodeId);
    if (!node) throw new Error('NOT_FOUND: Print node not found');

    // 2. Validations
    // Sender ownership check
    if (pkg.tenant_id !== context.tenantId && context.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: You do not own this production package');
    }

    // Printer license check
    if (node.license_status !== 'ACTIVE') {
      throw new Error('PRECONDITION_FAILED: Target node does not have an active printer license');
    }

    // Node status check
    if (node.status === 'OFFLINE' || node.status === 'MAINTENANCE') {
        throw new Error('PRECONDITION_FAILED: Target node is currently unavailable');
    }

    // Check if package is in a valid state for dispatch
    if (pkg.status !== 'DRAFT' && pkg.status !== 'READY_FOR_DISPATCH' && pkg.status !== 'REJECTED_BY_PRINTER') {
        throw new Error(`PRECONDITION_FAILED: Package in status ${pkg.status} cannot be dispatched`);
    }

    // 3. Create Dispatch Record
    const dispatch = await persistence.createDispatch({
      packageId,
      nodeId,
      senderTenantId: context.tenantId,
      receiverTenantId: node.tenant_id,
      message: options.message,
      expiresAt: options.expiresAt,
      status: 'SENT'
    });

    // 4. Update Package Status
    await persistence.updatePackage(packageId, { 
        status: 'DISPATCHED',
        assignedPrinterTenantId: node.tenant_id
    });

    await auditLogger.log({
      type: 'DISPATCH_CREATE',
      tenantId: context.tenantId,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { dispatchId: dispatch.id, packageId, nodeId }
    });

    await eventService.record({
      tenantId: context.tenantId,
      packageId,
      dispatchId: dispatch.id,
      type: 'PACKAGE_DISPATCHED',
      actorType: 'USER',
      actorId: context.userId,
      message: `Package dispatched to node ${node.company_name}`,
      metadata: { nodeId, companyName: node.company_name }
    });

    return dispatch;
  }

  /**
   * List dispatches with tenant visibility rules
   */
  async listDispatches(filters, context) {
    const finalFilters = { ...filters };

    // RBAC: 
    // - SUPER_ADMIN sees everything
    // - Others see dispatches where they are sender OR receiver
    if (context.role !== 'SUPER_ADMIN') {
        finalFilters.senderTenantId = context.tenantId;
        finalFilters.receiverTenantId = context.tenantId;
    }

    return persistence.listDispatches(finalFilters);
  }

  /**
   * Get dispatch detail
   */
  async getDispatch(dispatchId, context) {
    const dispatch = await persistence.getDispatch(dispatchId);
    if (!dispatch) return null;

    // Visibility Check
    const isSender = dispatch.sender_tenant_id === context.tenantId;
    const isReceiver = dispatch.receiver_tenant_id === context.tenantId;

    if (!isSender && !isReceiver && context.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: You do not have permission to view this dispatch');
    }

    return dispatch;
  }

  /**
   * Accept a dispatch (Printer Action)
   */
  async acceptDispatch(dispatchId, context) {
    const dispatch = await persistence.getDispatch(dispatchId);
    if (!dispatch) throw new Error('NOT_FOUND: Dispatch not found');

    // Security: Only the receiver tenant can accept
    if (dispatch.receiver_tenant_id !== context.tenantId && context.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: Only the target printer can accept this dispatch');
    }

    // Re-validate Node license at acceptance time
    const node = await persistence.getNode(dispatch.print_node_id);
    if (!node || node.license_status !== 'ACTIVE') {
        throw new Error('PRECONDITION_FAILED: Target node does not have an active printer license');
    }

    if (dispatch.status !== 'SENT' && dispatch.status !== 'VIEWED') {
      throw new Error(`INVALID_STATE: Cannot accept dispatch in status ${dispatch.status}`);
    }

    // Ensure package is still waiting for dispatch
    const pkg = await persistence.getPackage(dispatch.production_package_id);
    if (!pkg || pkg.status !== 'DISPATCHED') {
        throw new Error(`INVALID_STATE: Package is in status ${pkg?.status || 'UNKNOWN'}, cannot accept dispatch`);
    }

    // 1. Update Dispatch
    const updatedDispatch = await persistence.updateDispatch(dispatchId, { status: 'ACCEPTED' });

    // 2. Update Package
    await persistence.updatePackage(dispatch.production_package_id, { status: 'ACCEPTED_BY_PRINTER' });

    await auditLogger.log({
      type: 'DISPATCH_ACCEPT',
      tenantId: context.tenantId,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { dispatchId, packageId: dispatch.production_package_id }
    });

    await eventService.record({
      tenantId: context.tenantId,
      packageId: dispatch.production_package_id,
      dispatchId,
      type: 'DISPATCH_ACCEPTED',
      actorType: 'NODE',
      actorId: context.userId, // or node identity if available
      message: `Printer accepted production job #${dispatch.id.substring(0,8)}`,
      metadata: { dispatchId }
    });

    return updatedDispatch;
  }

  /**
   * Reject a dispatch (Printer Action)
   */
  async rejectDispatch(dispatchId, reason, context) {
    const dispatch = await persistence.getDispatch(dispatchId);
    if (!dispatch) throw new Error('NOT_FOUND: Dispatch not found');

    // Security: Only the receiver tenant can reject
    if (dispatch.receiver_tenant_id !== context.tenantId && context.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: Only the target printer can reject this dispatch');
    }

    // 1. Update Dispatch
    const updatedDispatch = await persistence.updateDispatch(dispatchId, { 
        status: 'REJECTED',
        message: reason ? `Rejected: ${reason}` : 'Rejected by printer'
    });

    // 2. Update Package
    await persistence.updatePackage(dispatch.production_package_id, { status: 'REJECTED_BY_PRINTER' });

    await auditLogger.log({
      type: 'DISPATCH_REJECT',
      tenantId: context.tenantId,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { dispatchId, reason }
    });

    await eventService.record({
      tenantId: context.tenantId,
      packageId: dispatch.production_package_id,
      dispatchId,
      type: 'DISPATCH_REJECTED',
      actorType: 'NODE',
      actorId: context.userId,
      message: `Printer rejected production job: ${reason}`,
      metadata: { dispatchId, reason }
    });

    return updatedDispatch;
  }
}

module.exports = new ProductionDispatchService();
