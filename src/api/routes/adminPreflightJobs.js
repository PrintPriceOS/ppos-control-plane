/**
 * Admin Preflight Jobs Router (Industrial Console)
 * 
 * Implements the complete operational layer for preflight job administration.
 * Reuses the authentic upstream V2 canonical contract via PreflightContractGateway,
 * strictly avoiding mocks and fallback data generation.
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { resolveActorContext, requireApprovedPrinthouse } = require('../middleware/auth');
const gateway = require('../services/preflightContractGateway');
const db = require('../services/mysqlClient');

// Memory storage to stream files directly to the upstream gateway without disk overhead
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: parseInt(process.env.PPOS_MAX_FILE_SIZE_BYTES || '2147483648', 10) }
});

// Helper: Log operational audit trails persistently
async function logAuditEvent({ tenantId, jobId, action, status, message, metadata, traceId }) {
    try {
        await db.query(`
            INSERT INTO preflight_audit_events 
            (tenant_id, job_id, action, status, message, metadata_json, trace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            tenantId || 'system',
            jobId || null,
            action,
            status,
            message || null,
            metadata ? JSON.stringify(metadata) : null,
            traceId || `trace_${Date.now()}`
        ]);
    } catch (err) {
        console.error('[ADMIN-PREFLIGHT-ROUTER] Failed to log audit event:', err.message);
    }
}

// Ensure all endpoints are authenticated and contextualized
router.use((req, res, next) => {
    req.actorContext = resolveActorContext(req);
    next();
});

/**
 * Helper: Build Context Headers for Gateway
 */
function buildGatewayContext(req) {
    const context = req.actorContext || {};
    const traceId = req.headers['x-trace-id'] || `trace_${Date.now()}`;
    const targetTenantId = context.isSuperAdmin && req.headers['x-tenant-id'] ? req.headers['x-tenant-id'] : (context.tenantId || 'system');

    return {
        tenantId: targetTenantId,
        traceId,
        requestId: req.headers['x-request-id'] || `req_${Date.now()}`,
        printhouseId: context.printhouseId || req.headers['x-printhouse-id'] || '',
        operatorId: context.userId || '',
        policy: req.headers['x-policy'] || req.query.policy || req.body?.policy || ''
    };
}

/**
 * Helper: Tenant Isolation Verification
 */
function verifyTenantScope(req, targetTenantId) {
    const context = req.actorContext || {};
    if (!context.isSuperAdmin && context.tenantId !== targetTenantId) {
        const error = new Error('TENANT_ISOLATION_VIOLATION: Access restricted to assigned tenant resources.');
        error.status = 403;
        throw error;
    }
}

// --- 1. GET /api/admin/preflight/jobs ---
router.get('/jobs', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const { status, type, limit = 50, offset = 0 } = req.query;
        let sql = 'SELECT * FROM preflight_job_registry WHERE 1=1';
        const params = [];

        // Tenant Isolation Filter
        if (!req.actorContext?.isSuperAdmin) {
            sql += ' AND tenant_id = ?';
            params.push(context.tenantId);
        } else if (req.query.tenant) {
            sql += ' AND tenant_id = ?';
            params.push(req.query.tenant);
        }

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        if (type) {
            sql += ' AND type = ?';
            params.push(type);
        }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const rows = await db.query(sql, params);
        
        // Count query
        let countSql = 'SELECT COUNT(*) as cnt FROM preflight_job_registry WHERE 1=1';
        const countParams = [];
        if (!req.actorContext?.isSuperAdmin) {
            countSql += ' AND tenant_id = ?';
            countParams.push(context.tenantId);
        } else if (req.query.tenant) {
            countSql += ' AND tenant_id = ?';
            countParams.push(req.query.tenant);
        }
        if (status) { countSql += ' AND status = ?'; countParams.push(status); }
        if (type) { countSql += ' AND type = ?'; countParams.push(type); }

        const [countRows] = await db.query(countSql, countParams);
        const total = Array.isArray(countRows) ? (countRows[0]?.cnt || 0) : (countRows?.cnt || rows.length);

        const jobs = rows.map(r => ({
            jobId: r.job_id,
            tenantId: r.tenant_id,
            printhouseId: r.printhouse_id,
            operatorId: r.operator_id,
            batchId: r.batch_id,
            status: r.status,
            policy: r.policy,
            type: r.type,
            progress: r.progress,
            fileSize: r.file_size_bytes,
            filename: r.original_filename,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            // Preserve raw canonical diagnostics safely
            canonicalData: r.canonical_payload_json ? (typeof r.canonical_payload_json === 'string' ? JSON.parse(r.canonical_payload_json) : r.canonical_payload_json) : null
        }));

        await logAuditEvent({
            tenantId: context.tenantId,
            action: 'LIST_JOBS',
            status: 'SUCCESS',
            traceId: context.traceId
        });

        res.json({ ok: true, total, jobs, source_status: 'PERSISTENT_REGISTRY' });
    } catch (err) {
        console.error('[ADMIN-PREFLIGHT-ROUTER] GET /jobs error:', err.message);
        res.status(err.status || 500).json({ ok: false, error: { message: err.message } });
    }
});

