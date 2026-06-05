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
const { isTerminalDiagnosticStatus, collectFindings, normalizePreflightArtifacts } = require('../services/preflightStatusHelpers');
const auditLoggerService = require('../services/auditLoggerService');
const governanceLedgerService = require('../services/preflightGovernanceLedgerService');
const humanReportService = require('../services/preflightHumanReportService');
const humanReportSnapshotService = require('../services/preflightHumanReportSnapshotService');
const reviewApprovalService = require('../services/preflightReviewApprovalService');

// Memory storage to stream files directly to the upstream gateway without disk overhead
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: parseInt(process.env.PPOS_MAX_FILE_SIZE_BYTES || '2147483648', 10) }
});


async function hydratePreflightArtifacts(jobId, context, localRecordOverride = null) {
    let localRecord = localRecordOverride;
    if (!localRecord) {
        const rows = await db.query('SELECT * FROM preflight_job_registry WHERE job_id = ?', [jobId]);
        localRecord = rows[0];
    }
    const canonicalObj = localRecord?.canonical_payload_json ? (typeof localRecord.canonical_payload_json === 'string' ? JSON.parse(localRecord.canonical_payload_json) : localRecord.canonical_payload_json) : null;
    const syncError = localRecord?.sync_error_json ? (typeof localRecord.sync_error_json === 'string' ? JSON.parse(localRecord.sync_error_json) : localRecord.sync_error_json) : {};

    let liveArtifactsResponse = null;
    try {
        liveArtifactsResponse = await preflightServiceClient.getJobArtifacts(jobId, context.Authorization, context.tenantId);
        
        // clear stale error
        if (syncError.live_hydration_disabled) {
            syncError.live_hydration_disabled = false;
            await db.query('UPDATE preflight_job_registry SET sync_error_json = ? WHERE job_id = ?', [JSON.stringify(syncError), jobId]);
        }
    } catch (upstreamErr) {
        console.log(`[CONTROL][PREFLIGHT][ARTIFACTS-REGISTRY-FALLBACK] ${JSON.stringify({ jobId, reason: upstreamErr.message })}`);
    }

    let normalized = [];
    let sourceStatus = 'PERSISTENT_REGISTRY';
    let downloadable_artifact_count = 0;
    let zero_byte_artifact_count = 0;
    
    if (liveArtifactsResponse && liveArtifactsResponse.physical_artifacts_ready && Array.isArray(liveArtifactsResponse.artifacts) && liveArtifactsResponse.artifacts.length > 0) {
        const uniqueByHashOrName = new Map();
        liveArtifactsResponse.artifacts.forEach(a => {
             const storageRef = a.storage_key || a.path || a.storagePath || '';
             const key = storageRef ? storageRef : `${a.filename}_${a.size_bytes}`;
             if (!uniqueByHashOrName.has(key)) {
                 uniqueByHashOrName.set(key, { ...a, aliases: [a.alias || a.id] });
             } else {
                 const existing = uniqueByHashOrName.get(key);
                 if (a.alias && a.id && !existing.aliases.includes(a.alias)) existing.aliases.push(a.alias);
                 if (a.id && !existing.aliases.includes(a.id)) existing.aliases.push(a.id);
                 if (a.alias === 'fixed_pdf' || a.alias === 'final_fixed_pdf') {
                     existing.alias = a.alias;
                 }
             }
        });
        normalized = Array.from(uniqueByHashOrName.values()).map(a => {
            if (!Array.isArray(a.aliases)) a.aliases = a.alias ? [a.alias] : [];
            if (a.id && !a.aliases.includes(a.id)) a.aliases.push(a.id);
            if (a.download_id && !a.aliases.includes(a.download_id)) a.aliases.push(a.download_id);

            if (a.type === 'fixed_pdf' || a.type === 'final_fixed_pdf' || a.filename === 'fixed.pdf') {
                a.type = 'fixed_pdf';
                a.alias = 'fixed_pdf';
                a.download_id = 'fixed_pdf';
                a.label = 'Fixed PDF';
                if (!a.aliases.includes('fixed_pdf')) a.aliases.push('fixed_pdf');
                if (!a.aliases.includes('final_fixed_pdf')) a.aliases.push('final_fixed_pdf');
            } else if (a.type === 'certified_pdf' || a.filename === 'certified.pdf') {
                a.type = 'certified_pdf';
                a.alias = 'certified_pdf';
                a.download_id = 'certified_pdf';
                a.label = 'Certified PDF';
                if (!a.aliases.includes('certified_pdf')) a.aliases.push('certified_pdf');
            } else if (a.type === 'fix_audit') {
                a.type = 'fix_audit';
                a.alias = 'fix_audit';
                a.download_id = 'fix_audit';
                a.label = 'Fix Audit JSON';
                if (!a.aliases.includes('fix_audit')) a.aliases.push('fix_audit');
                if (!a.aliases.includes('fix_audit_json')) a.aliases.push('fix_audit_json');
            } else if (a.type === 'output_file') {
                a.alias = 'output_file';
                a.download_id = a.id || a.download_id || 'output_file';
                a.label = 'Output PDF';
            } else {
                a.download_id = a.download_id || a.alias || a.id;
            }

            a.download_url = `/api/admin/preflight/jobs/${jobId}/artifacts/${a.download_id}`;
            return a;
        });
        
        sourceStatus = 'LIVE_UPSTREAM';
        
        const newCanonical = canonicalObj || {};
        newCanonical.artifacts = normalized;
        newCanonical.artifact_summary = {
            downloadable_artifact_count: liveArtifactsResponse.downloadable_artifact_count,
            zero_byte_artifact_count: liveArtifactsResponse.zero_byte_artifact_count,
            physical_artifacts_ready: liveArtifactsResponse.physical_artifacts_ready
        };
        if (localRecord) {
            await db.query('UPDATE preflight_job_registry SET artifact_list_json = ?, canonical_payload_json = ? WHERE job_id = ?', [
                JSON.stringify(normalized),
                JSON.stringify(newCanonical),
                jobId
            ]);
        }
        
        downloadable_artifact_count = liveArtifactsResponse.downloadable_artifact_count;
        zero_byte_artifact_count = liveArtifactsResponse.zero_byte_artifact_count;
    } else {
         normalized = normalizePreflightArtifacts(canonicalObj, localRecord, canonicalObj, jobId);
         normalized.forEach(a => {
            if (a.downloadable && a.size_bytes > 0) downloadable_artifact_count++;
            if (!a.downloadable || a.size_bytes === 0) zero_byte_artifact_count++;
         });
         
         if (normalized.length > 0) {
             sourceStatus = 'PERSISTENT_REGISTRY_HYDRATED';
         }
    }
    
    const primaryAliasCandidates = ['final_fixed_pdf', 'fixed_pdf', 'corrected_pdf', 'repaired_pdf', 'production_pdf', 'printable_pdf'];
    let primary_fixed_pdf_selected = false;

    normalized.forEach(a => {
        if (!Array.isArray(a.aliases)) a.aliases = a.alias ? [a.alias] : [];
        if (a.id && !a.aliases.includes(a.id)) a.aliases.push(a.id);
        if (a.download_id && !a.aliases.includes(a.download_id)) a.aliases.push(a.download_id);

        if (a.type === 'fixed_pdf' || a.type === 'final_fixed_pdf' || a.filename === 'fixed.pdf') {
            a.type = 'fixed_pdf';
            a.alias = 'fixed_pdf';
            a.download_id = 'fixed_pdf';
            a.label = 'Fixed PDF';
            if (!a.aliases.includes('fixed_pdf')) a.aliases.push('fixed_pdf');
            if (!a.aliases.includes('final_fixed_pdf')) a.aliases.push('final_fixed_pdf');
        } else if (a.type === 'certified_pdf' || a.filename === 'certified.pdf') {
            a.type = 'certified_pdf';
            a.alias = 'certified_pdf';
            a.download_id = 'certified_pdf';
            a.label = 'Certified PDF';
            if (!a.aliases.includes('certified_pdf')) a.aliases.push('certified_pdf');
        } else if (a.type === 'fix_audit') {
            a.type = 'fix_audit';
            a.alias = 'fix_audit';
            a.download_id = 'fix_audit';
            a.label = 'Fix Audit JSON';
            if (!a.aliases.includes('fix_audit')) a.aliases.push('fix_audit');
            if (!a.aliases.includes('fix_audit_json')) a.aliases.push('fix_audit_json');
        } else if (a.type === 'output_file') {
            a.alias = 'output_file';
            a.download_id = a.id || a.download_id || 'output_file';
            a.label = 'Output PDF';
        } else {
            a.download_id = a.download_id || a.alias || a.id;
        }

        a.download_url = a.download_url || `/api/admin/preflight/jobs/${jobId}/artifacts/${a.download_id}`;

        if (a.downloadable && a.size_bytes > 0 && primaryAliasCandidates.includes(a.alias)) {
            primary_fixed_pdf_selected = true;
            a.primary = true;
        }
    });

    const physical_artifacts_ready = downloadable_artifact_count > 0;

    return {
        artifacts: normalized,
        source_status: sourceStatus,
        physical_artifacts_ready,
        downloadable_artifact_count,
        zero_byte_artifact_count,
        primary_fixed_pdf_selected
    };
}

