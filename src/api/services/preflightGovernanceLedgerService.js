const db = require('./mysqlClient');

// Phase 62D.1 — Type guard: safely coerce sync_error_json to a string for text operations.
// The DB column is declared JSON NULL, so drivers can return a string, an already-parsed
// object/array, null, or a number depending on version and ORM mode.
function normalizeSyncErrorText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(' ');
    try {
        return JSON.stringify(value);
    } catch {
        return String(value || '');
    }
}

// Define classification rules for raw events
const classificationRules = [
    { match: /SUBMITTED/i, category: 'submission', label: 'Job submitted', summary: 'The preflight job was submitted for processing.' },
    { match: /JOB_CREATED/i, category: 'submission', label: 'Job created', summary: 'The preflight job record was created.' },
    { match: /FILE_SELECTED/i, category: 'submission', label: 'File selected', summary: 'A PDF file was selected for preflight processing.' },
    { match: /PANEL_OPENED/i, category: 'ui', label: 'Upload panel opened', summary: 'The operator opened the preflight upload panel.' },
    { match: /GOVERNANCE_LEDGER_VIEWED/i, category: 'access', label: 'Governance ledger viewed', summary: 'The governance ledger was opened by an operator.' },
    { match: /VIEWED/i, category: 'access', label: 'Job viewed', summary: 'The job detail page was opened by an operator.' },
    { match: /FIX_TRIGGERED/i, category: 'autofix', label: 'Fix requested', summary: 'An automatic fix was requested for this preflight job.' },
    { match: /FIX_JOB_CREATED/i, category: 'autofix', label: 'Fix job created', summary: 'A child autofix job was created.' },
    { match: /LINKED_TO_PARENT/i, category: 'autofix', label: 'Fix job linked', summary: 'The autofix result was linked back to the original analysis job.' },
    { match: /EMPTY_OR_UNAVAILABLE/i, category: 'artifact', label: 'Artifacts unavailable', summary: 'The engine registered artifacts but no downloadable bytes were available.' },
    { match: /FIXED_PDF_READY/i, category: 'artifact', label: 'Fixed PDF ready', summary: 'A corrected PDF artifact is available for download.' },
    { match: /CERTIFIED_PDF_READY/i, category: 'artifact', label: 'Certified PDF ready', summary: 'A certified PDF artifact is available.' },
    { match: /ARTIFACTS_UPSTREAM_HYDRATED/i, category: 'artifact', label: 'Artifacts hydrated', summary: 'Downloadable artifacts were refreshed from the live upstream service.' },
    { match: /ARTIFACTS_REGISTRY_FALLBACK/i, category: 'sync', label: 'Registry fallback used', summary: 'The Control Plane used the persistent registry because live upstream hydration was unavailable.' },
    { match: /DOWNLOAD_REQUESTED/i, category: 'download', label: 'PDF download requested', summary: 'An operator requested an artifact download.' },
    { match: /DOWNLOAD_FAILED/i, category: 'download', label: 'PDF download failed', summary: 'An artifact download was attempted but failed.' },
    { match: /TICKET_CREATED/i, category: 'download', label: 'Download ticket created', summary: 'A short-lived secure download ticket was issued.' },
    { match: /TICKET_USED/i, category: 'download', label: 'Download ticket used', summary: 'A secure download ticket was used to stream an artifact.' },
    { match: /COMPLETED_WITH_FINDINGS/i, category: 'completion', label: 'Job completed with findings', summary: 'The job completed, but findings were detected.' },
    { match: /REVIEW_REQUIRED/i, category: 'completion', label: 'Review required', summary: 'The job completed but requires human review.' },
    { match: /COMPLETED/i, category: 'completion', label: 'Job completed', summary: 'The preflight job completed successfully.' },
    { match: /FAILED/i, category: 'completion', label: 'Job failed', summary: 'The preflight job failed.' },
    { match: /NOTIFICATION_CREATED/i, category: 'notification', label: 'Notification created', summary: 'A Control Plane notification was created for this event.' },
    { match: /HYDRATION_FAILED/i, category: 'hydration', label: 'Hydration failed', summary: 'Failed to hydrate live status from upstream.' },
    { match: /HYDRATION_SUCCESS/i, category: 'hydration', label: 'Hydration succeeded', summary: 'Live status was successfully fetched from upstream.' },
    { match: /JOB_SYNCED/i, category: 'sync', label: 'Job synchronized', summary: 'The job status was synchronized with the upstream preflight service.' }
];