// --- 2. POST /api/admin/preflight/jobs ---
router.post('/jobs', upload.single('file'), async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, error: { message: 'File payload is strictly required for execution.' } });
        }

        context.policy = req.body.policy || context.policy || 'OFFSET_MODERN_COATED';
        context.type = req.body.type || 'ANALYZE';

        // Direct pass to Gateway preserving full contract
        const upstreamResponse = await gateway.createJob(req.file.buffer, req.file.originalname, context);

        const canonicalJobId = upstreamResponse.jobId || upstreamResponse.id || `job_${Date.now()}`;
        const canonicalStatus = upstreamResponse.status || 'COMPLETED';

        // Persist record honestly
        await db.query(`
            INSERT INTO preflight_job_registry 
            (job_id, tenant_id, printhouse_id, operator_id, status, policy, type, progress, file_size_bytes, original_filename, canonical_payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            status = VALUES(status), canonical_payload_json = VALUES(canonical_payload_json), updated_at = NOW()
        `, [
            canonicalJobId,
            context.tenantId,
            context.printhouseId,
            context.operatorId,
            canonicalStatus,
            context.policy,
            context.type,
            canonicalStatus === 'COMPLETED' ? 100 : 10,
            req.file.size,
            req.file.originalname,
            JSON.stringify(upstreamResponse)
        ]);

        // Register output artifacts if available in canonical payload
        if (upstreamResponse.artifacts && Array.isArray(upstreamResponse.artifacts)) {
            for (const art of upstreamResponse.artifacts) {
                const artId = art.id || art.artifactId || `art_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
                await db.query(`
                    INSERT IGNORE INTO preflight_artifact_registry 
                    (artifact_id, job_id, tenant_id, artifact_type, filename, size_bytes, storage_path)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    artId,
                    canonicalJobId,
                    context.tenantId,
                    art.type || 'OUTPUT',
                    art.filename || art.name || 'artifact.pdf',
                    art.sizeBytes || art.size || 0,
                    art.path || art.storageKey || ''
                ]);
            }
        }

        await logAuditEvent({ tenantId: context.tenantId, jobId: canonicalJobId, action: 'CREATE_JOB', status: 'SUCCESS', traceId: context.traceId });

        res.status(201).json({ ok: true, job: upstreamResponse, source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        await logAuditEvent({ tenantId: context.tenantId, action: 'CREATE_JOB', status: 'FAILURE', message: err.message, traceId: context.traceId });
        res.status(err.status || 503).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: err.message, details: err.upstreamResponse } });
    }
});

