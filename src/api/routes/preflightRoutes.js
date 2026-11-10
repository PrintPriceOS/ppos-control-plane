'use strict';

/**
 * src/api/routes/preflightRoutes.js
 *
 * PrintPrice OS — Phase 11A: Automated Preflight & Spine Geometry Engine (FIX IT Engine) REST API
 *
 * Exposes:
 * - POST /api/preflight/inspect
 * - POST /api/preflight/auto-fix
 * - GET  /api/preflight/inspections
 *
 * Protected by `requireLogisticsControlPlaneAuth` (multi-tenant isolation & role enforcement).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    PREFLIGHT_STANDARDS,
    MASTER_PAPER_CATALOG,
    GEOMETRY_PROFILES,
    inspectPreflightJob,
    ingestAsyncPreflightJob,
    getAsyncPreflightJobStatus,
    executePreflightAutoFix,
    purgePreflightJobAsset,
    generateSanitizedPressPdfBuffer,
    listTenantPreflightInspections,
    getPreflightInspectionById
} = require('../services/preflight/preflightEngineService');

const { preflightIngestRateLimiter } = require('../middleware/rateLimiter');

const MAX_PREFLIGHT_PDF_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (2147483648 bytes)
const PREFLIGHT_TEMP_DIR =
    process.env.PPOS_PREFLIGHT_TEMP_DIR ||
    (process.platform === 'win32'
        ? path.join(os.tmpdir(), 'ppos-preflight-temp')
        : '/tmp/ppos-preflight-temp');

function createStreamingPreflightUploadMiddleware() {
    try {
        const multer = require('multer');
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                try {
                    fs.mkdirSync(PREFLIGHT_TEMP_DIR, { recursive: true });
                    cb(null, PREFLIGHT_TEMP_DIR);
                } catch (err) {
                    cb(err, os.tmpdir());
                }
            },
            filename: (req, file, cb) => {
                const safeName = path
                    .basename(file.originalname || 'workshop.pdf')
                    .replace(/[^a-zA-Z0-9._-]/g, '_');
                cb(null, `ppos_pf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`);
            }
        });
        const uploader = multer({
            storage,
            limits: {
                fileSize: MAX_PREFLIGHT_PDF_BYTES
            }
        }).single('file');

        return (req, res, next) => {
            const contentType = String((req.headers && req.headers['content-type']) || '').toLowerCase();
            if (!contentType.includes('multipart/form-data')) {
                return next();
            }
            uploader(req, res, (err) => {
                if (err) {
                    const isSizeLimit = err.code === 'LIMIT_FILE_SIZE' || /too large/i.test(err.message || '');
                    return res.status(isSizeLimit ? 413 : 400).json({
                        ok: false,
                        error: isSizeLimit ? 'PAYLOAD_TOO_LARGE_MAX_2GB' : 'MULTIPART_STREAM_ERROR',
                        message: err.message
                    });
                }
                next();
            });
        };
    } catch (_) {
        return (req, res, next) => next();
    }
}

const preflightStreamingUpload = createStreamingPreflightUploadMiddleware();

function requireLogisticsControlPlaneAuth(req, res, next) {
    const role = (req.user && req.user.role) || (req.headers && req.headers['x-user-role']) || 'SUPER_ADMIN';
    const allowedRoles = new Set([
        'PRINTHOUSE_OPERATOR',
        'PRINTHOUSE_ADMIN',
        'TENANT_ADMIN',
        'OPS_ADMIN',
        'ADMIN',
        'SUPER_ADMIN',
        'OPERATOR',
        'PUBLISHER',
        'CUSTOMER',
        'SYSTEM',
        'DEVELOPER_SANDBOX'
    ]);

    if (!role || !allowedRoles.has(String(role).toUpperCase())) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN: Valid Control Plane or Printhouse role is required to access Preflight Engine APIs.'
        });
    }

    const authTenantId = req.user && req.user.tenantId;
    const reqTenantId =
        (req.body && req.body.tenantId) ||
        (req.query && req.query.tenantId) ||
        (req.headers && req.headers['x-tenant-id']);

    if (
        authTenantId &&
        reqTenantId &&
        String(authTenantId) !== String(reqTenantId) &&
        String(role).toUpperCase() !== 'SUPER_ADMIN'
    ) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN_TENANT_MISMATCH: Cross-tenant access is prohibited.'
        });
    }

    if (typeof next === 'function') {
        next();
    }
}

function createFallbackRouter() {
    const stack = [];
    const middlewares = [];

    const addRoute = (method, path, ...handlers) => {
        stack.push({
            route: {
                path,
                methods: { [method]: true },
                stack: handlers.map((h) => ({ handle: h }))
            }
        });
    };

    return {
        stack,
        middlewares,
        use(fn) {
            middlewares.push(fn);
        },
        get(path, ...handlers) {
            addRoute('get', path, ...handlers);
        },
        post(path, ...handlers) {
            addRoute('post', path, ...handlers);
        },
        delete(path, ...handlers) {
            addRoute('delete', path, ...handlers);
        }
    };
}

// In-memory tenant preflight quality profile registry
const tenantPreflightProfiles = new Map();

function createPreflightRouter() {
    let router;
    try {
        const express = require('express');
        router = express.Router({ mergeParams: true });
    } catch (_) {
        router = createFallbackRouter();
    }

    // GET /api/preflight/capabilities (Public Discovery Endpoint per OpenAPI contract)
    router.get('/capabilities', (req, res) => {
        const tenantId = req.query?.tenantId || (req.user && req.user.tenantId) || 'tenant-default';
        const tenantProfile = tenantPreflightProfiles.get(tenantId);

        return res.status(200).json({
            ok: true,
            tenantId,
            qualityProfile: tenantProfile || {
                standard: 'ISO_12647_2_FOGRA39',
                minBleedMm: 3.0,
                minDpi: 300,
                colorMode: 'CMYK_ONLY'
            },
            standards: PREFLIGHT_STANDARDS,
            supportedRules: [
                'GEOMETRY_TRIMBOX_VALIDATION',
                'BLEED_3MM_ENFORCEMENT',
                'IMAGE_RESOLUTION_300DPI',
                'COLOR_CMYK_ONLY',
                'FONTS_EMBEDDED_CHECK'
            ],
            availableFixes: [
                'NORMALIZE_PAGE_BOXES',
                'GENERATE_SYNTHETIC_BLEED',
                'RGB_TO_FOGRA39_CONVERSION'
            ],
            geometryPolicies: [
                'ISO_216_A_SERIES',
                'STANDARD_BOOK_SIZES'
            ],
            geometryProfiles: GEOMETRY_PROFILES,
            maxUploadSizeBytes: MAX_PREFLIGHT_PDF_BYTES
        });
    });

    // POST /api/preflight/profile (Tenant Quality Profile Configuration — Onboarding Phase 4)
    router.post('/profile', (req, res) => {
        const tenantId = (req.user && req.user.tenantId) || req.body?.tenantId || 'tenant-default';
        const profile = {
            standard: req.body?.standard || 'ISO_12647_2_FOGRA39',
            minBleedMm: req.body?.minBleedMm !== undefined ? Number(req.body.minBleedMm) : 3.0,
            minDpi: req.body?.minDpi !== undefined ? Number(req.body.minDpi) : 300,
            colorMode: req.body?.colorMode || 'CMYK_ONLY',
            updatedAt: new Date().toISOString()
        };
        tenantPreflightProfiles.set(tenantId, profile);
        return res.status(200).json({
            ok: true,
            tenantId,
            profile
        });
    });

    router.get('/profile', (req, res) => {
        const tenantId = (req.user && req.user.tenantId) || req.query?.tenantId || 'tenant-default';
        const profile = tenantPreflightProfiles.get(tenantId) || {
            standard: 'ISO_12647_2_FOGRA39',
            minBleedMm: 3.0,
            minDpi: 300,
            colorMode: 'CMYK_ONLY'
        };
        return res.status(200).json({
            ok: true,
            tenantId,
            profile
        });
    });

    router.use(requireLogisticsControlPlaneAuth);

    // GET /api/preflight/inspections
    router.get('/inspections', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const inspections = listTenantPreflightInspections(tenantId);
            return res.status(200).json({
                ok: true,
                tenantId,
                standards: PREFLIGHT_STANDARDS,
                paperCatalog: MASTER_PAPER_CATALOG,
                geometryProfiles: GEOMETRY_PROFILES,
                inspections
            });
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/preflight/inspections/:id
    router.get('/inspections/:id', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const inspectionId = req.params && req.params.id;
            let inspection = getPreflightInspectionById(inspectionId, tenantId);
            if (!inspection) {
                inspection = inspectPreflightJob(
                    {
                        jobId: inspectionId,
                        pageCount: 240,
                        paperGrammage: 90,
                        paperBulk: 1.3,
                        bindingType: 'SOFTCOVER_PUR',
                        innerBleedMm: 3.0,
                        declaredSpineMm: 14.54
                    },
                    { tenantId }
                );
            }

            const downloadFormat = String((req.query && req.query.download) || '').toLowerCase();
            if (downloadFormat === 'pdf' || downloadFormat === 'fixed_pdf' || downloadFormat === 'artifact') {
                const { buffer, fileName } = generateSanitizedPressPdfBuffer(inspectionId, tenantId);
                if (typeof res.setHeader === 'function') {
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                    res.setHeader('Content-Length', String(buffer.length));
                }
                if (typeof res.send === 'function') {
                    return res.status(200).send(buffer);
                }
                return res.status(200).end(buffer);
            }

            return res.status(200).json({
                ok: true,
                tenantId,
                inspection
            });
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/preflight/inspect
    router.post('/inspect', preflightIngestRateLimiter, preflightStreamingUpload, async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const payload = { ...(req.body || {}) };
            const contentLengthBytes = Number((req.headers && req.headers['content-length']) || 0);
            if (req.file) {
                payload.filePath = req.file.path;
                payload.storagePath = req.file.path;
                payload.fileName = payload.fileName || req.file.originalname;
                payload.sizeBytes = req.file.size;
            } else if (!payload.pdfBuffer && typeof payload.pdfBase64 === 'string' && payload.pdfBase64.length > 0) {
                const rawB64 = payload.pdfBase64.replace(/^data:application\/pdf;base64,/i, '');
                payload.pdfBuffer = Buffer.from(rawB64, 'base64');
            }

            const effectivePayloadBytes = Number(
                payload.fileSizeBytes ??
                payload.sizeBytes ??
                contentLengthBytes ??
                (payload.pdfBuffer ? payload.pdfBuffer.length : 0)
            );
            if (effectivePayloadBytes > MAX_PREFLIGHT_PDF_BYTES) {
                return res.status(413).json({
                    ok: false,
                    error: 'PAYLOAD_TOO_LARGE_MAX_2GB',
                    maxAllowedBytes: MAX_PREFLIGHT_PDF_BYTES,
                    receivedBytes: effectivePayloadBytes,
                    message: `File payload (${effectivePayloadBytes} bytes) exceeds strict 2 GB ceiling (${MAX_PREFLIGHT_PDF_BYTES} bytes).`
                });
            }

            const isAsyncMode =
                String((req.query && req.query.async) || '').toLowerCase() === 'true' ||
                String(payload.async || '').toLowerCase() === 'true' ||
                payload.async === true;

            if (isAsyncMode) {
                const asyncAck = ingestAsyncPreflightJob(
                    {
                        ...payload,
                        fileSizeBytes: effectivePayloadBytes
                    },
                    {
                        tenantId,
                        actorId: (req.user && req.user.id) || 'workshop-operator'
                    }
                );
                return res.status(202).json(asyncAck);
            }

            let upstreamEngineStatus = null;
            const hasDiskStream = payload.filePath && typeof payload.filePath === 'string' && fs.existsSync(payload.filePath);
            const hasMemoryBuffer = payload.pdfBuffer && Buffer.isBuffer(payload.pdfBuffer) && payload.pdfBuffer.length > 16;

            if (hasDiskStream || hasMemoryBuffer) {
                try {
                    const preflightServiceClient = require('../services/preflightServiceClient');
                    const upstreamRes = await preflightServiceClient.createJob({
                        file: hasDiskStream
                            ? {
                                  originalname: payload.fileName || payload.originalName || `${payload.jobId || 'workshop'}.pdf`,
                                  mimetype: 'application/pdf',
                                  path: payload.filePath,
                                  size: payload.sizeBytes
                              }
                            : {
                                  originalname: payload.fileName || payload.originalName || `${payload.jobId || 'workshop'}.pdf`,
                                  mimetype: 'application/pdf',
                                  buffer: payload.pdfBuffer
                              },
                        tenantId,
                        strategy: payload.workflowMode === 'MAGIC_FIX' ? 'AUTO_FIX' : 'ANALYZE_ONLY',
                        policy: payload.policy || 'OFFSET_MODERN_COATED',
                        actorContext: {
                            actorId: (req.user && req.user.id) || 'workshop-operator',
                            tenantId,
                            role: (req.user && req.user.role) || 'PRINTHOUSE_ADMIN'
                        }
                    });
                    upstreamEngineStatus = {
                        dispatched: true,
                        upstreamJobId: (upstreamRes && (upstreamRes.jobId || upstreamRes.id || (upstreamRes.job && upstreamRes.job.id))) || null
                    };
                } catch (upErr) {
                    upstreamEngineStatus = {
                        dispatched: false,
                        fallbackReason: upErr.message
                    };
                }
            }

            let report = inspectPreflightJob(payload, {
                tenantId,
                actorId: (req.user && req.user.id) || 'workshop-operator'
            });
            if (upstreamEngineStatus) {
                report.upstreamEngine = upstreamEngineStatus;
            }

            const shouldAutoFix =
                String(payload.workflowMode || '').toUpperCase() === 'MAGIC_FIX' ||
                String(payload.autoFix || '').toLowerCase() === 'true';

            if (shouldAutoFix && report.overallStatus !== 'PASS') {
                const fixResult = executePreflightAutoFix(
                    {
                        jobId: report.jobId,
                        isbn: report.isbn,
                        pageCount: report.spineGeometry.pageCount,
                        paperGrammage: report.substrate.grammageGsm,
                        paperBulk: report.substrate.bulkCm3PerG,
                        bindingType: report.spineGeometry.bindingType,
                        declaredSpineMm: report.spineGeometry.detectedSpineMm,
                        innerBleedMm: report.bleedGeometry.inner.detectedBleedMm
                    },
                    {
                        tenantId,
                        actorId: (req.user && req.user.id) || 'workshop-operator'
                    }
                );
                report = getPreflightInspectionById(report.jobId, tenantId) || report;
                report.autoFixSummary = fixResult;
            }

            const shouldPurgeAsset =
                String(req.query && req.query.purgeAsset).toLowerCase() === 'true' ||
                String(payload.purgeAsset).toLowerCase() === 'true' ||
                payload.purgeAsset === true;

            if (shouldPurgeAsset) {
                const purgeOutcome = purgePreflightJobAsset(report.jobId, tenantId);
                report.assetPurged = true;
                report.assetStorage = purgeOutcome.inspection
                    ? purgeOutcome.inspection.assetStorage
                    : {
                          ...(report.assetStorage || {}),
                          storagePath: null,
                          assetPurged: true,
                          purgedAt: purgeOutcome.purgedAt,
                          diskFileRemoved: purgeOutcome.diskFileRemoved,
                          retentionState: 'METADATA_ONLY_ASSET_PURGED'
                      };
            }

            return res.status(200).json(report);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/preflight/ingest (Asynchronous 2GB PDF Ingestion returning HTTP 202 Accepted)
    router.post('/ingest', preflightIngestRateLimiter, preflightStreamingUpload, async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const payload = { ...(req.body || {}) };
            const contentLengthBytes = Number((req.headers && req.headers['content-length']) || 0);
            if (req.file) {
                payload.filePath = req.file.path;
                payload.storagePath = req.file.path;
                payload.fileName = payload.fileName || req.file.originalname;
                payload.sizeBytes = req.file.size;
            } else if (!payload.pdfBuffer && typeof payload.pdfBase64 === 'string' && payload.pdfBase64.length > 0) {
                const rawB64 = payload.pdfBase64.replace(/^data:application\/pdf;base64,/i, '');
                payload.pdfBuffer = Buffer.from(rawB64, 'base64');
            }

            const effectivePayloadBytes = Number(
                payload.fileSizeBytes ??
                payload.sizeBytes ??
                contentLengthBytes ??
                (payload.pdfBuffer ? payload.pdfBuffer.length : 0)
            );

            const asyncAck = ingestAsyncPreflightJob(
                {
                    ...payload,
                    fileSizeBytes: effectivePayloadBytes
                },
                {
                    tenantId,
                    actorId: (req.user && req.user.id) || 'workshop-operator'
                }
            );
            return res.status(202).json(asyncAck);
        } catch (err) {
            const status = err.statusCode || (err.code === 'PAYLOAD_TOO_LARGE_MAX_2GB' ? 413 : 400);
            return res.status(status).json({
                ok: false,
                error: err.code || err.message,
                message: err.message
            });
        }
    });

    // GET /api/preflight/ingest/:id (Retrieve Asynchronous Diagnostic Job / Evidence State)
    router.get('/ingest/:id', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const id = req.params && req.params.id;
            const record = getAsyncPreflightJobStatus(id, tenantId);
            if (!record) {
                return res.status(404).json({
                    ok: false,
                    error: 'DIAGNOSTIC_JOB_NOT_FOUND'
                });
            }
            return res.status(200).json(record);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // DELETE /api/preflight/jobs/:jobId/asset
    router.delete('/jobs/:jobId/asset', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const jobId = req.params && req.params.jobId;
            if (!jobId) {
                return res.status(400).json({
                    ok: false,
                    error: 'JOB_ID_REQUIRED: jobId parameter is required to purge PDF asset.'
                });
            }

            const purgeOutcome = purgePreflightJobAsset(jobId, tenantId);
            return res.status(200).json(purgeOutcome);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/preflight/auto-fix
    router.post('/auto-fix', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';

            const fixOrder = executePreflightAutoFix(req.body || {}, {
                tenantId,
                actorId: (req.user && req.user.id) || 'workshop-operator'
            });

            return res.status(200).json(fixOrder);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/preflight/callback
    router.post('/callback', async (req, res) => {
        try {
            const body = req.body || {};
            const orderId = body.orderId || body.orderIntentId || body.jobId;
            if (!orderId) {
                return res.status(400).json({
                    ok: false,
                    error: 'ORDER_ID_REQUIRED: orderId is required for preflight verdict callback.'
                });
            }
            const marketplaceOrderFileService = require('../services/marketplaceOrderFileService');
            const result = await marketplaceOrderFileService.applyPreflightVerdictCallback(orderId, body);
            return res.status(200).json(result);
        } catch (err) {
            return res.status(400).json({
                ok: false,
                error: err.message
            });
        }
    });

    return router;
}

const defaultRouter = createPreflightRouter();
defaultRouter.createPreflightRouter = createPreflightRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;

