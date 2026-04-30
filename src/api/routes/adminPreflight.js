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

// Apply admin protection to all routes
router.use(requireAdmin);
router.use(requirePrinterLicense);

/**
 * Helper: Resolve Tenant Identity from user context
 */
function resolveTargetTenantId(req) {
    // If SUPER_ADMIN provides X-Tenant-Id, trust it.
    if (req.user.role === 'SUPER_ADMIN' && req.headers['x-tenant-id']) {
        return req.headers['x-tenant-id'];
    }
    // Otherwise, use the user's own tenantId (defaults to 'system' for bootstrap admin)
    return req.user.tenantId || 'system';
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
router.get('/jobs', async (req, res) => {
  try {
    const filters = { ...req.query };
    
    // Security: Restrict non-SUPER_ADMIN to their own tenant
    if (req.user.role !== 'SUPER_ADMIN') {
        filters.tenantId = req.user.tenantId;
    }

    const result = await operations.listJobs(filters);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'JOB_LIST_FAILED', message: error.message } });
  }
});

/**
 * POST /api/admin/preflight/jobs
 * Create a new persistent preflight job from an existing upload.
 */
router.post('/jobs', async (req, res) => {
  const tenantId = resolveTargetTenantId(req);
  try {
    const { uploadId, type, policy } = req.body;

    if (!uploadId || !type) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: 'MISSING_PARAMS', message: 'uploadId and type are required' } 
      });
    }

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
        userId: req.user.id,
        status: 'SUCCESS',
        metadata: { jobId: job.id, type, uploadId }
    });

    res.json({ ok: true, job });
  } catch (error) {
    await auditLogger.log({
        type: 'JOB_CREATE',
        tenantId,
        userId: req.user.id,
        status: 'FAILURE',
        metadata: { error: error.message }
    });
    const status = error.message.includes('NOT_FOUND') ? 404 : 500;
    res.status(status).json({ 
      ok: false, 
      error: { code: 'JOB_CREATION_FAILED', message: error.message } 
    });
  }
});

/**
 * GET /api/admin/preflight/jobs/:jobId
 * Forensic detail for a specific job
 */
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const job = await operations.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ ok: false, error: { code: 'JOB_NOT_FOUND', message: 'Preflight job not found' } });
    }

    // Security: Tenant Isolation
    if (req.user.role !== 'SUPER_ADMIN' && job.tenant_id !== req.user.tenantId) {
        return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Job belongs to another tenant' } });
    }

    // Auto-sync if job is in active/non-terminal state
    const terminalStates = ['COMPLETED', 'FAILED', 'CANCELLED'];
    let responseJob = job;
    if (!terminalStates.includes(job.status) && job.metadata_json?.upstreamJobId) {
        try {
            responseJob = await operations.syncJobStatus(req.params.jobId, req.headers.authorization);
        } catch (syncErr) {
            console.warn(`[API] Auto-sync failed for ${req.params.jobId}:`, syncErr.message);
            // Fallback to currently known local state
        }
    }

    res.json({ ok: true, job: responseJob });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: 'JOB_FETCH_FAILED', message: error.message } });
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

        // Security: Tenant Isolation
        if (req.user.role !== 'SUPER_ADMIN' && job.tenant_id !== req.user.tenantId) {
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

        // Security: Tenant Isolation
        if (req.user.role !== 'SUPER_ADMIN' && job.tenant_id !== req.user.tenantId) {
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

        // Security: Tenant Isolation
        if (req.user.role !== 'SUPER_ADMIN' && job.tenant_id !== req.user.tenantId) {
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
    if (req.user.role !== 'SUPER_ADMIN') {
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
    if (req.user.role !== 'SUPER_ADMIN') {
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
    const filters = { ...req.query };
    // Security: Tenant Isolation
    if (req.user.role !== 'SUPER_ADMIN') {
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
    const item = await artifact.getArtifact(req.params.artifactId);
    if (!item) return res.status(404).json({ ok: false, error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact record not found' } });

    // Security: Tenant Isolation
    if (req.user.role !== 'SUPER_ADMIN' && item.tenant_id !== req.user.tenantId) {
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
  const logPrefix = `[ARTIFACT-DOWNLOAD][${req.params.artifactId}]`;
  const targetTenantId = req.user.role === 'SUPER_ADMIN' ? null : req.user.tenantId;

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
    const item = await artifact.getArtifact(req.params.artifactId);
    if (!item) return res.status(404).json({ ok: false, error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found' } });

    // Security: Tenant Isolation
    if (req.user.role !== 'SUPER_ADMIN' && item.tenant_id !== req.user.tenantId) {
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
  if (req.user.role !== 'SUPER_ADMIN') {
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
  const targetTenantId = req.params.tenantId;
  
  // Security: Tenant Isolation
  if (req.user.role !== 'SUPER_ADMIN' && targetTenantId !== req.user.tenantId) {
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

module.exports = router;