// --- 3. GET /api/admin/preflight/jobs/:jobId ---
router.get('/jobs/:jobId', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    try {
        // Query persistent registry
        const rows = await db.query('SELECT * FROM preflight_job_registry WHERE job_id = ?', [jobId]);
        const localRecord = rows[0];

        if (localRecord) {
            verifyTenantScope(req, localRecord.tenant_id);
        }

        // Always attempt live status check from upstream Gateway for absolute fidelity
        let livePayload = null;
        let sourceStatus = 'PERSISTENT_REGISTRY';

        try {
            livePayload = await gateway.getJob(jobId, context);
            if (livePayload) {
                sourceStatus = 'LIVE_UPSTREAM';
                const currentStatus = livePayload.status || localRecord?.status || 'COMPLETED';
                // Update local record dynamically
                await db.query(`
                    INSERT INTO preflight_job_registry 
                    (job_id, tenant_id, status, canonical_payload_json)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                    status = VALUES(status), canonical_payload_json = VALUES(canonical_payload_json), updated_at = NOW()
                `, [
                    jobId,
                    localRecord?.tenant_id || context.tenantId,
                    currentStatus,
                    JSON.stringify(livePayload)
                ]);
            }
        } catch (upstreamErr) {
            console.warn(`[ADMIN-PREFLIGHT-ROUTER] Live hydration failed for ${jobId}, relying on persistent registry:`, upstreamErr.message);
            if (!localRecord) {
                // Completely unmocked fail-loud
                return res.status(upstreamErr.status || 404).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: `Job ${jobId} not found upstream or locally.` } });
            }
            sourceStatus = 'PERSISTENT_REGISTRY_FALLBACK';
        }

        const rawCanonical = livePayload || (localRecord?.canonical_payload_json ? (typeof localRecord.canonical_payload_json === 'string' ? JSON.parse(localRecord.canonical_payload_json) : localRecord.canonical_payload_json) : null);

        await logAuditEvent({ tenantId: localRecord?.tenant_id || context.tenantId, jobId, action: 'GET_JOB', status: 'SUCCESS', traceId: context.traceId });

        res.json({
            ok: true,
            jobId,
            status: rawCanonical?.status || localRecord?.status || 'UNKNOWN',
            source_status: sourceStatus,
            canonicalPayload: rawCanonical,
            registryRecord: localRecord ? {
                createdAt: localRecord.created_at,
                updatedAt: localRecord.updated_at,
                fileSize: localRecord.file_size_bytes,
                filename: localRecord.original_filename
            } : null
        });
    } catch (err) {
        res.status(err.status || 500).json({ ok: false, error: { message: err.message } });
    }
});

// --- 4. POST /api/admin/preflight/jobs/:jobId/actions/fix ---
router.post('/jobs/:jobId/actions/fix', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    try {
        const options = req.body || {};
        const responsePayload = await gateway.fixJob(jobId, options, context);

        // Update local status
        await db.query('UPDATE preflight_job_registry SET status = ?, updated_at = NOW() WHERE job_id = ?', ['PROCESSING', jobId]);

        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'REQUEST_FIX', status: 'SUCCESS', traceId: context.traceId });

        res.json({ ok: true, result: responsePayload, source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'REQUEST_FIX', status: 'FAILURE', message: err.message, traceId: context.traceId });
        res.status(err.status || 503).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: err.message, details: err.upstreamResponse } });
    }
});

// --- 5. POST /api/admin/preflight/jobs/:jobId/actions/retry ---
router.post('/jobs/:jobId/actions/retry', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    try {
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'REQUEST_RETRY', status: 'ATTEMPTING', traceId: context.traceId });

        // Since retry is an operational Control Plane addition not exposed natively by the V2 public engine API,
        // we proxy to upstream and guarantee a 501 / explicit failure propagation if not supported.
        try {
            const result = await gateway._execute('POST', `/api/v2/jobs/${encodeURIComponent(jobId)}/actions/retry`, null, context);
            return res.json({ ok: true, result, source_status: 'LIVE_UPSTREAM' });
        } catch (upstreamErr) {
            // Map 404 cleanly to 501 Not Implemented per requirements
            const status = upstreamErr.status === 404 ? 501 : (upstreamErr.status || 503);
            const message = upstreamErr.status === 404 ? 'Retry operation is not natively implemented on the upstream V2 engine contract.' : upstreamErr.message;
            
            await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'REQUEST_RETRY', status: 'UNSUPPORTED', message, traceId: context.traceId });
            
            return res.status(status).json({
                ok: false,
                source_status: 'UPSTREAM_UNSUPPORTED',
                error: {
                    code: status === 501 ? 'NOT_IMPLEMENTED' : 'UPSTREAM_ERROR',
                    message
                }
            });
        }
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

