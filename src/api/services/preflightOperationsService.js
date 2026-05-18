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
const {
  isTerminalDiagnosticStatus,
  mapPhase10Status,
  collectFindings,
  normalizeArtifacts
} = require('./preflightStatusHelpers');

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
      const simulationEnabled = process.env.PPOS_PREFLIGHT_ENABLE_SIMULATION === 'true';
      
      if (!simulationEnabled) {
        console.error(`[PREFLIGHT-OPS] Upstream trigger failed for ${job.id} (Simulation Disabled):`, err.message);
        const isAuth = err.status === 401 || err.status === 403;
        const sourceStat = isAuth ? 'UPSTREAM_AUTH_FAILED' : 'UPSTREAM_UNAVAILABLE';
        
        await persistence.updateJob(job.id, {
          status: 'FAILED',
          error: {
            code: sourceStat,
            message: err.message,
            details: err.details || {}
          }
        });
        
        job.status = 'FAILED';
        job.progress = 0;
        job.source_status = sourceStat;
        job.error_json = { code: sourceStat, message: err.message };
        return job;
      }

      console.warn(`[PREFLIGHT-OPS] Upstream trigger unavailable for ${job.id}. Gated Dev simulation enabled: persisting virtual dev-only lifecycle.`);
      
      const simUpstreamJobId = `sim-upstream-${job.id}`;
      const simMeta = {
          ...job.metadata_json,
          upstreamJobId: simUpstreamJobId,
          originalFilename: filename,
          strategy: type,
          policy,
          simulation: true,
          source_status: 'SIMULATED_DEV_ONLY',
          issueCount: type === 'CERTIFY' ? 0 : 2,
          fixCount: type === 'ANALYZE' ? 0 : 1,
          destructiveFixRisk: type === 'AUTOFIX' ? 'LOW' : null,
          file: {
              name: filename,
              sizeBytes: stats.size,
              mime: 'application/pdf'
          }
      };

      const db = require('./mysqlClient');
      await db.query('UPDATE preflight_jobs SET status = ?, progress = 100, completed_at = NOW(), metadata_json = ? WHERE id = ?', [
          'COMPLETED',
          JSON.stringify(simMeta),
          job.id
      ]);

      // Automatically register simulated output artifact evidence for visual dev demonstration
      try {
          const { v4: uuidv4 } = require('uuid');
          await db.query(`
            INSERT INTO preflight_artifacts
            (id, tenant_id, job_id, upload_id, type, filename, storage_key, size_bytes, mime_type, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
              uuidv4(),
              tenantId,
              job.id,
              uploadId,
              'REPORT',
              'preflight_report.json',
              `simulated/${job.id}/report.json`,
              1250,
              'application/json',
              JSON.stringify({ simulated: true, source_status: 'SIMULATED_DEV_ONLY' })
          ]);
      } catch (artErr) {
          console.warn('[PREFLIGHT-OPS] Optional simulated artifact registration skipped:', artErr.message);
      }

      job.status = 'COMPLETED';
      job.progress = 100;
      job.upstreamJobId = simUpstreamJobId;
      job.source_status = 'SIMULATED_DEV_ONLY';
      job.metadata_json = simMeta;
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
      const progressVal = isTerminalDiagnosticStatus(localStatus) ? 100 : (upstreamStatus.progress || 0);
      const updates = {
        status: localStatus,
        progress: progressVal,
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
        // If it's successful, processing, or terminal diagnostic status, ensure no stale error is shown
        if (['COMPLETED', 'PROCESSING', 'QUEUED'].includes(localStatus) || isTerminalDiagnosticStatus(localStatus)) {
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
      }

      // If job reached terminal diagnostic state, register artifacts if provided by upstream
      const artifactsRaw = upstreamStatus.artifacts || upstreamStatus.artifact_list || upstreamStatus.availableArtifacts || upstreamStatus.available_artifacts;
      if (isTerminalDiagnosticStatus(localStatus) && artifactsRaw) {
        const normalized = normalizeArtifacts(artifactsRaw);
        const existing = await persistence.listArtifacts({ jobId });
        const existingKeys = new Set(existing.map(a => a.storage_key || a.storageKey));

        for (const art of normalized) {
          const key = art.storageKey || art.path || '';
          if (key && existingKeys.has(key)) {
            continue;
          }
          await persistence.createArtifact({
            tenantId: job.tenant_id,
            jobId,
            type: art.type || 'OUTPUT',
            filename: art.filename || 'artifact.pdf',
            storageKey: key,
            sizeBytes: art.sizeBytes || 0,
            mimeType: art.mimeType || 'application/pdf',
            metadata: art.metadata || {}
          });
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

  _mapUpstreamStatus(upstreamStatus) {
    return mapPhase10Status(upstreamStatus);
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
        fallbackMode: true,
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
      source_status: 'LOCAL_FALLBACK',
      fallbackMode: true
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
      findings: [],
      source_status: 'LOCAL_FALLBACK',
      fallbackMode: true,
      reason: 'Upstream findings unavailable. No diagnostic findings fabricated.'
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
        repaired: false,
        fixCount: 0,
        appliedRules: [],
        summary: ''
      },
      artifacts: [],
      source_status: 'LOCAL_FALLBACK',
      fallbackMode: true,
      reason: 'Upstream evidence unavailable. Local operational summary only.'
    };
  }

  /**
   * Trigger a native autofix operation for a job
   */
  async triggerJobFix(jobId, authHeader = null, optionsOrPolicy = null) {
    const job = await persistence.getJob(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');

    const upstreamJobId = job.metadata_json?.upstreamJobId || job.upstreamJobId;
    if (!upstreamJobId) {
      throw new Error('UPSTREAM_JOB_NOT_FOUND: Cannot trigger fix on a job without upstream context');
    }

    const options = typeof optionsOrPolicy === 'string' ? { policy: optionsOrPolicy } : { ...(optionsOrPolicy || {}) };
    const policy = options.policy || job.policy;

    // Fetch upstream job status to evaluate findings if explicit requested_fixes are absent
    let upstreamData = null;
    try {
      upstreamData = await upstream.getJobStatus(upstreamJobId, authHeader, job.tenant_id);
    } catch (e) {
      console.warn(`[PREFLIGHT-OPS] Pre-fetch of upstream job status failed for deriving autofix intent: ${e.message}`);
    }

    let explicitFixes = [];
    if (Array.isArray(options.fixes)) explicitFixes.push(...options.fixes);
    if (Array.isArray(options.requested_fixes)) explicitFixes.push(...options.requested_fixes);
    if (Array.isArray(options.requestedFixes)) explicitFixes.push(...options.requestedFixes);
    if (typeof options.fixes === 'string') {
      try { explicitFixes.push(...JSON.parse(options.fixes)); } catch(e) { explicitFixes.push(options.fixes); }
    }
    if (typeof options.requested_fixes === 'string') {
      try { explicitFixes.push(...JSON.parse(options.requested_fixes)); } catch(e) { explicitFixes.push(options.requested_fixes); }
    }

    const derivedSet = new Set(explicitFixes);

    if (options.forceBleed || options.force_bleed) derivedSet.add('APPLY_BLEED');
    if (options.convertCmyk || options.convert_cmyk) derivedSet.add('CONVERT_CMYK');
    if (options.rebuildTrimbox || options.rebuild_trimbox) derivedSet.add('REBUILD_TRIMBOX');
    if (options.injectOutputIntent || options.inject_output_intent) derivedSet.add('INJECT_OUTPUT_INTENT');

    if (options.forceBleed !== undefined) options.force_bleed = options.forceBleed;
    if (options.force_bleed !== undefined) options.forceBleed = options.force_bleed;

    if (derivedSet.size === 0) {
      let findings = Array.isArray(upstreamData?.findings) ? upstreamData.findings :
                       Array.isArray(upstreamData?.issues) ? upstreamData.issues : [];
      if (findings.length === 0) {
        try {
          const m = typeof job.metadata_json === 'string' ? JSON.parse(job.metadata_json) : (job.metadata_json || {});
          findings = m.findings || m.issues || [];
        } catch(e) {}
      }
      
      findings.forEach(f => {
        if (!f) return;
        const fStr = typeof f === 'string' ? f.toUpperCase() : JSON.stringify(f).toUpperCase();
        if (fStr.includes('TRIMBOX') || fStr.includes('TRIM_BOX')) derivedSet.add('REBUILD_TRIMBOX');
        if (fStr.includes('BLEED') || fStr.includes('BLEEDBOX')) derivedSet.add('APPLY_BLEED');
        if (fStr.includes('RGB') || fStr.includes('CMYK') || fStr.includes('COLOR') || fStr.includes('ICC')) derivedSet.add('CONVERT_CMYK');
        if (fStr.includes('INTENT') || fStr.includes('OUTPUT_INTENT')) derivedSet.add('INJECT_OUTPUT_INTENT');
      });

      if (derivedSet.size === 0) {
        ['REBUILD_TRIMBOX', 'APPLY_BLEED', 'CONVERT_CMYK', 'INJECT_OUTPUT_INTENT'].forEach(x => derivedSet.add(x));
      }
    }

    const CANONICAL_ORDER = ['REBUILD_TRIMBOX', 'APPLY_BLEED', 'CONVERT_CMYK', 'INJECT_OUTPUT_INTENT'];
    const finalFixes = CANONICAL_ORDER.filter(fix => derivedSet.has(fix));
    derivedSet.forEach(fix => {
      if (!CANONICAL_ORDER.includes(fix)) finalFixes.push(fix);
    });

    options.fixes = finalFixes;
    options.requested_fixes = finalFixes;
    options.requestedFixes = finalFixes;
    options.policy = policy;

    console.log(`[CONTROL][PREFLIGHT][AUTOFIX-INTENT] Dispatching fix intent contract: ${JSON.stringify({
      jobId,
      upstreamJobId,
      fixes: options.fixes,
      requested_fixes: options.requested_fixes,
      policy: options.policy
    })}`);

    try {
      const res = await upstream.triggerJobFix(upstreamJobId, authHeader, job.tenant_id, options);
      
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
        metadata: { jobId, upstreamJobId, policy: options.policy, requested_fixes: options.requested_fixes }
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
    let sourceStatus = 'LIVE_UPSTREAM';
    let initialStatus = 'QUEUED';
    let progressVal = 0;
    const simulationEnabled = process.env.PPOS_PREFLIGHT_ENABLE_SIMULATION === 'true';

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
      if (!simulationEnabled) {
        console.warn('[PREFLIGHT-OPS] Upstream createJob unavailable, persisting honest failure state (Simulation Disabled):', err.message);
        const isAuth = err.status === 401 || err.status === 403;
        sourceStatus = isAuth ? 'UPSTREAM_AUTH_FAILED' : 'UPSTREAM_UNAVAILABLE';
        initialStatus = 'FAILED';
        progressVal = 0;
      } else {
        console.warn('[PREFLIGHT-OPS] Upstream createJob unavailable, triggering gated dev-only simulated fallback state:', err.message);
        sourceStatus = 'SIMULATED_DEV_ONLY';
        initialStatus = 'COMPLETED';
        progressVal = 100;
      }
    }

    const upstreamJobId = upstreamRes?.jobId || upstreamRes?.id || upstreamRes?.upstreamJobId || (sourceStatus === 'SIMULATED_DEV_ONLY' ? `sim-upstream-${localJobId}` : null);

    if (upstreamRes && upstreamRes.status) {
      initialStatus = mapPhase10Status(upstreamRes.status);
      progressVal = isTerminalDiagnosticStatus(initialStatus) ? 100 : (upstreamRes.progress || 0);
    }

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

    if (sourceStatus === 'SIMULATED_DEV_ONLY') {
      metadataJson.simulation = true;
      metadataJson.source_status = 'SIMULATED_DEV_ONLY';
    } else {
      metadataJson.source_status = sourceStatus;
    }

    const db = require('./mysqlClient');
    await db.query(`
      INSERT INTO preflight_jobs 
      (id, tenant_id, user_id, submitted_by_role, visibility_scope, upload_id, type, status, progress, policy, original_name, metadata_json)
      VALUES (?, ?, ?, ?, 'PRIVATE', ?, ?, ?, ?, ?, ?, ?)
    `, [
      localJobId,
      tenantId,
      reqContext?.userId || null,
      reqContext?.role || 'ADMIN',
      uploadId,
      dbType,
      initialStatus,
      progressVal,
      policy,
      originalName,
      JSON.stringify(metadataJson)
    ]);

    if (initialStatus === 'COMPLETED') {
      await db.query('UPDATE preflight_jobs SET completed_at = NOW() WHERE id = ?', [localJobId]);
    }

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

      if (sourceStatus === 'SIMULATED_DEV_ONLY') {
        await db.query(`
          INSERT INTO preflight_artifacts
          (id, tenant_id, job_id, upload_id, type, filename, storage_key, size_bytes, mime_type, metadata_json)
          VALUES (?, ?, ?, ?, 'REPORT', ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          tenantId,
          localJobId,
          uploadId,
          'preflight_report.json',
          `simulated/${localJobId}/report.json`,
          1250,
          'application/json',
          JSON.stringify({ simulated: true, source_status: 'SIMULATED_DEV_ONLY' })
        ]);
      }
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
        status: savedJob.status || initialStatus,
        strategy,
        policy,
        originalName,
        sizeBytes,
        createdAt: savedJob.created_at || new Date().toISOString()
      },
      source_status: sourceStatus
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
            const mappedStatus = mapPhase10Status(statusRes.status);
            if (mappedStatus !== row.status) {
              await db.query('UPDATE preflight_jobs SET status = ? WHERE id = ?', [mappedStatus, row.id]);
              row.status = mappedStatus;
            }
          }
        }
      } catch (e) {}

      const simulationEnabled = process.env.PPOS_PREFLIGHT_ENABLE_SIMULATION === 'true';
      const fileSz = metaObj?.file?.sizeBytes || row.size_bytes || 0;
      const fName = row.original_name || metaObj?.file?.name || metaObj?.originalFilename || 'document.pdf';
      const isSimulatedDev = simulationEnabled && (metaObj?.source_status === 'SIMULATED_DEV_ONLY' || metaObj?.simulation);
      const resolvedStatus = isSimulatedDev ? 'COMPLETED' : row.status;
      
      const findings = collectFindings(upstreamMeta || row.metadata_json || metaObj);
      const progressVal = isTerminalDiagnosticStatus(resolvedStatus) ? 100 : (row.progress || 0);

      return {
        id: row.id,
        jobId: row.id,
        upstreamJobId: metaObj?.upstreamJobId || null,
        tenantId: row.tenant_id,
        status: resolvedStatus,
        type: row.type || metaObj?.strategy || 'ANALYZE',
        strategy: metaObj?.strategy || row.type,
        policy: row.policy || metaObj?.policy,
        filename: fName,
        originalName: fName,
        fileSize: fileSz,
        sizeBytes: fileSz,
        createdAt: row.created_at,
        sourceStatus: metaObj?.source_status || (resolvedStatus === 'FAILED' ? 'UPSTREAM_UNAVAILABLE' : 'LIVE_UPSTREAM'),
        source_status: metaObj?.source_status || (resolvedStatus === 'FAILED' ? 'UPSTREAM_UNAVAILABLE' : 'LIVE_UPSTREAM'),
        progress: progressVal,
        issueCount: findings.length,
        fixCount: upstreamMeta?.evidence?.length ?? metaObj?.fixCount ?? (isSimulatedDev ? 1 : 0),
        destructiveFixRisk: upstreamMeta?.destructiveFixRisk || metaObj?.destructiveFixRisk || (isSimulatedDev ? 'LOW' : null),
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
          const mappedStatus = mapPhase10Status(upstreamData.status);
          await db.query('UPDATE preflight_jobs SET status = ? WHERE id = ?', [mappedStatus, jobId]);
          jobRow.status = mappedStatus;
        }
      } catch (e) {
        console.warn(`[PREFLIGHT-OPS] Upstream job resolution failed for ${upstreamJobId}, using local mapping:`, e.message);
        source_status = e.status ? 'UPSTREAM_UNAVAILABLE' : 'LOCAL_FALLBACK';
      }
    }

    const simulationEnabled = process.env.PPOS_PREFLIGHT_ENABLE_SIMULATION === 'true';
    const isSimulatedDev = simulationEnabled && (metaObj?.source_status === 'SIMULATED_DEV_ONLY' || metaObj?.simulation);
    const resolvedStatus = isSimulatedDev ? 'COMPLETED' : jobRow.status;
    const fName = jobRow.original_name || metaObj?.file?.name || metaObj?.originalFilename || 'document.pdf';
    const fileSz = metaObj?.file?.sizeBytes || jobRow.size_bytes || 0;
    const strat = metaObj?.strategy || jobRow.type || 'ANALYZE';
    const pol = jobRow.policy || metaObj?.policy || 'OFFSET_MODERN_COATED';

    // Build rich simulated/hydrated upstream object if missing and simulation is enabled
    const hydratedUpstreamData = upstreamData || (isSimulatedDev ? {
        status: resolvedStatus,
        findings: [],
        evidence: [],
        destructiveFixRisk: null,
        simulationMode: true,
        reason: 'Simulation mode active. No diagnostic findings fabricated by design.'
    } : null);

    const finalSourceStatus = metaObj?.source_status || (resolvedStatus === 'FAILED' ? 'UPSTREAM_UNAVAILABLE' : source_status);
    const findings = collectFindings(hydratedUpstreamData || jobRow.metadata_json || metaObj);
    const progressVal = isTerminalDiagnosticStatus(resolvedStatus) ? 100 : (jobRow.progress ?? 0);

    return {
      ok: true,
      job: {
        // camelCase schema
        id: jobRow.id,
        jobId: jobRow.id,
        upstreamJobId,
        tenantId: jobRow.tenant_id,
        status: resolvedStatus,
        type: strat,
        strategy: strat,
        policy: pol,
        filename: fName,
        originalName: fName,
        fileSize: fileSz,
        sizeBytes: fileSz,
        createdAt: jobRow.created_at,
        updatedAt: jobRow.updated_at,
        completedAt: jobRow.completed_at || jobRow.created_at,
        progress: progressVal,
        issueCount: findings.length,
        fixCount: hydratedUpstreamData?.evidence?.length || hydratedUpstreamData?.fixes?.length || hydratedUpstreamData?.repairs?.length || 0,
        destructiveFixRisk: hydratedUpstreamData?.destructiveFixRisk || null,
        metadata: metaObj,
        upstreamData: hydratedUpstreamData,
        sourceStatus: finalSourceStatus,
        source_status: finalSourceStatus,

        // snake_case schema support for raw DB accessor components
        tenant_id: jobRow.tenant_id,
        created_at: jobRow.created_at,
        updated_at: jobRow.updated_at,
        completed_at: jobRow.completed_at || jobRow.created_at,
        upstream_job_id: upstreamJobId,
        metadata_json: {
            ...metaObj,
            originalFilename: fName,
            upstreamJobId
        }
      },
      source_status: finalSourceStatus
    };
  }
}

module.exports = new PreflightOperationsService();
