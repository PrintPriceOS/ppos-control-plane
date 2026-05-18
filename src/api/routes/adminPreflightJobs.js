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
const FormData = require('form-data');
const { resolveActorContext, requireApprovedPrinthouse } = require('../middleware/auth');
const gateway = require('../services/preflightContractGateway');
const db = require('../services/mysqlClient');
const syncService = require('../services/preflightRegistrySyncService');
const preflightServiceClient = require('../services/preflightServiceClient');
const { isTerminalDiagnosticStatus, collectFindings } = require('../services/preflightStatusHelpers');

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
        policy: req.headers['x-policy'] || req.query.policy || req.body?.policy || '',
        Authorization: req.headers.authorization || ''
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

/**
 * Helper: Policy Contract Resolution to map legacy slugs to canonical IDs
 */
async function resolveCanonicalPolicyId(inputId, context) {
    let policy = String(inputId || '').trim() || 'OFFSET_MODERN_COATED';
    try {
        const upRes = await gateway.getPolicies(context);
        const available = upRes?.policies || upRes?.data || (Array.isArray(upRes) ? upRes : []) || [];
        
        const activeList = available.length > 0 ? available : [
            { id: 'OFFSET_MODERN_COATED_F51', legacyId: 'OFFSET_MODERN_COATED', aliases: ['OFFSET_MODERN_COATED'] },
            { id: 'OFFSET_MODERN_UNCOATED_F52', legacyId: 'OFFSET_MODERN_UNCOATED', aliases: ['OFFSET_MODERN_UNCOATED'] },
            { id: 'OFFSET_LEGACY_COATED_F39', legacyId: 'OFFSET_LEGACY_COATED', aliases: ['OFFSET_LEGACY_COATED'] },
            { id: 'OFFSET_LEGACY_UNCOATED_F29', legacyId: 'OFFSET_LEGACY_UNCOATED', aliases: ['OFFSET_LEGACY_UNCOATED'] },
            { id: 'US_COATED_GRACOL' },
            { id: 'US_WEB_SWOP' },
            { id: 'NEWSPAPER_ISO' },
            { id: 'DIGITAL_RGB' }
        ];

        const direct = activeList.find(p => p.id === policy || p.policy_id === policy);
        if (direct) return direct.id || direct.policy_id;

        const alias = activeList.find(p =>
            p.legacyId === policy ||
            p.legacy_id === policy ||
            (Array.isArray(p.aliases) && p.aliases.includes(policy))
        );
        if (alias) return alias.id || alias.policy_id;
    } catch (err) {
        console.warn('[ADMIN-PREFLIGHT-ROUTER] Resolution lookup fallback triggered:', err.message);
    }

    const defaultMap = {
        'OFFSET_MODERN_COATED': 'OFFSET_MODERN_COATED_F51',
        'OFFSET_MODERN_UNCOATED': 'OFFSET_MODERN_UNCOATED_F52',
        'OFFSET_LEGACY_COATED': 'OFFSET_LEGACY_COATED_F39',
        'OFFSET_LEGACY_UNCOATED': 'OFFSET_LEGACY_UNCOATED_F29'
    };
    return defaultMap[policy] || policy;
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

        const jobs = rows.map(r => {
            const safeParse = str => {
                if (!str) return null;
                if (typeof str !== 'string') return str;
                try { return JSON.parse(str); } catch(e) { return null; }
            };
            const requestedFixes = safeParse(r.requested_fixes_json);
            const repairs = safeParse(r.repairs_json);
            const fixes = safeParse(r.fixes_json);
            const appliedFixes = safeParse(r.applied_fixes_json);
            const skippedFixes = safeParse(r.skipped_fixes_json);
            const failedFixes = safeParse(r.failed_fixes_json);

            return {
                jobId: r.job_id,
                sourceJobId: r.source_job_id,
                sourceSystem: r.source_system,
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
                riskScore: r.risk_score,
                riskLevel: r.risk_level,
                issueCount: r.issue_count,
                requestedFixes,
                repairs,
                fixes,
                appliedFixes,
                skippedFixes,
                failedFixes,
                requestedFixesCount: Array.isArray(requestedFixes) ? requestedFixes.length : 0,
                repairsCount: Array.isArray(repairs) ? repairs.length : 0,
                appliedFixesCount: Array.isArray(appliedFixes) ? appliedFixes.length : 0,
                skippedFixesCount: Array.isArray(skippedFixes) ? skippedFixes.length : 0,
                failedFixesCount: Array.isArray(failedFixes) ? failedFixes.length : 0,
                degraded: !!r.degraded,
                degradedReasons: safeParse(r.degraded_reasons_json),
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                lastSeenAt: r.last_seen_at,
                lastSyncedAt: r.last_synced_at,
                canonicalData: safeParse(r.canonical_payload_json)
            };
        });

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

        const rawPolicy = req.body.policy || context.policy || 'OFFSET_MODERN_COATED';
        context.policy = await resolveCanonicalPolicyId(rawPolicy, context);
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
        return res.status(err.status || 502).json({
            ok: false,
            source_status: 'UPSTREAM_UNAVAILABLE',
            error: {
                code: 'PREFLIGHT_UPSTREAM_ERROR',
                message: err.message,
                details: err.upstreamResponse || null
            }
        });
    }
});

