const gateway = require('./preflightContractGateway');
const preflightServiceClient = require('./preflightServiceClient');
const db = require('./mysqlClient');
const governanceLedgerService = require('./preflightGovernanceLedgerService');

// Helper to determine the primary artifact
function selectPrimaryHumanArtifact(job, artifacts) {
    if (!Array.isArray(artifacts)) return null;

    const certPdf = artifacts.find(a => (a.type === 'certified_pdf' || a.alias === 'certified_pdf'));
    const reviewPdf = artifacts.find(a => (a.type === 'review_pdf' || a.alias === 'review_pdf'));
    const fixedPdf = artifacts.find(a => (a.type === 'fixed_pdf' || a.alias === 'fixed_pdf'));
    const deltaReport = artifacts.find(a => (a.type === 'delta_report' || a.alias === 'delta_report'));
    const reportJson = artifacts.find(a => (a.type === 'report_json' || a.alias === 'report_json'));
    const analysisReport = artifacts.find(a => (a.type === 'analysis_report' || a.alias === 'analysis_report'));

    // Rule 1: certified_pdf ONLY if production_certified=true AND customer_visible=true AND artifact_role=PRODUCTION_READY
    if (certPdf && 
        certPdf.production_certified === true && 
        certPdf.customer_visible === true && 
        certPdf.artifact_role === 'PRODUCTION_READY') {
        return certPdf;
    }

    // Rule 2: review_pdf if review_required true and downloadable
    if (job.review_required === true && reviewPdf && reviewPdf.downloadable) {
        return reviewPdf;
    }

    // Rule 3: fixed_pdf if downloadable
    if (fixedPdf && fixedPdf.downloadable) {
        return fixedPdf;
    }

    // Rule 4: delta_report if no PDF output but available
    if (deltaReport) {
        return deltaReport;
    }

    // Rule 5: analysis_report or report_json
    if (analysisReport) return analysisReport;
    if (reportJson) return reportJson;

    return null;
}

// Helper to translate fix strings to human readable text
function translateFixMessage(fixCode, isSkipped = false) {
    const code = String(fixCode || '').toUpperCase();
    if (code.includes('REBUILD_TRIMBOX')) return "Page geometry / TrimBox was rebuilt.";
    if (code.includes('APPLY_BLEED')) return "Bleed boxes were adjusted. Visual artwork was not extended automatically.";
    if (code.includes('INJECT_OUTPUT_INTENT')) return "OutputIntent was injected.";
    if (code.includes('CONVERT_CMYK')) return isSkipped 
        ? "CMYK conversion was skipped because explicit review mode is required." 
        : "Colors were converted to CMYK.";
    if (code.includes('STRIP_JAVASCRIPT')) return "Interactive JavaScript was removed.";
    if (code.includes('FLATTEN_ANNOTATIONS')) return "Annotations or annotation references were flattened/removed for print safety.";
    if (code.includes('FLATTEN_FORMS')) return "Interactive form fields were flattened or removed for print safety.";
    
    if (isSkipped) return "The issue was detected, but this correction is not currently supported automatically.";
    return `Applied structural correction: ${code}`;
}

