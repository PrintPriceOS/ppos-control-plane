/**
 * Preflight Persistence Service
 * 
 * Handles persistent storage of preflight jobs and artifacts in MySQL.
 */
const db = require('./mysqlClient');
const { v4: uuidv4 } = require('uuid');

class PreflightPersistenceService {
  /**
   * Initialize tables - Now managed by MigrationService.
   */
  async init() {
    // Schema logic moved to migrations/003_preflight_orchestration.sql
    console.log('[PREFLIGHT-PERSISTENCE] Initialization delegated to Migration Engine.');
  }

  async createJob(jobData) {
    const id = uuidv4();
    const { 
        tenantId, userId, uploadId, type, policy, metadata,
        submittedByRole, assignedPrinterTenantId, visibilityScope 
    } = jobData;
    
    await db.query(`
      INSERT INTO preflight_jobs 
      (id, tenant_id, user_id, submitted_by_role, assigned_printer_tenant_id, visibility_scope, upload_id, type, status, policy, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?)
    `, [
        id, tenantId, userId || null, submittedByRole || 'USER', 
        assignedPrinterTenantId || null, visibilityScope || 'PRIVATE', 
        uploadId, type, policy || null, JSON.stringify(metadata || {})
    ]);
    
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
      // Visibility Rule: Owned by tenant OR assigned to tenant as printer
      sql += ' AND (j.tenant_id = ? OR j.assigned_printer_tenant_id = ?)';
      params.push(filters.tenantId);
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
    if (filters.submittedByRole) {
      sql += ' AND j.submitted_by_role = ?';
      params.push(filters.submittedByRole);
    }
    if (filters.visibilityScope) {
      sql += ' AND j.visibility_scope = ?';
      params.push(filters.visibilityScope);
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
    if (updates.retry_count !== undefined) { fields.push('retry_count = ?'); params.push(updates.retry_count); }
    if (updates.last_heartbeat_at) { fields.push('last_heartbeat_at = ?'); params.push(updates.last_heartbeat_at); }
    if (updates.last_synced_at) { fields.push('last_synced_at = ?'); params.push(updates.last_synced_at); }

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
    await db.query('UPDATE preflight_artifacts SET deleted_at = CURRENT_TIMESTAMP, status = "DELETED" WHERE id = ?', [id]);
  }

  async updateArtifact(id, updates) {
    const fields = [];
    const params = [];
    if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
    if (updates.metadata) { fields.push('metadata_json = ?'); params.push(JSON.stringify(updates.metadata)); }
    if (fields.length === 0) return;
    params.push(id);
    await db.query(`UPDATE preflight_artifacts SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  /**
   * Find artifacts that are either soft-deleted OR exceed retention age
   */
  async listArtifactsForGC(retentionDays) {
    const sql = `
      SELECT * FROM preflight_artifacts 
      WHERE status != 'DELETED' 
      AND (
        deleted_at IS NOT NULL 
        OR created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      )
      LIMIT 1000
    `;
    return db.query(sql, [retentionDays]);
  }
}

const service = new PreflightPersistenceService();
// Self-initialize on load (Industrial style)
service.init().catch(err => console.error('[PREFLIGHT-PERSISTENCE] Critical init error:', err));

module.exports = service;
