/**
 * Production Persistence Service
 * 
 * Handles persistent storage of Print Nodes and Machine Profiles.
 */
const db = require('./mysqlClient');
const { v4: uuidv4 } = require('uuid');

class ManufacturingPersistenceService {
  /**
   * Initialize tables if they don't exist.
   * This is a no-op at runtime. Schema initialization must be handled
   * via migration modules at deploy/startup CLI time.
   */
  async init() {
    // Runtime tables must be provisioned via scripts/run_control_plane_migrations.js
    // in order to maintain a clean import separation boundary.
    console.log('[MANUFACTURING-PERSISTENCE] Table verification bypassed at runtime.');
  }


  async createNode(nodeData) {
    const id = uuidv4();
    const { 
      tenantId, companyName, country, city, capabilities, 
      machineProfile, supportedPolicies, maxFileSizeMb, apiEnabled 
    } = nodeData;
    
    await db.query(`
      INSERT INTO print_nodes 
      (id, tenant_id, company_name, country, city, capabilities_json, machine_profile_json, supported_policies_json, max_file_size_mb, api_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, companyName, country || null, city || null, 
      JSON.stringify(capabilities || {}), JSON.stringify(machineProfile || {}), 
      JSON.stringify(supportedPolicies || []), maxFileSizeMb || 500, apiEnabled || false
    ]);
    
    return this.getNode(id);
  }

  async getNode(id) {
    const rows = await db.query('SELECT * FROM print_nodes WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async listNodes(filters = {}) {
    let sql = 'SELECT * FROM print_nodes WHERE 1=1';
    const params = [];

    if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.country) {
      sql += ' AND country = ?';
      params.push(filters.country);
    }
    if (filters.licenseStatus) {
      sql += ' AND license_status = ?';
      params.push(filters.licenseStatus);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '50'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async updateNode(id, updates) {
    const fields = [];
    const params = [];
    
    if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
    if (updates.licenseStatus) { fields.push('license_status = ?'); params.push(updates.licenseStatus); }
    if (updates.companyName) { fields.push('company_name = ?'); params.push(updates.companyName); }
    if (updates.capabilities) { fields.push('capabilities_json = ?'); params.push(JSON.stringify(updates.capabilities)); }
    if (updates.machineProfile) { fields.push('machine_profile_json = ?'); params.push(JSON.stringify(updates.machineProfile)); }
    if (updates.supportedPolicies) { fields.push('supported_policies_json = ?'); params.push(JSON.stringify(updates.supportedPolicies)); }
    if (updates.maxFileSizeMb !== undefined) { fields.push('max_file_size_mb = ?'); params.push(updates.maxFileSizeMb); }
    if (updates.apiEnabled !== undefined) { fields.push('api_enabled = ?'); params.push(updates.apiEnabled); }

    if (fields.length === 0) return this.getNode(id);

    params.push(id);
    await db.query(`UPDATE print_nodes SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getNode(id);
  }

  async createMachineProfile(profileData) {
    const id = profileData.id || uuidv4();
    const { 
      nodeId, profileName, profileType, manufacturer, model, 
      rawData, normalizedCapabilities, status 
    } = profileData;

    await db.query(`
      INSERT INTO print_node_machine_profiles
      (id, node_id, profile_name, profile_type, manufacturer, model, raw_data_json, normalized_capabilities_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        profile_name = VALUES(profile_name),
        profile_type = VALUES(profile_type),
        manufacturer = VALUES(manufacturer),
        model = VALUES(model),
        raw_data_json = VALUES(raw_data_json),
        normalized_capabilities_json = VALUES(normalized_capabilities_json),
        status = VALUES(status)
    `, [
      id, nodeId, profileName, profileType || 'OFFSET', 
      manufacturer || 'UNKNOWN', model || 'UNKNOWN',
      JSON.stringify(rawData || {}), JSON.stringify(normalizedCapabilities || {}),
      status || 'ACTIVE'
    ]);

    return id;
  }

  async getMachineProfiles(nodeId) {
    const rows = await db.query('SELECT * FROM print_node_machine_profiles WHERE node_id = ?', [nodeId]);
    return rows.map(row => ({
      ...row,
      raw_data_json: typeof row.raw_data_json === 'string' ? JSON.parse(row.raw_data_json) : row.raw_data_json,
      normalized_capabilities_json: typeof row.normalized_capabilities_json === 'string' ? JSON.parse(row.normalized_capabilities_json) : row.normalized_capabilities_json
    }));
  }

  // --- Production Packages ---

  async createPackage(packageData) {
    const id = uuidv4();
    const { 
      tenantId, source, sourceJobId, sourceArtifactId, 
      fixedPdfArtifactId, certifiedPdfArtifactId, bookSpec, 
      preflightReport, policyId, createdByUserId, status 
    } = packageData;

    await db.query(`
      INSERT INTO manufacturing_packages 
      (id, tenant_id, source, source_job_id, source_artifact_id, fixed_pdf_artifact_id, certified_pdf_artifact_id, book_spec_json, preflight_report_json, policy_id, created_by_user_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, source || 'PREFLIGHT', sourceJobId, sourceArtifactId, 
      fixedPdfArtifactId || null, certifiedPdfArtifactId || null, 
      JSON.stringify(bookSpec || {}), JSON.stringify(preflightReport || {}), 
      policyId || null, createdByUserId, status || 'DRAFT'
    ]);

    return this.getPackage(id);
  }

  async getPackage(id) {
    const rows = await db.query('SELECT * FROM manufacturing_packages WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async listPackages(filters = {}) {
    let sql = 'SELECT * FROM manufacturing_packages WHERE 1=1';
    const params = [];

    if (filters.actorTenantId) {
      sql += ' AND (tenant_id = ? OR assigned_printer_tenant_id = ?)';
      params.push(filters.actorTenantId, filters.actorTenantId);
    } else if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.assignedPrinterTenantId) {
      sql += ' AND assigned_printer_tenant_id = ?';
      params.push(filters.assignedPrinterTenantId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '50'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async updatePackage(id, updates) {
    const fields = [];
    const params = [];

    if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
    if (updates.assignedPrinterTenantId) { fields.push('assigned_printer_tenant_id = ?'); params.push(updates.assignedPrinterTenantId); }
    if (updates.bookSpec) { fields.push('book_spec_json = ?'); params.push(JSON.stringify(updates.bookSpec)); }
    if (updates.preflightReport) { fields.push('preflight_report_json = ?'); params.push(JSON.stringify(updates.preflightReport)); }

    if (fields.length === 0) return this.getPackage(id);

    params.push(id);
    await db.query(`UPDATE manufacturing_packages SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getPackage(id);
  }

  // --- Production Dispatches ---

  async createDispatch(dispatchData) {
    const id = uuidv4();
    const { 
      packageId, nodeId, senderTenantId, receiverTenantId, 
      message, expiresAt, status 
    } = dispatchData;

    await db.query(`
      INSERT INTO manufacturing_dispatches 
      (id, manufacturing_package_id, print_node_id, sender_tenant_id, receiver_tenant_id, message, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, packageId, nodeId, senderTenantId, receiverTenantId, 
      message || null, expiresAt || null, status || 'PENDING'
    ]);

    return this.getDispatch(id);
  }

  async getDispatch(id) {
    const rows = await db.query('SELECT * FROM manufacturing_dispatches WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async listDispatches(filters = {}) {
    let sql = 'SELECT * FROM manufacturing_dispatches WHERE 1=1';
    const params = [];

    if (filters.senderTenantId && filters.receiverTenantId) {
      sql += ' AND (sender_tenant_id = ? OR receiver_tenant_id = ?)';
      params.push(filters.senderTenantId, filters.receiverTenantId);
    } else if (filters.senderTenantId) {
      sql += ' AND sender_tenant_id = ?';
      params.push(filters.senderTenantId);
    } else if (filters.receiverTenantId) {
      sql += ' AND receiver_tenant_id = ?';
      params.push(filters.receiverTenantId);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.packageId) {
      sql += ' AND manufacturing_package_id = ?';
      params.push(filters.packageId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '50'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async updateDispatch(id, updates) {
    const fields = [];
    const params = [];

    if (updates.status) { 
      fields.push('status = ?'); 
      params.push(updates.status);
      if (updates.status === 'ACCEPTED') {
        fields.push('accepted_at = CURRENT_TIMESTAMP');
      } else if (updates.status === 'REJECTED') {
        fields.push('rejected_at = CURRENT_TIMESTAMP');
      }
    }
    
    if (updates.message) { fields.push('message = ?'); params.push(updates.message); }

    if (fields.length === 0) return this.getDispatch(id);

    params.push(id);
    await db.query(`UPDATE manufacturing_dispatches SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getDispatch(id);
  }

  // --- Production Events ---

  async createEvent(eventData) {
    const id = uuidv4();
    const { 
      tenantId, packageId, dispatchId, eventType, 
      actorType, actorId, message, metadata 
    } = eventData;

    await db.query(`
      INSERT INTO manufacturing_dispatch_events 
      (id, tenant_id, manufacturing_package_id, dispatch_id, event_type, actor_type, actor_id, message, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, packageId || null, dispatchId || null, eventType, 
      actorType || 'SYSTEM', actorId || 'system', message, 
      JSON.stringify(metadata || {})
    ]);

    return id;
  }

  async listEvents(filters = {}) {
    let sql = 'SELECT * FROM manufacturing_dispatch_events WHERE 1=1';
    const params = [];

    if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.packageId) {
      sql += ' AND manufacturing_package_id = ?';
      params.push(filters.packageId);
    }
    if (filters.dispatchId) {
      sql += ' AND dispatch_id = ?';
      params.push(filters.dispatchId);
    }
    if (filters.eventType) {
      sql += ' AND event_type = ?';
      params.push(filters.eventType);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '100'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  // --- Notifications ---

  async createNotification(data) {
    const id = uuidv4();
    const { 
      tenantId, userId, title, message, severity, 
      type, relatedEntityType, relatedEntityId 
    } = data;

    await db.query(`
      INSERT INTO manufacturing_notifications 
      (id, tenant_id, user_id, title, message, severity, type, related_entity_type, related_entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, userId || null, title, message || null, severity || 'info', 
      type || 'GENERAL', relatedEntityType || null, relatedEntityId || null
    ]);

    return { id, ...data };
  }

  async listNotifications(filters = {}) {
    let sql = 'SELECT * FROM manufacturing_notifications WHERE 1=1';
    const params = [];

    if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.userId) {
      sql += ' AND user_id = ?';
      params.push(filters.userId);
    }
    if (filters.isRead !== undefined) {
      sql += ' AND is_read = ?';
      params.push(filters.isRead ? 1 : 0);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '50'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async markNotificationRead(id, tenantId) {
    await db.query('UPDATE manufacturing_notifications SET is_read = 1 WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    return true;
  }

  async markAllNotificationsRead(tenantId, userId) {
    let sql = 'UPDATE manufacturing_notifications SET is_read = 1 WHERE tenant_id = ?';
    const params = [tenantId];
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }
    await db.query(sql, params);
    return true;
  }
}

const service = new ManufacturingPersistenceService();
// service.init() is deprecated at import-time to prevent automatic runtime DDL execution
module.exports = service;
