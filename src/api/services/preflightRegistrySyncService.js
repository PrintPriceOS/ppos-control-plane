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
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
                ) ON DUPLICATE KEY UPDATE
                    source_job_id = VALUES(source_job_id),
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
}

module.exports = new PreflightRegistrySyncService();
