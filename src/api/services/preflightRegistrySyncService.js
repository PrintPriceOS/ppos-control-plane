/**
 * src/api/services/preflightRegistrySyncService.js
 * 
 * Preflight Job Synchronization Service
 * Manages per-job synchronization with the upstream Preflight Service,
 * extracting forensic indicators, fix buckets, and metadata into the persistent registry.
 */
const db = require('./mysqlClient');
const preflightServiceClient = require('./preflightServiceClient');
const logger = require('./logger').child('preflight-registry-sync');
const {
    isTerminalDiagnosticStatus,
    mapPhase10Status,
    collectFindings,
    normalizeArtifacts,
    normalizePreflightArtifacts
} = require('./preflightStatusHelpers');

class PreflightRegistrySyncService {
    /**
     * Synchronizes a single preflight job by fetching its live canonical state upstream
     * and upserting the full preserved payload and derived extraction buckets into the MySQL registry.
     * 
     * @param {string} jobId - The unique identifier of the job to sync.
     * @param {object} options - Options containing tenantId context and authHeader.
     * @returns {Promise<object>} The fully synced and hydrated job record.
     */
    async syncJob(jobId, { tenantId = null, authHeader = null } = {}) {
        const targetTenantId = tenantId || 'system';
        
        // Mandatory Structured Logging: Start
        console.log(`[CONTROL][PREFLIGHT][SYNC-JOB-START] Initiating sync for job ${jobId} under tenant context: ${targetTenantId}`);
        logger.info({ event: 'sync_job_start', jobId, tenantId: targetTenantId });

        try {
            // Guarantee registry schema compliance before proceeding
            await require('./controlPlaneSchemaService').ensurePreflightRegistrySchema();

            // Fetch live payload utilizing preflightServiceClient.getJob
            const upstreamJob = await preflightServiceClient.getJob(jobId, authHeader, targetTenantId);
            
            if (!upstreamJob) {
                throw new Error(`Upstream service returned empty payload for job ${jobId}`);
            }

            // Mandatory Structured Logging: Fetched
            console.log(`[CONTROL][PREFLIGHT][SYNC-JOB-FETCHED] Successfully retrieved job payload for ${jobId} (status: ${upstreamJob.status || upstreamJob.state || 'UNKNOWN'})`);
            logger.debug({ event: 'sync_job_fetched', jobId, status: upstreamJob.status });

            // Data Extraction Logic
            const source_job_id = upstreamJob.sourceJobId || upstreamJob.source_job_id || null;
            const source_system = upstreamJob.sourceSystem || upstreamJob.source_system || 'PREFLIGHT_SERVICE';
            const type = upstreamJob.type || upstreamJob.strategy || 'ANALYZE';
            const status = mapPhase10Status(upstreamJob.status || upstreamJob.state || 'COMPLETED');
            const resolved_tenant_id = upstreamJob.tenantId || upstreamJob.tenant_id || targetTenantId;

            // Extract original filename safely
            const original_filename = upstreamJob.document?.name || 
                                      upstreamJob.meta?.fileName || 
                                      upstreamJob.original_filename || 
                                      upstreamJob.filename || 
                                      null;

            // Extract file size bytes safely
            const file_size_bytes = upstreamJob.document?.size || 
                                    upstreamJob.meta?.fileSize || 
                                    upstreamJob.file_size_bytes || 
                                    upstreamJob.sizeBytes || 
                                    0;

            // Extract risk scores
            const summaryObj = upstreamJob.summary || upstreamJob.summaryFlat || upstreamJob.analysis?.summary || {};
            const risk_score = summaryObj.riskScore !== undefined ? summaryObj.riskScore : (summaryObj.risk_score || 0);
            const risk_level = summaryObj.riskLevel || summaryObj.risk_level || null;
            const findings = collectFindings(upstreamJob);
            const issue_count = findings.length;

            // Unified canonical extractions following rules 1, 2, 3, 4
            const extractedRepairs = this._extractRepairs(upstreamJob);
            const repairs_json = extractedRepairs ? JSON.stringify(extractedRepairs) : null;

            const extractedFixes = this._extractFixes(upstreamJob, extractedRepairs);
            const fixes_json = extractedFixes ? JSON.stringify(extractedFixes) : null;

            const extractedRequested = this._extractRequestedFixes(upstreamJob);
            const requested_fixes_json = extractedRequested ? JSON.stringify(extractedRequested) : null;

            const requestedCount = extractedRequested ? extractedRequested.length : 0;
            const buckets = this._deriveBuckets(extractedRepairs, upstreamJob, jobId, type, requestedCount);

            const applied_fixes_json = buckets.applied.length > 0 ? JSON.stringify(buckets.applied) : null;
            const skipped_fixes_json = buckets.skipped.length > 0 ? JSON.stringify(buckets.skipped) : null;
            const failed_fixes_json = buckets.failed.length > 0 ? JSON.stringify(buckets.failed) : null;


            // Artifact List Preservation
            const artifactsRaw = upstreamJob.artifacts || upstreamJob.artifact_list || upstreamJob.availableArtifacts || upstreamJob.available_artifacts || (upstreamJob.result ? upstreamJob.result.artifacts : null);
            const artifacts = normalizePreflightArtifacts(upstreamJob, null, upstreamJob, jobId);
            const artifact_list_json = artifacts.length > 0 ? JSON.stringify(artifacts) : null;

            // Degraded path verification
            const derivedDegraded = this._deriveDegraded(upstreamJob, status);
            const degraded = derivedDegraded.degraded;
            const degraded_reasons = derivedDegraded.reasons;
            const degraded_reasons_json = degraded_reasons.length > 0 ? JSON.stringify(degraded_reasons) : null;

            const policy = upstreamJob.policy || null;
            const progress = isTerminalDiagnosticStatus(status) ? 100 : (upstreamJob.progress || 10);
            const canonical_payload_json = JSON.stringify(upstreamJob);

            // Mandatory Structured Logging: Upsert
            console.log(`[CONTROL][PREFLIGHT][SYNC-JOB-UPSERT] Upserting extracted metadata and fix buckets into preflight_job_registry for ${jobId}`);
            logger.info({ event: 'sync_job_upsert', jobId, type, status, appliedCount: buckets.applied.length });

            // Perform highly robust MySQL upsert preserving existing operational data if missing in polls
            await db.query(`
                INSERT INTO preflight_job_registry (
                    job_id,
                    source_job_id,
                    source_system,
                    type,
                    status,
                    tenant_id,
                    original_filename,
                    file_size_bytes,
                    risk_score,
                    risk_level,
                    issue_count,
                    requested_fixes_json,
                    repairs_json,
                    fixes_json,
                    applied_fixes_json,
                    skipped_fixes_json,
                    failed_fixes_json,
                    artifact_list_json,
                    degraded,
                    degraded_reasons_json,
                    policy,
                    progress,
                    canonical_payload_json,
                    last_seen_at,
                    last_synced_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
                ) ON DUPLICATE KEY UPDATE
                    source_job_id = VALUES(source_job_id),
                    source_system = VALUES(source_system),
                    type = VALUES(type),
                    status = VALUES(status),
                    tenant_id = VALUES(tenant_id),
                    original_filename = COALESCE(VALUES(original_filename), original_filename),
                    file_size_bytes = IF(VALUES(file_size_bytes) > 0, VALUES(file_size_bytes), file_size_bytes),
                    risk_score = VALUES(risk_score),
                    risk_level = VALUES(risk_level),
                    issue_count = VALUES(issue_count),
                    requested_fixes_json = VALUES(requested_fixes_json),
                    repairs_json = VALUES(repairs_json),
                    fixes_json = VALUES(fixes_json),
                    applied_fixes_json = VALUES(applied_fixes_json),
                    skipped_fixes_json = VALUES(skipped_fixes_json),
                    failed_fixes_json = VALUES(failed_fixes_json),
                    artifact_list_json = VALUES(artifact_list_json),
                    degraded = VALUES(degraded),
                    degraded_reasons_json = VALUES(degraded_reasons_json),
                    policy = COALESCE(VALUES(policy), policy),
                    progress = VALUES(progress),
                    canonical_payload_json = VALUES(canonical_payload_json),
                    last_seen_at = NOW(),
                    last_synced_at = NOW(),
                    updated_at = NOW()
            `, [
                jobId,
                source_job_id,
                source_system,
                type,
                status,
                resolved_tenant_id,
                original_filename,
                file_size_bytes,
                risk_score,
                risk_level,
                issue_count,
                requested_fixes_json,
                repairs_json,
                fixes_json,
                applied_fixes_json,
                skipped_fixes_json,
                failed_fixes_json,
                artifact_list_json,
                degraded,
                degraded_reasons_json,
                policy,
                progress,
                canonical_payload_json
            ]);

            // Ensure any output artifacts are correctly advertised in preflight_artifact_registry
            if (artifacts && artifacts.length > 0) {
                for (const art of artifacts) {
                    const artId = art.id || art.artifactId || `art_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
                    await db.query(`
                        INSERT IGNORE INTO preflight_artifact_registry 
                        (artifact_id, job_id, tenant_id, artifact_type, filename, size_bytes, storage_path)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        artId,
                        jobId,
                        resolved_tenant_id,
                        art.type || 'OUTPUT',
                        art.filename || 'artifact.pdf',
                        art.sizeBytes || 0,
                        art.path || ''
                    ]);
                }
            }