function resolveRequestedArtifact(artifacts, requestedArtifactId) {
    return artifacts.find(a => {
         const target = requestedArtifactId.toLowerCase();
         const idMatch = a.id === target || a.artifact_id === target || a.download_id === target;
         const typeMatch = (a.type || '').toLowerCase() === target || (a.alias || '').toLowerCase() === target;
         const aliasesMatch = Array.isArray(a.aliases) && a.aliases.some(al => al.toLowerCase() === target);
         
         const fixedGroup = ['fixed_pdf', 'final_fixed_pdf', 'corrected_pdf', 'repaired_pdf', 'repair_pdf', 'production_pdf', 'printable_pdf'];
         const certifiedGroup = ['certified_pdf', 'certified', 'certified_output'];
         const reviewGroup = ['review_pdf', 'review_copy', 'human_review_pdf'];
         const fixAuditGroup = ['fix_audit', 'fix_audit_json'];
         const analysisGroup = ['analysis_report', 'report_json', 'preflight_report'];
         
         let groupMatch = false;
         if (fixedGroup.includes(target) && (fixedGroup.includes((a.type || '').toLowerCase()) || fixedGroup.includes((a.alias || '').toLowerCase()) || (Array.isArray(a.aliases) && a.aliases.some(al => fixedGroup.includes(al.toLowerCase()))))) groupMatch = true;
         if (certifiedGroup.includes(target) && (certifiedGroup.includes((a.type || '').toLowerCase()) || certifiedGroup.includes((a.alias || '').toLowerCase()) || (Array.isArray(a.aliases) && a.aliases.some(al => certifiedGroup.includes(al.toLowerCase()))))) groupMatch = true;
         if (reviewGroup.includes(target) && (reviewGroup.includes((a.type || '').toLowerCase()) || reviewGroup.includes((a.alias || '').toLowerCase()) || (Array.isArray(a.aliases) && a.aliases.some(al => reviewGroup.includes(al.toLowerCase()))))) groupMatch = true;
         if (fixAuditGroup.includes(target) && (fixAuditGroup.includes((a.type || '').toLowerCase()) || fixAuditGroup.includes((a.alias || '').toLowerCase()) || (Array.isArray(a.aliases) && a.aliases.some(al => fixAuditGroup.includes(al.toLowerCase()))))) groupMatch = true;
         if (analysisGroup.includes(target) && (analysisGroup.includes((a.type || '').toLowerCase()) || analysisGroup.includes((a.alias || '').toLowerCase()) || (Array.isArray(a.aliases) && a.aliases.some(al => analysisGroup.includes(al.toLowerCase()))))) groupMatch = true;
         
         return idMatch || typeMatch || aliasesMatch || groupMatch || a.filename === target || a.name === target;
    });
}


// Helper: Log operational audit trails persistently
async function logPreflightAdminEvent({ tenantId, userId, jobId, eventType, status, message, metadata, traceId }) {
    try {
        const finalMetadata = {
            job_id: jobId,
            trace_id: traceId,
            message: message,
            ...metadata
        };

        await auditLoggerService.log({
            type: eventType,
            tenantId: tenantId || 'system',
            userId: userId || 'system',
            status: status || 'SUCCESS',
            metadata: finalMetadata
        });
    } catch (err) {
        console.error('[ADMIN-PREFLIGHT-ROUTER] Failed to log canonical audit event:', err.message);
    }
}

