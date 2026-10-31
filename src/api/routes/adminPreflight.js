/**
 * Admin Preflight Operations Routes
 * 
 * Secure backend API for control plane operators to manage preflight infrastructure.
 */
const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const requirePrinterLicense = require('../middleware/requirePrinterLicense');

// Services
const operations = require('../services/preflightOperationsService');
const storage = require('../services/preflightStorageService');
const artifact = require('../services/preflightArtifactService');
const quota = require('../services/preflightQuotaService');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const auditLogger = require('../services/auditLoggerService');

// Multer setup for temporary staging
const maxMb = parseInt(process.env.PPOS_PREFLIGHT_MAX_UPLOAD_MB || '2048');
const upload = multer({
  dest: path.join(process.env.PPOS_PREFLIGHT_STORAGE_ROOT || '/opt/printprice-os/storage/preflight', 'tmp'),
  limits: { fileSize: maxMb * 1024 * 1024 }
});

const { resolveActorContext, requireApprovedPrinthouse } = require('../middleware/auth');

// Apply admin protection to all routes
router.use(requireAdmin);

// Diagnostic: Log identity for preflight admin operations
router.use((req, res, next) => {
    const context = resolveActorContext(req);
    const traceId = req.headers['x-trace-id'] || `trace_${Date.now()}`;
    
    if (process.env.NODE_ENV !== 'production' || context.isSuperAdmin) {
        console.log(`[ADMIN-PREFLIGHT-AUTH] Trace: ${traceId} | User: ${context.userId} | Role: ${context.role} | SuperAdmin: ${context.context?.isSuperAdmin || context.isSuperAdmin}`);
    }
    next();
});

router.use(requirePrinterLicense);
router.use(requireApprovedPrinthouse);

/**
 * Helper: Resolve Tenant Identity from user context
 */
function resolveTargetTenantId(req) {
    const context = resolveActorContext(req);
    // If SUPER_ADMIN provides X-Tenant-Id, trust it.
    if (context.isSuperAdmin && req.headers['x-tenant-id']) {
        return req.headers['x-tenant-id'];
    }
    // Otherwise, use the user's own tenantId
    return context.tenantId || 'system';
}

/**
 * GET /api/admin/preflight/health
 * Infrastructure and worker status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await operations.getHealth();
    res.json({ ok: true, ...health });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'HEALTH_CHECK_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/preflight/jobs
 * List and filter jobs
 */
/**
 * GET /api/admin/preflight/jobs
 * List and filter jobs with upstream state hydration
 */
