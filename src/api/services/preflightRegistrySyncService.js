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
            const status = upstreamJob.status || upstreamJob.state || 'COMPLETED';
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
            const issue_count = summaryObj.issueCount !== undefined ? summaryObj.issueCount : (summaryObj.issue_count || (Array.isArray(upstreamJob.findings) ? upstreamJob.findings.length : 0));

            // Normalize JSON arrays
            const requested_fixes = Array.isArray(upstreamJob.requested_fixes) ? upstreamJob.requested_fixes :
                                    Array.isArray(upstreamJob.requestedFixes) ? upstreamJob.requestedFixes : null;
            const requested_fixes_json = requested_fixes ? JSON.stringify(requested_fixes) : null;

            const repairs = Array.isArray(upstreamJob.repairs) ? upstreamJob.repairs : null;
            const repairs_json = repairs ? JSON.stringify(repairs) : null;

            const fixes = Array.isArray(upstreamJob.fixes) ? upstreamJob.fixes : null;
            const fixes_json = fixes ? JSON.stringify(fixes) : null;

            // Derive fix buckets: Applied, Skipped, Failed
            let applied_fixes = [];
            let skipped_fixes = [];
            let failed_fixes = [];

            if (Array.isArray(upstreamJob.repairs)) {
                upstreamJob.repairs.forEach(r => {
                    if (!r) return;
                    if (typeof r === 'string') {
                        applied_fixes.push(r);
                        return;
                    }
                    const fixName = r.fix || r.type || r.name || r.id || 'UNKNOWN_FIX';
                    const rStatus = String(r.status || r.state || '').toUpperCase();
                    
                    if (rStatus === 'APPLIED' || rStatus === 'SUCCESS' || r.applied === true) {
                        applied_fixes.push(fixName);
                    } else if (rStatus === 'SKIPPED') {
                        skipped_fixes.push(fixName);
                    } else if (rStatus === 'FAILED' || rStatus === 'ERROR' || r.failed === true || r.error) {
                        failed_fixes.push(fixName);
                    } else {
                        // Deterministic fallback if status is omitted but success indicator is positive or absent
                        if (r.success !== false) {
                            applied_fixes.push(fixName);
                        } else {
                            failed_fixes.push(fixName);
                        }
                    }
                });
            } else {
                if (Array.isArray(upstreamJob.applied_fixes)) applied_fixes = upstreamJob.applied_fixes;
                else if (Array.isArray(upstreamJob.appliedFixes)) applied_fixes = upstreamJob.appliedFixes;

                if (Array.isArray(upstreamJob.skipped_fixes)) skipped_fixes = upstreamJob.skipped_fixes;
                else if (Array.isArray(upstreamJob.skippedFixes)) skipped_fixes = upstreamJob.skippedFixes;

                if (Array.isArray(upstreamJob.failed_fixes)) failed_fixes = upstreamJob.failed_fixes;
                else if (Array.isArray(upstreamJob.failedFixes)) failed_fixes = upstreamJob.failedFixes;
            }

            const applied_fixes_json = JSON.stringify(applied_fixes);
            const skipped_fixes_json = JSON.stringify(skipped_fixes);
            const failed_fixes_json = JSON.stringify(failed_fixes);

            // Artifact List Preservation
            const artifacts = Array.isArray(upstreamJob.artifacts) ? upstreamJob.artifacts :
                              Array.isArray(upstreamJob.artifact_list) ? upstreamJob.artifact_list : null;
            const artifact_list_json = artifacts ? JSON.stringify(artifacts) : null;

            // Degraded path verification
            const degraded = upstreamJob.degraded === true || upstreamJob.isDegraded === true;
            const degraded_reasons = Array.isArray(upstreamJob.degradedReasons) ? upstreamJob.degradedReasons :
                                     Array.isArray(upstreamJob.degraded_reasons) ? upstreamJob.degraded_reasons : null;
            const degraded_reasons_json = degraded_reasons ? JSON.stringify(degraded_reasons) : null;

            const policy = upstreamJob.policy || null;
            const progress = status === 'COMPLETED' ? 100 : (upstreamJob.progress || 10);
            const canonical_payload_json = JSON.stringify(upstreamJob);

            // Mandatory Structured Logging: Upsert
            console.log(`[CONTROL][PREFLIGHT][SYNC-JOB-UPSERT] Upserting extracted metadata and fix buckets into preflight_job_registry for ${jobId}`);
            logger.info({ event: 'sync_job_upsert', jobId, type, status, appliedCount: applied_fixes.length });

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

            return {
                ok: true,
                jobId,
                sourceJobId: source_job_id,
                type,
                status,
                tenantId: resolved_tenant_id,
                riskScore: risk_score,
                fixBuckets: {
                    applied: applied_fixes,
                    skipped: skipped_fixes,
                    failed: failed_fixes
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

        // 3. Always upsert a minimal preflight_job_registry row from the list item before attempting enrichment.
        await this._upsertJobRow(jobId, item, tenantId, null);

        // 4. Then attempt enrichment:
        try {
            console.log(`[CONTROL][PREFLIGHT][SYNC-JOB-FETCH] ${JSON.stringify({ jobId, tenantId })}`);
            const enrichedJob = await preflightServiceClient.getJob(jobId, null, tenantId);
            
            if (enrichedJob) {
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
                console.log(`[CONTROL][PREFLIGHT][SYNC-JOB-GET-404-FALLBACK] ${JSON.stringify({ jobId, tenantId })}`);
                const syncErrorJson = { status: 404, message: 'UPSTREAM_GET_404', jobId, tenantId };
                
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
        const status = payload.status || payload.state || 'UNKNOWN';
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
        const issue_count = summaryObj.issueCount !== undefined ? summaryObj.issueCount : (summaryObj.issue_count || (Array.isArray(payload.findings) ? payload.findings.length : 0));

        // Derive forensic fields
        const requested_fixes = Array.isArray(payload.requested_fixes) ? payload.requested_fixes :
                                Array.isArray(payload.requestedFixes) ? payload.requestedFixes : null;
        const requested_fixes_json = requested_fixes ? JSON.stringify(requested_fixes) : null;

        const repairs = Array.isArray(payload.repairs) ? payload.repairs : null;
        const repairs_json = repairs ? JSON.stringify(repairs) : null;

        const fixes = Array.isArray(payload.fixes) ? payload.fixes : null;
        const fixes_json = fixes ? JSON.stringify(fixes) : null;

        let applied_fixes = [];
        let skipped_fixes = [];
        let failed_fixes = [];

        if (Array.isArray(payload.repairs)) {
            payload.repairs.forEach(r => {
                if (!r) return;
                if (typeof r === 'string') {
                    applied_fixes.push(r);
                    return;
                }
                const fixName = r.fix || r.type || r.name || r.id || 'UNKNOWN_FIX';
                const rStatus = String(r.status || r.state || '').toUpperCase();
                
                if (rStatus === 'APPLIED' || rStatus === 'SUCCESS' || r.applied === true) {
                    applied_fixes.push(fixName);
                } else if (rStatus === 'SKIPPED') {
                    skipped_fixes.push(fixName);
                } else if (rStatus === 'FAILED' || rStatus === 'ERROR' || r.failed === true || r.error) {
                    failed_fixes.push(fixName);
                } else {
                    if (r.success !== false) {
                        applied_fixes.push(fixName);
                    } else {
                        failed_fixes.push(fixName);
                    }
                }
            });
        } else {
            if (Array.isArray(payload.applied_fixes)) applied_fixes = payload.applied_fixes;
            else if (Array.isArray(payload.appliedFixes)) applied_fixes = payload.appliedFixes;

            if (Array.isArray(payload.skipped_fixes)) skipped_fixes = payload.skipped_fixes;
            else if (Array.isArray(payload.skippedFixes)) skipped_fixes = payload.skippedFixes;

            if (Array.isArray(payload.failed_fixes)) failed_fixes = payload.failed_fixes;
            else if (Array.isArray(payload.failedFixes)) failed_fixes = payload.failedFixes;
        }

        const hasAppliedSource = repairs !== null || Array.isArray(payload.applied_fixes) || Array.isArray(payload.appliedFixes);
        const applied_fixes_json = hasAppliedSource || applied_fixes.length > 0 ? JSON.stringify(applied_fixes) : null;

        const hasSkippedSource = repairs !== null || Array.isArray(payload.skipped_fixes) || Array.isArray(payload.skippedFixes);
        const skipped_fixes_json = hasSkippedSource || skipped_fixes.length > 0 ? JSON.stringify(skipped_fixes) : null;

        const hasFailedSource = repairs !== null || Array.isArray(payload.failed_fixes) || Array.isArray(payload.failedFixes);
        const failed_fixes_json = hasFailedSource || failed_fixes.length > 0 ? JSON.stringify(failed_fixes) : null;

        const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts :
                          Array.isArray(payload.artifact_list) ? payload.artifact_list : null;
        const artifact_list_json = artifacts ? JSON.stringify(artifacts) : null;

        const degraded = payload.degraded === true || payload.isDegraded === true;
        const degraded_reasons = Array.isArray(payload.degradedReasons) ? payload.degradedReasons :
                                 Array.isArray(payload.degraded_reasons) ? payload.degraded_reasons : null;
        const degraded_reasons_json = degraded_reasons ? JSON.stringify(degraded_reasons) : null;

        const policy = payload.policy || null;
        const progress = status === 'COMPLETED' ? 100 : (payload.progress || 10);
        const canonical_payload_json = JSON.stringify(payload);
        const sync_error_json_str = syncErrorJson ? JSON.stringify(syncErrorJson) : null;

        const requestedFixesCount = Array.isArray(requested_fixes) ? requested_fixes.length : 0;
        const repairsCount = Array.isArray(repairs) ? repairs.length : 0;
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
                    sync_error_json = VALUES(sync_error_json),
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
    }
}

module.exports = new PreflightRegistrySyncService();
