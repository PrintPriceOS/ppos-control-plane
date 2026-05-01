/**
 * Production Persistence Service
 * 
 * Handles persistent storage of Print Nodes and Machine Profiles.
 */
const db = require('./mysqlClient');
const { v4: uuidv4 } = require('uuid');

class ProductionPersistenceService {
  /**
   * Initialize tables if they don't exist
   */
  async init() {
    try {
      console.log('[PRODUCTION-PERSISTENCE] Initializing tables...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS print_nodes (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          company_name VARCHAR(255) NOT NULL,
          status ENUM('ONLINE', 'OFFLINE', 'BUSY', 'MAINTENANCE') DEFAULT 'OFFLINE',
          license_status ENUM('ACTIVE', 'EXPIRED', 'PENDING', 'SUSPENDED') DEFAULT 'PENDING',
          country VARCHAR(64) NULL,
          city VARCHAR(64) NULL,
          capabilities_json JSON NULL,
          machine_profile_json JSON NULL,
          supported_policies_json JSON NULL,
          max_file_size_mb INT DEFAULT 500,
          api_enabled BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_tenant (tenant_id),
          INDEX idx_status (status),
          INDEX idx_license (license_status)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS print_node_machine_profiles (
          id VARCHAR(64) PRIMARY KEY,
          node_id VARCHAR(64) NOT NULL,
          profile_name VARCHAR(128) NOT NULL,
          profile_type VARCHAR(64) NOT NULL,
          raw_data_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_node (node_id),
          CONSTRAINT fk_node_profile FOREIGN KEY (node_id) REFERENCES print_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS production_packages (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          source VARCHAR(32) DEFAULT 'PREFLIGHT',
          source_job_id VARCHAR(64) NOT NULL,
          source_artifact_id VARCHAR(64) NOT NULL,
          fixed_pdf_artifact_id VARCHAR(64) NULL,
          certified_pdf_artifact_id VARCHAR(64) NULL,
          book_spec_json JSON NULL,
          preflight_report_json JSON NULL,
          policy_id VARCHAR(64) NULL,
          status ENUM('DRAFT', 'READY_FOR_DISPATCH', 'DISPATCHED', 'ACCEPTED_BY_PRINTER', 'REJECTED_BY_PRINTER', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED') DEFAULT 'DRAFT',
          created_by_user_id VARCHAR(64) NOT NULL,
          assigned_printer_tenant_id VARCHAR(64) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_tenant (tenant_id),
          INDEX idx_status (status),
          INDEX idx_printer (assigned_printer_tenant_id),
          INDEX idx_source_job (source_job_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS production_dispatches (
          id VARCHAR(64) PRIMARY KEY,
          production_package_id VARCHAR(64) NOT NULL,
          print_node_id VARCHAR(64) NOT NULL,
          sender_tenant_id VARCHAR(64) NOT NULL,
          receiver_tenant_id VARCHAR(64) NOT NULL,
          status ENUM('PENDING', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED') DEFAULT 'PENDING',
          message TEXT NULL,
          expires_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          accepted_at TIMESTAMP NULL,
          rejected_at TIMESTAMP NULL,
          INDEX idx_package (production_package_id),
          INDEX idx_node (print_node_id),
          INDEX idx_sender (sender_tenant_id),
          INDEX idx_receiver (receiver_tenant_id),
          INDEX idx_status (status),
          CONSTRAINT fk_dispatch_package FOREIGN KEY (production_package_id) REFERENCES production_packages(id) ON DELETE CASCADE,
          CONSTRAINT fk_dispatch_node FOREIGN KEY (print_node_id) REFERENCES print_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS production_events (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          production_package_id VARCHAR(64) NULL,
          dispatch_id VARCHAR(64) NULL,
          event_type VARCHAR(64) NOT NULL,
          actor_type ENUM('USER', 'SYSTEM', 'NODE', 'API') NOT NULL,
          actor_id VARCHAR(64) NOT NULL,
          message TEXT NOT NULL,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_tenant (tenant_id),
          INDEX idx_package (production_package_id),
          INDEX idx_dispatch (dispatch_id),
          INDEX idx_type (event_type)
        ) ENGINE=InnoDB;
      `);
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS production_notifications (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          user_id VARCHAR(64) NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NULL,
          severity ENUM('info', 'warning', 'error', 'success') DEFAULT 'info',
          type VARCHAR(64) NULL,
          related_entity_type VARCHAR(64) NULL,
          related_entity_id VARCHAR(64) NULL,
          is_read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_tenant (tenant_id),
          INDEX idx_user (user_id),
          INDEX idx_read (is_read),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB;
      `);
      
      console.log('[PRODUCTION-PERSISTENCE] Tables verified.');
    } catch (err) {
      console.error('[PRODUCTION-PERSISTENCE] Initialization failed:', err.message);
    }
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
    const id = uuidv4();
    const { nodeId, profileName, profileType, rawData } = profileData;

    await db.query(`
      INSERT INTO print_node_machine_profiles
      (id, node_id, profile_name, profile_type, raw_data_json)
      VALUES (?, ?, ?, ?, ?)
    `, [id, nodeId, profileName, profileType, JSON.stringify(rawData || {})]);

    return id;
  }

  async getMachineProfiles(nodeId) {
    return db.query('SELECT * FROM print_node_machine_profiles WHERE node_id = ?', [nodeId]);
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
      INSERT INTO production_packages 
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
    const rows = await db.query('SELECT * FROM production_packages WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async listPackages(filters = {}) {
    let sql = 'SELECT * FROM production_packages WHERE 1=1';
    const params = [];

    if (filters.tenantId) {
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
    await db.query(`UPDATE production_packages SET ${fields.join(', ')} WHERE id = ?`, params);
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
      INSERT INTO production_dispatches 
      (id, production_package_id, print_node_id, sender_tenant_id, receiver_tenant_id, message, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, packageId, nodeId, senderTenantId, receiverTenantId, 
      message || null, expiresAt || null, status || 'PENDING'
    ]);

    return this.getDispatch(id);
  }

  async getDispatch(id) {
    const rows = await db.query('SELECT * FROM production_dispatches WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async listDispatches(filters = {}) {
    let sql = 'SELECT * FROM production_dispatches WHERE 1=1';
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
      sql += ' AND production_package_id = ?';
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
    await db.query(`UPDATE production_dispatches SET ${fields.join(', ')} WHERE id = ?`, params);
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
      INSERT INTO production_events 
      (id, tenant_id, production_package_id, dispatch_id, event_type, actor_type, actor_id, message, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, packageId || null, dispatchId || null, eventType, 
      actorType || 'SYSTEM', actorId || 'system', message, 
      JSON.stringify(metadata || {})
    ]);

    return id;
  }

  async listEvents(filters = {}) {
    let sql = 'SELECT * FROM production_events WHERE 1=1';
    const params = [];

    if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.packageId) {
      sql += ' AND production_package_id = ?';
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
      INSERT INTO production_notifications 
      (id, tenant_id, user_id, title, message, severity, type, related_entity_type, related_entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, tenantId, userId || null, title, message || null, severity || 'info', 
      type || 'GENERAL', relatedEntityType || null, relatedEntityId || null
    ]);

    return { id, ...data };
  }

  async listNotifications(filters = {}) {
    let sql = 'SELECT * FROM production_notifications WHERE 1=1';
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
    await db.query('UPDATE production_notifications SET is_read = 1 WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    return true;
  }

  async markAllNotificationsRead(tenantId, userId) {
    let sql = 'UPDATE production_notifications SET is_read = 1 WHERE tenant_id = ?';
    const params = [tenantId];
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }
    await db.query(sql, params);
    return true;
  }
}

const service = new ProductionPersistenceService();
service.init().catch(err => console.error('[PRODUCTION-PERSISTENCE] Critical init error:', err));

module.exports = service;