function classifyGovernanceEvent(eventType, metadata) {
    const defaultRes = { category: 'system', label: eventType || 'Unknown Event', summary: `System event recorded: ${eventType}` };
    if (!eventType) return defaultRes;

    const upperEvent = String(eventType).toUpperCase();
    for (const rule of classificationRules) {
        if (rule.match.test(upperEvent)) {
            let label = rule.label;
            if (upperEvent.includes('FIXED') && rule.label.includes('PDF download requested')) {
                 label = 'Fixed PDF download requested';
            }
            return {
                category: rule.category,
                label,
                summary: rule.summary
            };
        }
    }
    
    // Fallback classification
    return { category: 'system', label: eventType, summary: `Action: ${eventType}` };
}

function deriveSeverity(eventType, status, metadata) {
    const upperEvent = String(eventType).toUpperCase();
    const upperStatus = String(status || '').toUpperCase();
    
    if (upperStatus === 'FAILURE' || upperStatus === 'ERROR') return 'error';
    if (upperEvent.includes('FAILED') || upperEvent.includes('EMPTY_OR_UNAVAILABLE') || upperEvent.includes('BLOCKED') || upperEvent.includes('REJECTED') || upperEvent.includes('404')) return 'error';
    
    if (upperEvent.includes('WARNING') || upperEvent.includes('DEGRADED') || upperEvent.includes('FINDINGS') || upperEvent.includes('REVIEW_REQUIRED') || upperEvent.includes('FALLBACK') || upperEvent.includes('TRIGGERED')) return 'warning';

    if (upperEvent.includes('READY') || upperEvent.includes('COMPLETED') && !upperEvent.includes('FINDINGS')) return 'success';
    if (upperStatus === 'SUCCESS') {
        if (upperEvent.includes('COMPLETED') || upperEvent.includes('READY')) return 'success';
        return 'info';
    }

    return 'info';
}

function deriveActor(row, metadata) {
    return {
        user_id: row.user_id || metadata?.operator_id || metadata?.userId || 'system',
        role: metadata?.actor_role || metadata?.role || metadata?.userRole || 'SYSTEM',
        label: row.user_id ? `User ${row.user_id}` : 'System'
    };
}

function mapAuditEventToLedgerEvent(row) {
    const metadata = row.metadata_json ? (typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json) : {};
    const { category, label, summary } = classifyGovernanceEvent(row.event_type, metadata);
    const severity = deriveSeverity(row.event_type, row.status, metadata);
    
    return {
        id: row.id,
        event_type: row.event_type,
        category,
        severity,
        status: row.status || 'SUCCESS',
        label,
        summary,
        actor: deriveActor(row, metadata),
        created_at: row.created_at,
        metadata,
        forensic: {
            trace_id: row.trace_id || metadata.trace_id || metadata.traceId || row.request_id || null,
            tenant_id: row.tenant_id,
            source: metadata.source || 'api_audit_logs'
        }
    };
}

