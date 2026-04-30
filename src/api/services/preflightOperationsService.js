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
    const uploadPath = storage.resolveTenantPath(tenantId, path.join('uploads', uploadId));
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

    // 3. Create Persistent Job (PrintPrice OS Model)
    const job = await persistence.createJob({
      tenantId,
      userId: jobData.userId || null,
      submittedByRole: jobData.submittedByRole || 'USER',
      assignedPrinterTenantId: jobData.assignedPrinterTenantId || null,
      visibilityScope: jobData.visibilityScope || 'PRIVATE',
      uploadId,
      type,
      policy,
      metadata: { originalFilename: filename }
    });

    // 4. Register Input Artifact (using relative storage key)
    await persistence.createArtifact({
      tenantId,
      jobId: job.id,
      uploadId,
      type: 'INPUT',
      filename,
      storageKey: storage.makeRelative(filePath),
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

  /**
   * Sync a local job record with the upstream processing state
   */
  async syncJobStatus(jobId, authHeader = null) {
    const job = await persistence.getJob(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');

    // Parse metadata to find upstreamJobId
    const metadata = job.metadata_json || {};
    const upstreamJobId = metadata.upstreamJobId || job.upstreamJobId;

    if (!upstreamJobId) {
        console.warn(`[PREFLIGHT-SYNC] Job ${jobId} has no upstream ID. Skipping sync.`);
        return job;
    }

    try {
        const upstreamStatus = await upstream.getJobStatus(upstreamJobId, authHeader, job.tenant_id);
        if (!upstreamStatus) throw new Error('UPSTREAM_UNAVAILABLE');

        const localStatus = this._mapUpstreamStatus(upstreamStatus.status);
        const updates = {
            status: localStatus,
            progress: upstreamStatus.progress || 0,
            step: upstreamStatus.step || null,
            last_synced_at: new Date().toISOString()
        };

        // If upstream is active, update heartbeat
        if (['PROCESSING', 'QUEUED'].includes(localStatus)) {
            updates.last_heartbeat_at = new Date().toISOString();
        }

        if (upstreamStatus.error) {
            updates.error = upstreamStatus.error;
        }

        if (upstreamStatus.completedAt || upstreamStatus.completed_at) {
            updates.completedAt = upstreamStatus.completedAt || upstreamStatus.completed_at;
        }

        // Detect transition for audit log
        if (job.status !== localStatus) {
            console.log(`[PREFLIGHT-SYNC] Job ${jobId} status transition: ${job.status} -> ${localStatus}`);
            const auditLogger = require('./auditLoggerService');
            await auditLogger.log({
                type: 'JOB_STATUS_SYNC',
                tenantId: job.tenant_id,
                userId: 'SYSTEM',
                status: 'SUCCESS',
                metadata: { jobId, oldStatus: job.status, newStatus: localStatus, upstreamJobId }
            });

            // If job just completed, register artifacts if provided by upstream
            if (localStatus === 'COMPLETED' && upstreamStatus.artifacts && Array.isArray(upstreamStatus.artifacts)) {
                for (const art of upstreamStatus.artifacts) {
                    await persistence.createArtifact({
                        tenantId: job.tenant_id,
                        jobId,
                        type: art.type || 'OUTPUT',
                        filename: art.filename,
                        storageKey: art.storageKey || art.path,
                        sizeBytes: art.sizeBytes || 0,
                        mimeType: art.mimeType || 'application/pdf',
                        metadata: art.metadata || {}
                    });
                }
            }
        }

        await persistence.updateJob(jobId, updates);
        
        // Return updated job
        return await persistence.getJob(jobId);

    } catch (err) {
        console.error(`[PREFLIGHT-SYNC] Failed to sync job ${jobId}:`, err.message);
        
        // Non-destructive fallback: record sync failure in logs
        const auditLogger = require('./auditLoggerService');
        await auditLogger.log({
            type: 'JOB_STATUS_SYNC',
            tenantId: job.tenant_id,
            userId: 'SYSTEM',
            status: 'FAILURE',
            metadata: { jobId, error: err.message, upstreamJobId }
        });

        return job; // Return current local state
    }
  }

  /**
   * Map upstream status (likely BullMQ/Worker states) to Control Plane canonical lifecycle
   */
  _mapUpstreamStatus(upstreamStatus) {
    if (!upstreamStatus) return 'FAILED';
    
    const s = upstreamStatus.toUpperCase();
    
    // Mapping Logic
    switch (s) {
        case 'WAITING':
        case 'QUEUED':
        case 'DELAYED':
            return 'QUEUED';
        case 'ACTIVE':
        case 'PROCESSING':
            return 'PROCESSING';
        case 'COMPLETED':
        case 'FINISHED':
        case 'SUCCESS':
            return 'COMPLETED';
        case 'FAILED':
        case 'ERROR':
            return 'FAILED';
        case 'STALLED':
            return 'STALLED';
        case 'RETRYING':
            return 'RETRYING';
        case 'CANCELLED':
        case 'REMOVED':
            return 'CANCELLED';
        default:
            return 'PROCESSING'; // Default to active if unknown but present
    }
  }

  /**
   * Retry a failed or stalled job
   */
  async retryJob(jobId, authHeader = null) {
    const job = await persistence.getJob(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');

    const allowable = ['FAILED', 'STALLED', 'CANCELLED'];
    if (!allowable.includes(job.status)) {
        throw new Error(`CANNOT_RETRY: Job is in ${job.status} state`);
    }

    if (job.retry_count >= job.max_retries) {
        throw new Error(`MAX_RETRIES_EXCEEDED: Already retried ${job.retry_count} times`);
    }

    console.log(`[PREFLIGHT-OPS] Retrying job ${jobId} (Attempt ${job.retry_count + 1})`);

    // 1. Prepare for retry: reset status and increment count
    await persistence.updateJob(jobId, {
        status: 'QUEUED',
        retry_count: job.retry_count + 1,
        error: null,
        progress: 0
    });

    // 2. Re-trigger upstream (re-using createJob logic but for existing job)
    const artifactData = await persistence.listArtifacts({ jobId, type: 'INPUT' });
    const inputPath = artifactData[0]?.storage_key;
    if (!inputPath) throw new Error('INPUT_ARTIFACT_MISSING');

    const storage = require('./preflightStorageService');
    const resolvedInputPath = storage.resolveStorageKey(inputPath);

    try {
        const upstreamResult = await upstream.enqueueJob({
            id: job.id,
            tenantId: job.tenant_id,
            type: job.type,
            policy: job.policy,
            inputPath: resolvedInputPath,
            metadata: job.metadata_json
        }, authHeader);

        await persistence.updateJob(jobId, {
            upstreamJobId: upstreamResult.jobId || upstreamResult.id
        });

        const auditLogger = require('./auditLoggerService');
        await auditLogger.log({
            type: 'JOB_RETRY',
            tenantId: job.tenant_id,
            userId: 'SYSTEM',
            status: 'SUCCESS',
            metadata: { jobId, attempt: job.retry_count + 1 }
        });

        return await persistence.getJob(jobId);
    } catch (err) {
        await persistence.updateJob(jobId, { status: 'FAILED', error: { code: 'RETRY_TRIGGER_FAILED', message: err.message } });
        throw err;
    }
  }

  /**
   * Cancel an active job
   */
  async cancelJob(jobId, authHeader = null) {
    const job = await persistence.getJob(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');

    const cancellable = ['CREATED', 'QUEUED', 'PROCESSING'];
    if (!cancellable.includes(job.status)) {
        throw new Error(`CANNOT_CANCEL: Job is in ${job.status} state`);
    }

    try {
        // 1. Attempt upstream cancellation if possible
        const upstreamJobId = job.metadata_json?.upstreamJobId || job.upstreamJobId;
        if (upstreamJobId) {
            console.log(`[PREFLIGHT-OPS] Attempting upstream cancellation for ${upstreamJobId}`);
            try {
                await upstream._request('DELETE', `/api/preflight/jobs/${upstreamJobId}`, null, {
                    'Authorization': authHeader
                });
            } catch (upErr) {
                console.warn(`[PREFLIGHT-OPS] Upstream cancel failed (might not be supported):`, upErr.message);
            }
        }

        // 2. Persist local cancellation
        await persistence.updateJob(jobId, { status: 'CANCELLED' });

        const auditLogger = require('./auditLoggerService');
        await auditLogger.log({
            type: 'JOB_CANCEL',
            tenantId: job.tenant_id,
            userId: 'SYSTEM',
            status: 'SUCCESS',
            metadata: { jobId }
        });

        return await persistence.getJob(jobId);
    } catch (err) {
        throw err;
    }
  }

  /**
   * Scan for PROCESSING jobs that haven't updated in PPOS_PREFLIGHT_STALLED_MINUTES
   */
  async recoverStalledJobs() {
    const thresholdMins = parseInt(process.env.PPOS_PREFLIGHT_STALLED_MINUTES || '30');
    const thresholdMs = thresholdMins * 60 * 1000;
    const now = new Date();

    // Fetch all PROCESSING jobs
    const jobs = await persistence.listJobs({ status: 'PROCESSING', limit: 1000 });
    let recoveredCount = 0;

    for (const job of jobs) {
        const lastActivity = job.last_heartbeat_at || job.updated_at || job.created_at;
        const diff = now - new Date(lastActivity);

        if (diff > thresholdMs) {
            console.log(`[PREFLIGHT-OPS] Detecting stalled job: ${job.id} (Last activity: ${lastActivity})`);
            
            await persistence.updateJob(job.id, { 
                status: 'STALLED',
                error: { code: 'JOB_STALLED', message: `No activity detected for >${thresholdMins} minutes` }
            });

            const auditLogger = require('./auditLoggerService');
            await auditLogger.log({
                type: 'JOB_STALLED_DETECTION',
                tenantId: job.tenant_id,
                userId: 'SYSTEM',
                status: 'WARNING',
                metadata: { jobId: job.id, lastActivity }
            });

            recoveredCount++;
            
            if (process.env.PPOS_PREFLIGHT_AUTO_RETRY === 'true' && job.retry_count < job.max_retries) {
                try {
                    await this.retryJob(job.id);
                } catch (retryErr) {
                    console.error(`[PREFLIGHT-OPS] Auto-retry failed for stalled job ${job.id}:`, retryErr.message);
                }
            }
        }
    }

    return { recoveredCount };
  }
}

module.exports = new PreflightOperationsService();
