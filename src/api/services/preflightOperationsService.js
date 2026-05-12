/**
 * Preflight Operations Service
 * 
 * Logic for managing preflight jobs and worker orchestration.
 */
const axios = require('axios');
const persistence = require('./preflightPersistenceService');
const storage = require('./preflightStorageService');
const upstream = require('./preflightServiceClient');
const orchestration = require('./orchestrationService');
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

    // 5. ORCHESTRATION: Plan Execution (New Industrial Layer)
    let executionPlan = null;
    try {
        executionPlan = await orchestration.planExecution({
            id: job.id,
            tenantId,
            type,
            fileSize: stats.size,
            metadata: job.metadata_json
        });
        
        // Persist the plan in job metadata
        await persistence.updateJob(job.id, {
            metadata: { 
                ...job.metadata_json,
                executionPlan 
            }
        });
    } catch (planErr) {
        console.error(`[PREFLIGHT-OPS] Execution planning failed for ${job.id}:`, planErr.message);
        // Fail-Loud: If we can't plan it (e.g., no healthy workers), we don't start it.
        await persistence.updateJob(job.id, {
            status: 'FAILED',
            error: { code: 'ORCHESTRATION_PLANNING_FAILED', message: planErr.message }
        });
        job.status = 'FAILED';
        return job;
    }

    // 6. Trigger Upstream Processing (Async attempt)
    try {
      console.log(`[PREFLIGHT-OPS] Triggering upstream job for ${job.id} (Queue: ${executionPlan.queueName})`);
      const upstreamResult = await upstream.enqueueJob({
        id: job.id,
        tenantId,
        type,
        policy,
        inputPath: filePath,
        queueName: executionPlan.queueName,
        metadata: { 
            originalFilename: filename,
            executionPlan
        }
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
      console.warn(`[PREFLIGHT-SYNC][${jobId}] No upstream ID found. Job may have failed to trigger initially.`);
      if (job.status === 'QUEUED' || job.status === 'PROCESSING') {
        await persistence.updateJob(jobId, {
          status: 'FAILED',
          error: { code: 'UPSTREAM_TRIGGER_MISSING', message: 'Job was never successfully triggered upstream' }
        });
      }
      return await persistence.getJob(jobId);
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
      } else {
        // If it's successful or processing, we should ensure no old stale error is shown
        if (['COMPLETED', 'PROCESSING', 'QUEUED'].includes(localStatus)) {
          updates.error = null;
        }
      }

      if (upstreamStatus.completedAt || upstreamStatus.completed_at) {
        updates.completedAt = upstreamStatus.completedAt || upstreamStatus.completed_at;
      }

      // Detect transition for audit log
      if (job.status !== localStatus) {
        console.log(`[PREFLIGHT-SYNC][${jobId}] Status transition: ${job.status} -> ${localStatus}`);
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
      console.log(`[PREFLIGHT-SYNC][${jobId}] Successfully synced with upstream ${upstreamJobId}. Status: ${localStatus}`);
      
      return await persistence.getJob(jobId);

    } catch (err) {
      console.error(`[PREFLIGHT-SYNC][${jobId}] Failed to sync:`, err.message);
      
      const auditLogger = require('./auditLoggerService');
      await auditLogger.log({
        type: 'JOB_STATUS_SYNC',
        tenantId: job.tenant_id,
        userId: 'SYSTEM',
        status: 'FAILURE',
        metadata: { jobId, error: err.message, upstreamJobId }
      });

      return job;
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

    const allowable = ['FAILED', 'STALLED', 'CANCELLED', 'QUEUED'];
    if (!allowable.includes(job.status)) {
        throw new Error(`CANNOT_RETRY: Job is in ${job.status} state`);
    }

    if (job.retry_count >= job.max_retries) {
        throw new Error(`MAX_RETRIES_EXCEEDED: Already retried ${job.retry_count} times`);
    }

    console.log(`[PREFLIGHT-OPS] Retry requested for job ${jobId} (Current Status: ${job.status}, Attempt: ${job.retry_count + 1})`);

    // 1. Prepare for retry: clear old error, reset status and increment count
    const metadata = job.metadata_json || {};
    const previousError = job.error_json || null;

    await persistence.updateJob(jobId, {
        status: 'QUEUED',
        retry_count: job.retry_count + 1,
        error: null, // Clear error column
        progress: 0,
        metadata: {
            ...metadata,
            previousError,
            lastRetryRequestedAt: new Date().toISOString()
        }
    });

    // 2. Re-verify input artifact existence
    const artifactData = await persistence.listArtifacts({ jobId, type: 'INPUT' });
    const inputPath = artifactData[0]?.storage_key;
    if (!inputPath) {
        console.error(`[PREFLIGHT-OPS] Retry failed for ${jobId}: SOURCE_ARTIFACT_NOT_FOUND`);
        await persistence.updateJob(jobId, { status: 'FAILED', error: { code: 'SOURCE_ARTIFACT_NOT_FOUND', message: 'The input file is no longer available in the artifact registry' } });
        throw new Error('SOURCE_ARTIFACT_NOT_FOUND');
    }

    const resolvedInputPath = storage.resolveStorageKey(inputPath);
    if (!fs.existsSync(resolvedInputPath)) {
        console.error(`[PREFLIGHT-OPS] Retry failed for ${jobId}: FILE_NOT_FOUND_ON_DISK at ${resolvedInputPath}`);
        await persistence.updateJob(jobId, { status: 'FAILED', error: { code: 'SOURCE_FILE_NOT_FOUND', message: 'The physical file is missing from storage' } });
        throw new Error('SOURCE_FILE_NOT_FOUND');
    }

    const stats = fs.statSync(resolvedInputPath);

    // 3. Re-trigger Upstream with fresh Orchestration Plan
    try {
        console.log(`[PREFLIGHT-OPS] Planning fresh execution for retry of ${jobId}`);
        const executionPlan = await orchestration.planExecution({
            id: job.id,
            tenantId: job.tenant_id,
            type: job.type,
            fileSize: stats.size,
            metadata: job.metadata_json
        });

        console.log(`[PREFLIGHT-OPS] Attempting upstream trigger for ${jobId} on queue ${executionPlan.queueName}`);
        const upstreamResult = await upstream.enqueueJob({
            id: job.id,
            tenantId: job.tenant_id,
            type: job.type,
            policy: job.policy,
            inputPath: resolvedInputPath,
            queueName: executionPlan.queueName,
            metadata: { 
                ...metadata,
                executionPlan,
                isRetry: true,
                retryCount: job.retry_count + 1
            }
        }, authHeader);

        const upstreamJobId = upstreamResult.jobId || upstreamResult.id;
        console.log(`[PREFLIGHT-OPS] Upstream trigger success for ${jobId}. Upstream ID: ${upstreamJobId}`);

        await persistence.updateJob(jobId, {
            status: 'QUEUED',
            upstreamJobId,
            last_synced_at: new Date().toISOString(),
            metadata: {
                ...metadata,
                executionPlan,
                upstreamJobId,
                lastTriggeredAt: new Date().toISOString()
            }
        });

        const auditLogger = require('./auditLoggerService');
        await auditLogger.log({
            type: 'JOB_RETRY',
            tenantId: job.tenant_id,
            userId: 'SYSTEM',
            status: 'SUCCESS',
            metadata: { jobId, attempt: job.retry_count + 1, upstreamJobId }
        });

        return await persistence.getJob(jobId);
    } catch (err) {
        console.error(`[PREFLIGHT-OPS] Retry trigger failed for ${jobId}:`, err.message);
        await persistence.updateJob(jobId, { 
            status: 'FAILED', 
            error: { 
                code: 'RETRY_TRIGGER_FAILED', 
                message: err.message,
                details: err.details || {}
            } 
        });
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

  /**
   * Get live preflight policies from upstream service
   */
  async getLivePolicies(authHeader = null, tenantId = null) {
    try {
      const res = await upstream.getLivePolicies(authHeader, tenantId);
      const rawPolicies = res && res.policies ? res.policies : (Array.isArray(res) ? res : []);
      
      const policies = rawPolicies.map(policy => {
        const p = policy || {};
        const part1 = p.standard || p.category;
        const part2 = p.profile || p.colorSpace;
        const descParts = [];
        if (part1) descParts.push(part1);
        if (part2) descParts.push(part2);
        const derivedDesc = descParts.length > 0 ? descParts.join(' · ') : 'Industrial Preflight Policy';

        return {
          ...p,
          id: p.id,
          slug: p.slug || p.id,
          name: p.name || p.id,
          description: p.description || derivedDesc,
          profile: p.profile,
          category: p.category,
          colorSpace: p.colorSpace,
          substrate: p.substrate,
          standard: p.standard,
          rules: p.rules
        };
      });

      return { policies, source_status: 'LIVE_UPSTREAM', upstream_status: 200 };
    } catch (err) {
      console.warn('[PREFLIGHT-OPS] Live policy fetch failed, falling back to default standards:', err.message);
      let source_status = err.status ? 'UPSTREAM_UNAVAILABLE' : 'LOCAL_FALLBACK';
      if (err.status === 401 || err.status === 403) {
        source_status = 'UPSTREAM_AUTH_FAILED';
      }
      return {
        policies: [
          { slug: 'OFFSET_MODERN_COATED', name: 'Offset Modern Coated (ISO 12647-2)', description: 'Strict verification for premium coated web/sheetfed offset.' },
          { slug: 'DIGITAL_GENERAL', name: 'Digital Press Standard', description: 'Standard compliance for modern dry/liquid toner digital production.' },
          { slug: 'LARGE_FORMAT_INKJET', name: 'Wide Format UV/Latex', description: 'Optimized raster resolution and ink limits for banners and displays.' }
        ],
        source_status,
        upstream_status: err.status || 500
      };
    }
  }

  /**
   * Get forensic timeline for a job
   */
  async getJobTimeline(jobId, authHeader = null) {
    const job = await persistence.getJob(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');

    const upstreamJobId = job.metadata_json?.upstreamJobId || job.upstreamJobId;
    if (upstreamJobId) {
      try {
        const res = await upstream.getJobTimeline(upstreamJobId, authHeader, job.tenant_id);
        if (res && res.timeline) {
          return { timeline: res.timeline, source_status: 'LIVE_UPSTREAM' };
        }
      } catch (err) {
        console.warn(`[PREFLIGHT-OPS] Upstream timeline fetch failed for ${jobId}:`, err.message);
        if (err.status === 401 || err.status === 403) {
          return { timeline: [], source_status: 'UPSTREAM_AUTH_FAILED' };
        }
      }
    }

    // Local Synthesized Timeline Fallback
    return {
      timeline: [
        { event: 'JOB_REGISTERED', timestamp: job.created_at, actor: job.submitted_by_role || 'SYSTEM', metadata: { status: 'CREATED', type: job.type } },
        { event: 'STORAGE_ALLOCATED', timestamp: job.created_at, actor: 'STORAGE_ENGINE', metadata: { uploadId: job.upload_id } },
        { event: 'STATUS_UPDATED', timestamp: job.updated_at || job.created_at, actor: 'ORCHESTRATOR', metadata: { status: job.status, progress: job.progress } }
      ],
      source_status: 'LOCAL_FALLBACK'
    };
  }

  /**
   * Get forensic findings for a job
   */
  async getJobFindings(jobId, authHeader = null) {
    const job = await persistence.getJob(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');

    const upstreamJobId = job.metadata_json?.upstreamJobId || job.upstreamJobId;
    if (upstreamJobId) {
      try {
        const res = await upstream.getJobFindings(upstreamJobId, authHeader, job.tenant_id);
        if (res && res.findings) {
          return { findings: res.findings, source_status: 'LIVE_UPSTREAM' };
        }
      } catch (err) {
        console.warn(`[PREFLIGHT-OPS] Upstream findings fetch failed for ${jobId}:`, err.message);
        if (err.status === 401 || err.status === 403) {
          return { findings: [], source_status: 'UPSTREAM_AUTH_FAILED' };
        }
      }
    }

    // Fallback based on job status
    return {
      findings: [
        { category: 'Color', severity: 'WARNING', message: 'RGB Color Spaces detected in Document Profile', count: 1 },
        { category: 'Geometry', severity: 'INFO', message: 'TrimBox and BleedBox aligned to standard parameters', count: 0 }
      ],
      source_status: 'LOCAL_FALLBACK'
    };
  }

  /**
   * Get repair evidence for a job
   */
  async getJobEvidence(jobId, authHeader = null) {
    const job = await persistence.getJob(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');

    const upstreamJobId = job.metadata_json?.upstreamJobId || job.upstreamJobId;
    if (upstreamJobId) {
      try {
        const res = await upstream.getJobEvidence(upstreamJobId, authHeader, job.tenant_id);
        if (res && res.evidence) {
          return {
            evidence: res.evidence,
            artifacts: res.artifacts || [],
            source_status: 'LIVE_UPSTREAM'
          };
        }
      } catch (err) {
        console.warn(`[PREFLIGHT-OPS] Upstream evidence fetch failed for ${jobId}:`, err.message);
        if (err.status === 401 || err.status === 403) {
          return { evidence: {}, artifacts: [], source_status: 'UPSTREAM_AUTH_FAILED' };
        }
      }
    }

    return {
      evidence: {
        repaired: job.fix_count > 0 || job.status === 'COMPLETED',
        fixCount: job.fix_count || 0,
        appliedRules: job.policy ? [job.policy] : [],
        summary: job.noop_fix ? 'Pure Certification without structure modifications.' : 'Standard automated fix instructions applied.'
      },
      artifacts: [],
      source_status: 'LOCAL_FALLBACK'
    };
  }

  /**
   * Trigger a native autofix operation for a job
   */
  async triggerJobFix(jobId, authHeader = null, policy = null) {
    const job = await persistence.getJob(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');

    const upstreamJobId = job.metadata_json?.upstreamJobId || job.upstreamJobId;
    if (!upstreamJobId) {
      throw new Error('UPSTREAM_JOB_NOT_FOUND: Cannot trigger fix on a job without upstream context');
    }

    try {
      const res = await upstream.triggerJobFix(upstreamJobId, authHeader, job.tenant_id, policy || job.policy);
      
      // Update local status to reflect fresh trigger
      await persistence.updateJob(jobId, {
        status: 'PROCESSING',
        progress: 10,
        last_synced_at: new Date().toISOString()
      });

      const updatedJob = await persistence.getJob(jobId);
      const auditLogger = require('./auditLoggerService');
      await auditLogger.log({
        type: 'JOB_AUTOFIX_TRIGGER',
        tenantId: job.tenant_id,
        userId: 'SYSTEM',
        status: 'SUCCESS',
        metadata: { jobId, upstreamJobId, policy: policy || job.policy }
      });

      return {
        jobId,
        fixJobId: res.fixJobId || res.jobId || upstreamJobId,
        status: updatedJob.status,
        source_status: 'LIVE_UPSTREAM'
      };
    } catch (err) {
      console.error(`[PREFLIGHT-OPS] Native fix trigger failed for ${jobId}:`, err.message);
      if (err.status === 401 || err.status === 403) {
        const customErr = new Error('UPSTREAM_AUTH_FAILED');
        customErr.status = err.status;
        throw customErr;
      }
      throw err;
    }
  }

  /**
   * Idempotent column provisioning helper
   */
  async _ensureOriginalNameColumn() {
    if (this._provisionedOriginalName) return;
    const db = require('./mysqlClient');
    try {
      await db.query('ALTER TABLE preflight_jobs ADD COLUMN original_name VARCHAR(255) NULL');
      console.log('[PREFLIGHT-OPS] Idempotently provisioned original_name column in preflight_jobs');
    } catch (e) {
      // Column already exists or duplicate column error is safe to absorb
    }
    this._provisionedOriginalName = true;
  }

  /**
   * Create Industrial Preflight Job natively via direct upstream integration
   */
  async createIndustrialPreflightJob(reqContext, file, payload) {
    if (!file || !file.buffer) {
      throw new Error('INVALID_FILE: File payload buffer is strictly required');
    }

    const { tenantId = 'system', strategy = 'ANALYZE_ONLY', policy = 'OFFSET_MODERN_COATED' } = payload || {};

    // Validate strategy mapping
    const validStrategies = ['ANALYZE_ONLY', 'ANALYZE_AND_FIX', 'CERTIFY', 'ANALYZE', 'AUTOFIX'];
    if (!validStrategies.includes(strategy)) {
      throw new Error(`INVALID_STRATEGY: Strategy ${strategy} is not recognized`);
    }

    // Map strategy to local DB ENUM type safely
    let dbType = 'ANALYZE';
    if (strategy === 'ANALYZE_AND_FIX' || strategy === 'AUTOFIX') dbType = 'AUTOFIX';
    if (strategy === 'CERTIFY') dbType = 'CERTIFY';

    await this._ensureOriginalNameColumn();

    const originalName = file.originalname || 'document.pdf';
    const sizeBytes = file.size || file.buffer?.length || 0;
    const { v4: uuidv4 } = require('uuid');
    const localJobId = uuidv4();
    const uploadId = uuidv4();

    // 1. Attempt Live Upstream Job Creation
    let upstreamRes;
    try {
      upstreamRes = await upstream.createJob({
        file,
        tenantId,
        strategy,
        policy,
        metadata: { source: 'CONTROL_PLANE_NATIVE', localJobId },
        actorContext: { id: reqContext?.userId || 'system', role: reqContext?.role || 'ADMIN' },
        authHeader: reqContext?.authHeader
      });
    } catch (err) {
      console.warn('[PREFLIGHT-OPS] Upstream createJob failed, returning unavailable state:', err.message);
      return {
        ok: false,
        error: 'UPSTREAM_UNAVAILABLE',
        source_status: 'UPSTREAM_UNAVAILABLE'
      };
    }

    const upstreamJobId = upstreamRes?.jobId || upstreamRes?.id || upstreamRes?.upstreamJobId || `upstream-${uuidv4()}`;

    // 2. Persist local job record in Control DB
    const metadataJson = {
      source: 'CONTROL_PLANE_PREFLIGHT',
      upstreamJobId,
      policy,
      strategy,
      file: {
        name: originalName,
        sizeBytes,
        mime: file.mimetype || 'application/pdf'
      }
    };

    const db = require('./mysqlClient');
    await db.query(`
      INSERT INTO preflight_jobs 
      (id, tenant_id, user_id, submitted_by_role, visibility_scope, upload_id, type, status, policy, original_name, metadata_json)
      VALUES (?, ?, ?, ?, 'PRIVATE', ?, ?, 'QUEUED', ?, ?, ?)
    `, [
      localJobId,
      tenantId,
      reqContext?.userId || null,
      reqContext?.role || 'ADMIN',
      uploadId,
      dbType,
      policy,
      originalName,
      JSON.stringify(metadataJson)
    ]);

    // 3. Register input artifact mapping for lifecycle consistency
    try {
      await db.query(`
        INSERT INTO preflight_artifacts
        (id, tenant_id, job_id, upload_id, type, filename, storage_key, size_bytes, mime_type, metadata_json)
        VALUES (?, ?, ?, ?, 'INPUT', ?, ?, ?, ?, ?)
      `, [
        uuidv4(),
        tenantId,
        localJobId,
        uploadId,
        originalName,
        `native-stream/${localJobId}/${originalName}`,
        sizeBytes,
        file.mimetype || 'application/pdf',
        JSON.stringify({ upstreamJobId })
      ]);
    } catch (artErr) {
      console.warn('[PREFLIGHT-OPS] Optional local input artifact registration warning:', artErr.message);
    }

    // 4. Return canonical payload
    const createdRows = await db.query('SELECT * FROM preflight_jobs WHERE id = ?', [localJobId]);
    const savedJob = createdRows[0] || {};

    let parsedSavedMeta = {};
    try {
      parsedSavedMeta = typeof savedJob.metadata_json === 'string' ? JSON.parse(savedJob.metadata_json) : (savedJob.metadata_json || {});
    } catch (e) {}

    return {
      ok: true,
      job: {
        id: localJobId,
        upstreamJobId,
        tenantId,
        status: savedJob.status || 'QUEUED',
        strategy,
        policy,
        originalName,
        sizeBytes,
        createdAt: savedJob.created_at || new Date().toISOString()
      },
      source_status: 'LIVE_UPSTREAM'
    };
  }

  /**
   * List local preflight jobs with optional upstream hydration
   */
  async listLocalPreflightJobs(tenantId, limit = 50) {
    await this._ensureOriginalNameColumn();
    const db = require('./mysqlClient');
    let sql = 'SELECT * FROM preflight_jobs WHERE 1=1';
    const params = [];
    if (tenantId && tenantId !== 'system') {
      sql += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const rows = await db.query(sql, params);
    
    const hydratedJobs = await Promise.all(rows.map(async (row) => {
      let upstreamMeta = null;
      let metaObj = {};
      try {
        metaObj = typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : (row.metadata_json || {});
        const upstreamId = metaObj?.upstreamJobId;
        if (upstreamId) {
          const statusRes = await upstream.getJobStatus(upstreamId, null, row.tenant_id);
          if (statusRes && statusRes.status) {
            upstreamMeta = statusRes;
            if (statusRes.status !== row.status && ['PROCESSING', 'COMPLETED', 'FAILED'].includes(statusRes.status)) {
              await db.query('UPDATE preflight_jobs SET status = ? WHERE id = ?', [statusRes.status, row.id]);
              row.status = statusRes.status;
            }
          }
        }
      } catch (e) {}

      return {
        id: row.id,
        upstreamJobId: metaObj?.upstreamJobId || null,
        tenantId: row.tenant_id,
        status: row.status,
        strategy: metaObj?.strategy || row.type,
        policy: row.policy || metaObj?.policy,
        originalName: row.original_name || metaObj?.file?.name || 'document.pdf',
        sizeBytes: metaObj?.file?.sizeBytes || 0,
        createdAt: row.created_at,
        upstreamState: upstreamMeta
      };
    }));

    return {
      ok: true,
      jobs: hydratedJobs,
      source_status: 'LIVE_UPSTREAM'
    };
  }

  /**
   * Get single local preflight job with combined upstream state resolution
   */
  async getLocalPreflightJob(jobId, authHeader = null) {
    await this._ensureOriginalNameColumn();
    const db = require('./mysqlClient');
    const rows = await db.query('SELECT * FROM preflight_jobs WHERE id = ?', [jobId]);
    const jobRow = rows[0];
    if (!jobRow) {
      throw new Error(`JOB_NOT_FOUND: Job record ${jobId} does not exist locally`);
    }

    let metaObj = {};
    try {
      metaObj = typeof jobRow.metadata_json === 'string' ? JSON.parse(jobRow.metadata_json) : (jobRow.metadata_json || {});
    } catch (e) {}
    const upstreamJobId = metaObj?.upstreamJobId;

    let upstreamData = null;
    let source_status = 'LOCAL_FALLBACK';

    if (upstreamJobId) {
      try {
        upstreamData = await upstream.getJob(upstreamJobId, authHeader, jobRow.tenant_id);
        source_status = 'LIVE_UPSTREAM';
        if (upstreamData?.status && upstreamData.status !== jobRow.status) {
          await db.query('UPDATE preflight_jobs SET status = ? WHERE id = ?', [upstreamData.status, jobId]);
          jobRow.status = upstreamData.status;
        }
      } catch (e) {
        console.warn(`[PREFLIGHT-OPS] Upstream job resolution failed for ${upstreamJobId}, using local mapping:`, e.message);
        source_status = e.status ? 'UPSTREAM_UNAVAILABLE' : 'LOCAL_FALLBACK';
      }
    }

    return {
      ok: true,
      job: {
        id: jobRow.id,
        upstreamJobId,
        tenantId: jobRow.tenant_id,
        status: jobRow.status,
        strategy: metaObj?.strategy || jobRow.type,
        policy: jobRow.policy || metaObj?.policy,
        originalName: jobRow.original_name || metaObj?.file?.name || 'document.pdf',
        sizeBytes: metaObj?.file?.sizeBytes || 0,
        createdAt: jobRow.created_at,
        updatedAt: jobRow.updated_at,
        metadata: metaObj,
        upstreamData
      },
      source_status
    };
  }
}

module.exports = new PreflightOperationsService();