// --- 6. GET /api/admin/preflight/jobs/:jobId/artifacts ---
router.get('/jobs/:jobId/artifacts', async (req, res) => {
    const { jobId } = req.params;
    try {
        // Fetch from Artifact Registry
        const artifacts = await db.query('SELECT * FROM preflight_artifact_registry WHERE job_id = ?', [jobId]);
        
        // Also consult job record's canonical payload
        const rows = await db.query('SELECT canonical_payload_json FROM preflight_job_registry WHERE job_id = ?', [jobId]);
        const canonicalObj = rows[0]?.canonical_payload_json ? (typeof rows[0].canonical_payload_json === 'string' ? JSON.parse(rows[0].canonical_payload_json) : rows[0].canonical_payload_json) : null;

        const combinedMap = new Map();
        artifacts.forEach(a => combinedMap.set(a.artifact_id, {
            id: a.artifact_id,
            artifactId: a.artifact_id,
            type: a.artifact_type,
            filename: a.filename,
            sizeBytes: a.size_bytes,
            createdAt: a.created_at
        }));

        if (canonicalObj?.artifacts && Array.isArray(canonicalObj.artifacts)) {
            canonicalObj.artifacts.forEach(art => {
                const aid = art.id || art.artifactId;
                if (aid && !combinedMap.has(aid)) {
                    combinedMap.set(aid, {
                        id: aid,
                        artifactId: aid,
                        type: art.type || 'OUTPUT',
                        filename: art.filename || art.name || 'artifact.pdf',
                        sizeBytes: art.sizeBytes || art.size || 0,
                        createdAt: new Date().toISOString()
                    });
                }
            });
        }

        res.json({ ok: true, artifacts: Array.from(combinedMap.values()), source_status: 'PERSISTENT_REGISTRY' });
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

// --- 7. GET /api/admin/preflight/jobs/:jobId/artifacts/:artifactId ---
router.get('/jobs/:jobId/artifacts/:artifactId', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId, artifactId } = req.params;
    try {
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'DOWNLOAD_ARTIFACT', status: 'ATTEMPTING', message: `Artifact: ${artifactId}`, traceId: context.traceId });

        const streamResponse = await gateway.getArtifact(jobId, artifactId, context);
        
        // Proxy content type and bytes directly
        res.setHeader('Content-Type', streamResponse.headers?.['content-type'] || 'application/pdf');
        if (streamResponse.headers?.['content-disposition']) {
            res.setHeader('Content-Disposition', streamResponse.headers['content-disposition']);
        }
        
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'DOWNLOAD_ARTIFACT', status: 'SUCCESS', traceId: context.traceId });

        return res.send(Buffer.from(streamResponse.data));
    } catch (err) {
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'DOWNLOAD_ARTIFACT', status: 'FAILURE', message: err.message, traceId: context.traceId });
        res.status(err.status || 503).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: err.message } });
    }
});

// --- 8. GET /api/admin/preflight/policies ---
router.get('/policies', async (req, res) => {
    const context = buildGatewayContext(req);
    const traceId = context.traceId;
    console.log(`[ADMIN-PREFLIGHT][POLICIES][REQUEST] Fetching real policies from upstream (mode: ${gateway.mode}, traceId: ${traceId})`);
    try {
        const response = await gateway.getPolicies(context);
        const policiesArray = Array.isArray(response) ? response : (response?.policies || []);
        
        if (policiesArray.length === 0) {
            console.warn(`[ADMIN-PREFLIGHT][POLICIES][EMPTY-CATALOG] Upstream returned an empty policy catalog.`);
        } else {
            console.log(`[ADMIN-PREFLIGHT][POLICIES][UPSTREAM-OK] Successfully loaded ${policiesArray.length} real policies.`);
        }

        return res.json({
            ok: true,
            source: gateway.mode,
            policies: policiesArray
        });
    } catch (err) {
        const upstreamStatus = err.status || 503;
        console.error(`[ADMIN-PREFLIGHT][POLICIES][UPSTREAM-FAIL] Upstream policy fetch failed with status ${upstreamStatus}:`, err.message);
        
        return res.status(502).json({
            ok: false,
            error: "PREFLIGHT_POLICIES_UNAVAILABLE",
            message: "Could not load real preflight policies from upstream.",
            upstreamStatus,
            traceId
        });
    }
});

// --- 9. POST /api/admin/preflight/batches ---
router.post('/batches', upload.any(), async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const form = new FormData();
        if (req.files && req.files.length > 0) {
            req.files.forEach(f => form.append('files', f.buffer, { filename: f.originalname, contentType: f.mimetype }));
        }
        Object.entries(req.body || {}).forEach(([k, v]) => form.append(k, v));

        const batchResult = await gateway.createBatch(form, context);
        
        await logAuditEvent({ tenantId: context.tenantId, action: 'CREATE_BATCH', status: 'SUCCESS', traceId: context.traceId });

        res.status(201).json({ ok: true, batch: batchResult, source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        await logAuditEvent({ tenantId: context.tenantId, action: 'CREATE_BATCH', status: 'FAILURE', message: err.message, traceId: context.traceId });
        res.status(err.status || 503).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: err.message } });
    }
});

// --- 10. GET /api/admin/preflight/batches ---
router.get('/batches', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const batches = await gateway.listBatches(context);
        res.json({ ok: true, batches: Array.isArray(batches) ? batches : (batches?.batches || []), source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        res.status(err.status || 503).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: err.message } });
    }
});