router.get('/jobs', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || `trace_${Date.now()}`;
  const logger = require('../services/logger').child('admin-preflight');
  try {
    const filters = { ...req.query };
    const context = resolveActorContext(req);
    
    const targetTenantId = context.isSuperAdmin ? (filters.tenantId || 'system') : context.tenantId;

    // Use native pipeline hydration helper directly to satisfy Phase 35 requirements
    const resData = await operations.listLocalPreflightJobs(targetTenantId, filters.limit || 50);
    return res.json(resData);
  } catch (error) {
    logger.error({
        event: 'JOB_LIST_FAILED',
        error: error.message,
        tenant: req.user?.tenantId || 'system',
        traceId
    });

    if (error.message.includes('UNAVAILABLE') || error.message.includes('ECONNREFUSED')) {
        return res.status(503).json({ 
            ok: false, 
            source_status: 'UPSTREAM_UNAVAILABLE',
            status: 'DEGRADED', 
            error: { code: 'OPERATIONS_SERVICE_UNAVAILABLE', message: 'Preflight operations service is unreachable' } 
        });
    }

    res.status(500).json({ ok: false, source_status: 'LOCAL_FALLBACK', error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * POST /api/admin/preflight/jobs
 * Create a new native preflight job supporting direct multipart PDF upload or legacy staged upload.
 */
router.post('/jobs', upload.single('pdf'), async (req, res) => {
  const tenantId = resolveTargetTenantId(req);
  const context = resolveActorContext(req);
  const quotaEnforcementService = require('../services/quotaEnforcementService');
  const usageMeteringService = require('../services/usageMeteringService');
  const billingEventService = require('../services/billingEventService');
  const commercialPlanService = require('../services/commercialPlanService');
  const db = require('../services/mysqlClient');

  try {
    // 1. Native Direct Pipeline check (file attached as 'pdf')
    if (req.file) {
      // Assert quota limits first
      await quotaEnforcementService.assertQuotaAllowed({
          tenantId,
          action: 'UPLOAD_FILE',
          bytes: req.file.size,
          actor: context
      });

      await quotaEnforcementService.assertQuotaAllowed({
          tenantId,
          action: 'CREATE_PREFLIGHT_JOB',
          actor: context
      });

      const fileBuffer = fs.readFileSync(req.file.path);
      const fileObj = {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: fileBuffer
      };

      const payload = {
        tenantId: req.body.tenantId || tenantId,
        strategy: req.body.strategy || req.body.type || 'ANALYZE_ONLY',
        policy: req.body.policy || 'OFFSET_MODERN_COATED'
      };

      const result = await operations.createIndustrialPreflightJob({
        userId: context.userId || req.user?.id,
        role: context.role || 'ADMIN',
        authHeader: req.headers.authorization
      }, fileObj, payload);

      // Clean up temp file safely
      try {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (e) {}

      // Log audit trace securely
      await auditLogger.log({
        type: 'JOB_CREATE_NATIVE',
        tenantId: payload.tenantId,
        userId: context.userId || req.user?.id || 'system',
        status: result.ok ? 'SUCCESS' : 'FAILURE',
        metadata: { strategy: payload.strategy, policy: payload.policy }
      });

      if (result.ok) {
          // Record usage events
          await usageMeteringService.recordUsageEvent({
              tenantId,
              eventType: 'FILE_UPLOADED',
              resourceId: req.file.filename || req.file.originalname,
              resourceType: 'PDF',
              bytes: req.file.size
          });

          await usageMeteringService.recordUsageEvent({
              tenantId,
              eventType: 'PREFLIGHT_JOB_CREATED',
              resourceId: result.job?.id,
              resourceType: 'JOB'
          });

          // Check if overage billing event is required
          const decision = await quotaEnforcementService.evaluateQuotaForAction({
              tenantId,
              action: 'CREATE_PREFLIGHT_JOB',
              actor: context
          });
          if (decision.billing_event_required) {
              const ent = await commercialPlanService.evaluateTenantEntitlement({ tenantId });
              let includedJobs = 0;
              try {
                  const planRows = await db.query('SELECT included_preflight_jobs_monthly FROM commercial_plans WHERE plan_code = ?', [ent.plan_code]);
                  includedJobs = Number(planRows[0]?.included_preflight_jobs_monthly || 0);
              } catch (e) {}

              await billingEventService.recordOverage({
                  tenantId,
                  metric: 'preflight_jobs_count',
                  quantity: decision.current_usage + 1,
                  includedQuantity: includedJobs,
                  unitPriceCents: 10,
                  periodKey: usageMeteringService.getCurrentPeriodKey()
              });
          }
      }

      const statusVal = result.ok ? 200 : 503;
      return res.status(statusVal).json(result);
    }

    // 2. Legacy fallback
    const { uploadId, type, policy } = req.body || {};

    if (!uploadId || !type) {
      return res.status(400).json({ 
        ok: false, 
        source_status: 'LOCAL_FALLBACK',
        error: { code: 'MISSING_PARAMS', message: 'uploadId and type are required for staged uploads' } 
      });
    }

    // Assert preflight job quota
    await quotaEnforcementService.assertQuotaAllowed({
        tenantId,
        action: 'CREATE_PREFLIGHT_JOB',
        actor: context
    });

    const job = await operations.createJob(tenantId, { 
      uploadId, 
      type, 
      policy,
      authHeader: req.headers.authorization,
      submittedByRole: 'PRINTER' 
    });
    
    await auditLogger.log({
        type: 'JOB_CREATE',
        tenantId,
        userId: req.user?.id || 'system',
        status: 'SUCCESS',
        metadata: { jobId: job.id, type, uploadId }
    });

    if (job) {
        await usageMeteringService.recordUsageEvent({
            tenantId,
            eventType: 'PREFLIGHT_JOB_CREATED',
            resourceId: job.id,
            resourceType: 'JOB'
        });

        // Check if overage billing event is required
        const decision = await quotaEnforcementService.evaluateQuotaForAction({
            tenantId,
            action: 'CREATE_PREFLIGHT_JOB',
            actor: context
        });
        if (decision.billing_event_required) {
            const ent = await commercialPlanService.evaluateTenantEntitlement({ tenantId });
            let includedJobs = 0;
            try {
                const planRows = await db.query('SELECT included_preflight_jobs_monthly FROM commercial_plans WHERE plan_code = ?', [ent.plan_code]);
                includedJobs = Number(planRows[0]?.included_preflight_jobs_monthly || 0);
            } catch (e) {}

            await billingEventService.recordOverage({
                tenantId,
                metric: 'preflight_jobs_count',
                quantity: decision.current_usage + 1,
                includedQuantity: includedJobs,
                unitPriceCents: 10,
                periodKey: usageMeteringService.getCurrentPeriodKey()
            });
        }
    }

    res.json({ ok: true, job, source_status: 'LIVE_UPSTREAM' });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    await auditLogger.log({
        type: 'JOB_CREATE',
        tenantId,
        userId: req.user?.id || 'system',
        status: 'FAILURE',
        metadata: { error: error.message }
    });

    if (error.code === 'QUOTA_EXCEEDED') {
        return res.status(403).json({
            ok: false,
            error: {
                code: 'QUOTA_EXCEEDED',
                message: error.message,
                decision: error.decision
            }
        });
    }

    const status = error.message.includes('NOT_FOUND') ? 404 : 500;
    res.status(status).json({ 
      ok: false, 
      source_status: 'UPSTREAM_UNAVAILABLE',
      error: { code: 'JOB_CREATION_FAILED', message: error.message } 
    });
  }
});

/**
 * GET /api/admin/preflight/jobs/:jobId
 * Deep state resolution combining local persistent record and upstream state
 */
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const result = await operations.getLocalPreflightJob(req.params.jobId, req.headers.authorization);
    
    const context = resolveActorContext(req);
    if (!context.isSuperAdmin && result.job?.tenantId !== req.user?.tenantId) {
        return res.status(403).json({ ok: false, source_status: result.source_status, error: { code: 'ACCESS_DENIED', message: 'Job belongs to another tenant' } });
    }

    res.json(result);
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : 500;
    res.status(status).json({ ok: false, source_status: 'LOCAL_FALLBACK', error: { code: 'JOB_FETCH_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/preflight/jobs/:jobId/sync
 * Manually trigger a status sync with the upstream service
 */
router.post('/jobs/:jobId/sync', async (req, res) => {
    try {
        const job = await operations.getJob(req.params.jobId);
        if (!job) return res.status(404).json({ ok: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } });

        const context = resolveActorContext(req);
        // Security: Tenant Isolation
        if (!context.isSuperAdmin && job.tenant_id !== req.user.tenantId) {
            return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Job belongs to another tenant' } });
        }

        const syncedJob = await operations.syncJobStatus(req.params.jobId, req.headers.authorization);
        res.json({ ok: true, job: syncedJob });
    } catch (error) {
        res.status(500).json({ ok: false, error: { code: 'SYNC_FAILED', message: error.message } });
    }
});

/**
 * POST /api/admin/preflight/jobs/:jobId/retry
 */
router.post('/jobs/:jobId/retry', async (req, res) => {
    try {
        const job = await operations.getJob(req.params.jobId);
        if (!job) return res.status(404).json({ ok: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } });

        const context = resolveActorContext(req);
        // Security: Tenant Isolation
        if (!context.isSuperAdmin && job.tenant_id !== req.user.tenantId) {
            return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Job belongs to another tenant' } });
        }

        const retriedJob = await operations.retryJob(req.params.jobId, req.headers.authorization);
        res.json({ ok: true, job: retriedJob });
    } catch (error) {
        res.status(400).json({ ok: false, error: { code: 'RETRY_FAILED', message: error.message } });
    }
});

/**
 * POST /api/admin/preflight/jobs/:jobId/cancel
 */
router.post('/jobs/:jobId/cancel', async (req, res) => {
    try {
        const job = await operations.getJob(req.params.jobId);
        if (!job) return res.status(404).json({ ok: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } });

        const context = resolveActorContext(req);
        // Security: Tenant Isolation
        if (!context.isSuperAdmin && job.tenant_id !== req.user.tenantId) {
            return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Job belongs to another tenant' } });
        }

        const cancelledJob = await operations.cancelJob(req.params.jobId, req.headers.authorization);
        res.json({ ok: true, job: cancelledJob });
    } catch (error) {
        res.status(400).json({ ok: false, error: { code: 'CANCEL_FAILED', message: error.message } });
    }
});

/**
 * POST /api/admin/preflight/artifacts/gc
 * Trigger artifact garbage collection
 */
router.post('/artifacts/gc', async (req, res) => {
    const context = resolveActorContext(req);
    if (!context.isSuperAdmin) {
        return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'GC requires SUPER_ADMIN' } });
    }
    try {
        const dryRun = req.query.dryRun === 'true';
        const results = await artifacts.runGarbageCollector(dryRun);
        res.json({ ok: true, results });
    } catch (error) {
        res.status(500).json({ ok: false, error: { code: 'GC_FAILED', message: error.message } });
    }
});

/**
 * POST /api/admin/preflight/jobs/recover-stalled
 * Maintenance route to detect and recover stuck jobs
 */
router.post('/jobs/recover-stalled', async (req, res) => {
    const context = resolveActorContext(req);
    if (!context.isSuperAdmin) {
        return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Maintenance operations require SUPER_ADMIN' } });
    }
    try {
        const result = await operations.recoverStalledJobs();
        res.json({ ok: true, ...result });
    } catch (error) {
        res.status(500).json({ ok: false, error: { code: 'RECOVERY_FAILED', message: error.message } });
    }
});

/**
 * List artifacts for a specific job
 */
router.get('/jobs/:jobId/artifacts', async (req, res) => {
  try {
    const job = await operations.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } });

    // Security: Tenant Isolation
    if (req.user.role !== 'SUPER_ADMIN' && job.tenant_id !== req.user.tenantId) {
        return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Job belongs to another tenant' } });
    }

    const result = await artifact.listJobArtifacts(req.params.jobId);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'ARTIFACT_LIST_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/preflight/artifacts
 * Global artifact registry
 */
router.get('/artifacts', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const filters = { ...req.query };
    // Security: Tenant Isolation
    if (!context.isSuperAdmin) {
        filters.tenantId = req.user.tenantId;
    }

    const result = await artifact.listArtifacts(filters);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'ARTIFACT_LIST_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/preflight/artifacts/:artifactId
 * Artifact metadata
 */
router.get('/artifacts/:artifactId', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const item = await artifact.getArtifact(req.params.artifactId);
    if (!item) return res.status(404).json({ ok: false, error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact record not found' } });

    // Security: Tenant Isolation
    if (!context.isSuperAdmin && item.tenant_id !== req.user.tenantId) {
        return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Artifact belongs to another tenant' } });
    }

    res.json({ ok: true, artifact: item });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'ARTIFACT_FETCH_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/preflight/artifacts/:artifactId/download
 * Secure stream download
 */
router.get('/artifacts/:artifactId/download', async (req, res) => {
  const context = resolveActorContext(req);
  const logPrefix = `[ARTIFACT-DOWNLOAD][${req.params.artifactId}]`;
  const targetTenantId = context.isSuperAdmin ? null : req.user.tenantId;

  try {
    const { stream, filename, mimeType, sizeBytes, tenantId } = await artifact.getArtifactDownloadStream(req.params.artifactId, targetTenantId);

    console.log(`${logPrefix} Starting download: ${filename} (${sizeBytes} bytes) for tenant ${tenantId}`);

    await auditLogger.log({
        type: 'ARTIFACT_DOWNLOAD',
        tenantId,
        userId: req.user.id,
        status: 'SUCCESS',
        metadata: { artifactId: req.params.artifactId, filename }
    });

    res.setHeader('Content-Type', mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (sizeBytes) res.setHeader('Content-Length', sizeBytes);

    stream.pipe(res);

  } catch (error) {
    console.error(`${logPrefix} Download failed:`, error.message);
    
    await auditLogger.log({
        type: 'ARTIFACT_DOWNLOAD',
        tenantId: req.user.tenantId,
        userId: req.user.id,
        status: 'FAILURE',
        metadata: { artifactId: req.params.artifactId, error: error.message }
    });

    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message.includes('ACCESS') ? 403 : 500);
    res.status(status).json({ ok: false, error: { code: 'DOWNLOAD_FAILED', message: error.message } });
  }
});

/**
 * DELETE /api/admin/preflight/artifacts/:artifactId
 * Soft delete an artifact
 */
router.delete('/artifacts/:artifactId', async (req, res) => {
  try {
    const context = resolveActorContext(req);
    const item = await artifact.getArtifact(req.params.artifactId);
    if (!item) return res.status(404).json({ ok: false, error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found' } });

    // Security: Tenant Isolation
    if (!context.isSuperAdmin && item.tenant_id !== req.user.tenantId) {
        return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Permission denied' } });
    }

    await artifact.softDeleteArtifact(req.params.artifactId);
    
    await auditLogger.log({
        type: 'ARTIFACT_DELETE',
        tenantId: item.tenant_id,
        userId: req.user.id,
        status: 'SUCCESS',
        metadata: { artifactId: req.params.artifactId }
    });

    res.json({ ok: true, message: 'Artifact marked for deletion' });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/preflight/storage
 * Global storage overview
 */
router.get('/storage', async (req, res) => {
  const context = resolveActorContext(req);
  if (!context.isSuperAdmin) {
      return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Global storage access requires SUPER_ADMIN' } });
  }
  try {
    const usage = await storage.getGlobalUsage();
    res.json({ ok: true, ...usage });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'STORAGE_METRICS_FAILED', message: error.message } });
  }
});

/**
 * GET /api/admin/preflight/storage/:tenantId
 * Specific tenant storage and quota status
 */
router.get('/storage/:tenantId', async (req, res) => {
  const context = resolveActorContext(req);
  const targetTenantId = req.params.tenantId;
  
  // Security: Tenant Isolation
  if (!context.isSuperAdmin && targetTenantId !== req.user.tenantId) {
      return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Access denied to other tenant storage' } });
  }

  try {
    // 1. Ensure layout exists (idempotent)
    await storage.ensureTenantStorageLayout(targetTenantId);

    // 2. Fetch usage and quota summary
    const summary = await storage.getTenantStorageSummary(targetTenantId);
    
    res.json({ ok: true, ...summary });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'TENANT_STORAGE_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/preflight/upload
 * Accept PDF uploads, check quotas, and stage for processing.
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  const logPrefix = `[PREFLIGHT-UPLOAD]`;
  const tenantId = resolveTargetTenantId(req);
  
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: { code: 'NO_FILE_UPLOADED', message: 'No file part found in request' } });
    }

    // Check Tenant Plan File Limits
    const tenantPlanGovernanceService = require('../services/tenantPlanGovernanceService');
    const context = resolveActorContext(req);
    const limitCheck = await tenantPlanGovernanceService.checkFileLimit(tenantId, req.file.size, context);
    if (!limitCheck.ok) {
      try {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (e) {}
      return res.status(403).json({
        ok: false,
        error: {
          code: 'TENANT_FILE_LIMIT_EXCEEDED',
          message: limitCheck.blockers[0]?.message || 'File size limit exceeded for plan',
          blockers: limitCheck.blockers
        }
      });
    }

    // 1. Security: Magic Byte Check for PDF
    const fd = fs.openSync(req.file.path, 'r');
    const buffer = Buffer.alloc(5);
    fs.readSync(fd, buffer, 0, 5, 0);
    fs.closeSync(fd);
    
    if (buffer.toString() !== '%PDF-') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: { code: 'INVALID_FILE_TYPE', message: 'File is not a valid PDF document (magic bytes mismatch)' } });
    }

    console.log(`${logPrefix} Processing upload for tenant ${tenantId}: ${req.file.originalname} (${req.file.size} bytes)`);

    // 3. Quota Check
    try {
      await quota.assertTenantHasStorageCapacity(tenantId, req.file.size);
    } catch (quotaErr) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      await auditLogger.log({
          type: 'QUOTA_EXCEEDED',
          tenantId,
          userId: req.user.id,
          status: 'WARNING',
          metadata: { size: req.file.size, error: quotaErr.message }
      });
      return res.status(403).json({ 
        ok: false, 
        error: { code: 'QUOTA_EXCEEDED', message: 'Tenant storage quota exceeded' } 
      });
    }

    // 4. Sanitize Filename & Resolve Destination via Safe Resolver
    const uploadId = uuidv4();
    const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    await storage.ensureTenantStorageLayout(tenantId);
    
    // SECURITY: Use canonical resolver to prevent path injection/traversal
    const uploadDir = storage.resolveTenantPath(tenantId, path.join('uploads', uploadId));
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    
    const finalPath = storage.resolveTenantPath(tenantId, path.join('uploads', uploadId, safeFilename));
    fs.renameSync(req.file.path, finalPath);

    await auditLogger.log({
        type: 'UPLOAD',
        tenantId,
        userId: req.user.id,
        status: 'SUCCESS',
        metadata: { uploadId, filename: safeFilename, size: req.file.size }
    });

    res.json({
      ok: true,
      upload: {
        id: uploadId,
        tenantId,
        filename: safeFilename,
        sizeBytes: req.file.size,
        mimeType: 'application/pdf',
        createdAt: new Date().toISOString(),
        largeDocument: req.file.size > (500 * 1024 * 1024)
      }
    });

  } catch (error) {
    console.error(`${logPrefix} Fatal error:`, error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    
    await auditLogger.log({
        type: 'UPLOAD',
        tenantId,
        userId: req.user.id,
        status: 'FAILURE',
        metadata: { error: error.message }
    });

    res.status(500).json({ ok: false, error: { code: 'UPLOAD_FAILED', message: error.message } });
  }
});

/**
   * GET /api/admin/preflight/policies
   * Fetch live industrial compliance policies directly from upstream preflight engine
   */
router.get('/policies', async (req, res) => {
  const tenantId = resolveTargetTenantId(req);
  const context = resolveActorContext(req);
  const traceId = req.headers['x-trace-id'] || `trace_${Date.now()}`;
  const gateway = require('../services/preflightContractGateway');
  
  // Standardized logging for upstream policy requests
  console.log(`[ADMIN-PREFLIGHT-POLICIES] Fetching upstream policy catalog | Tenant: ${tenantId} | Trace: ${traceId}`);
  
  try {
    const gatewayContext = {
      tenantId,
      traceId,
      requestId: req.headers['x-request-id'] || `req_${Date.now()}`,
      printhouseId: context.printhouseId || req.headers['x-printhouse-id'] || '',
      operatorId: context.userId || ''
    };

    const upstreamData = await gateway.getPolicies(gatewayContext);
    const rawPolicies = upstreamData?.policies || upstreamData?.data || (Array.isArray(upstreamData) ? upstreamData : []);
    
    if (rawPolicies.length > 0) {
      console.log(`[ADMIN-PREFLIGHT-POLICIES] Successfully retrieved ${rawPolicies.length} canonical policies upstream.`);
      
      // Ensure each policy item conforms to the strict new contract requirements
      const policies = rawPolicies.map(p => {
        const id = p.id || p.policy_id || '';
        let legacy_id = p.legacyId || p.legacy_id || null;
        let aliases = Array.isArray(p.aliases) ? [...p.aliases] : [];
        
        if (id === 'OFFSET_MODERN_COATED_F51' && !legacy_id) {
          legacy_id = 'OFFSET_MODERN_COATED';
          if (!aliases.includes('OFFSET_MODERN_COATED')) aliases.push('OFFSET_MODERN_COATED');
        } else if (id === 'OFFSET_MODERN_UNCOATED_F52' && !legacy_id) {
          legacy_id = 'OFFSET_MODERN_UNCOATED';
          if (!aliases.includes('OFFSET_MODERN_UNCOATED')) aliases.push('OFFSET_MODERN_UNCOATED');
        } else if (id === 'OFFSET_LEGACY_COATED_F39' && !legacy_id) {
          legacy_id = 'OFFSET_LEGACY_COATED';
          if (!aliases.includes('OFFSET_LEGACY_COATED')) aliases.push('OFFSET_LEGACY_COATED');
        } else if (id === 'OFFSET_LEGACY_UNCOATED_F29' && !legacy_id) {
          legacy_id = 'OFFSET_LEGACY_UNCOATED';
          if (!aliases.includes('OFFSET_LEGACY_UNCOATED')) aliases.push('OFFSET_LEGACY_UNCOATED');
        }

        return {
          ...p,
          id,
          policy_id: id,
          name: p.name || id,
          description: p.description || `${id} Standard Policy`,
          legacy_id,
          legacyId: legacy_id,
          aliases,
          transformEnabled: p.transformEnabled !== false,
          fixEnabled: p.fixEnabled !== false,
          magicfixEnabled: p.magicfixEnabled !== false
        };
      });

      return res.json({
        ok: true,
        available: true,
        source: 'upstream',
        policies,
        source_status: 'LIVE_UPSTREAM',
        upstream_status: 200
      });
    }
    
    throw new Error('Upstream policy catalog returned empty array');
  } catch (error) {
    console.warn(`[ADMIN-PREFLIGHT-POLICIES] Upstream policy retrieval failed: ${error.message}. Providing local canonical contract fallback.`);
    
    // Non-mocked canonical local contract fallback to prevent pipeline blockage
    const canonicalFallbackPolicies = [
      {
        id: 'OFFSET_MODERN_COATED_F51',
        policy_id: 'OFFSET_MODERN_COATED_F51',
        legacy_id: 'OFFSET_MODERN_COATED',
        legacyId: 'OFFSET_MODERN_COATED',
        aliases: ['OFFSET_MODERN_COATED'],
        name: 'Offset Modern Coated (Fogra 51)',
        description: 'Strict verification for premium coated web/sheetfed offset compliant with ISO 12647-2:2013.',
        category: 'Offset',
        profile: 'PSO Coated v3 (Fogra 51)',
        standard: 'ISO 12647-2:2013',
        transformEnabled: true,
        fixEnabled: true,
        magicfixEnabled: true
      },
      {
        id: 'OFFSET_MODERN_UNCOATED_F52',
        policy_id: 'OFFSET_MODERN_UNCOATED_F52',
        legacy_id: 'OFFSET_MODERN_UNCOATED',
        legacyId: 'OFFSET_MODERN_UNCOATED',
        aliases: ['OFFSET_MODERN_UNCOATED'],
        name: 'Offset Modern Uncoated (Fogra 52)',
        description: 'Targeted dot gain and ink limits for modern uncoated wood-free offset printing.',
        category: 'Offset',
        profile: 'PSO Uncoated v3 (Fogra 52)',
        standard: 'ISO 12647-2:2013 Uncoated',
        transformEnabled: true,
        fixEnabled: true,
        magicfixEnabled: true
      },
      {
        id: 'OFFSET_LEGACY_COATED_F39',
        policy_id: 'OFFSET_LEGACY_COATED_F39',
        legacy_id: 'OFFSET_LEGACY_COATED',
        legacyId: 'OFFSET_LEGACY_COATED',
        aliases: ['OFFSET_LEGACY_COATED'],
        name: 'Offset Legacy Coated (Fogra 39)',
        description: 'Classic verification profile for standard coated offset production environments.',
        category: 'Offset',
        profile: 'ISO Coated v2 (Fogra 39)',
        standard: 'ISO 12647-2:2004',
        transformEnabled: true,
        fixEnabled: true,
        magicfixEnabled: true
      },
      {
        id: 'OFFSET_LEGACY_UNCOATED_F29',
        policy_id: 'OFFSET_LEGACY_UNCOATED_F29',
        legacy_id: 'OFFSET_LEGACY_UNCOATED',
        legacyId: 'OFFSET_LEGACY_UNCOATED',
        aliases: ['OFFSET_LEGACY_UNCOATED'],
        name: 'Offset Legacy Uncoated (Fogra 29)',
        description: 'Legacy standards mapping for uncoated substrates using standard Fogra 29 reference.',
        category: 'Offset',
        profile: 'ISO Uncoated (Fogra 29)',
        standard: 'ISO 12647-2 Legacy',
        transformEnabled: true,
        fixEnabled: true,
        magicfixEnabled: true
      },
      {
        id: 'US_COATED_GRACOL',
        policy_id: 'US_COATED_GRACOL',
        legacy_id: null,
        legacyId: null,
        aliases: [],
        name: 'US Coated (GRACoL 2006/2013)',
        description: 'G7 calibrated commercial sheetfed standard reference for North American operations.',
        category: 'North America',
        profile: 'GRACoL 2006 Coated1',
        standard: 'G7/GRACoL',
        transformEnabled: true,
        fixEnabled: true,
        magicfixEnabled: true
      },
      {
        id: 'US_WEB_SWOP',
        policy_id: 'US_WEB_SWOP',
        legacy_id: null,
        legacyId: null,
        aliases: [],
        name: 'US Web Coated (SWOP)',
        description: 'Standard Web Offset Publications requirements for publication print environments.',
        category: 'North America',
        profile: 'US Web Coated (SWOP) v2',
        standard: 'SWOP Publication',
        transformEnabled: true,
        fixEnabled: true,
        magicfixEnabled: true
      },
      {
        id: 'NEWSPAPER_ISO',
        policy_id: 'NEWSPAPER_ISO',
        legacy_id: null,
        legacyId: null,
        aliases: [],
        name: 'Coldset Newspaper (ISO 12647-3)',
        description: 'Optimized total ink coverage limits (TAC 240%) for standard coldset web newspaper production.',
        category: 'Coldset',
        profile: 'WAN-IFRA newspaper26v5',
        standard: 'ISO 12647-3',
        transformEnabled: true,
        fixEnabled: true,
        magicfixEnabled: true
      },
      {
        id: 'DIGITAL_RGB',
        policy_id: 'DIGITAL_RGB',
        legacy_id: null,
        legacyId: null,
        aliases: [],
        name: 'Digital Press Standard (RGB/CMYK)',
        description: 'High-fidelity workflow support allowing RGB objects tailored for advanced digital frontends.',
        category: 'Digital',
        profile: 'sRGB / Generic Digital',
        standard: 'Digital Press Standard',
        transformEnabled: true,
        fixEnabled: true,
        magicfixEnabled: true
      }
    ];

    // Always return 200 OK with policies to unblock frontend components dynamically
    return res.json({
      ok: true,
      available: true,
      source: 'local_contract_fallback',
      policies: canonicalFallbackPolicies,
      source_status: 'LOCAL_FALLBACK',
      upstream_status: error.status || 503,
      error: { code: 'UPSTREAM_POLICIES_UNAVAILABLE', message: error.message }
    });
  }
});

/**
   * GET /api/admin/preflight/jobs/:jobId/timeline
   * Native bridge for real-time forensic timeline execution events
   */
router.get('/jobs/:jobId/timeline', async (req, res) => {
  try {
    const result = await operations.getJobTimeline(req.params.jobId, req.headers.authorization);
    res.json({
      ok: true,
      timeline: result.timeline || [],
      source_status: result.source_status || 'LIVE_UPSTREAM'
    });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : 500;
    res.status(status).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { code: 'TIMELINE_FETCH_FAILED', message: error.message } });
  }
});

/**
   * GET /api/admin/preflight/jobs/:jobId/findings
   * Native bridge for preflight geometry/color/raster anomalies
   */
router.get('/jobs/:jobId/findings', async (req, res) => {
  try {
    const result = await operations.getJobFindings(req.params.jobId, req.headers.authorization);
    res.json({
      ok: true,
      findings: result.findings || [],
      source_status: result.source_status || 'LIVE_UPSTREAM'
    });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : 500;
    res.status(status).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { code: 'FINDINGS_FETCH_FAILED', message: error.message } });
  }
});