            console.log(`[CONTROL][PREFLIGHT][SYNC-UPSERT-SUCCESS] ${JSON.stringify({
                jobId,
                type,
                repairsCount: extractedRepairs ? extractedRepairs.length : 0,
                appliedCount: buckets.applied.length,
                skippedCount: buckets.skipped.length,
                failedCount: buckets.failed.length,
                requestedCount
            })}`);

            return {
                ok: true,
                jobId,
                sourceJobId: source_job_id,
                type,
                status,
                tenantId: resolved_tenant_id,
                riskScore: risk_score,
                fixBuckets: {
                    applied: buckets.applied,
                    skipped: buckets.skipped,
                    failed: buckets.failed
                },
                canonicalPayload: upstreamJob
            };

        } catch (error) {
            // Mandatory Structured Logging: Error
            console.error(`[CONTROL][PREFLIGHT][SYNC-JOB-ERROR] Synchronization failed for job ${jobId}: ${error.message}`);
            logger.error({ event: 'sync_job_error', jobId, error: error.message, stack: error.stack });
            throw error;
        }
    }

    /**
     * Synchronizes an item returned by listJobs(), performing minimal upsert first,
     * followed by optional GET enrichment. Never fails the whole item on GET 404.
     */
    async syncListItem(item, requestedTenantId = null) {
        const jobId = item.jobId || item.id || item.targetJobId || item.fixJobId;
        const tenantId = item.tenantId || requestedTenantId || 'ppos-production-worker';

        if (!jobId) {
            throw new Error('List item missing resolvable jobId');
        }

        const type = item.type || item.strategy || 'ANALYZE';
        const status = item.status || item.state || 'UNKNOWN';

        console.log(`[CONTROL][PREFLIGHT][SYNC-LIST-ITEM] ${JSON.stringify({ jobId, tenantId, type, status })}`);

        // Guarantee registry schema compliance before proceeding
        await require('./controlPlaneSchemaService').ensurePreflightRegistrySchema();

        // 2.5 Check existing sync error state before fetching
        let existingSyncError = {};
        try {
            const rows = await db.query('SELECT sync_error_json FROM preflight_job_registry WHERE job_id = ?', [jobId]);
            if (rows.length > 0 && rows[0].sync_error_json) {
                existingSyncError = typeof rows[0].sync_error_json === 'string' ? JSON.parse(rows[0].sync_error_json) : rows[0].sync_error_json;
            }
        } catch (e) {
            // Ignore select error
        }

        // 3. Always upsert a minimal preflight_job_registry row from the list item before attempting enrichment.
        await this._upsertJobRow(jobId, item, tenantId, null);

        if (existingSyncError.live_hydration_disabled) {
            console.log(`[CONTROL][PREFLIGHT][SYNC-JOB-FETCH-SUPPRESSED] ${JSON.stringify({ jobId, tenantId, reason: existingSyncError.live_hydration_disabled_reason })}`);
            return {
                ok: true,
                jobId,
                enriched: false,
                source_status: 'LISTED_BUT_NOT_GET_RESOLVABLE',
                sync_error_json: existingSyncError,
                status
            };
        }

        // 4. Then attempt enrichment:
        try {
            console.log(`[CONTROL][PREFLIGHT][SYNC-JOB-FETCH] ${JSON.stringify({ jobId, tenantId })}`);
            const enrichedJob = await preflightServiceClient.getJob(jobId, null, tenantId);
            
            if (enrichedJob) {
                if (existingSyncError['404_count']) {
                    delete existingSyncError['404_count'];
                    await db.query(`UPDATE preflight_job_registry SET sync_error_json = ? WHERE job_id = ?`, [JSON.stringify(existingSyncError), jobId]);
                }
                
                // 5. If enrichment succeeds, merge enriched payload over the list item and update the same registry row.
                const mergedPayload = { ...item, ...enrichedJob, source_status: 'ENRICHED' };
                await this._upsertJobRow(jobId, mergedPayload, tenantId, null);
                console.log(`[CONTROL][PREFLIGHT][SYNC-UPSERT-SUCCESS] ${JSON.stringify({ jobId, enriched: true })}`);
                return {
                    ok: true,
                    jobId,
                    enriched: true,
                    source_status: 'ENRICHED',
                    details: mergedPayload
                };
            }
        } catch (enrichErr) {
            const is404 = enrichErr.status === 404 || enrichErr.message?.includes('404');
            if (is404) {
                // 6. If enrichment returns 404, do NOT mark the whole item as failure. Keep the minimal row from list payload and set:
                existingSyncError['404_count'] = (existingSyncError['404_count'] || 0) + 1;
                if (existingSyncError['404_count'] >= 3) {
                    existingSyncError.live_hydration_disabled = true;
                    existingSyncError.live_hydration_disabled_reason = 'UPSTREAM_404_REPEATED';
                }
                const syncErrorJson = { ...existingSyncError, status: 404, message: 'UPSTREAM_GET_404', jobId, tenantId };
                
                if (!existingSyncError.live_hydration_disabled) {
                    console.log(`[CONTROL][PREFLIGHT][SYNC-JOB-GET-404-FALLBACK] ${JSON.stringify({ jobId, tenantId })}`);
                }
                
                await db.query(`
                    UPDATE preflight_job_registry 
                    SET source_status = ?, sync_error_json = ?, last_seen_at = NOW(), last_synced_at = NOW(), status = ?
                    WHERE job_id = ?
                `, ['LISTED_BUT_NOT_GET_RESOLVABLE', JSON.stringify(syncErrorJson), status, jobId]);

                console.log(`[CONTROL][PREFLIGHT][SYNC-UPSERT-SUCCESS] ${JSON.stringify({ jobId, enriched: false })}`);
                return {
                    ok: true,
                    jobId,
                    enriched: false,
                    source_status: 'LISTED_BUT_NOT_GET_RESOLVABLE',
                    sync_error_json: syncErrorJson,
                    status
                };
            } else {
                console.log(`[CONTROL][PREFLIGHT][SYNC-UPSERT-SUCCESS] ${JSON.stringify({ jobId, enriched: false })}`);
                const syncErrorJson = { status: enrichErr.status || 500, message: enrichErr.message, jobId, tenantId };
                await db.query(`
                    UPDATE preflight_job_registry 
                    SET sync_error_json = ?, last_seen_at = NOW(), last_synced_at = NOW()
                    WHERE job_id = ?
                `, [JSON.stringify(syncErrorJson), jobId]);

                return {
                    ok: true,
                    jobId,
                    enriched: false,
                    source_status: 'LISTED_BUT_GET_FAILED',
                    sync_error_json: syncErrorJson,
                    status
                };
            }
        }

        console.log(`[CONTROL][PREFLIGHT][SYNC-UPSERT-SUCCESS] ${JSON.stringify({ jobId, enriched: false })}`);
        return {
            ok: true,
            jobId,
            enriched: false,
            source_status: 'MINIMAL_UPSERTED',
            details: item
        };
    }

    /**
     * Shared helper to upsert a job row into preflight_job_registry preserving forensic fields
     */
    async _upsertJobRow(jobId, payload, tenantId, syncErrorJson = null) {
        const source_job_id = payload.sourceJobId || payload.source_job_id || null;
        const source_system = payload.sourceSystem || payload.source_system || 'PREFLIGHT_SERVICE';
        const source_status = payload.source_status || null;
        const type = payload.type || payload.strategy || 'ANALYZE';
        const status = mapPhase10Status(payload.status || payload.state || 'UNKNOWN');
        const resolved_tenant_id = payload.tenantId || payload.tenant_id || tenantId;

        const original_filename = payload.document?.name || 
                                  payload.meta?.fileName || 
                                  payload.original_filename || 
                                  payload.filename || 
                                  null;

        const file_size_bytes = payload.document?.size || 
                                payload.meta?.fileSize || 
                                payload.file_size_bytes || 
                                payload.sizeBytes || 
                                0;

        const summaryObj = payload.summary || payload.summaryFlat || payload.analysis?.summary || {};
        const risk_score = summaryObj.riskScore !== undefined ? summaryObj.riskScore : (summaryObj.risk_score || 0);
        const risk_level = summaryObj.riskLevel || summaryObj.risk_level || null;
        const findings = collectFindings(payload);
        const issue_count = findings.length;

        // Unified canonical extractions following rules 1, 2, 3, 4
        const extractedRepairs = this._extractRepairs(payload);
        const repairs_json = extractedRepairs ? JSON.stringify(extractedRepairs) : null;

        const extractedFixes = this._extractFixes(payload, extractedRepairs);
        const fixes_json = extractedFixes ? JSON.stringify(extractedFixes) : null;

        const extractedRequested = this._extractRequestedFixes(payload);
        const requested_fixes_json = extractedRequested ? JSON.stringify(extractedRequested) : null;

        const requestedCount = extractedRequested ? extractedRequested.length : 0;
        const buckets = this._deriveBuckets(extractedRepairs, payload, jobId, type, requestedCount);

        const applied_fixes_json = buckets.applied.length > 0 ? JSON.stringify(buckets.applied) : null;
        const skipped_fixes_json = buckets.skipped.length > 0 ? JSON.stringify(buckets.skipped) : null;
        const failed_fixes_json = buckets.failed.length > 0 ? JSON.stringify(buckets.failed) : null;

        const artifactsRaw = payload.artifacts || payload.artifact_list || payload.availableArtifacts || payload.available_artifacts || (payload.result ? payload.result.artifacts : null);
        const artifacts = normalizePreflightArtifacts(payload, null, payload, jobId);
        const artifact_list_json = artifacts.length > 0 ? JSON.stringify(artifacts) : null;

        const derivedDegraded = this._deriveDegraded(payload, status);
        const degraded = derivedDegraded.degraded;
        const degraded_reasons = derivedDegraded.reasons;
        const degraded_reasons_json = degraded_reasons.length > 0 ? JSON.stringify(degraded_reasons) : null;

        const policy = payload.policy || null;
        const progress = isTerminalDiagnosticStatus(status) ? 100 : (payload.progress || 10);
        const canonical_payload_json = JSON.stringify(payload);
        const sync_error_json_str = syncErrorJson ? JSON.stringify(syncErrorJson) : null;

        const requestedFixesCount = extractedRequested ? extractedRequested.length : 0;
        const repairsCount = extractedRepairs ? extractedRepairs.length : 0;
        console.log(`[CONTROL][PREFLIGHT][SYNC-UPSERT-ATTEMPT] ${JSON.stringify({
            jobId,
            tenantId: resolved_tenant_id,
            type,
            status,
            sourceJobId: source_job_id,
            requestedFixesCount,
            repairsCount
        })}`);

        try {
            await db.query(`
                INSERT INTO preflight_job_registry (
                    job_id,
                    source_job_id,
                    source_system,
                    source_status,
                    type,
                    status,
                    tenant_id,
                    original_filename,
                    file_size_bytes,
                    risk_score,
                    risk_level,
                    issue_count,
                    requested_fixes_json,
                    repairs_json,
                    fixes_json,
                    applied_fixes_json,
                    skipped_fixes_json,
                    failed_fixes_json,
                    artifact_list_json,
                    sync_error_json,
                    degraded,
                    degraded_reasons_json,
                    policy,
                    progress,
                    canonical_payload_json,
                    last_seen_at,
                    last_synced_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
                ) ON DUPLICATE KEY UPDATE
                    source_job_id = COALESCE(VALUES(source_job_id), source_job_id),
                    source_system = COALESCE(VALUES(source_system), source_system),
                    source_status = COALESCE(VALUES(source_status), source_status),
                    type = VALUES(type),
                    status = VALUES(status),
                    tenant_id = VALUES(tenant_id),
                    original_filename = COALESCE(VALUES(original_filename), original_filename),
                    file_size_bytes = IF(VALUES(file_size_bytes) > 0, VALUES(file_size_bytes), file_size_bytes),
                    risk_score = VALUES(risk_score),
                    risk_level = VALUES(risk_level),
                    issue_count = VALUES(issue_count),
                    requested_fixes_json = COALESCE(VALUES(requested_fixes_json), requested_fixes_json),
                    repairs_json = COALESCE(VALUES(repairs_json), repairs_json),
                    fixes_json = COALESCE(VALUES(fixes_json), fixes_json),
                    applied_fixes_json = COALESCE(VALUES(applied_fixes_json), applied_fixes_json),
                    skipped_fixes_json = COALESCE(VALUES(skipped_fixes_json), skipped_fixes_json),
                    failed_fixes_json = COALESCE(VALUES(failed_fixes_json), failed_fixes_json),
                    artifact_list_json = COALESCE(VALUES(artifact_list_json), artifact_list_json),
                    sync_error_json = COALESCE(VALUES(sync_error_json), sync_error_json),
                    degraded = VALUES(degraded),
                    degraded_reasons_json = VALUES(degraded_reasons_json),
                    policy = COALESCE(VALUES(policy), policy),
                    progress = VALUES(progress),
                    canonical_payload_json = VALUES(canonical_payload_json),
                    last_seen_at = NOW(),
                    last_synced_at = NOW(),
                    updated_at = NOW()
            `, [
                jobId,
                source_job_id,
                source_system,
                source_status,
                type,
                status,
                resolved_tenant_id,
                original_filename,
                file_size_bytes,
                risk_score,
                risk_level,
                issue_count,
                requested_fixes_json,
                repairs_json,
                fixes_json,
                applied_fixes_json,
                skipped_fixes_json,
                failed_fixes_json,
                artifact_list_json,
                sync_error_json_str,
                degraded,
                degraded_reasons_json,
                policy,
                progress,
                canonical_payload_json
            ]);
        } catch (upsertErr) {
            console.error(`[CONTROL][PREFLIGHT][SYNC-UPSERT-ERROR] ${JSON.stringify({
                jobId,
                error: upsertErr.message
            })}`);
            throw upsertErr;
        }

        if (artifacts && Array.isArray(artifacts)) {
            for (const art of artifacts) {
                const artId = art.id || art.artifactId || `art_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
                await db.query(`
                    INSERT IGNORE INTO preflight_artifact_registry 
                    (artifact_id, job_id, tenant_id, artifact_type, filename, size_bytes, storage_path)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    artId,
                    jobId,
                    resolved_tenant_id,
                    art.type || 'OUTPUT',
                    art.filename || art.name || 'artifact.pdf',
                    art.sizeBytes || art.size || 0,
                    art.path || art.storageKey || ''
                ]);
            }
        }

        console.log(`[CONTROL][PREFLIGHT][SYNC-UPSERT-SUCCESS] ${JSON.stringify({
            jobId,
            type,
            repairsCount,
            appliedCount: buckets.applied.length,
            skippedCount: buckets.skipped.length,
            failedCount: buckets.failed.length,
            requestedCount
        })}`);
    }

    _extractRepairs(payload) {
        if (!payload) return null;

        const isObjectArray = (arr) => Array.isArray(arr) && arr.length > 0 && arr.some(item => item && typeof item === 'object' && !Array.isArray(item));

        let repairs = null;
        if (isObjectArray(payload.repairs)) {
            repairs = payload.repairs;
        } else if (payload.result && isObjectArray(payload.result.repairs)) {
            repairs = payload.result.repairs;
        } else if (isObjectArray(payload.fixes)) {
            repairs = payload.fixes;
        } else if (payload.result && isObjectArray(payload.result.fixes)) {
            repairs = payload.result.fixes;
        }

        if (repairs) {
            return repairs.map(r => {
                if (!r || typeof r !== 'object') return r;
                const code = r.code || r.fix_method || r.repairStrategy || r.id || r.type || r.fix || r.name;
                if (!code) {
                    console.warn(`[CONTROL][PREFLIGHT][SYNC-UNKNOWN-FIX-WARN] Repair record missing resolvable code field: ${JSON.stringify(r)}`);
                    logger.warn({ event: 'sync_unknown_fix_warn', repair: r });
                }
                return {
                    ...r,
                    code: code || 'UNKNOWN_FIX'
                };
            });
        }
        return null;
    }

    _extractFixes(payload, extractedRepairs) {
        if (!payload) return null;
        if (extractedRepairs && extractedRepairs.length > 0) {
            return extractedRepairs;
        }

        const getStrings = (arr) => Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : null;
        const strFixes = getStrings(payload.fixes) || (payload.result ? getStrings(payload.result.fixes) : null);
        return strFixes && strFixes.length > 0 ? strFixes : null;
    }

    _extractRequestedFixes(payload) {
        if (!payload) return null;
        const getStrings = (arr) => Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : null;

        const req = getStrings(payload.requested_fixes) ||
                    getStrings(payload.requestedFixes) ||
                    (payload.result ? (getStrings(payload.result.requested_fixes) || getStrings(payload.result.requestedFixes)) : null) ||
                    (payload.options ? (getStrings(payload.options.requested_fixes) || getStrings(payload.options.requestedFixes)) : null);

        return req && req.length > 0 ? req : null;
    }

    _deriveBuckets(repairs, payload, jobId, type, requestedCount = 0) {
        let applied = [];
        let skipped = [];
        let failed = [];

        if (repairs && repairs.length > 0) {
            repairs.forEach(r => {
                if (!r || typeof r !== 'object') return;
                const rStatus = String(r.status || r.state || '').toUpperCase();

                if (rStatus === 'APPLIED' || rStatus === 'SUCCESS' || r.applied === true || r.success === true) {
                    applied.push(r);
                } else if (rStatus === 'SKIPPED') {
                    skipped.push(r);
                } else if (rStatus === 'FAILED' || rStatus === 'ERROR' || r.failed === true || r.error) {
                    failed.push(r);
                } else {
                    if (r.success !== false) {
                        applied.push(r);
                    } else {
                        failed.push(r);
                    }
                }
            });
        } else if (payload) {
            const mapLegacyBucket = (sourceArr, defaultStatus) => {
                if (!Array.isArray(sourceArr)) return [];
                return sourceArr.map(item => {
                    if (item && typeof item === 'object') {
                        const code = item.code || item.fix_method || item.repairStrategy || item.id || item.type || item.fix || item.name || 'UNKNOWN_FIX';
                        if (!item.code && !item.fix_method && !item.repairStrategy && !item.id && !item.type && !item.fix && !item.name) {
                            console.warn(`[CONTROL][PREFLIGHT][SYNC-UNKNOWN-FIX-WARN] Legacy bucket item missing resolvable code field: ${JSON.stringify(item)}`);
                            logger.warn({ event: 'sync_unknown_fix_warn', legacyItem: item });
                        }
                        return { ...item, code, status: item.status || defaultStatus };
                    }
                    const strVal = String(item || 'UNKNOWN_FIX');
                    if (strVal === 'UNKNOWN_FIX') {
                        console.warn(`[CONTROL][PREFLIGHT][SYNC-UNKNOWN-FIX-WARN] String bucket item defaults to UNKNOWN_FIX`);
                        logger.warn({ event: 'sync_unknown_fix_warn', item });
                    }
                    return { code: strVal, status: defaultStatus };
                });
            };

            applied = mapLegacyBucket(payload.applied_fixes || payload.appliedFixes, 'APPLIED');
            skipped = mapLegacyBucket(payload.skipped_fixes || payload.skippedFixes, 'SKIPPED');
            failed = mapLegacyBucket(payload.failed_fixes || payload.failedFixes, 'FAILED');
        }

        const repairsCount = repairs ? repairs.length : 0;
        console.log(`[CONTROL][PREFLIGHT][SYNC-BUCKET-DERIVE] ${JSON.stringify({
            jobId,
            type,
            repairsCount,
            appliedCount: applied.length,
            skippedCount: skipped.length,
            failedCount: failed.length,
            requestedCount
        })}`);

        return { applied, skipped, failed };
    }

    _deriveDegraded(payload, status) {
        if (!payload) return { degraded: false, reasons: [] };

        const statusUpper = (status || payload.status || payload.state || '').toUpperCase();
        const outcomeCategory = (payload.outcomeCategory || payload.outcome_category || '').toUpperCase();
        const analysisIntegrity = payload.analysisIntegrity || payload.analysis_integrity || {};

        const isDegradedStatus = ['DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'].includes(statusUpper);
        const isDegradedOutcome = ['DEGRADED_ANALYSIS', 'PARTIAL_ANALYSIS', 'ARTIFACT_INTEGRITY_FAILURE'].includes(outcomeCategory);
        const isDegradedIntegrity = analysisIntegrity.degradedMode === true || analysisIntegrity.degraded_mode === true;

        const degraded = payload.degraded === true || 
                         payload.isDegraded === true || 
                         isDegradedStatus || 
                         isDegradedOutcome || 
                         isDegradedIntegrity;

        let reasons = Array.isArray(payload.degradedReasons) ? payload.degradedReasons :
                      Array.isArray(payload.degraded_reasons) ? payload.degraded_reasons : [];

        if (degraded && reasons.length === 0) {
            if (isDegradedStatus) {
                reasons.push(`STATUS_DEGRADATION:${statusUpper}`);
            }
            if (isDegradedOutcome) {
                reasons.push(`OUTCOME_DEGRADATION:${outcomeCategory}`);
            }
            if (isDegradedIntegrity) {
                reasons.push('ANALYSIS_INTEGRITY_DEGRADED_MODE');
            }
            if (payload.degraded === true || payload.isDegraded === true) {
                reasons.push('UPSTREAM_DEGRADED_INDICATOR');
            }
            if (reasons.length === 0) {
                reasons.push('GENERAL_DEGRADATION_DETECTED');
            }
        }

        return { degraded, reasons };
    }

    normalizeArtifacts(source) {
        return normalizeArtifacts(source);
    }
}

module.exports = new PreflightRegistrySyncService();