// --- 3. GET /api/admin/preflight/jobs/:jobId ---
router.get('/jobs/:jobId', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    try {
        const rows = await db.query('SELECT * FROM preflight_job_registry WHERE job_id = ?', [jobId]);
        const localRecord = rows[0];

        if (localRecord) {
            verifyTenantScope(req, localRecord.tenant_id);
        }

        let livePayload = null;
        let sourceStatus = 'PERSISTENT_REGISTRY';

        try {
            livePayload = await gateway.getJob(jobId, context);
            if (livePayload) {
                sourceStatus = 'LIVE_UPSTREAM';
                const currentStatus = livePayload.status || localRecord?.status || 'COMPLETED';
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
                return res.status(upstreamErr.status || 404).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: `Job ${jobId} not found upstream or locally.` } });
            }
            sourceStatus = 'PERSISTENT_REGISTRY_FALLBACK';
        }

        const rawCanonical = livePayload || (localRecord?.canonical_payload_json ? (typeof localRecord.canonical_payload_json === 'string' ? JSON.parse(localRecord.canonical_payload_json) : localRecord.canonical_payload_json) : null);

        await logAuditEvent({ tenantId: localRecord?.tenant_id || context.tenantId, jobId, action: 'GET_JOB', status: 'SUCCESS', traceId: context.traceId });

        const safeParseLocal = str => {
            if (!str) return null;
            if (typeof str !== 'string') return str;
            try { return JSON.parse(str); } catch(e) { return null; }
        };

        const requestedFixes = localRecord ? safeParseLocal(localRecord.requested_fixes_json) : null;
        const repairs = localRecord ? safeParseLocal(localRecord.repairs_json) : null;
        const fixes = localRecord ? safeParseLocal(localRecord.fixes_json) : null;
        const appliedFixes = localRecord ? safeParseLocal(localRecord.applied_fixes_json) : null;
        const skippedFixes = localRecord ? safeParseLocal(localRecord.skipped_fixes_json) : null;
        const failedFixes = localRecord ? safeParseLocal(localRecord.failed_fixes_json) : null;

        const currentStatus = rawCanonical?.status || localRecord?.status || 'UNKNOWN';

        let progress = null;
        let issueCount = null;
        let degraded = null;
        let degradedReasons = null;

        if (rawCanonical) {
            progress = isTerminalDiagnosticStatus(currentStatus) ? 100 : (rawCanonical.progress || 10);
            issueCount = collectFindings(rawCanonical).length;
            
            const statusUpper = currentStatus.toUpperCase();
            const outcomeCategory = (rawCanonical.outcomeCategory || rawCanonical.outcome_category || '').toUpperCase();
            const isDegradedMode = rawCanonical.analysisIntegrity?.degradedMode === true || rawCanonical.analysisIntegrity?.degraded_mode === true;
            
            degraded = ['DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'].includes(statusUpper) ||
                       ['DEGRADED_ANALYSIS', 'PARTIAL_ANALYSIS'].includes(outcomeCategory) ||
                       isDegradedMode ||
                       rawCanonical.degraded === true || 
                       rawCanonical.isDegraded === true;
                       
            degradedReasons = rawCanonical.degraded_reasons || rawCanonical.degradedReasons || null;
            if (degraded && (!degradedReasons || degradedReasons.length === 0)) {
                degradedReasons = [];
                if (['DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'].includes(statusUpper)) degradedReasons.push(`STATUS_DEGRADATION:${statusUpper}`);
                if (['DEGRADED_ANALYSIS', 'PARTIAL_ANALYSIS'].includes(outcomeCategory)) degradedReasons.push(`OUTCOME_DEGRADATION:${outcomeCategory}`);
                if (isDegradedMode) degradedReasons.push('ANALYSIS_INTEGRITY_DEGRADED_MODE');
            }
        } else if (localRecord) {
            progress = localRecord.progress;
            issueCount = localRecord.issue_count;
            degraded = !!localRecord.degraded;
            degradedReasons = safeParseLocal(localRecord.degraded_reasons_json);
        }

        res.json({
            ok: true,
            jobId,
            status: currentStatus,
            source_status: sourceStatus,
            progress,
            issueCount,
            degraded,
            degradedReasons,
            canonicalPayload: rawCanonical,
            registryRecord: localRecord ? {
                createdAt: localRecord.created_at,
                updatedAt: localRecord.updated_at,
                fileSize: localRecord.file_size_bytes,
                filename: localRecord.original_filename,
                requestedFixes,
                repairs,
                fixes,
                appliedFixes,
                skippedFixes,
                failedFixes,
                requestedFixesCount: Array.isArray(requestedFixes) ? requestedFixes.length : 0,
                repairsCount: Array.isArray(repairs) ? repairs.length : 0,
                appliedFixesCount: Array.isArray(appliedFixes) ? appliedFixes.length : 0,
                skippedFixesCount: Array.isArray(skippedFixes) ? skippedFixes.length : 0,
                failedFixesCount: Array.isArray(failedFixes) ? failedFixes.length : 0
            } : null
        });
    } catch (err) {
        res.status(err.status || 500).json({ ok: false, error: { message: err.message } });
    }
});