async function getGovernanceLedger(jobId, context) {
    // 1. First pass: Find all related job IDs
    const relationSql = `
        SELECT metadata_json
        FROM api_audit_logs
        WHERE 
            tenant_id = ?
            AND (
                JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.job_id')) = ?
                OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.parent_job_id')) = ?
                OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.child_job_id')) = ?
                OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.fix_job_id')) = ?
                OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.latest_fix_job_id')) = ?
                OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.source_analyze_job_id')) = ?
                OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.entity_id')) = ?
                OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.artifact_job_id')) = ?
                OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.related_job_id')) = ?
            )
    `;
    
    const relParams = [
        context.tenantId,
        jobId, jobId, jobId, jobId, jobId, jobId, jobId, jobId, jobId
    ];

    let rows = [];
    let relatedJobs = new Set([jobId]);

    try {
        const relResult = await db.query(relationSql, relParams);
        const relRows = Array.isArray(relResult) && Array.isArray(relResult[0]) ? relResult[0] : (Array.isArray(relResult) ? relResult : []);
        
        for (const r of relRows) {
            const meta = typeof r.metadata_json === 'string' ? JSON.parse(r.metadata_json) : (r.metadata_json || {});
            if (meta.job_id) relatedJobs.add(meta.job_id);
            if (meta.parent_job_id) relatedJobs.add(meta.parent_job_id);
            if (meta.child_job_id) relatedJobs.add(meta.child_job_id);
            if (meta.fix_job_id) relatedJobs.add(meta.fix_job_id);
            if (meta.latest_fix_job_id) relatedJobs.add(meta.latest_fix_job_id);
            if (meta.source_analyze_job_id) relatedJobs.add(meta.source_analyze_job_id);
            if (meta.artifact_job_id) relatedJobs.add(meta.artifact_job_id);
            if (meta.related_job_id) relatedJobs.add(meta.related_job_id);
        }

        const targetJobs = Array.from(relatedJobs);
        const placeholders = targetJobs.map(() => '?').join(', ');
        
        // 2. Fetch all events for the related jobs
        const sql = `
            SELECT id, event_type, status, user_id, tenant_id, created_at, metadata_json
            FROM api_audit_logs
            WHERE 
                tenant_id = ?
                AND (
                    JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.job_id')) IN (${placeholders})
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.parent_job_id')) IN (${placeholders})
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.child_job_id')) IN (${placeholders})
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.fix_job_id')) IN (${placeholders})
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.latest_fix_job_id')) IN (${placeholders})
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.source_analyze_job_id')) IN (${placeholders})
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.entity_id')) IN (${placeholders})
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.artifact_job_id')) IN (${placeholders})
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.related_job_id')) IN (${placeholders})
                )
            ORDER BY created_at ASC
        `;

        const params = [context.tenantId];
        for (let i = 0; i < 9; i++) {
            params.push(...targetJobs);
        }

        const result = await db.query(sql, params);
        const rawRows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : (Array.isArray(result) ? result : []);
        
        // Ensure distinct rows
        const uniqueRows = new Map();
        for (const r of rawRows) {
             uniqueRows.set(r.id, r);
        }
        rows = Array.from(uniqueRows.values());

    } catch (err) {
        console.error('[GOVERNANCE-LEDGER] Failed to query audit logs:', err.message);
    }

    let ledger = rows.map(mapAuditEventToLedgerEvent);
    const rawEventCount = ledger.length;

    // Compact repeated VIEWED events
    const compactLedger = [];
    let currentGroup = null;

    for (const event of ledger) {
        if (event.event_type === 'PREFLIGHT_JOB_VIEWED') {
            if (!currentGroup) {
                currentGroup = {
                    ...event,
                    count: 1,
                    first_created_at: event.created_at,
                    last_created_at: event.created_at,
                    synthetic: false,
                    label: 'Job viewed repeatedly',
                    summary: `The job detail page was opened or refreshed 1 times during this period.`
                };
            } else {
                const timeDiff = new Date(event.created_at).getTime() - new Date(currentGroup.last_created_at).getTime();
                if (currentGroup.actor.user_id === event.actor.user_id && timeDiff <= 60000) {
                    currentGroup.count++;
                    currentGroup.last_created_at = event.created_at;
                    currentGroup.summary = `The job detail page was opened or refreshed ${currentGroup.count} times during this period.`;
                } else {
                    if (currentGroup.count === 1) {
                        currentGroup.label = 'Job viewed';
                        currentGroup.summary = 'The job detail page was opened by an operator.';
                    }
                    compactLedger.push(currentGroup);
                    currentGroup = {
                        ...event,
                        count: 1,
                        first_created_at: event.created_at,
                        last_created_at: event.created_at,
                        label: 'Job viewed repeatedly',
                        summary: `The job detail page was opened or refreshed 1 times during this period.`
                    };
                }
            }
        } else {
            if (currentGroup) {
                if (currentGroup.count === 1) {
                    currentGroup.label = 'Job viewed';
                    currentGroup.summary = 'The job detail page was opened by an operator.';
                }
                compactLedger.push(currentGroup);
                currentGroup = null;
            }
            compactLedger.push(event);
        }
    }
    if (currentGroup) {
        if (currentGroup.count === 1) {
            currentGroup.label = 'Job viewed';
            currentGroup.summary = 'The job detail page was opened by an operator.';
        }
        compactLedger.push(currentGroup);
    }

    ledger = compactLedger;

    // 2. Fetch registry state to build summary & synthetic events if needed
    let localRecord = null;
    let artifactSummary = {
        artifact_count: 0,
        downloadable_artifact_count: 0,
        zero_byte_artifact_count: 0,
        physical_artifacts_ready: false,
        primary_fixed_pdf_available: false,
        certified_pdf_available: false,
        report_available: false
    };
    
    let statusSummary = {
        status: 'UNKNOWN',
        display_status: 'UNKNOWN',
        upstream_status: 'UNKNOWN',
        registry_status: 'UNKNOWN',
        sourceStatus: 'UNKNOWN',
        progress: 0,
        terminal: false
    };

    try {
        const regRows = await db.query('SELECT * FROM preflight_job_registry WHERE job_id = ? AND tenant_id = ?', [jobId, context.tenantId]);
        localRecord = Array.isArray(regRows) && Array.isArray(regRows[0]) ? regRows[0][0] : (Array.isArray(regRows) ? regRows[0] : null);
        
        if (localRecord) {
            const canonicalData = localRecord.canonical_payload_json ? (typeof localRecord.canonical_payload_json === 'string' ? JSON.parse(localRecord.canonical_payload_json) : localRecord.canonical_payload_json) : {};
            const jobPayload = canonicalData.job || canonicalData;
            
            // Build Status Summary
            const currentStatus = jobPayload?.status || localRecord.status || 'UNKNOWN';
            const mappedStatus = currentStatus; // In full integration, we'd use mapPreflightStatus but basic mapped is fine for summary here or we can just rely on the API.
            
            const isTerminal = ['COMPLETED', 'COMPLETED_WITH_FINDINGS', 'COMPLETED_WITH_REVIEW', 'SUCCESS_WITH_FINDINGS', 'REVIEW_REQUIRED', 'AUTOFIX_REVIEW_REQUIRED', 'FAILED', 'DEGRADED', 'CANCELLED'].includes(currentStatus.toUpperCase());
            
            statusSummary = {
                status: currentStatus,
                display_status: mappedStatus,
                upstream_status: jobPayload?.status || 'UNKNOWN',
                registry_status: localRecord.status,
                sourceStatus: normalizeSyncErrorText(localRecord.sync_error_json).includes('live_hydration_disabled') ? 'PERSISTENT_REGISTRY' : 'LIVE_UPSTREAM', // Approximation (Phase 62D.1)
                progress: isTerminal ? 100 : (localRecord.progress || 10),
                terminal: isTerminal
            };

            // Build Artifact Summary
            let artifacts = jobPayload.artifacts || [];
            try {
                const preflightServiceClient = require('./preflightServiceClient');
                const liveArtifactsResponse = await preflightServiceClient.getJobArtifacts(jobId, context.Authorization, context.tenantId);
                if (liveArtifactsResponse && liveArtifactsResponse.physical_artifacts_ready && Array.isArray(liveArtifactsResponse.artifacts)) {
                    artifacts = liveArtifactsResponse.artifacts;
                }
            } catch (err) {
                console.warn('[GOVERNANCE-LEDGER] Live artifact hydration failed, using registry payload:', err.message);
            }

            const isDownloadable = (a) => (a.sizeBytes > 0 || a.size_bytes > 0) && (a.downloadable === true || a.path || a.url);

            artifactSummary.artifact_count = artifacts.length;
            artifactSummary.downloadable_artifact_count = artifacts.filter(isDownloadable).length;
            artifactSummary.zero_byte_artifact_count = artifacts.filter(a => (a.sizeBytes === 0 || a.size_bytes === 0) && a.type !== 'EMPTY').length;
            artifactSummary.physical_artifacts_ready = artifactSummary.downloadable_artifact_count > 0;
            
            const isReport = (a) => {
                const type = (a.type || '').toLowerCase();
                const alias = (a.alias || '').toLowerCase();
                const label = (a.label || '').toLowerCase();
                const filename = (a.filename || '').toLowerCase();
                const exactMatches = ['analysis_report', 'report_json', 'preflight_report', 'fix_audit', 'audit_json', 'certified_report', 'validation_report', 'diagnostic_report'];
                
                if (exactMatches.includes(type) || exactMatches.includes(alias)) return true;
                if (label.includes('report') || label.includes('audit') || label.includes('analysis')) return true;
                if (filename.includes('report') || filename.includes('audit')) return true;
                if (filename.endsWith('.json') && !type.includes('unknown')) return true;
                if (a.mime_type === 'application/json' && (filename.includes('report') || filename.includes('audit') || type.includes('report') || type.includes('audit'))) return true;
                return false;
            };
            const isCertified = (a) => ['certified_pdf', 'certified'].includes((a.type || a.alias || '').toLowerCase()) || (String(a.alias || '').toLowerCase() === 'production_pdf' && String(a.type || '').toLowerCase().includes('cert'));
            const isFixed = (a) => ['fixed_pdf', 'final_fixed_pdf'].includes((a.type || a.alias || '').toLowerCase()) || (String(a.alias || '').toLowerCase() === 'review_pdf' && String(a.type || '').toLowerCase().includes('fix'));

            artifactSummary.primary_fixed_pdf_available = artifacts.some(a => isFixed(a) && isDownloadable(a));
            artifactSummary.certified_pdf_available = artifacts.some(a => isCertified(a) && isDownloadable(a));
            artifactSummary.report_available = artifacts.some(a => isReport(a) && isDownloadable(a));
        }
    } catch(err) {
         console.error('[GOVERNANCE-LEDGER] Failed to query job registry:', err.message);
    }

    // 3. Fallback synthetic events
    if (ledger.length === 0 && localRecord) {
        ledger.push({
            id: `synth_${jobId}_1`,
            event_type: 'SYNTHETIC_REGISTRY_ENTRY',
            category: 'system',
            severity: 'info',
            status: 'SUCCESS',
            label: 'Job exists in registry',
            summary: `Job found in persistent registry. Current status: ${statusSummary.status}`,
            actor: { user_id: localRecord.operator_id || 'system', role: 'SYSTEM', label: 'System' },
            created_at: localRecord.created_at,
            metadata: { source_status: statusSummary.sourceStatus },
            forensic: { trace_id: null, tenant_id: context.tenantId, source: 'registry_fallback' },
            synthetic: true
        });

        if (statusSummary.terminal) {
             ledger.push({
                id: `synth_${jobId}_2`,
                event_type: 'SYNTHETIC_TERMINAL_STATE',
                category: 'completion',
                severity: statusSummary.status.includes('FAIL') ? 'error' : (statusSummary.status.includes('REVIEW') ? 'warning' : 'success'),
                status: 'SUCCESS',
                label: `Job reached ${statusSummary.status}`,
                summary: `Job reached terminal state ${statusSummary.status} according to registry.`,
                actor: { user_id: 'system', role: 'SYSTEM', label: 'System' },
                created_at: localRecord.updated_at,
                metadata: {},
                forensic: { trace_id: null, tenant_id: context.tenantId, source: 'registry_fallback' },
                synthetic: true
            });
        }
    }

    if (ledger.length === 0 && !localRecord) {
        return {
            ok: true,
            job_id: jobId,
            source: 'empty',
            event_count: 0,
            ledger: [],
            message: "No audit or registry records were found for this job."
        };
    }

    return {
        ok: true,
        job_id: jobId,
        source: ledger.some(l => l.synthetic) ? 'registry_fallback' : 'api_audit_logs',
        raw_event_count: rawEventCount,
        event_count: ledger.length,
        compacted_count: rawEventCount - ledger.length,
        ledger,
        status_summary: statusSummary,
        artifact_summary: artifactSummary
    };
}

module.exports = {
    getGovernanceLedger,
    mapAuditEventToLedgerEvent,
    classifyGovernanceEvent,
    humanizeGovernanceEvent: classifyGovernanceEvent,
    deriveSeverity,
    deriveActor
};
