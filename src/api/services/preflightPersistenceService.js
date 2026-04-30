/**
 * Preflight Persistence Service
 * 
 * Handles persistent storage of preflight jobs and artifacts in MySQL.
 */
const db = require('./mysqlClient');
const { v4: uuidv4 } = require('uuid');

class PreflightPersistenceService {
  /**
   * Initialize tables if they don't exist
   */
  async init() {
    try {
      console.log('[PREFLIGHT-PERSISTENCE] Initializing tables...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS preflight_jobs (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          user_id VARCHAR(64) NULL,
          upload_id VARCHAR(64) NOT NULL,
          source_artifact_id VARCHAR(64) NULL,
          output_artifact_id VARCHAR(64) NULL,
          type ENUM('ANALYZE', 'AUTOFIX', 'CERTIFY') NOT NULL,
          status ENUM('CREATED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') DEFAULT 'CREATED',
          progress INT DEFAULT 0,
          step VARCHAR(64) NULL,
          policy VARCHAR(128) NULL,
          error_json JSON NULL,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          completed_at TIMESTAMP NULL,
          INDEX idx_tenant (tenant_id),
          INDEX idx_status (status)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS preflight_artifacts (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL,
          job_id VARCHAR(64) NULL,
          upload_id VARCHAR(64) NULL,
          type VARCHAR(32) NOT NULL,
          filename VARCHAR(255) NOT NULL,
          storage_key VARCHAR(512) NOT NULL,
          size_bytes BIGINT NOT NULL,
          checksum VARCHAR(128) NULL,
          mime_type VARCHAR(128) DEFAULT 'application/pdf',
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP NULL,
          INDEX idx_tenant_job (tenant_id, job_id),
          INDEX idx_upload (upload_id)
        ) ENGINE=InnoDB;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          event_type VARCHAR(64) NOT NULL,
          tenant_id VARCHAR(64) NOT NULL,
          user_id VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_tenant_event (tenant_id, event_type)
        ) ENGINE=InnoDB;
      `);
      
      console.log('[PREFLIGHT-PERSISTENCE] Tables verified.');
    } catch (err) {
      console.error('[PREFLIGHT-PERSISTENCE] Initialization failed:', err.message);
    }
  }

  async createJob(jobData) {
    const id = uuidv4();
    const { tenantId, userId, uploadId, type, policy, metadata } = jobData;
    
    await db.query(`
      INSERT INTO preflight_jobs 
      (id, tenant_id, user_id, upload_id, type, status, policy, metadata_json)
      VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?)
    `, [id, tenantId, userId || null, uploadId, type, policy || null, JSON.stringify(metadata || {})]);
    
    return this.getJob(id);
  }

  async getJob(id) {
    const rows = await db.query('SELECT * FROM preflight_jobs WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async listJobs(filters = {}) {
    let sql = `
      SELECT j.*, a.size_bytes as file_size 
      FROM preflight_jobs j
      LEFT JOIN preflight_artifacts a ON j.id = a.job_id AND a.type = 'INPUT'
      WHERE 1=1
    `;
    const params = [];

    if (filters.tenantId) {
      sql += ' AND j.tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.status) {
      sql += ' AND j.status = ?';
      params.push(filters.status);
    }
    if (filters.type) {
      sql += ' AND j.type = ?';
      params.push(filters.type);
    }
    if (filters.largeOnly) {
      sql += ' AND a.size_bytes >= 524288000'; // 500MB
    }

    sql += ' ORDER BY j.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '50'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async updateJob(id, updates) {
    const fields = [];
    const params = [];
    
    if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
    if (updates.progress !== undefined) { fields.push('progress = ?'); params.push(updates.progress); }
    if (updates.upstreamJobId) { fields.push('metadata_json = JSON_SET(COALESCE(metadata_json, "{}"), "$.upstreamJobId", ?)'); params.push(updates.upstreamJobId); }
    if (updates.error) { fields.push('error_json = ?'); params.push(JSON.stringify(updates.error)); }
    if (updates.completedAt) { fields.push('completed_at = ?'); params.push(updates.completedAt); }

    if (fields.length === 0) return;

    params.push(id);
    await db.query(`UPDATE preflight_jobs SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  async createArtifact(artifactData) {
    const id = uuidv4();
    const { tenantId, jobId, uploadId, type, filename, storageKey, sizeBytes, mimeType, metadata } = artifactData;

    await db.query(`
      INSERT INTO preflight_artifacts
      (id, tenant_id, job_id, upload_id, type, filename, storage_key, size_bytes, mime_type, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, tenantId, jobId || null, uploadId || null, type, filename, storageKey, sizeBytes, mimeType || 'application/pdf', JSON.stringify(metadata || {})]);

    return id;
  }

  async getArtifact(id) {
    const rows = await db.query('SELECT * FROM preflight_artifacts WHERE id = ? AND deleted_at IS NULL', [id]);
    return rows[0] || null;
  }

  async listArtifacts(filters = {}) {
    let sql = 'SELECT * FROM preflight_artifacts WHERE deleted_at IS NULL';
    const params = [];

    if (filters.tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(filters.tenantId);
    }
    if (filters.jobId) {
      sql += ' AND job_id = ?';
      params.push(filters.jobId);
    }
    if (filters.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(filters.limit || '100'));
    params.push(parseInt(filters.offset || '0'));

    return db.query(sql, params);
  }

  async deleteArtifact(id) {
    await db.query('UPDATE preflight_artifacts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  }
}

const service = new PreflightPersistenceService();
// Self-initialize on load (Industrial style)
service.init().catch(err => console.error('[PREFLIGHT-PERSISTENCE] Critical init error:', err));

module.exports = service;
