const fs = require('fs');
let code = fs.readFileSync('src/api/routes/adminPreflightJobs.js', 'utf8');

const helpers = `
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
        console.log(\`[CONTROL][PREFLIGHT][ARTIFACTS-REGISTRY-FALLBACK] \${JSON.stringify({ jobId, reason: upstreamErr.message })}\`);
    }

    let normalized = [];
    let sourceStatus = 'PERSISTENT_REGISTRY';
    let downloadable_artifact_count = 0;
    let zero_byte_artifact_count = 0;
    
    if (liveArtifactsResponse && liveArtifactsResponse.physical_artifacts_ready && Array.isArray(liveArtifactsResponse.artifacts) && liveArtifactsResponse.artifacts.length > 0) {
        const uniqueByHashOrName = new Map();
        liveArtifactsResponse.artifacts.forEach(a => {
             const storageRef = a.storage_key || a.path || a.storagePath || '';
             const key = storageRef ? storageRef : \`\${a.filename}_\${a.size_bytes}\`;
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

            a.download_url = \`/api/admin/preflight/jobs/\${jobId}/artifacts/\${a.download_id}\`;
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

        a.download_url = a.download_url || \`/api/admin/preflight/jobs/\${jobId}/artifacts/\${a.download_id}\`;

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
`;

code = code.replace('// Helper: Log operational audit trails persistently', helpers + '\n\n// Helper: Log operational audit trails persistently');
fs.writeFileSync('src/api/routes/adminPreflightJobs.js', code);
