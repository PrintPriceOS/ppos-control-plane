/**
 * Production Node Service
 * 
 * Handles business logic for Print Nodes, including capability normalization
 * and RBAC enforcement.
 */
const persistence = require('./productionPersistenceService');
const auditLogger = require('./auditLoggerService');
const machineRegistry = require('./machineRegistryService');

class ProductionNodeService {
  /**
   * Create a new Print Node from a machine profile
   * @param {Object} nodeData
   * @param {Object} context { userId, tenantId, role }
   */
  async createNode(nodeData, context) {
    // RBAC: Only printer tenants may own nodes
    if (context.role !== 'PRINTER' && context.role !== 'SUPER_ADMIN') {
      throw new Error('UNAUTHORIZED: Only Printer tenants can register nodes');
    }

    const { machineProfile } = nodeData;
    
    // Normalize capabilities from machine profile
    const capabilities = machineRegistry.normalizeCapabilities(machineProfile);

    const newNode = await persistence.createNode({
      ...nodeData,
      tenantId: context.tenantId,
      capabilities
    });

    // Automatically register the primary machine profile
    await machineRegistry.registerMachine(newNode.id, {
        profile_name: 'Primary Machine',
        profile_type: machineProfile.method || 'OFFSET',
        raw_data_json: machineProfile
    });

    await auditLogger.log({
      type: 'NODE_CREATE',
      tenantId: context.tenantId,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { nodeId: newNode.id, companyName: newNode.company_name }
    });

    return newNode;
  }

  /**
   * Get a single node by ID
   * @param {string} nodeId
   * @param {Object} context { tenantId, role }
   */
  async getNode(nodeId, context) {
    const node = await persistence.getNode(nodeId);
    if (!node) return null;

    // RBAC: Owners or SuperAdmins only
    if (context.role !== 'SUPER_ADMIN' && node.tenant_id !== context.tenantId) {
      throw new Error('FORBIDDEN: Access to this node is restricted');
    }

    // Enrich with machines
    node.machines = await machineRegistry.getMachinesForNode(nodeId);

    return node;
  }

  /**
   * List nodes based on filters
   * @param {Object} filters
   * @param {Object} context { tenantId, role }
   */
  async listNodes(filters, context) {
    const finalFilters = { ...filters };

    // RBAC: If not SuperAdmin, filter by tenantId
    if (context.role !== 'SUPER_ADMIN') {
      finalFilters.tenantId = context.tenantId;
    }

    return persistence.listNodes(finalFilters);
  }

  /**
   * Update node status or metadata
   */
  async updateNode(nodeId, updates, context) {
    const node = await persistence.getNode(nodeId);
    if (!node) throw new Error('NOT_FOUND: Node not found');

    // RBAC: Owners or SuperAdmins only
    if (context.role !== 'SUPER_ADMIN' && node.tenant_id !== context.tenantId) {
      throw new Error('FORBIDDEN: Cannot update this node');
    }

    // If machine profile is updated, re-normalize capabilities
    if (updates.machineProfile) {
      updates.capabilities = machineRegistry.normalizeCapabilities(updates.machineProfile);
      
      // Update/Sync machines
      await machineRegistry.registerMachine(nodeId, {
          profile_name: 'Primary Machine',
          profile_type: updates.machineProfile.method || 'OFFSET',
          raw_data_json: updates.machineProfile
      });
    }

    const updatedNode = await persistence.updateNode(nodeId, updates);

    await auditLogger.log({
      type: 'NODE_UPDATE',
      tenantId: context.tenantId,
      userId: context.userId,
      status: 'SUCCESS',
      metadata: { nodeId, updates: Object.keys(updates) }
    });

    return updatedNode;
  }

  /**
   * Normalize machine profile capabilities into structured fields
   * @deprecated Use machineRegistry.normalizeCapabilities instead
   */
  normalizeCapabilities(profile = {}) {
    return machineRegistry.normalizeCapabilities(profile);
  }
}

module.exports = new ProductionNodeService();