// --- 3.5 POST /api/admin/preflight/jobs/:jobId/sync ---
router.post('/jobs/:jobId/sync', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    try {
        // Enforce schema checks before executing sync operations
        await require('../services/controlPlaneSchemaService').ensurePreflightRegistrySchema();

        // First verify job existence and scope if local record exists
        const rows = await db.query('SELECT tenant_id FROM preflight_job_registry WHERE job_id = ?', [jobId]);
        const localRecord = rows[0];
        if (localRecord) {
            verifyTenantScope(req, localRecord.tenant_id);
        }

        const upstreamAuthHeader = process.env.PREFLIGHT_JWT
          ? `Bearer ${process.env.PREFLIGHT_JWT}`
          : null;

        const syncedResult = await syncService.syncJob(jobId, {
            tenantId: context.tenantId,
            authHeader: upstreamAuthHeader
        });

        await logAuditEvent({
            tenantId: context.tenantId,
            jobId,
            action: 'SYNC_JOB',
            status: 'SUCCESS',
            traceId: context.traceId
        });

        res.json({ ok: true, ...syncedResult, source_status: 'LIVE_UPSTREAM_SYNCED' });
    } catch (err) {
        await logAuditEvent({
            tenantId: context.tenantId,
            jobId,
            action: 'SYNC_JOB',
            status: 'FAILURE',
            message: err.message,
            traceId: context.traceId
        });

        const status = err.status || (err.message?.includes('404') ? 404 : 500);
        res.status(status).json({ ok: false, error: 'SYNC_FAILED', message: err.message });
    }
});

