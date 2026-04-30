/**
 * Preflight Operations Service
 * 
 * Logic for managing preflight jobs and worker orchestration.
 */
const axios = require('axios');
const persistence = require('./preflightPersistenceService');
const storage = require('./preflightStorageService');
const upstream = require('./preflightServiceClient');
const fs = require('fs');
const path = require('path');

class PreflightOperationsService {
  constructor() {
    this.upstreamUrl = process.env.PPOS_SERVICE_URL || 'http://localhost:8001';
    this.apiKey = process.env.PPOS_ADMIN_API_KEY || 'admin-secret';
  }

  /**
   * Helper for upstream requests with admin auth
   */
  async _request(method, path, params = {}, data = null) {
    try {
      const response = await axios({
        method,
        url: `${this.upstreamUrl}${path}`,
        params,
        data,
        headers: {
          'X-Admin-Api-Key': this.apiKey,
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error(`[PREFLIGHT-SERVICE-ERROR] ${method} ${path}:`, error.message);
      // Return null or empty structure to allow safe fallback
      return null;
    }
  }

  async getHealth() {
    const res = await this._request('GET', '/api/preflight/workers/health');
    return res || { ok: false, workers: [], status: 'UNAVAILABLE' };
  }

  async listJobs(filters = {}) {
    // Phase 5: Return persistent records from Control Plane DB
    const jobs = await persistence.listJobs(filters);
    return { total: jobs.length, jobs };
  }

  async getJob(jobId) {
    // Phase 5: Return persistent record from Control Plane DB
    return await persistence.getJob(jobId);
  }

  /**
   * Create a new persistent job and validate upload
   */
  async createJob(tenantId, jobData) {
    const { uploadId, type, policy } = jobData;

    // 1. Validate upload exists in tenant directory
    const uploadPath = storage._resolveTenantPath(tenantId, path.join('uploads', uploadId));
    if (!fs.existsSync(uploadPath)) {
      throw new Error(`UPLOAD_NOT_FOUND: Upload ${uploadId} does not exist for tenant ${tenantId}`);
    }

    // 2. Identify the file inside the uploadId folder
    const files = fs.readdirSync(uploadPath);
    if (files.length === 0) {
      throw new Error(`UPLOAD_EMPTY: No files found in upload ${uploadId}`);
    }
    const filename = files[0];
    const filePath = path.join(uploadPath, filename);
    const stats = fs.statSync(filePath);

    // 3. Create Persistent Job
    const job = await persistence.createJob({
      tenantId,
      uploadId,
      type,
      policy,
      metadata: { originalFilename: filename }
    });

    // 4. Register Input Artifact
    await persistence.createArtifact({
      tenantId,
      jobId: job.id,
      uploadId,
      type: 'INPUT',
      filename,
      storageKey: filePath,
      sizeBytes: stats.size,
      mimeType: 'application/pdf'
    });

    // 5. Trigger Upstream Processing (Async attempt)
    try {
      console.log(`[PREFLIGHT-OPS] Triggering upstream job for ${job.id} (Tenant: ${tenantId})`);
      const upstreamResult = await upstream.enqueueJob({
        id: job.id,
        tenantId,
        type,
        policy,
        inputPath: filePath,
        metadata: { originalFilename: filename }
      }, jobData.authHeader);

      // Update local record to QUEUED
      await persistence.updateJob(job.id, {
        status: 'QUEUED',
        upstreamJobId: upstreamResult.jobId || upstreamResult.id
      });

      // Update local object for response
      job.status = 'QUEUED';
      job.upstreamJobId = upstreamResult.jobId || upstreamResult.id;

    } catch (err) {
      console.error(`[PREFLIGHT-OPS] Upstream trigger failed for ${job.id}:`, err.message);
      
      // Update local record to FAILED if upstream rejected it
      await persistence.updateJob(job.id, {
        status: 'FAILED',
        error: {
          code: 'UPSTREAM_TRIGGER_FAILED',
          message: err.message,
          details: err.details || {}
        }
      });
      
      job.status = 'FAILED';
      job.error_json = { code: 'UPSTREAM_TRIGGER_FAILED', message: err.message };
    }

    return job;
  }
}

module.exports = new PreflightOperationsService();