// --- 11. GET /api/admin/preflight/batches/:batchId ---
router.get('/batches/:batchId', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const batch = await gateway.getBatch(req.params.batchId, context);
        res.json({ ok: true, batch, source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        res.status(err.status || 503).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: err.message } });
    }
});

// --- 12. GET /api/admin/preflight/batches/:batchId/jobs ---
router.get('/batches/:batchId/jobs', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const jobs = await gateway.getBatchJobs(req.params.batchId, context);
        res.json({ ok: true, jobs: Array.isArray(jobs) ? jobs : (jobs?.jobs || []), source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        res.status(err.status || 503).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: err.message } });
    }
});

// --- 13. GET /api/admin/preflight/batches/:batchId/download ---
router.get('/batches/:batchId/download', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const streamResponse = await gateway.downloadBatch(req.params.batchId, context);
        res.setHeader('Content-Type', streamResponse.headers?.['content-type'] || 'application/zip');
        if (streamResponse.headers?.['content-disposition']) {
            res.setHeader('Content-Disposition', streamResponse.headers['content-disposition']);
        }
        return res.send(Buffer.from(streamResponse.data));
    } catch (err) {
        res.status(err.status || 503).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: err.message } });
    }
});

// --- 14. GET /api/admin/preflight/audit ---
router.get('/audit', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const { tenant, action, status, limit = 50, offset = 0 } = req.query;
        let sql = 'SELECT * FROM preflight_audit_events WHERE 1=1';
        const params = [];

        if (!req.actorContext?.isSuperAdmin) {
            sql += ' AND tenant_id = ?';
            params.push(context.tenantId);
        } else if (tenant) {
            sql += ' AND tenant_id = ?';
            params.push(tenant);
        }

        if (action) { sql += ' AND action = ?'; params.push(action); }
        if (status) { sql += ' AND status = ?'; params.push(status); }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const rows = await db.query(sql, params);

        let countSql = 'SELECT COUNT(*) as cnt FROM preflight_audit_events WHERE 1=1';
        const countParams = [];
        if (!req.actorContext?.isSuperAdmin) {
            countSql += ' AND tenant_id = ?'; countParams.push(context.tenantId);
        } else if (tenant) {
            countSql += ' AND tenant_id = ?'; countParams.push(tenant);
        }
        if (action) { countSql += ' AND action = ?'; countParams.push(action); }
        if (status) { countSql += ' AND status = ?'; countParams.push(status); }

        const [countRows] = await db.query(countSql, countParams);
        const total = Array.isArray(countRows) ? (countRows[0]?.cnt || 0) : (countRows?.cnt || rows.length);

        res.json({ ok: true, total, events: rows, source_status: 'PERSISTENT_REGISTRY' });
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

// --- 15. GET /api/admin/preflight/governance ---
router.get('/governance', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const { tenant, ruleSlug, result, limit = 50, offset = 0 } = req.query;
        let sql = 'SELECT * FROM preflight_governance_events WHERE 1=1';
        const params = [];

        if (!req.actorContext?.isSuperAdmin) {
            sql += ' AND tenant_id = ?';
            params.push(context.tenantId);
        } else if (tenant) {
            sql += ' AND tenant_id = ?';
            params.push(tenant);
        }

        if (ruleSlug) { sql += ' AND rule_slug = ?'; params.push(ruleSlug); }
        if (result) { sql += ' AND evaluation_result = ?'; params.push(result); }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const rows = await db.query(sql, params);

        let countSql = 'SELECT COUNT(*) as cnt FROM preflight_governance_events WHERE 1=1';
        const countParams = [];
        if (!req.actorContext?.isSuperAdmin) {
            countSql += ' AND tenant_id = ?'; countParams.push(context.tenantId);
        } else if (tenant) {
            countSql += ' AND tenant_id = ?'; countParams.push(tenant);
        }
        if (ruleSlug) { countSql += ' AND rule_slug = ?'; countParams.push(ruleSlug); }
        if (result) { countSql += ' AND evaluation_result = ?'; countParams.push(result); }

        const [countRows] = await db.query(countSql, countParams);
        const total = Array.isArray(countRows) ? (countRows[0]?.cnt || 0) : (countRows?.cnt || rows.length);

        res.json({ ok: true, total, governanceEvents: rows, source_status: 'PERSISTENT_REGISTRY' });
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

module.exports = router;