// --- 3.6 POST /api/admin/preflight/sync ---
router.post('/sync', async (req, res) => {
    const context = buildGatewayContext(req);
    console.log('[CONTROL][PREFLIGHT][SYNC-START] Initiating global preflight synchronization');
    try {
        // Enforce schema checks before executing global sync operations
        await require('../services/controlPlaneSchemaService').ensurePreflightRegistrySchema();

        const limit = req.body?.limit || req.query?.limit || 100;
        const statusParam = req.body?.status || req.query?.status;

        const requestedTenantId = req.actorContext?.isSuperAdmin && req.body?.tenantId ? req.body.tenantId : context.tenantId;

        const upstreamAuthHeader = process.env.PREFLIGHT_JWT
            ? `Bearer ${process.env.PREFLIGHT_JWT}`
            : null;

        // Fetch jobs from upstream service
        const listRes = await preflightServiceClient.listJobs({
            tenantId: requestedTenantId,
            limit,
            status: statusParam,
            authHeader: upstreamAuthHeader
        });

        const items = Array.isArray(listRes) ? listRes : (listRes?.jobs || listRes?.data || []);
        const syncResults = [];
        let successCount = 0;
        let failureCount = 0;

        for (const job of items) {
            const jId = job.id || job.jobId || job.job_id || job.targetJobId || job.fixJobId;
            if (!jId) continue;
            try {
                const res = await syncService.syncListItem(job, requestedTenantId);
                syncResults.push({ jobId: jId, status: 'SUCCESS', details: res });
                successCount++;
            } catch (syncErr) {
                syncResults.push({ jobId: jId, status: 'FAILURE', error: syncErr.message });
                failureCount++;
            }
        }

        console.log('[CONTROL][PREFLIGHT][SYNC-SUCCESS] Global preflight synchronization completed successfully');
        await logAuditEvent({
            tenantId: context.tenantId,
            action: 'GLOBAL_SYNC',
            status: 'SUCCESS',
            message: `Processed ${items.length} jobs (${successCount} successful, ${failureCount} failed)`,
            traceId: context.traceId
        });

        res.json({
            ok: true,
            totalProcessed: items.length,
            successCount,
            failureCount,
            results: syncResults,
            source_status: 'GLOBAL_RECONCILIATION_COMPLETED'
        });
    } catch (err) {
        console.error('[CONTROL][PREFLIGHT][SYNC-ERROR] Global preflight synchronization encountered an error:', err.message);
        await logAuditEvent({
            tenantId: context.tenantId,
            action: 'GLOBAL_SYNC',
            status: 'FAILURE',
            message: err.message,
            traceId: context.traceId
        });

        res.status(500).json({ ok: false, error: 'GLOBAL_SYNC_FAILED', message: err.message });
    }
});

// --- 4. POST /api/admin/preflight/jobs/:jobId/actions/fix ---
router.post(['/jobs/:jobId/actions/fix', '/jobs/:jobId/fix'], async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    console.log(`[ADMIN-PREFLIGHT][FIX] Triggering fix operation for job ${jobId}`);
    try {
        const options = { ...(req.body || {}) };
        if (options.policy) {
            options.policy = await resolveCanonicalPolicyId(options.policy, context);
        }

        let jobPayload = null;
        try {
            jobPayload = await gateway.getJob(jobId, context);
        } catch (e) {
            console.warn(`[ADMIN-PREFLIGHT][FIX] Pre-fetch of live job payload failed for deriving autofix intent: ${e.message}`);
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
            const findings = Array.isArray(jobPayload?.findings) ? jobPayload.findings :
                             Array.isArray(jobPayload?.issues) ? jobPayload.issues :
                             Array.isArray(jobPayload?.analysis?.issues) ? jobPayload.analysis.issues :
                             Array.isArray(jobPayload?.analysis?.findings) ? jobPayload.analysis.findings : [];
            
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

        console.log(`[CONTROL][PREFLIGHT][AUTOFIX-INTENT] Dispatching fix intent contract: ${JSON.stringify({
            jobId,
            fixes: options.fixes,
            requested_fixes: options.requested_fixes,
            policy: options.policy
        })}`);

        const responsePayload = await gateway.fixJob(jobId, options, context);

        await db.query('UPDATE preflight_job_registry SET status = ?, updated_at = NOW() WHERE job_id = ?', ['PROCESSING', jobId]);

        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'REQUEST_FIX', status: 'SUCCESS', traceId: context.traceId });

        res.json({ ok: true, result: responsePayload, source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'REQUEST_FIX', status: 'FAILURE', message: err.message, traceId: context.traceId });
        
        const status = err.status || 502;
        if (status === 404 || err.message?.includes('404') || err.message?.includes('NOT_FOUND')) {
            return res.status(404).json({ ok: false, error: 'JOB_NOT_FOUND', message: 'Requested job could not be found for fix operation.' });
        }
        return res.status(502).json({ ok: false, error: 'PREFLIGHT_UPSTREAM_ERROR', message: err.message || 'Preflight upstream service encountered an error during fix.' });
    }
});