async function getHumanReport(jobId, context, injectedJob = null, injectedArtifacts = null) {
    let job = injectedJob;
    let artifacts = injectedArtifacts;
    let sourceStatus = 'LOCAL';

    if (!job) {
        try {
            const upRes = await gateway.getJob(jobId, context);
            job = upRes?.job || upRes;
            sourceStatus = 'LIVE_UPSTREAM';
        } catch (err) {
            // fallback to local db
            const rows = await db.query('SELECT canonical_payload_json FROM preflight_job_registry WHERE job_id = ?', [jobId]);
            if (rows.length > 0) {
                const parsed = typeof rows[0].canonical_payload_json === 'string' ? JSON.parse(rows[0].canonical_payload_json) : rows[0].canonical_payload_json;
                job = parsed?.job || parsed;
                sourceStatus = 'LOCAL_FALLBACK';
            }
        }
    }

    if (!artifacts) {
        try {
            const liveArtifactsResponse = await preflightServiceClient.getJobArtifacts(jobId, context.Authorization, context.tenantId);
            artifacts = liveArtifactsResponse?.artifacts || [];
        } catch (err) {
            // Fallback artifacts
            artifacts = job?.artifacts || job?.artifact_list || [];
        }
    }

    if (!job) {
        return { ok: false, error: 'Job not found for human report generation' };
    }

    let appliedFixesRaw = job.applied_fixes || job.fix_summary?.applied_fixes || [];
    let skippedFixesRaw = job.skipped_fixes || job.fix_summary?.skipped_fixes || [];
    let failedFixesRaw = job.failed_fixes || job.fix_summary?.failed_fixes || [];
    const fixSummaryObj = job.fix_summary || {};

    // Fallback hydration from fix_audit
    if (appliedFixesRaw.length === 0 && skippedFixesRaw.length === 0 && 
        ((fixSummaryObj.applied_count > 0) || (fixSummaryObj.skipped_count > 0))) {
        
        let auditData = null;
        if (job.fix_audit) {
            auditData = job.fix_audit;
        } else {
            const fixAuditArtifact = artifacts.find(a => a.type === 'fix_audit' || a.alias === 'fix_audit' || a.filename === 'fix_audit.json');
            if (fixAuditArtifact) {
                if (fixAuditArtifact.metadata_json) {
                    auditData = typeof fixAuditArtifact.metadata_json === 'string' ? JSON.parse(fixAuditArtifact.metadata_json) : fixAuditArtifact.metadata_json;
                } else if (fixAuditArtifact.metadata) {
                    auditData = typeof fixAuditArtifact.metadata === 'string' ? JSON.parse(fixAuditArtifact.metadata) : fixAuditArtifact.metadata;
                } else if (fixAuditArtifact.raw) {
                    auditData = typeof fixAuditArtifact.raw === 'string' ? JSON.parse(fixAuditArtifact.raw) : fixAuditArtifact.raw;
                } else {
                    try {
                        const actualArtifactId = fixAuditArtifact.download_id || fixAuditArtifact.id || fixAuditArtifact.alias;
                        if (actualArtifactId) {
                            const streamRes = await preflightServiceClient.downloadArtifact(jobId, actualArtifactId, null, context.tenantId);
                            if (streamRes && streamRes.stream) {
                                if (typeof streamRes.stream.on === 'function') {
                                    auditData = await new Promise((resolve) => {
                                        let data = '';
                                        streamRes.stream.on('data', chunk => data += chunk.toString());
                                        streamRes.stream.on('end', () => {
                                            try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
                                        });
                                        streamRes.stream.on('error', () => resolve(null));
                                    });
                                } else {
                                    try {
                                        auditData = typeof streamRes.stream === 'string' ? JSON.parse(streamRes.stream) : streamRes.stream;
                                    } catch(e) {}
                                }
                            }
                        }
                    } catch (err) {
                        console.error('[HUMAN-REPORT] Failed to download fix_audit artifact for hydration', err.message);
                    }
                }
            }
        }

        if (auditData) {
            if (Array.isArray(auditData.applied_fixes)) {
                appliedFixesRaw = auditData.applied_fixes.map(f => f.code || f);
            }
            if (Array.isArray(auditData.skipped_fixes)) {
                skippedFixesRaw = auditData.skipped_fixes.map(f => f.code || f);
            }
            if (Array.isArray(auditData.failed_fixes)) {
                failedFixesRaw = auditData.failed_fixes.map(f => f.code || f);
            }
        }
    }

    // Default structural mapping
    let outcome = "UNKNOWN";
    let severity = "neutral";
    let summaryTitle = "Preflight Status Unknown";
    let customerSummary = "The PDF status could not be determined.";
    let operatorSummary = "Check raw technical details.";
    let recommendedAction = {
        action_id: "wait",
        label: "Wait for completion",
        description: "The system is still processing.",
        severity: "neutral",
        primary_artifact_type: null,
        primary_artifact_download_id: null,
        primary_artifact_filename: null,
        primary_artifact_available: false
    };

    const certLevel = job.certification_level || job.certificationLevel;
    const isReviewReq = job.review_required === true || job.reviewRequired === true;
    const isProdCert = job.production_certified === true || job.productionCertified === true;
    
    const primaryArtifact = selectPrimaryHumanArtifact(job, artifacts);

    if (certLevel === "CERTIFIED_READY" && isProdCert && !isReviewReq && primaryArtifact?.artifact_role === 'PRODUCTION_READY') {
        outcome = "CERTIFIED_READY";
        severity = "success";
        summaryTitle = "PDF certified and ready for production";
        customerSummary = "Your PDF passed preflight and a certified production-ready file is available.";
        operatorSummary = "File is certified for immediate production routing.";
        recommendedAction = {
            action_id: "use_certified",
            label: "Use Certified PDF",
            description: "Download the production-certified PDF for manufacturing.",
            severity: "success",
            primary_artifact_type: primaryArtifact?.type || null,
            primary_artifact_download_id: primaryArtifact?.download_id || primaryArtifact?.id || null,
            primary_artifact_filename: primaryArtifact?.filename || null,
            primary_artifact_available: !!primaryArtifact
        };
    } else if (certLevel === "FIXED_REVIEW_REQUIRED" && isReviewReq) {
        outcome = "FIXED_REVIEW_REQUIRED";
        severity = "warning";
        summaryTitle = "PDF fixed, review required before production";
        customerSummary = "The PDF was corrected structurally, but it requires review before production.";
        
        let opDetails = [];
        
        const certPdf = artifacts.find(a => (a.type === 'certified_pdf' || a.alias === 'certified_pdf'));
        if (certPdf && (!certPdf.production_certified || !certPdf.customer_visible)) {
            opDetails.push("certified.pdf exists physically but is not production-certified and should not be customer-visible.");
        }

        const applied = appliedFixesRaw;
        const skipped = skippedFixesRaw;
        applied.forEach(f => opDetails.push(translateFixMessage(f.code || f)));
        skipped.forEach(f => opDetails.push(translateFixMessage(f.code || f, true)));
        
        operatorSummary = opDetails.length > 0 ? opDetails.join(" ") : "Review the fixed PDF and the technical change summary before releasing it.";
        
        recommendedAction = {
            action_id: "review_fixed",
            label: "Review Fixed PDF",
            description: "A fixed PDF is available, but human verification is required due to structural changes.",
            severity: "warning",
            primary_artifact_type: primaryArtifact?.type || null,
            primary_artifact_download_id: primaryArtifact?.download_id || primaryArtifact?.alias || primaryArtifact?.id || null,
            primary_artifact_filename: primaryArtifact?.filename || null,
            primary_artifact_available: !!primaryArtifact
        };
    } else if (certLevel === "FIXED_READY" && !isReviewReq && !isProdCert) {
        outcome = "FIXED_READY";
        severity = "info";
        summaryTitle = "PDF fixed and ready for operator use";
        customerSummary = "The PDF was corrected and no additional review requirement was flagged.";
        operatorSummary = "Fixed PDF available for standard routing. Not fully production-certified.";
        recommendedAction = {
            action_id: "use_fixed",
            label: "Use Fixed PDF",
            description: "Download the fixed file.",
            severity: "info",
            primary_artifact_type: primaryArtifact?.type || null,
            primary_artifact_download_id: primaryArtifact?.download_id || primaryArtifact?.alias || primaryArtifact?.id || null,
            primary_artifact_filename: primaryArtifact?.filename || null,
            primary_artifact_available: !!primaryArtifact
        };
    } else if (certLevel === "ANALYSIS_ONLY") {
        outcome = "ANALYSIS_ONLY";
        severity = "info";
        summaryTitle = "PDF analyzed only";
        customerSummary = "The PDF was analyzed. No corrected production file was generated.";
        operatorSummary = "Analysis completed. Review the analysis report for findings.";
        recommendedAction = {
            action_id: "review_analysis",
            label: "Review Analysis Report",
            description: "View the diagnostic results.",
            severity: "info",
            primary_artifact_type: primaryArtifact?.type || null,
            primary_artifact_download_id: primaryArtifact?.download_id || primaryArtifact?.alias || primaryArtifact?.id || null,
            primary_artifact_filename: primaryArtifact?.filename || null,
            primary_artifact_available: !!primaryArtifact
        };
    } else if (certLevel === "BLOCKED" || job.status === "FAILED") {
        outcome = "BLOCKED";
        severity = "error";
        summaryTitle = "PDF blocked";
        customerSummary = "The PDF cannot be used for production in its current state.";
        operatorSummary = "Job is blocked. Critical failures or zero-byte artifacts detected.";
        recommendedAction = {
            action_id: "request_upload",
            label: "Request corrected file upload",
            description: "The file cannot be processed automatically. A new upload is required.",
            severity: "error",
            primary_artifact_type: null,
            primary_artifact_download_id: null,
            primary_artifact_filename: null,
            primary_artifact_available: false
        };
    } else if (['PROCESSING', 'PENDING', 'RUNNING'].includes(job.status)) {
        outcome = "PROCESSING";
        severity = "neutral";
        summaryTitle = "Preflight is still processing";
        customerSummary = "The PDF is still being checked or corrected.";
        operatorSummary = "Execution is still in progress upstream.";
        recommendedAction = {
            action_id: "wait",
            label: "Wait for completion",
            description: "Job is not yet in a terminal state.",
            severity: "neutral",
            primary_artifact_type: null,
            primary_artifact_download_id: null,
            primary_artifact_filename: null,
            primary_artifact_available: false
        };
    }

    // Process artifact recommendations for deduplication
    const groupedArtifacts = {};
    (artifacts || []).forEach(a => {
        const key = a.filename + '_' + a.size_bytes;
        if (!groupedArtifacts[key]) {
            groupedArtifacts[key] = { ...a, secondary_aliases: [] };
        } else {
            // Group the aliases
            if (a.alias && !groupedArtifacts[key].secondary_aliases.includes(a.alias)) {
                groupedArtifacts[key].secondary_aliases.push(a.alias);
            }
        }
    });

    const dedupedArtifacts = Object.values(groupedArtifacts).map((a) => {
        const isPrimary = primaryArtifact && (
            (primaryArtifact.id && primaryArtifact.id === a.id) ||
            (primaryArtifact.download_id && primaryArtifact.download_id === a.download_id) ||
            (primaryArtifact.filename === a.filename && primaryArtifact.size_bytes === a.size_bytes)
        );

        let warning = null;
        if (a.type === 'certified_pdf' && (!a.production_certified || !a.customer_visible)) {
            warning = "Not production-certified and should not be customer-visible.";
        }

        return {
            type: a.type || a.alias || 'OUTPUT',
            filename: a.filename || a.name || 'document.pdf',
            label: a.label || a.alias || a.type,
            downloadable: a.downloadable !== false && a.size_bytes > 0,
            production_certified: a.production_certified === true,
            customer_visible: a.customer_visible === true,
            artifact_role: a.artifact_role || 'INTERNAL',
            recommended_use: a.recommended_use || 'Internal review only.',
            is_primary: isPrimary,
            is_customer_safe: a.customer_visible === true && a.production_certified === true,
            warning: warning,
            download_id: a.download_id || a.alias || a.id,
            secondary_aliases: a.secondary_aliases || []
        };
    });

    // Governance
    let govSummary = { event_count: 0, source: 'UNAVAILABLE', compacted_count: 0 };
    try {
        const gov = await governanceLedgerService.getGovernanceLedger(jobId, context);
        if (gov && gov.events) {
            govSummary = {
                event_count: gov.events.length,
                source: 'LEDGER',
                compacted_count: gov.events.length
            };
        }
    } catch (err) {
        // Safe to ignore, we don't depend on it
    }

    const reportPayload = {
        outcome,
        severity,
        summary_title: summaryTitle,
        customer_summary: customerSummary,
        operator_summary: operatorSummary,
        technical_summary: job.summary || job.analysis?.summary || '',
        recommended_next_action: recommendedAction,
        artifact_recommendations: dedupedArtifacts,
        fix_summary: {
            requested_count: fixSummaryObj.requested_count || job.requested_fixes?.length || 0,
            applied_count: fixSummaryObj.applied_count || appliedFixesRaw.length || 0,
            skipped_count: fixSummaryObj.skipped_count || skippedFixesRaw.length || 0,
            failed_count: fixSummaryObj.failed_count || failedFixesRaw.length || 0,
            applied_fixes: appliedFixesRaw.map(f => translateFixMessage(f.code || f)),
            skipped_fixes: skippedFixesRaw.map(f => translateFixMessage(f.code || f, true)),
            failed_fixes: failedFixesRaw.map(f => f.code || f),
            review_required: isReviewReq,
            production_certified: isProdCert,
            highest_risk_level: job.risk_level || 'UNKNOWN'
        },
        findings_summary: {
            critical: job.issue_count || 0,
            warning: 0,
            info: 0,
            review_required: isReviewReq
        },
        governance_summary: govSummary,
        copy_blocks: {
            customer: customerSummary,
            operator: operatorSummary
        }
    };

    return {
        ok: true,
        job_id: jobId,
        generated_at: new Date().toISOString(),
        source_status: sourceStatus,
        report: reportPayload
    };
}

module.exports = {
    getHumanReport,
    selectPrimaryHumanArtifact
};