/**
   * GET /api/admin/preflight/jobs/:jobId/evidence
   * Native bridge for detailed proof and certified evidence reports
   */
router.get('/jobs/:jobId/evidence', async (req, res) => {
  try {
    const result = await operations.getJobEvidence(req.params.jobId, req.headers.authorization);
    res.json({
      ok: true,
      evidence: result.evidence || {},
      artifacts: result.artifacts || [],
      source_status: result.source_status || 'LIVE_UPSTREAM'
    });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : 500;
    res.status(status).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { code: 'EVIDENCE_FETCH_FAILED', message: error.message } });
  }
});

/**
   * POST /api/admin/preflight/jobs/:jobId/fix
   * Native bridge to trigger automated engine repairs based on defined policies
   */
router.post('/jobs/:jobId/fix', async (req, res) => {
  try {
    const options = { ...(req.body || {}) };
    const result = await operations.triggerJobFix(req.params.jobId, req.headers.authorization, options);
    res.json({
      ok: true,
      jobId: result.jobId,
      fixJobId: result.fixJobId,
      status: result.status,
      source_status: result.source_status || 'LIVE_UPSTREAM'
    });
  } catch (error) {
    const status = error.message.includes('NOT_FOUND') ? 404 : (error.message === 'UPSTREAM_AUTH_FAILED' ? 401 : 400);
    res.status(status).json({ 
      ok: false, 
      source_status: error.message === 'UPSTREAM_AUTH_FAILED' ? 'UPSTREAM_AUTH_FAILED' : 'UPSTREAM_UNAVAILABLE', 
      error: { code: 'FIX_TRIGGER_FAILED', message: error.message } 
    });
  }
});

module.exports = router;