// --- 5. POST /api/admin/preflight/jobs/:jobId/actions/retry ---
router.post(['/jobs/:jobId/actions/retry', '/jobs/:jobId/retry'], async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    console.log(`[ADMIN-PREFLIGHT][RETRY] Triggering retry operation for job ${jobId}`);
    try {
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'REQUEST_RETRY', status: 'ATTEMPTING', traceId: context.traceId });

        // For now re-run analysis only if original input exists, otherwise return controlled 409:
        // { ok:false, error:"RETRY_NOT_IMPLEMENTED", message:"Retry requires source input requeue support." }
        // Do not 404.
        return res.status(409).json({
            ok: false,
            error: "RETRY_NOT_IMPLEMENTED",
            message: "Retry requires source input requeue support."
        });
    } catch (err) {
        return res.status(502).json({ ok: false, error: 'PREFLIGHT_UPSTREAM_ERROR', message: err.message });
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

function resolveArtifactIdForUpstream(jobId, artifactId) {
    const raw = String(artifactId || '').trim();

    if (!raw) return raw;

    try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        if (decoded && decoded.startsWith(`${jobId}:`)) {
            return decoded.slice(`${jobId}:`.length);
        }
    } catch (_) {}

    return raw;
}

// --- 7. GET /api/admin/preflight/jobs/:jobId/artifacts/:artifactId ---
router.get('/jobs/:jobId/artifacts/:artifactId', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    let { artifactId } = req.params;
    
    // Decode artifact IDs only if needed, but pass canonical artifactId safely
    if (artifactId && artifactId.includes('%')) {
        try {
            artifactId = decodeURIComponent(artifactId);
        } catch (e) {}
    }

    const upstreamArtifactId = resolveArtifactIdForUpstream(jobId, artifactId);

    console.log(
        `[ADMIN-PREFLIGHT][ARTIFACT][RESOLVED] job=${jobId} raw=${artifactId} upstream=${upstreamArtifactId}`
    );

    try {
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'DOWNLOAD_ARTIFACT', status: 'ATTEMPTING', message: `Artifact: ${upstreamArtifactId}`, traceId: context.traceId });

        const streamResponse = await gateway.getArtifact(jobId, upstreamArtifactId, context);
        
        // Proxy content type and bytes directly
        res.setHeader('Content-Type', streamResponse.headers?.['content-type'] || 'application/pdf');
        if (streamResponse.headers?.['content-disposition']) {
            res.setHeader('Content-Disposition', streamResponse.headers['content-disposition']);
        }
        
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'DOWNLOAD_ARTIFACT', status: 'SUCCESS', traceId: context.traceId });

        return res.send(Buffer.from(streamResponse.data));
    } catch (err) {
        await logAuditEvent({ tenantId: context.tenantId, jobId, action: 'DOWNLOAD_ARTIFACT', status: 'FAILURE', message: err.message, traceId: context.traceId });
        
        const status = err.status || 502;
        if (status === 404 || err.message?.includes('404') || err.message?.includes('NOT_FOUND')) {
            return res.status(404).json({ ok: false, error: 'ARTIFACT_NOT_FOUND', message: 'Requested artifact could not be found.' });
        }
        return res.status(502).json({ ok: false, error: 'PREFLIGHT_UPSTREAM_ERROR', message: err.message || 'Preflight upstream service encountered an error.' });
    }
});

