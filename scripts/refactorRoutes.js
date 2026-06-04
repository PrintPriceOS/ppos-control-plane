const fs = require('fs');
let code = fs.readFileSync('src/api/routes/adminPreflightJobs.js', 'utf8');

// Replace the inside of GET /jobs/:jobId/artifacts
const getArtifactsRegex = /(router\.get\('\/jobs\/:jobId\/artifacts', async \(req, res\) => \{\s+const context = buildGatewayContext\(req\);\s+const \{ jobId \} = req\.params;\s+console\.log\(`\[CONTROL\]\[PREFLIGHT\]\[ARTIFACTS-LIVE-HYDRATION-START\] \$\{JSON\.stringify\(\{ jobId \}\)\}`\);\s+try \{)([\s\S]*?)(res\.json\(\{ \s+ok: true, \s+artifacts: normalized, \s+downloadable_artifact_count,\s+zero_byte_artifact_count,\s+physical_artifacts_ready,\s+message,\s+source_status: sourceStatus \s+\}\);\s+\} catch \(err\) \{\s+res\.status\(500\)\.json\(\{ ok: false, error: \{ message: err\.message \} \}\);\s+\}\s+\}\);)/;

const newGetArtifactsBody = `
        const hydrated = await hydratePreflightArtifacts(jobId, context);
        let message = undefined;
        if (!hydrated.physical_artifacts_ready && hydrated.artifacts.length > 0) {
            message = "Artifacts are registered but no downloadable bytes are available yet.";
        }

        console.log(\`[PRELIGHT-ARTIFACTS][NORMALIZED] \${JSON.stringify({
            jobId,
            artifact_count: hydrated.artifacts.length,
            downloadable_artifact_count: hydrated.downloadable_artifact_count,
            zero_byte_artifact_count: hydrated.zero_byte_artifact_count,
            physical_artifacts_ready: hydrated.physical_artifacts_ready,
            primary_fixed_pdf_selected: hydrated.primary_fixed_pdf_selected,
            aliases: hydrated.artifacts.map(a => a.alias)
        })}\`);

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
`;

code = code.replace(getArtifactsRegex, '$1\n' + newGetArtifactsBody);

// Update GET /jobs/:jobId/artifacts/:artifactId
const getDownloadRegex = /(router\.get\('\/jobs\/:jobId\/artifacts\/:artifactId', async \(req, res\) => \{)([\s\S]*?)(\/\/ Stream the bytes from upstream to the client)/;

const newGetDownloadBody = `
    const context = buildGatewayContext(req);
    const { jobId } = req.params;
    let { artifactId } = req.params;
    
    // Decode artifact IDs only if needed, but pass canonical artifactId safely
    if (artifactId && artifactId.includes('%')) {
        try {
            artifactId = decodeURIComponent(artifactId);
        } catch (e) {}
    }

    console.log(\`[CONTROL][PREFLIGHT][ARTIFACT-DOWNLOAD-RESOLVE-START] \${JSON.stringify({ jobId, requestedArtifactId: artifactId })}\`);

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
        console.log(\`[CONTROL][PREFLIGHT][ARTIFACT-DOWNLOAD-HYDRATED] \${JSON.stringify({ jobId, artifactCount: hydrated.artifacts.length, sourceStatus: hydrated.source_status })}\`);

        // 2. Resolve requested ID against normalized aliases
        const artifactRecord = resolveRequestedArtifact(hydrated.artifacts, artifactId);

        if (!artifactRecord) {
            console.log(\`[CONTROL][PREFLIGHT][ARTIFACT-DOWNLOAD-NOT-FOUND] \${JSON.stringify({
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
            })}\`);
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

        console.log(\`[CONTROL][PREFLIGHT][ARTIFACT-DOWNLOAD-RESOLVED] \${JSON.stringify({
            jobId,
            requestedArtifactId: artifactId,
            resolvedArtifactId,
            resolvedDownloadId: artifactRecord.download_id,
            resolvedType: artifactRecord.type,
            filename: artifactRecord.filename,
            sizeBytes: artifactRecord.size_bytes
        })}\`);

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
            res.setHeader('Content-Disposition', \`attachment; filename="\${artifactRecord.filename || artifactId}"\`);
        }

        $3`;

code = code.replace(getDownloadRegex, '$1' + newGetDownloadBody);
fs.writeFileSync('src/api/routes/adminPreflightJobs.js', code);