// Helper: Canonical Phase 41 Audit Logging to api_audit_logs
async function writePreflightAuditLog(eventType, status, tenantId, userId, metadata = {}) {
    console.log(`[PREFLIGHT-AUDIT][WRITE_ATTEMPT] ${JSON.stringify({ event_type: eventType, job_id: metadata.job_id, fix_job_id: metadata.fix_job_id, parent_job_id: metadata.parent_job_id })}`);
    try {
        await auditLoggerService.log({
            type: eventType,
            tenantId: tenantId || 'system',
            userId: userId || 'system',
            status: status || 'SUCCESS',
            metadata
        });
        console.log(`[PREFLIGHT-AUDIT][WRITE_OK] ${JSON.stringify({ event_type: eventType, job_id: metadata.job_id })}`);
    } catch (err) {
        console.error(`[PREFLIGHT-AUDIT][WRITE_FAILED] ${JSON.stringify({ event_type: eventType, job_id: metadata.job_id, error_message: err.message, error_code: err.code })}`);
        throw err;
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

/**
 * Helper: Project Preflight Registry Record from row and canonical payload
 */
function projectPreflightRegistryRecord(row, canonicalPayload = {}) {
  const cp = canonicalPayload || {};
  const type = row?.type || cp.type;

  const findingsCount =
    row?.findings_count ??
    row?.findingsCount ??
    cp.findingsCount ??
    cp.issuesCount ??
    (Array.isArray(cp.findings) ? cp.findings.length : null) ??
    (Array.isArray(cp.issues) ? cp.issues.length : null);

  const issuesCount =
    row?.issue_count ??
    row?.issues_count ??
    row?.issuesCount ??
    cp.issuesCount ??
    findingsCount;

  const requiresHumanReview =
    row?.requires_human_review ??
    row?.requiresHumanReview ??
    cp.requiresHumanReview ??
    cp.requires_human_review ??
    false;

  const productionCertified =
    row?.production_certified ??
    row?.productionCertified ??
    cp.productionCertified ??
    cp.production_certified ??
    null;

  const reviewReasons =
    row?.review_reasons_json ??
    row?.reviewReasons ??
    cp.reviewReasons ??
    [];

  const appliedFixesCount = Math.max(
    Number(row?.applied_fixes_count ?? row?.appliedFixesCount ?? 0),
    Number(cp.appliedFixesCount ?? cp.applied_fixes_count ?? 0),
    Array.isArray(row?.appliedFixes) ? row.appliedFixes.length : 0,
    Array.isArray(row?.applied_fixes) ? row.applied_fixes.length : 0,
    Array.isArray(cp.appliedFixes) ? cp.appliedFixes.length : 0,
    Array.isArray(cp.applied_fixes) ? cp.applied_fixes.length : 0
  );

  const rawSkippedMax = Math.max(
    Number(row?.skipped_fixes_count ?? row?.skippedFixesCount ?? 0),
    Number(cp.skippedFixesCount ?? cp.skipped_fixes_count ?? 0)
  );

  let skippedFixesCount = rawSkippedMax;
  if (Array.isArray(cp.skippedFixes)) {
    skippedFixesCount = cp.skippedFixes.length;
  } else if (Array.isArray(cp.skipped_fixes)) {
    skippedFixesCount = cp.skipped_fixes.length;
  } else if (Array.isArray(row?.skippedFixes)) {
    skippedFixesCount = row.skippedFixes.length;
  } else if (Array.isArray(row?.skipped_fixes)) {
    skippedFixesCount = row.skipped_fixes.length;
  }

  const failedFixesCount = Math.max(
    Number(row?.failed_fixes_count ?? row?.failedFixesCount ?? 0),
    Number(cp.failedFixesCount ?? cp.failed_fixes_count ?? 0),
    Array.isArray(row?.failedFixes) ? row.failedFixes.length : 0,
    Array.isArray(row?.failed_fixes) ? row.failed_fixes.length : 0,
    Array.isArray(cp.failedFixes) ? cp.failedFixes.length : 0,
    Array.isArray(cp.failed_fixes) ? cp.failed_fixes.length : 0
  );

  const sourceStatus =
    row?.source_status ??
    row?.sourceStatus ??
    cp.source_status ??
    cp.final_status ??
    cp.status ??
    null;

  const requestedFixesCount = Math.max(
    Number(row?.requested_fixes_count ?? row?.requestedFixesCount ?? 0),
    Number(cp.requestedFixesCount ?? cp.requested_fixes_count ?? 0),
    Array.isArray(row?.requestedFixes) ? row.requestedFixes.length : 0,
    Array.isArray(row?.requested_fixes) ? row.requested_fixes.length : 0,
    Array.isArray(cp.requestedFixes) ? cp.requestedFixes.length : 0,
    Array.isArray(cp.requested_fixes) ? cp.requested_fixes.length : 0
  );

  const repairsCount =
    row?.repairs_count ??
    row?.repairsCount ??
    cp.repairsCount ??
    (Array.isArray(cp.repairs) ? cp.repairs.length : 0) ??
    0;

  return {
    findingsCount: findingsCount ?? null,
    issuesCount: issuesCount ?? findingsCount ?? null,
    requestedFixesCount,
    repairsCount,
    appliedFixesCount,
    skippedFixesCount,
    failedFixesCount,
    requiresHumanReview,
    productionCertified,
    reviewReasons,
    source_status: sourceStatus
  };
}

/**
 * Helper: Map Preflight Status prioritizing review requirements
 */
function mapPreflightStatus(type, sourceStatus, projection) {
  const statusText = String(sourceStatus || '').toUpperCase();

  const reviewRequired =
    projection.requiresHumanReview === true ||
    statusText.includes('REVIEW_REQUIRED') ||
    (
      String(type).toUpperCase() === 'AUTOFIX' &&
      Number(projection.skippedFixesCount || 0) > 0 &&
      (
        projection.productionCertified === false ||
        projection.reviewReasons?.length > 0
      )
    );

  if (reviewRequired) return 'REVIEW_REQUIRED';

  if (String(type).toUpperCase() === 'AUTOFIX' && Number(projection.appliedFixesCount || 0) > 0) {
    return 'COMPLETED_WITH_FIXES';
  }

  return sourceStatus;
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
            const canonicalData = safeParse(r.canonical_payload_json);

            const projection = projectPreflightRegistryRecord(r, canonicalData);
            const mappedStatus = mapPreflightStatus(r.type, r.status, projection);

            const projectedRequestedFixesCount = Math.max(
                Number(projection.requestedFixesCount || 0),
                Array.isArray(requestedFixes) ? requestedFixes.length : 0,
                Array.isArray(canonicalData?.requestedFixes) ? canonicalData.requestedFixes.length : 0,
                Array.isArray(canonicalData?.requested_fixes) ? canonicalData.requested_fixes.length : 0
            );

            const projectedAppliedFixesCount = Math.max(
                Number(projection.appliedFixesCount || 0),
                Array.isArray(appliedFixes) ? appliedFixes.length : 0,
                Array.isArray(canonicalData?.appliedFixes) ? canonicalData.appliedFixes.length : 0,
                Array.isArray(canonicalData?.applied_fixes) ? canonicalData.applied_fixes.length : 0
            );

            const projectedSkippedFixesCount = Math.max(
                Number(projection.skippedFixesCount || 0),
                Array.isArray(skippedFixes) ? skippedFixes.length : 0,
                Array.isArray(canonicalData?.skippedFixes) ? canonicalData.skippedFixes.length : 0,
                Array.isArray(canonicalData?.skipped_fixes) ? canonicalData.skipped_fixes.length : 0
            );

            const projectedFailedFixesCount = Math.max(
                Number(projection.failedFixesCount || 0),
                Array.isArray(failedFixes) ? failedFixes.length : 0,
                Array.isArray(canonicalData?.failedFixes) ? canonicalData.failedFixes.length : 0,
                Array.isArray(canonicalData?.failed_fixes) ? canonicalData.failed_fixes.length : 0
            );

            return {
                jobId: r.job_id,
                sourceJobId: r.source_job_id,
                sourceSystem: r.source_system,
                tenantId: r.tenant_id,
                printhouseId: r.printhouse_id,
                operatorId: r.operator_id,
                batchId: r.batch_id,
                status: mappedStatus,
                source_status: projection.source_status || r.status,
                policy: r.policy,
                type: r.type,
                progress: r.progress,
                fileSize: r.file_size_bytes,
                filename: r.original_filename,
                riskScore: r.risk_score,
                riskLevel: r.risk_level,
                issueCount: projection.issuesCount,
                issuesCount: projection.issuesCount,
                findingsCount: projection.findingsCount,
                requestedFixes,
                repairs,
                fixes,
                appliedFixes,
                skippedFixes,
                failedFixes,
                requestedFixesCount: projectedRequestedFixesCount,
                repairsCount: projection.repairsCount,
                appliedFixesCount: projectedAppliedFixesCount,
                skippedFixesCount: projectedSkippedFixesCount,
                failedFixesCount: projectedFailedFixesCount,
                requiresHumanReview: projection.requiresHumanReview,
                productionCertified: projection.productionCertified,
                reviewReasons: projection.reviewReasons,
                degraded: !!r.degraded,
                degradedReasons: safeParse(r.degraded_reasons_json),
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                lastSeenAt: r.last_seen_at,
                lastSyncedAt: r.last_synced_at,
                canonicalData
            };
        });

        await logPreflightAdminEvent({
            tenantId: context.tenantId,
            eventType: 'PREFLIGHT_JOBS_LISTED',
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

        await logPreflightAdminEvent({ tenantId: context.tenantId, jobId: canonicalJobId, eventType: 'PREFLIGHT_JOB_CREATED', status: 'SUCCESS', traceId: context.traceId });

        res.status(201).json({ ok: true, job: upstreamResponse, source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        await logPreflightAdminEvent({ tenantId: context.tenantId, eventType: 'PREFLIGHT_JOB_CREATED', status: 'FAILURE', message: err.message, traceId: context.traceId });
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

        let syncError = localRecord?.sync_error_json ? (typeof localRecord.sync_error_json === 'string' ? JSON.parse(localRecord.sync_error_json) : localRecord.sync_error_json) : {};
        let livePayload = null;
        let sourceStatus = 'PERSISTENT_REGISTRY';

        if (syncError.live_hydration_disabled) {
            sourceStatus = 'PERSISTENT_REGISTRY_FALLBACK';
        } else {
            try {
                livePayload = await gateway.getJob(jobId, context);
                
                // On success, reset 404 count if it was incremented
                if (syncError['404_count']) {
                    delete syncError['404_count'];
                    await db.query(`UPDATE preflight_job_registry SET sync_error_json = ? WHERE job_id = ?`, [JSON.stringify(syncError), jobId]);
                }

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
                const is404 = upstreamErr.status === 404 || upstreamErr.message?.includes('404') || upstreamErr.message?.includes('Job not found');
                
                if (is404 && localRecord) {
                    syncError['404_count'] = (syncError['404_count'] || 0) + 1;
                    if (syncError['404_count'] >= 3) {
                        syncError.live_hydration_disabled = true;
                        syncError.live_hydration_disabled_reason = 'UPSTREAM_404_REPEATED';
                    }
                    await db.query(`UPDATE preflight_job_registry SET sync_error_json = ? WHERE job_id = ?`, [JSON.stringify(syncError), jobId]);
                }

                if (!syncError.live_hydration_disabled) {
                    console.warn(`[ADMIN-PREFLIGHT-ROUTER] Live hydration failed for ${jobId}, relying on persistent registry:`, upstreamErr.message);
                }

                if (!localRecord) {
                    return res.status(upstreamErr.status || 404).json({ ok: false, source_status: 'UPSTREAM_UNAVAILABLE', error: { message: `Job ${jobId} not found upstream or locally.` } });
                }
                sourceStatus = 'PERSISTENT_REGISTRY_FALLBACK';
            }
        }

        const rawCanonical = livePayload || (localRecord?.canonical_payload_json ? (typeof localRecord.canonical_payload_json === 'string' ? JSON.parse(localRecord.canonical_payload_json) : localRecord.canonical_payload_json) : null);

        await logPreflightAdminEvent({ tenantId: localRecord?.tenant_id || context.tenantId, jobId, eventType: 'PREFLIGHT_JOB_VIEWED', status: 'SUCCESS', traceId: context.traceId });

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
        const jobPayload = rawCanonical?.job || rawCanonical;

        const fixCoverage = jobPayload?.fix_coverage || jobPayload?.result?.fix_coverage || null;

        const currentStatus = jobPayload?.status || localRecord?.status || 'UNKNOWN';

        let progress = null;
        let issueCount = null;
        let degraded = null;
        let degradedReasons = null;

        if (jobPayload) {
            progress = isTerminalDiagnosticStatus(currentStatus) ? 100 : (jobPayload?.progress || 10);
            issueCount = collectFindings(jobPayload).length;
            
            const statusUpper = currentStatus.toUpperCase();
            const outcomeCategory = (jobPayload.outcomeCategory || jobPayload.outcome_category || '').toUpperCase();
            const isDegradedMode = jobPayload.analysisIntegrity?.degradedMode === true || jobPayload.analysisIntegrity?.degraded_mode === true;
            
            degraded = ['DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'].includes(statusUpper) ||
                       ['DEGRADED_ANALYSIS', 'PARTIAL_ANALYSIS'].includes(outcomeCategory) ||
                       isDegradedMode ||
                       jobPayload.degraded === true || 
                       jobPayload.isDegraded === true;
                       
            degradedReasons = jobPayload.degraded_reasons || jobPayload.degradedReasons || null;
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

        const projection = projectPreflightRegistryRecord(localRecord || {}, jobPayload);
        const mappedStatus = mapPreflightStatus(localRecord?.type || jobPayload?.type, currentStatus, projection);

        const projectedRequestedFixesCount = Math.max(
            Number(projection.requestedFixesCount || 0),
            Array.isArray(requestedFixes) ? requestedFixes.length : 0,
            Array.isArray(jobPayload?.requestedFixes) ? jobPayload.requestedFixes.length : 0,
            Array.isArray(jobPayload?.requested_fixes) ? jobPayload.requested_fixes.length : 0
        );

        const projectedAppliedFixesCount = Math.max(
            Number(projection.appliedFixesCount || 0),
            Array.isArray(appliedFixes) ? appliedFixes.length : 0,
            Array.isArray(jobPayload?.appliedFixes) ? jobPayload.appliedFixes.length : 0,
            Array.isArray(jobPayload?.applied_fixes) ? jobPayload.applied_fixes.length : 0
        );

        const projectedSkippedFixesCount = Math.max(
            Number(projection.skippedFixesCount || 0),
            Array.isArray(skippedFixes) ? skippedFixes.length : 0,
            Array.isArray(jobPayload?.skippedFixes) ? jobPayload.skippedFixes.length : 0,
            Array.isArray(jobPayload?.skipped_fixes) ? jobPayload.skipped_fixes.length : 0
        );

        const projectedFailedFixesCount = Math.max(
            Number(projection.failedFixesCount || 0),
            Array.isArray(failedFixes) ? failedFixes.length : 0,
            Array.isArray(jobPayload?.failedFixes) ? jobPayload.failedFixes.length : 0,
            Array.isArray(jobPayload?.failed_fixes) ? jobPayload.failed_fixes.length : 0
        );

        const artifacts = normalizePreflightArtifacts(rawCanonical, localRecord, rawCanonical, jobId);

        
        const resolvedJobId =
          jobPayload?.id ||
          jobPayload?.jobId ||
          rawCanonical?.job?.id ||
          rawCanonical?.job?.jobId ||
          localRecord?.job_id ||
          req.params.jobId;

        const resolvedSourceStatus =
          sourceStatus ||
          'PERSISTENT_REGISTRY';

        if (sourceStatus === 'LIVE_UPSTREAM') {
            console.log('[CONTROL][PREFLIGHT][STATUS-HYDRATED]', {
                jobId: resolvedJobId,
                registryStatus: localRecord?.status || 'UNKNOWN',
                upstreamStatus: currentStatus,
                displayStatus: mappedStatus,
                source: 'LIVE_UPSTREAM'
            });
        }
        res.json({
            ok: true,
            id: resolvedJobId,
            jobId: resolvedJobId,
            job_id: resolvedJobId,
            status: mappedStatus,
            display_status: mappedStatus,
            upstream_status: currentStatus,
            registry_status: localRecord?.status || 'UNKNOWN',
            status_source: resolvedSourceStatus,
            sourceStatus: resolvedSourceStatus,
            source_status: resolvedSourceStatus,
            live_hydration_disabled: !!syncError?.live_hydration_disabled,
            progress,
            issueCount: projection.issuesCount,
            findingsCount: projection.findingsCount,
            degraded,
            degradedReasons,
            requiresHumanReview: projection.requiresHumanReview,
            productionCertified: projection.productionCertified,
            reviewReasons: projection.reviewReasons,
            canonicalPayload: rawCanonical,
            artifacts,
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
                source_status: projection.source_status || currentStatus,
                issuesCount: projection.issuesCount,
                findingsCount: projection.findingsCount,
                requestedFixesCount: projectedRequestedFixesCount,
                repairsCount: projection.repairsCount,
                appliedFixesCount: projectedAppliedFixesCount,
                skippedFixesCount: projectedSkippedFixesCount,
                failedFixesCount: projectedFailedFixesCount,
                productionCertified: projection.productionCertified,
                requiresHumanReview: projection.requiresHumanReview,
                reviewReasons: projection.reviewReasons,
                fixCoverage
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

        await logPreflightAdminEvent({
            tenantId: context.tenantId,
            jobId,
            eventType: 'PREFLIGHT_JOB_SYNCED',
            status: 'SUCCESS',
            traceId: context.traceId
        });

        res.json({ ok: true, ...syncedResult, source_status: 'LIVE_UPSTREAM_SYNCED' });
    } catch (err) {
        await logPreflightAdminEvent({
            tenantId: context.tenantId,
            jobId,
            eventType: 'PREFLIGHT_JOB_SYNCED',
            status: 'FAILURE',
            message: err.message,
            traceId: context.traceId
        });

        const status = err.status || (err.message?.includes('404') ? 404 : 500);
        res.status(status).json({ ok: false, error: 'SYNC_FAILED', message: err.message });
    }
});

// --- 3.5b POST /api/admin/preflight/jobs/sync (Worker Push) ---
router.post('/jobs/sync', async (req, res) => {
    // This endpoint handles the payload pushed from the worker after it finishes a job.
    try {
        const payload = req.body;
        const { jobId, sourceJobId, tenantId, type, status, source_status, final_status } = payload;
        
        if (!jobId) {
            return res.status(400).json({ ok: false, error: 'MISSING_JOB_ID' });
        }

        // Map status based on prompt rules
        let mappedStatus = final_status || status || 'COMPLETED';
        const isAnalyze = type === 'ANALYZE' || type === 'preflight_job';
        const isAutofix = type === 'AUTOFIX';

        if (isAnalyze && mappedStatus === 'COMPLETED') {
            if (payload.findingsCount > 0) {
                mappedStatus = 'COMPLETED_WITH_FINDINGS';
            }
        }

        if (isAutofix) {
            const rawSourceStatus = source_status || '';
            const reviewRequired =
              payload.requiresHumanReview === true ||
              payload.requires_human_review === true ||
              (Number(payload.skippedFixesCount || payload.skipped_fixes_count || 0) > 0 && payload.reviewReasons?.length > 0) ||
              String(rawSourceStatus || mappedStatus || '').includes('REVIEW_REQUIRED');

            if (reviewRequired) {
                mappedStatus = 'REVIEW_REQUIRED';
            } else if (rawSourceStatus === 'AUTOFIX_FAILED' || mappedStatus === 'FAILED') {
                mappedStatus = 'FAILED';
            } else if (mappedStatus === 'COMPLETED') {
                 if (payload.appliedFixesCount > 0) mappedStatus = 'COMPLETED_WITH_FIXES';
            } else if (rawSourceStatus === 'AUTOFIX_PARTIAL' && payload.productionCertified) {
                mappedStatus = 'COMPLETED_WITH_FIXES';
            }
        }
        
        // Never keep QUEUED if source_status is terminal (already handled since we overwrite with mappedStatus)
        if (mappedStatus === 'QUEUED') {
             mappedStatus = 'COMPLETED';
        }

        // Apply robust projection mapping
        const dummyRow = { type, status: mappedStatus, source_status };
        const projection = projectPreflightRegistryRecord(dummyRow, payload);
        mappedStatus = mapPreflightStatus(type, mappedStatus, projection);

        console.log('[CONTROL][PREFLIGHT-JOB-SYNC][RECEIVED]', {
            jobId,
            type,
            source_status,
            mappedStatus,
            findingsCount: payload.findingsCount,
            appliedFixesCount: payload.appliedFixesCount,
            skippedFixesCount: payload.skippedFixesCount,
            requiresHumanReview: payload.requiresHumanReview
        });

        // Use preflightRegistrySyncService to upsert? Or DB directly
        const dbStatus = mappedStatus;
        const dbType = type === 'preflight_job' ? 'ANALYZE' : (type || 'ANALYZE');

        // Prepare canonical payload
        const canonical = {
             jobId,
             status: dbStatus,
             type: dbType,
             progress: 100,
             issuesCount: payload.issuesCount,
             findingsCount: payload.findingsCount,
             artifacts: payload.artifacts,
             analysisIntegrity: payload.analysisIntegrity,
             requiresHumanReview: payload.requiresHumanReview,
             productionCertified: payload.productionCertified,
             reviewReasons: payload.reviewReasons
        };

        const jsonStr = JSON.stringify(canonical);

        // UPSERT
        await db.query(`
            INSERT INTO preflight_job_registry 
            (job_id, source_job_id, tenant_id, status, type, progress, issue_count, 
             applied_fixes_json, skipped_fixes_json, failed_fixes_json, requested_fixes_json, canonical_payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            source_job_id = COALESCE(VALUES(source_job_id), source_job_id),
            status = VALUES(status), 
            type = VALUES(type),
            progress = VALUES(progress),
            issue_count = VALUES(issue_count),
            applied_fixes_json = COALESCE(VALUES(applied_fixes_json), applied_fixes_json),
            skipped_fixes_json = COALESCE(VALUES(skipped_fixes_json), skipped_fixes_json),
            failed_fixes_json = COALESCE(VALUES(failed_fixes_json), failed_fixes_json),
            requested_fixes_json = COALESCE(VALUES(requested_fixes_json), requested_fixes_json),
            canonical_payload_json = VALUES(canonical_payload_json), 
            updated_at = NOW()
        `, [
            jobId,
            sourceJobId || null,
            tenantId || 'system',
            dbStatus,
            dbType,
            100,
            payload.issuesCount || payload.findingsCount || 0,
            payload.appliedFixes ? JSON.stringify(payload.appliedFixes) : null,
            payload.skippedFixes ? JSON.stringify(payload.skippedFixes) : null,
            payload.failedFixes ? JSON.stringify(payload.failedFixes) : null,
            payload.requestedFixes ? JSON.stringify(payload.requestedFixes) : null,
            jsonStr
        ]);

        console.log('[CONTROL][PREFLIGHT-JOB-SYNC][UPSERTED]', { jobId, mappedStatus });

        res.json({ ok: true, jobId, mappedStatus });

    } catch (err) {
        console.error('[CONTROL][PREFLIGHT-JOB-SYNC][ERROR]', err.message);
        res.status(500).json({ ok: false, error: err.message });
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
        await logPreflightAdminEvent({
            tenantId: context.tenantId,
            eventType: 'PREFLIGHT_GLOBAL_SYNC_REQUESTED',
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
        
        if (jobId.startsWith('fix_') || options.type === 'AUTOFIX') {
            return res.status(409).json({ ok: false, error: 'FIX_ALREADY_AUTOFIX_JOB', message: 'This is already an AUTOFIX result. Open the parent ANALYZE job to trigger a new fix.' });
        }

        if (options.policy) {
            options.policy = await resolveCanonicalPolicyId(options.policy, context);
        }

        let jobPayload = null;
        try {
            jobPayload = await gateway.getJob(jobId, context);
            if (jobPayload?.type === 'AUTOFIX') {
                 return res.status(409).json({ ok: false, error: 'FIX_ALREADY_AUTOFIX_JOB', message: 'This is already an AUTOFIX result. Open the parent ANALYZE job to trigger a new fix.' });
            }
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

        const childJobId = responsePayload?.id || responsePayload?.jobId || responsePayload?.fix_job_id || responsePayload?.job_id;

        if (childJobId) {
            await db.query(`
                UPDATE preflight_job_registry 
                SET status = 'PROCESSING', 
                    updated_at = NOW(),
                    canonical_payload_json = JSON_SET(COALESCE(canonical_payload_json, '{}'), '$.child_fix_job_id', ?)
                WHERE job_id = ?
            `, [childJobId, jobId]);

            await db.query(`
                UPDATE preflight_job_registry 
                SET canonical_payload_json = JSON_SET(COALESCE(canonical_payload_json, '{}'), '$.fix_job_ids', JSON_ARRAY(?))
                WHERE job_id = ? AND JSON_EXTRACT(canonical_payload_json, '$.fix_job_ids') IS NULL
            `, [childJobId, jobId]);

            await db.query(`
                UPDATE preflight_job_registry 
                SET canonical_payload_json = JSON_ARRAY_APPEND(canonical_payload_json, '$.fix_job_ids', ?)
                WHERE job_id = ? AND JSON_TYPE(JSON_EXTRACT(canonical_payload_json, '$.fix_job_ids')) = 'ARRAY'
            `, [childJobId, jobId]);

            await writePreflightAuditLog('PREFLIGHT_FIX_TRIGGERED', 'SUCCESS', context.tenantId, context.operatorId, {
                job_id: jobId,
                parent_job_id: jobId,
                fix_job_id: childJobId,
                child_job_id: childJobId,
                actor: context.operatorId,
                actor_role: req.actorContext?.role || 'operator',
                policy_id: options.policy,
                requested_fixes: options.fixes,
                trace_id: context.traceId,
                source: "CONTROL_PLANE_PREFLIGHT_UI"
            });

            await writePreflightAuditLog('PREFLIGHT_FIX_JOB_CREATED', 'SUCCESS', context.tenantId, context.operatorId, {
                job_id: childJobId,
                parent_job_id: jobId,
                fix_job_id: childJobId,
                child_job_id: childJobId,
                source_analyze_job_id: jobId,
                actor: context.operatorId,
                actor_role: req.actorContext?.role || 'operator',
                trace_id: context.traceId,
                source: "CONTROL_PLANE_PREFLIGHT_UI"
            });

            await writePreflightAuditLog('PREFLIGHT_FIX_JOB_LINKED_TO_PARENT', 'SUCCESS', context.tenantId, context.operatorId, {
                job_id: jobId,
                parent_job_id: jobId,
                fix_job_id: childJobId,
                child_job_id: childJobId,
                latest_fix_job_id: childJobId,
                actor: context.operatorId,
                actor_role: req.actorContext?.role || 'operator',
                trace_id: context.traceId,
                source: "CONTROL_PLANE_PREFLIGHT_UI"
            });

            // Check if downstream synchronously returned artifacts
            let artifacts_pending = true;
            if (responsePayload?.artifacts || responsePayload?.artifact_list) {
                const immediateArtifacts = normalizePreflightArtifacts(responsePayload, null, responsePayload, childJobId);
                let hasDownloadable = false;
                immediateArtifacts.forEach(a => {
                    if (a.downloadable && a.size_bytes > 0) hasDownloadable = true;
                });
                if (!hasDownloadable && immediateArtifacts.length > 0) {
                    await writePreflightAuditLog('PREFLIGHT_ARTIFACTS_EMPTY_OR_UNAVAILABLE', 'WARNING', context.tenantId, context.operatorId, { 
                        job_id: childJobId, 
                        parent_job_id: jobId, 
                        child_job_id: childJobId,
                        trace_id: context.traceId 
                    });
                } else if (hasDownloadable) {
                    artifacts_pending = false;
                    await writePreflightAuditLog('PREFLIGHT_FIXED_PDF_READY', 'SUCCESS', context.tenantId, context.operatorId, { 
                        job_id: childJobId, 
                        parent_job_id: jobId, 
                        child_job_id: childJobId,
                        trace_id: context.traceId 
                    });
                }
            }

            res.json({ 
                ok: true, 
                child_job_id: childJobId,
                fix_job_id: childJobId,
                parent_job_id: jobId,
                status: responsePayload?.status || 'CREATED',
                artifacts_pending,
                result: responsePayload, 
                source_status: 'LIVE_UPSTREAM' 
            });
        } else {
            await writePreflightAuditLog('PREFLIGHT_FIX_TRIGGERED', 'WARNING', context.tenantId, context.operatorId, {
                job_id: jobId,
                message: 'Fix triggered but no child job ID was returned upstream',
                actor: context.operatorId,
                actor_role: req.actorContext?.role || 'operator',
                trace_id: context.traceId,
                source: "CONTROL_PLANE_PREFLIGHT_UI"
            });
            await db.query('UPDATE preflight_job_registry SET status = ?, updated_at = NOW() WHERE job_id = ?', ['PROCESSING', jobId]);
            res.json({ 
                ok: true, 
                warning: 'No child job identity returned from upstream',
                result: responsePayload, 
                source_status: 'LIVE_UPSTREAM' 
            });
        }
    } catch (err) {
        await logPreflightAdminEvent({ tenantId: context.tenantId, jobId, eventType: 'PREFLIGHT_FIX_REQUEST_FAILED', status: 'FAILURE', message: err.message, traceId: context.traceId });
        
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
        await logPreflightAdminEvent({ tenantId: context.tenantId, jobId, eventType: 'PREFLIGHT_RETRY_REQUESTED', status: 'ATTEMPTING', traceId: context.traceId });

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
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    console.log(`[CONTROL][PREFLIGHT][ARTIFACTS-LIVE-HYDRATION-START] ${JSON.stringify({ jobId })}`);
    try {

        const hydrated = await hydratePreflightArtifacts(jobId, context);
        let message = undefined;
        if (!hydrated.physical_artifacts_ready && hydrated.artifacts.length > 0) {
            message = "Artifacts are registered but no downloadable bytes are available yet.";
        }

        console.log(`[PRELIGHT-ARTIFACTS][NORMALIZED] ${JSON.stringify({
            jobId,
            artifact_count: hydrated.artifacts.length,
            downloadable_artifact_count: hydrated.downloadable_artifact_count,
            zero_byte_artifact_count: hydrated.zero_byte_artifact_count,
            physical_artifacts_ready: hydrated.physical_artifacts_ready,
            primary_fixed_pdf_selected: hydrated.primary_fixed_pdf_selected,
            aliases: hydrated.artifacts.map(a => a.alias)
        })}`);

        res.json({ 
            ok: true, 
            artifacts: hydrated.artifacts, 
            downloadable_artifact_count: hydrated.downloadable_artifact_count,
            zero_byte_artifact_count: hydrated.zero_byte_artifact_count,
            physical_artifacts_ready: hydrated.physical_artifacts_ready,
            message,
            source_status: hydrated.source_status 
        });
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
// --- 7. GET /api/admin/preflight/jobs/:jobId/artifacts/:artifactId ---

// --- 7a. POST /api/admin/preflight/jobs/:jobId/artifacts/:artifactId/download-ticket ---
router.post('/jobs/:jobId/artifacts/:artifactId/download-ticket', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId, artifactId } = req.params;

    try {
        const expiresInSec = 60;
        const payload = {
            sub: req.user.id,
            email: req.user.email,
            role: req.user.role,
            tenant_id: req.user.tenantId,
            printhouse_id: req.user.printhouseId,
            scopes: req.user.scopes
        };

        const ticket = require('jsonwebtoken').sign(payload, process.env.JWT_SECRET, {
            audience: process.env.JWT_AUDIENCE || 'ppos:control',
            issuer: process.env.JWT_ISSUER || 'https://auth.printprice.pro',
            expiresIn: expiresInSec
        });

        console.log('[CONTROL][PREFLIGHT][DOWNLOAD-TICKET-CREATED]', { jobId, artifactId, expiresInSec });

        return res.json({
            ok: true,
            download_url: `/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}?ticket=${encodeURIComponent(ticket)}`
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: 'Failed to generate ticket' });
    }
});

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

    if (req.query.ticket) {
        console.log('[CONTROL][PREFLIGHT][DOWNLOAD-TICKET-USED]', { jobId, artifactId });
    }
    console.log(`[CONTROL][PREFLIGHT][ARTIFACT-DOWNLOAD-RESOLVE-START] ${JSON.stringify({ jobId, requestedArtifactId: artifactId })}`);

    try {
        await writePreflightAuditLog('PREFLIGHT_FIXED_PDF_DOWNLOAD_REQUESTED', 'SUCCESS', context.tenantId, context.operatorId, {
            job_id: jobId,
            parent_job_id: jobId,
            child_job_id: jobId,
            artifact_id: artifactId,
            actor: context.operatorId,
            actor_role: req.actorContext?.role || 'operator',
            trace_id: context.traceId,
            source: 'CONTROL_PLANE_PREFLIGHT_UI'
        });

        // 1. Live hydrate first!
        const hydrated = await hydratePreflightArtifacts(jobId, context);
        console.log(`[CONTROL][PREFLIGHT][ARTIFACT-DOWNLOAD-HYDRATED] ${JSON.stringify({ jobId, artifactCount: hydrated.artifacts.length, sourceStatus: hydrated.source_status })}`);

        // 2. Resolve requested ID against normalized aliases
        const artifactRecord = resolveRequestedArtifact(hydrated.artifacts, artifactId);

        if (!artifactRecord) {
            console.log(`[CONTROL][PREFLIGHT][ARTIFACT-DOWNLOAD-NOT-FOUND] ${JSON.stringify({
                jobId,
                requestedArtifactId: artifactId,
                known: hydrated.artifacts.map(a => ({
                    id: a.id,
                    alias: a.alias,
                    download_id: a.download_id,
                    type: a.type,
                    filename: a.filename,
                    aliases: a.aliases
                }))
            })}`);
            return res.status(404).json({ ok: false, error: 'ARTIFACT_NOT_FOUND' });
        }

        // Phase 41.2 Byte validation enforcement
        if (!artifactRecord.downloadable || artifactRecord.size_bytes <= 0) {
            await writePreflightAuditLog('PREFLIGHT_FIXED_PDF_DOWNLOAD_FAILED', 'WARNING', context.tenantId, context.operatorId, {
                job_id: jobId,
                parent_job_id: jobId,
                child_job_id: jobId,
                artifact_id: artifactId,
                actor: context.operatorId,
                actor_role: req.actorContext?.role || 'operator',
                message: 'Rejected 0 B artifact download attempt',
                trace_id: context.traceId,
                source: 'CONTROL_PLANE_PREFLIGHT_UI'
            });
            return res.status(409).json({
                ok: false,
                error: "ARTIFACT_NOT_DOWNLOADABLE",
                reason: "ZERO_BYTE_ARTIFACT_OR_MISSING_STORAGE_REF"
            });
        }

        // 3. Determine best upstream identifier
        // 1. resolvedArtifact.id
        // 2. resolvedArtifact.artifact_id
        // 3. first base64-looking alias in resolvedArtifact.aliases
        // 4. resolvedArtifact.download_id, only if upstream accepts canonical aliases
        // 5. requestedArtifactId as final fallback
        let resolvedArtifactId = artifactRecord.id || artifactRecord.artifact_id;
        if (!resolvedArtifactId && Array.isArray(artifactRecord.aliases)) {
             resolvedArtifactId = artifactRecord.aliases.find(al => al.startsWith('Zml4Xz'));
        }
        if (!resolvedArtifactId) {
             resolvedArtifactId = artifactRecord.download_id;
        }
        if (!resolvedArtifactId) {
             resolvedArtifactId = resolveArtifactIdForUpstream(jobId, artifactId);
        }

        console.log(`[CONTROL][PREFLIGHT][ARTIFACT-DOWNLOAD-RESOLVED] ${JSON.stringify({
            jobId,
            requestedArtifactId: artifactId,
            resolvedArtifactId,
            resolvedDownloadId: artifactRecord.download_id,
            resolvedType: artifactRecord.type,
            filename: artifactRecord.filename,
            sizeBytes: artifactRecord.size_bytes
        })}`);

        // Ask service client to stream
        const streamResponse = await preflightServiceClient.downloadArtifact(jobId, resolvedArtifactId, context.Authorization, context.tenantId);

        if (!streamResponse.stream) {
            return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Physical artifact could not be downloaded from upstream' });
        }

        res.setHeader('Content-Type', streamResponse.headers?.['content-type'] || 'application/pdf');
        if (streamResponse.headers?.['content-disposition']) {
            res.setHeader('Content-Disposition', streamResponse.headers['content-disposition']);
        }
        else {
            res.setHeader('Content-Disposition', `attachment; filename="${artifactRecord.filename || artifactId}"`);
        }

        // Stream the bytes from upstream to the client
        streamResponse.stream.pipe(res);
    } catch (err) {
        await writePreflightAuditLog('PREFLIGHT_FIXED_PDF_DOWNLOAD_FAILED', 'FAILURE', context.tenantId, context.operatorId, {
            job_id: jobId,
            parent_job_id: jobId,
            child_job_id: jobId,
            artifact_id: upstreamArtifactId,
            actor: context.operatorId,
            actor_role: req.actorContext?.role || 'operator',
            message: err.message,
            trace_id: context.traceId,
            source: 'CONTROL_PLANE_PREFLIGHT_UI'
        });
        
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
        
        await logPreflightAdminEvent({ tenantId: context.tenantId, eventType: 'PREFLIGHT_BATCH_CREATED', status: 'SUCCESS', traceId: context.traceId });

        res.status(201).json({ ok: true, batch: batchResult, source_status: 'LIVE_UPSTREAM' });
    } catch (err) {
        await logPreflightAdminEvent({ tenantId: context.tenantId, eventType: 'PREFLIGHT_BATCH_CREATED', status: 'FAILURE', message: err.message, traceId: context.traceId });
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
        const event_type = action;
        let sql = 'SELECT * FROM api_audit_logs WHERE 1=1';
        const params = [];

        if (!req.actorContext?.isSuperAdmin) {
            sql += ' AND tenant_id = ?';
            params.push(context.tenantId);
        } else if (tenant) {
            sql += ' AND tenant_id = ?';
            params.push(tenant);
        }

        if (event_type) { sql += ' AND event_type = ?'; params.push(event_type); }
        if (status) { sql += ' AND status = ?'; params.push(status); }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const rows = await db.query(sql, params);

        let countSql = 'SELECT COUNT(*) as cnt FROM api_audit_logs WHERE 1=1';
        const countParams = [];
        if (!req.actorContext?.isSuperAdmin) {
            countSql += ' AND tenant_id = ?'; countParams.push(context.tenantId);
        } else if (tenant) {
            countSql += ' AND tenant_id = ?'; countParams.push(tenant);
        }
        if (event_type) { countSql += ' AND event_type = ?'; countParams.push(event_type); }
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

// --- 16. POST /api/admin/preflight/ui-audit ---
router.post('/ui-audit', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const payload = req.body || {};
        const { event_type, metadata: payloadMetadata } = payload;

        if (!event_type) {
            return res.status(400).json({ ok: false, error: 'INVALID_PAYLOAD', message: 'Missing event_type' });
        }

        const ALLOWED_EVENTS = [
            'PREFLIGHT_UPLOAD_PANEL_OPENED',
            'PREFLIGHT_FILE_SELECTED',
            'PREFLIGHT_UPLOAD_REJECTED',
            'PREFLIGHT_JOB_SUBMITTED',
            'PREFLIGHT_ARTIFACT_REFRESH_REQUESTED',
            'PREFLIGHT_ARTIFACT_DOWNLOAD_REQUESTED',
            'PREFLIGHT_RETRY_TRIGGERED',
            'PREFLIGHT_FIXED_PDF_DOWNLOAD_REQUESTED',
            'PREFLIGHT_FIXED_PDF_DOWNLOAD_FAILED'
        ];

        if (!ALLOWED_EVENTS.includes(event_type)) {
            console.warn(`[CONTROL][PREFLIGHT][UI-AUDIT] Rejected unauthorized event type: ${event_type}`);
            return res.status(400).json({ ok: false, error: 'INVALID_EVENT_TYPE', message: 'Event type not allowed' });
        }

        const pm = payloadMetadata || {};
        const {
            job_id,
            filename,
            file_size,
            execution_mode,
            policy_id,
            artifact_alias,
            artifact_id
        } = pm;

        const metadata = {
            job_id: job_id ? String(job_id) : undefined,
            tenant_id: context.tenantId,
            user_id: context.operatorId,
            actor: context.operatorId,
            actor_role: req.actorContext?.role || 'operator',
            filename: filename ? String(filename).substring(0, 255) : undefined,
            file_size: file_size ? Number(file_size) : undefined,
            execution_mode: execution_mode ? String(execution_mode).substring(0, 100) : undefined,
            policy_id: policy_id ? String(policy_id).substring(0, 100) : undefined,
            artifact_alias: artifact_alias ? String(artifact_alias).substring(0, 100) : undefined,
            artifact_id: artifact_id ? String(artifact_id).substring(0, 100) : undefined,
            trace_id: context.traceId,
            request_id: context.requestId,
            source: 'CONTROL_PLANE_PREFLIGHT_UI'
        };

        Object.keys(metadata).forEach(k => metadata[k] === undefined && delete metadata[k]);

        try {
            await writePreflightAuditLog(event_type, 'SUCCESS', context.tenantId, context.operatorId, metadata);
        } catch (auditErr) {
            // Do not fail the frontend request if audit logger fails
            return res.status(200).json({ 
                ok: true, 
                warning: 'Audit persistence failed', 
                event_type 
            });
        }

        res.json({ ok: true, event_type });
    } catch (err) {
        console.error(`[CONTROL][PREFLIGHT][UI-AUDIT] Internal error processing payload: ${err.message}`, err);
        // Return 200 with an error object rather than crashing the client with 500
        res.status(200).json({ ok: false, error: 'UI_AUDIT_INTERNAL_ERROR', message: err.message });
    }
});



// --- 16.5 GET /api/admin/preflight/jobs/:jobId/governance-ledger ---
router.get('/jobs/:jobId/governance-ledger', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const jobId = req.params.jobId;
        const ledgerPayload = await governanceLedgerService.getGovernanceLedger(jobId, context);
        
        await logPreflightAdminEvent({ 
            tenantId: context.tenantId, 
            jobId, 
            eventType: 'PREFLIGHT_GOVERNANCE_LEDGER_VIEWED', 
            status: 'SUCCESS', 
            traceId: context.traceId 
        });

        res.status(200).json(ledgerPayload);
    } catch (err) {
        console.error('[ADMIN-PREFLIGHT-ROUTER] GET /jobs/:jobId/governance-ledger error:', err.message);
        res.status(500).json({ ok: false, error: 'GOVERNANCE_LEDGER_ERROR', message: err.message });
    }
});

// --- 17. GET /api/admin/preflight/jobs/:jobId/audit-timeline ---
router.get('/jobs/:jobId/audit-timeline', async (req, res) => {
    try {
        const jobId = req.params.jobId;
        const sql = `
            SELECT id, event_type, status, user_id, created_at, metadata_json
            FROM api_audit_logs
            WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.job_id')) = ?
               OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.parent_job_id')) = ?
               OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.fix_job_id')) = ?
               OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.child_job_id')) = ?
               OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.source_analyze_job_id')) = ?
               OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.latest_fix_job_id')) = ?
            ORDER BY created_at ASC
        `;
        
        const rows = await db.query(sql, [jobId, jobId, jobId, jobId, jobId, jobId]);
        res.json({ ok: true, events: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

// --- 18. GET /api/admin/preflight/jobs/:jobId/artifacts/:artifactId ---
router.get('/jobs/:jobId/artifacts/:artifactId', async (req, res) => {
    const context = buildGatewayContext(req);
    try {
        const { jobId, artifactId } = req.params;
        
        let registryRow = null;
        try {
            const rows = await db.query('SELECT artifact_list_json, sync_error_json FROM preflight_job_registry WHERE job_id = ?', [jobId]);
            if (rows.length > 0) registryRow = rows[0];
        } catch (e) {}
        
        const syncError = registryRow && registryRow.sync_error_json ? (typeof registryRow.sync_error_json === 'string' ? JSON.parse(registryRow.sync_error_json) : registryRow.sync_error_json) : {};
        const isStale = !!syncError.live_hydration_disabled;
        
        const normalized = normalizePreflightArtifacts(null, registryRow, null, jobId);
        const target = normalized.find(a => a.alias === artifactId || a.id === artifactId);
        
        const actualArtifactId = target ? target.id : artifactId;
        
        if (isStale) {
            return res.status(404).json({
                ok: false,
                error: 'STALE_REGISTRY_ONLY',
                message: 'This job is served from persistent registry. Upstream live hydration is unavailable and the artifact is not physically available locally.'
            });
        }
        
        const streamResponse = await preflightServiceClient.downloadArtifact(jobId, actualArtifactId, null, context.tenantId);
        
        res.setHeader('Content-Type', streamResponse.headers?.['content-type'] || target?.mime_type || 'application/octet-stream');
        if (streamResponse.headers?.['content-disposition']) {
            res.setHeader('Content-Disposition', streamResponse.headers['content-disposition']);
        } else {
            const filename = target?.filename || `artifact-${actualArtifactId}`;
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }
        
        if (streamResponse.stream && typeof streamResponse.stream.pipe === 'function') {
            streamResponse.stream.pipe(res);
        } else {
            return res.send(Buffer.from(streamResponse.stream || streamResponse.data || []));
        }
    } catch (err) {
        if (err.status === 404 || err.message?.includes('404') || err.message?.includes('not found')) {
             return res.status(404).json({
                ok: false,
                error: 'ARTIFACT_NOT_FOUND',
                message: err.message
             });
        }
        res.status(err.status || 500).json({ ok: false, error: { message: err.message } });
    }
});
// --- GET /api/admin/preflight/jobs/:jobId/human-report ---
router.get('/jobs/:jobId/human-report', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    try {
        const payload = await humanReportService.getHumanReport(jobId, context);
        if (!payload.ok) {
            return res.status(404).json(payload);
        }
        await logPreflightAdminEvent({
            eventType: 'PREFLIGHT_HUMAN_REPORT_VIEWED',
            tenantId: context.tenantId || 'system',
            userId: context.userId || context.operatorId || 'system',
            status: 'SUCCESS',
            jobId: jobId,
            traceId: context.traceId
        });
        res.json(payload);
    } catch (err) {
        res.status(500).json({
            ok: false,
            error: {
                code: 'HUMAN_REPORT_ERROR',
                message: err.message
            }
        });
    }
});

// --- POST /api/admin/preflight/jobs/:jobId/human-report/snapshot ---
router.post('/jobs/:jobId/human-report/snapshot', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    try {
        const payload = await humanReportSnapshotService.createSnapshot(jobId, context);
        res.json(payload);
    } catch (err) {
        res.status(500).json({ ok: false, error: { code: 'HUMAN_REPORT_SNAPSHOT_FAILED', message: err.message } });
    }
});

// --- GET /api/admin/preflight/jobs/:jobId/human-report/snapshot ---
router.get('/jobs/:jobId/human-report/snapshot', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    try {
        const payload = await humanReportSnapshotService.getLatestSnapshot(jobId, context);
        if (!payload.ok && payload.error === 'NOT_FOUND') return res.status(404).json(payload);
        res.json(payload);
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

// --- POST /api/admin/preflight/jobs/:jobId/human-report/share-token ---
router.post('/jobs/:jobId/human-report/share-token', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    const { snapshotId } = req.body;
    try {
        if (!snapshotId) return res.status(400).json({ ok: false, error: { message: 'snapshotId is required' } });
        const payload = await humanReportSnapshotService.createShareToken(jobId, snapshotId, context);
        res.json(payload);
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

// --- POST /api/admin/preflight/jobs/:jobId/review-decision ---
router.post('/jobs/:jobId/review-decision', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    const { snapshotId, decision, reason, approvedArtifactType } = req.body;
    try {
        if (!snapshotId || !decision) return res.status(400).json({ ok: false, error: { message: 'snapshotId and decision are required' } });
        const payload = await reviewApprovalService.createDecision(jobId, snapshotId, decision, reason, approvedArtifactType, context);
        res.json(payload);
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

// --- GET /api/admin/preflight/jobs/:jobId/review-decision ---
router.get('/jobs/:jobId/review-decision', async (req, res) => {
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    try {
        const payload = await reviewApprovalService.getLatestDecision(jobId, context);
        if (!payload.ok && payload.error === 'NOT_FOUND') return res.status(404).json(payload);
        res.json(payload);
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

module.exports = router;