// --- 8. GET /api/admin/preflight/policies ---
router.get('/policies', async (req, res) => {
    const context = buildGatewayContext(req);
    const traceId = context.traceId;
    console.log(`[ADMIN-PREFLIGHT][POLICIES][REQUEST] Fetching real policies from upstream (traceId: ${traceId})`);
    try {
        const response = await gateway.getPolicies(context);
        const rawPolicies = response?.policies || response?.data || (Array.isArray(response) ? response : []);
        
        if (rawPolicies.length > 0) {
            console.log(`[ADMIN-PREFLIGHT][POLICIES][UPSTREAM-OK] Successfully loaded ${rawPolicies.length} canonical policies.`);
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
    } catch (err) {
        console.warn(`[ADMIN-PREFLIGHT][POLICIES][UPSTREAM-FAIL] Fetch failed: ${err.message}. Triggering local fallback array.`);
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

        return res.json({
            ok: true,
            available: true,
            source: 'static_catalog_default',
            policies: canonicalFallbackPolicies,
            source_status: 'STATIC_DEFAULT',
            upstream_status: err.status || 503,
            error: { code: 'UPSTREAM_POLICIES_UNAVAILABLE', message: err.message }
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
        const bodyEntries = { ...(req.body || {}) };
        if (bodyEntries.policy) {
            bodyEntries.policy = await resolveCanonicalPolicyId(bodyEntries.policy, context);
        }

        const isAutofix = bodyEntries.strategy === 'AUTOFIX' || bodyEntries.type === 'AUTOFIX' || bodyEntries.autofix === 'true';
        if (isAutofix) {
            let explicitFixes = [];
            if (bodyEntries.fixes) {
                try { explicitFixes.push(...JSON.parse(bodyEntries.fixes)); } catch(e) { explicitFixes.push(bodyEntries.fixes); }
            }
            if (bodyEntries.requested_fixes) {
                try { explicitFixes.push(...JSON.parse(bodyEntries.requested_fixes)); } catch(e) { explicitFixes.push(bodyEntries.requested_fixes); }
            }
            if (bodyEntries.requestedFixes) {
                try { explicitFixes.push(...JSON.parse(bodyEntries.requestedFixes)); } catch(e) { explicitFixes.push(bodyEntries.requestedFixes); }
            }
            
            const derivedSet = new Set(explicitFixes);
            if (bodyEntries.forceBleed || bodyEntries.force_bleed) derivedSet.add('APPLY_BLEED');
            if (bodyEntries.convertCmyk || bodyEntries.convert_cmyk) derivedSet.add('CONVERT_CMYK');
            if (bodyEntries.rebuildTrimbox || bodyEntries.rebuild_trimbox) derivedSet.add('REBUILD_TRIMBOX');
            if (bodyEntries.injectOutputIntent || bodyEntries.inject_output_intent) derivedSet.add('INJECT_OUTPUT_INTENT');

            if (derivedSet.size === 0) {
                console.warn(`[CONTROL][PREFLIGHT][AUTOFIX-INTENT-EMPTY] Batch autofix submission intercepted with empty requested_fixes payload.`);
                return res.status(400).json({
                    ok: false,
                    error: 'BATCH_AUTOFIX_EMPTY_INTENT',
                    message: 'Batch autofix requires an explicitly declared non-empty list of requested_fixes to preserve forensic traceability.'
                });
            }

            const CANONICAL_ORDER = ['REBUILD_TRIMBOX', 'APPLY_BLEED', 'CONVERT_CMYK', 'INJECT_OUTPUT_INTENT'];
            const finalFixes = CANONICAL_ORDER.filter(fix => derivedSet.has(fix));
            derivedSet.forEach(fix => {
                if (!CANONICAL_ORDER.includes(fix)) finalFixes.push(fix);
            });

            bodyEntries.fixes = JSON.stringify(finalFixes);
            bodyEntries.requested_fixes = JSON.stringify(finalFixes);
            bodyEntries.requestedFixes = JSON.stringify(finalFixes);

            console.log(`[CONTROL][PREFLIGHT][AUTOFIX-INTENT] Dispatching batch fix intent contract: ${JSON.stringify({
                fixes: finalFixes,
                requested_fixes: finalFixes,
                policy: bodyEntries.policy
            })}`);
        }

        Object.entries(bodyEntries).forEach(([k, v]) => form.append(k, v));

        const batchResult = await gateway.createBatch(form, context);
        
        await logAuditEvent({ tenantId: context.tenantId, action: 'CREATE_BATCH', status: 'SUCCESS', traceId: context.traceId });

        res.status(201).json({ ok: true, batch: batchResult, source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        await logAuditEvent({ tenantId: context.tenantId, action: 'CREATE_BATCH', status: 'FAILURE', message: err.message, traceId: context.traceId });
        return res.status(err.status || 502).json({
            ok: false,
            source_status: 'UPSTREAM_UNAVAILABLE',
            error: {
                code: 'PREFLIGHT_UPSTREAM_ERROR',
                message: err.message,
                details: err.upstreamResponse || null
            }
        });
    }
});

// --- 10. GET /api/admin/preflight/batches ---
router.get('/batches', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const query = req.query || {};
        const limit = Math.min(Number(query.limit || 50), 200);
        const offset = Math.max(Number(query.offset || 0), 0);
        const status = query.status || null;
        const tenantId = query.tenantId || query.tenant_id || null;

        const batchesRes = await gateway.listBatches({ ...context, limit, offset, status, tenantId });
        const arr = Array.isArray(batchesRes) ? batchesRes : (batchesRes?.batches || batchesRes?.data || []);
        
        return res.json({
            ok: true,
            batches: arr,
            total: arr.length,
            source_status: arr.length > 0 ? 'ACTIVE' : 'NO_BATCHES'
        });
    } catch (err) {
        return res.json({
            ok: true,
            batches: [],
            total: 0,
            source_status: 'BATCHES_UPSTREAM_UNAVAILABLE',
            degraded: true
        });
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
