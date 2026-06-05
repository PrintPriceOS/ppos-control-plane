const { getGovernanceLedger } = require('./preflightGovernanceLedgerService');
const { getJobFromRegistry } = require('./preflightRegistrySyncService');
const preflightServiceClient = require('./preflightServiceClient');

async function getPreflightHumanReport(jobId, context) {
    try {
        // 1. Fetch data sources
        const ledgerRes = await getGovernanceLedger(jobId, context);
        if (!ledgerRes.ok) {
            throw new Error('Failed to retrieve governance ledger');
        }

        const registryJob = await getJobFromRegistry(jobId, context.tenantId);
        let liveArtifacts = [];
        try {
            const liveArtifactsResponse = await preflightServiceClient.getJobArtifacts(jobId, context.Authorization, context.tenantId);
            if (liveArtifactsResponse && Array.isArray(liveArtifactsResponse.artifacts)) {
                liveArtifacts = liveArtifactsResponse.artifacts;
            }
        } catch (err) {
            // Silently fallback to registry payload artifacts
        }

        const canonicalPayload = registryJob ? JSON.parse(registryJob.canonical_payload_json || '{}') : {};
        const jobResult = canonicalPayload.job ? canonicalPayload.job.result : {};
        const artifacts = liveArtifacts.length > 0 ? liveArtifacts : (canonicalPayload.artifacts || []);
        const rawFindings = jobResult?.findings || jobResult?.issues || canonicalPayload.job?.findings || [];
        
        const displayStatus = ledgerRes.status_summary.display_status;
        const statusSummary = ledgerRes.status_summary;
        const artifactSummary = ledgerRes.artifact_summary;

        // 2. Extract Findings
        let criticalCount = 0;
        let warningCount = 0;
        let infoCount = 0;
        let reviewRequired = false;

        const processedFindings = (Array.isArray(rawFindings) ? rawFindings : []).map(f => {
            const severity = (f.severity || '').toLowerCase();
            if (severity === 'critical' || severity === 'error') criticalCount++;
            else if (severity === 'warning') warningCount++;
            else infoCount++;

            if (f.review_required) reviewRequired = true;

            return {
                severity: severity || 'info',
                code: f.code || 'UNKNOWN',
                title: f.title || f.message || 'Diagnostic finding',
                description: f.description || f.message || '',
                customer_safe_description: f.customer_visible ? (f.description || f.message) : 'An internal technical check was logged.',
                recommended_action: f.recommended_action || null
            };
        });

        // 3. Derive Outcome & Severity
        let outcome = 'PROCESSING';
        let severity = 'info';
        
        if (statusSummary.terminal) {
            if (statusSummary.status.includes('FAILED') || statusSummary.display_status === 'FAILED' || (artifactSummary.zero_byte_artifact_count > 0 && !artifactSummary.physical_artifacts_ready)) {
                outcome = 'BLOCKED';
                severity = 'error';
            } else if (statusSummary.status.includes('REVIEW') || displayStatus.includes('REVIEW_REQUIRED') || reviewRequired) {
                outcome = 'REVIEW_REQUIRED';
                severity = 'warning';
            } else if (artifactSummary.certified_pdf_available) {
                outcome = 'CERTIFIED_READY';
                severity = (warningCount > 0) ? 'warning' : 'success';
            } else if (artifactSummary.primary_fixed_pdf_available) {
                outcome = 'FIXED_READY';
                severity = (warningCount > 0) ? 'warning' : 'success';
            } else if (artifactSummary.report_available) {
                outcome = 'ANALYSIS_ONLY';
                severity = (criticalCount > 0) ? 'error' : ((warningCount > 0) ? 'warning' : 'info');
            } else {
                outcome = 'BLOCKED';
                severity = 'error';
            }
        }

        // 4. Derive Decision & Recommended Next Action
        const decision = {
            production_ready: false,
            customer_action_required: false,
            operator_review_required: false,
            recommended_artifact_type: null
        };

        const recommendedNextAction = {
            code: '',
            label: '',
            description: ''
        };

        if (outcome === 'CERTIFIED_READY') {
            decision.production_ready = true;
            decision.recommended_artifact_type = 'certified_pdf';
            recommendedNextAction.code = 'USE_CERTIFIED_PDF';
            recommendedNextAction.label = 'Use Certified PDF';
            recommendedNextAction.description = 'The certified PDF is available and should be used as the production-ready artifact.';
        } else if (outcome === 'FIXED_READY') {
            decision.operator_review_required = true;
            decision.recommended_artifact_type = 'fixed_pdf';
            recommendedNextAction.code = 'USE_FIXED_PDF_OR_REVIEW';
            recommendedNextAction.label = 'Review Fixed PDF';
            recommendedNextAction.description = 'A fixed PDF is available. Review it before sending to production.';
        } else if (outcome === 'REVIEW_REQUIRED') {
            decision.operator_review_required = true;
            decision.recommended_artifact_type = artifactSummary.primary_fixed_pdf_available ? 'fixed_pdf' : null;
            recommendedNextAction.code = 'REVIEW_BEFORE_PRODUCTION';
            recommendedNextAction.label = 'Review Before Production';
            recommendedNextAction.description = 'The file was processed, but the result requires human review before production.';
        } else if (outcome === 'BLOCKED') {
            decision.customer_action_required = true;
            recommendedNextAction.code = 'REQUEST_NEW_FILE_OR_MANUAL_INTERVENTION';
            recommendedNextAction.label = 'Request New File or Manual Intervention';
            recommendedNextAction.description = 'The file could not be safely certified or corrected automatically.';
        } else if (outcome === 'ANALYSIS_ONLY') {
            decision.operator_review_required = true;
            decision.recommended_artifact_type = 'analysis_report';
            recommendedNextAction.code = 'REVIEW_REPORT_OR_TRIGGER_FIX';
            recommendedNextAction.label = 'Review Report or Trigger Fix';
            recommendedNextAction.description = 'The file was analyzed and a report is available. Review the findings or run autofix.';
        } else {
            recommendedNextAction.code = 'WAIT_FOR_COMPLETION';
            recommendedNextAction.label = 'Wait for Completion';
            recommendedNextAction.description = 'The job is still processing. You can leave this page and return later.';
        }

        // 5. Build Artifact Recommendation list
        const artifactList = [];
        for (const a of artifacts) {
            const isDownloadable = (a.sizeBytes > 0 || a.size_bytes > 0) && (a.downloadable === true || a.path || a.url);
            if (!isDownloadable) continue;

            const t = (a.type || a.alias || '').toLowerCase();
            const filename = (a.filename || a.path || '').toLowerCase();
            let normType = 'other';
            let label = a.label || 'Artifact';
            let customerVisible = false;

            if (t.includes('cert') || filename.includes('cert')) {
                normType = 'certified_pdf';
                label = 'Certified PDF';
                customerVisible = true;
            } else if (t.includes('fix') || filename.includes('fix')) {
                normType = 'fixed_pdf';
                label = 'Fixed PDF';
                customerVisible = (outcome !== 'REVIEW_REQUIRED');
            } else if (t.includes('report') || t.includes('audit') || filename.includes('report') || filename.includes('audit') || (filename.endsWith('.json') && !t.includes('unknown'))) {
                normType = 'analysis_report';
                label = 'Analysis Report';
            }

            artifactList.push({
                type: normType,
                original_type: a.type || a.alias,
                label,
                filename: a.filename || 'downloadable_file',
                size_bytes: a.size_bytes || a.sizeBytes || 0,
                downloadable: true,
                download_id: a.id || a.download_id,
                download_url: a.url || a.download_url,
                recommended_use: (normType === decision.recommended_artifact_type),
                customer_visible: customerVisible
            });
        }
        
        // Ensure primary recommended artifact type is highlighted
        const primaryArtifact = artifactList.find(a => a.recommended_use) || null;

        // 6. Build Summaries
        let summaryTitle = 'Preflight completed';
        if (outcome === 'CERTIFIED_READY') {
            summaryTitle = warningCount > 0 ? 'PDF certified with warnings' : 'PDF analyzed and certified';
        } else if (outcome === 'REVIEW_REQUIRED') {
            summaryTitle = 'Human review required';
        } else if (outcome === 'BLOCKED') {
            summaryTitle = 'Preflight blocked due to critical issues';
        } else if (outcome === 'ANALYSIS_ONLY') {
            summaryTitle = 'Analysis completed';
        } else if (outcome === 'PROCESSING') {
            summaryTitle = 'Preflight in progress';
        }

        let customerSummary = 'Your PDF has been checked.';
        if (outcome === 'CERTIFIED_READY') {
            customerSummary = 'Your PDF has been checked successfully. A certified version is available for download. ' + (warningCount > 0 ? 'We found some minor warnings, but the file is ready for production.' : 'The file is ready for production.');
        } else if (outcome === 'REVIEW_REQUIRED' || outcome === 'FIXED_READY') {
            customerSummary = 'Your PDF has been processed and a corrected version is available, but it requires operator review before proceeding.';
        } else if (outcome === 'BLOCKED') {
            customerSummary = 'The preflight process encountered critical issues that could not be automatically resolved. Please provide a new file or contact support.';
        } else if (outcome === 'ANALYSIS_ONLY') {
            customerSummary = 'The file analysis is complete. Our team will review the results to determine next steps.';
        } else {
            customerSummary = 'Your file is currently being processed. You will be notified when it is complete.';
        }

        const operatorSummary = `The job status is ${displayStatus}. ${artifactSummary.physical_artifacts_ready ? 'Artifacts are available.' : 'No usable artifacts generated.'} ${criticalCount} critical issues, ${warningCount} warnings found. ${recommendedNextAction.label}.`;
        
        const technicalSummary = `Live upstream status is ${statusSummary.upstream_status || 'UNKNOWN'}. Artifact hydration returned ${artifactSummary.downloadable_artifact_count} downloadable artifacts. Governance ledger compacted ${ledgerRes.raw_event_count} audit events into ${ledgerRes.compacted_count || ledgerRes.event_count} operator-facing entries. Trace ID: ${ledgerRes.ledger?.[0]?.forensic?.trace_id || 'N/A'}.`;

        const significantEvents = ledgerRes.ledger.slice(0, 5).map(l => l.label);

        return {
            ok: true,
            job_id: jobId,
            report_version: "43D.1",
            generated_at: new Date().toISOString(),
            status: statusSummary.status,
            display_status: displayStatus,
            decision,
            outcome,
            severity,
            summary_title: summaryTitle,
            customer_summary: customerSummary,
            operator_summary: operatorSummary,
            technical_summary: technicalSummary,
            recommended_next_action: recommendedNextAction,
            artifact_recommendation: {
                primary_artifact_type: primaryArtifact?.type || decision.recommended_artifact_type,
                primary_label: primaryArtifact?.label || (decision.recommended_artifact_type === 'certified_pdf' ? 'Certified PDF' : ''),
                primary_download_available: !!primaryArtifact,
                secondary_artifacts: artifactList.filter(a => !a.recommended_use)
            },
            findings_summary: {
                findings_count: processedFindings.length,
                critical_count: criticalCount,
                warning_count: warningCount,
                info_count: infoCount,
                review_required: reviewRequired,
                top_findings: processedFindings.slice(0, 5)
            },
            fixes_summary: {
                fix_requested: ledgerRes.ledger.some(l => l.event_type === 'PREFLIGHT_FIX_TRIGGERED' || l.category === 'autofix'),
                fix_job_id: null,
                fixes_applied: [],
                fixes_failed: [],
                fixes_skipped: []
            },
            governance_summary: {
                ledger_event_count: ledgerRes.event_count,
                raw_event_count: ledgerRes.raw_event_count,
                compacted_count: ledgerRes.compacted_count,
                last_significant_event: significantEvents[0] || 'Unknown',
                trace_id: ledgerRes.ledger?.[0]?.forensic?.trace_id || 'N/A',
                governance_ledger_available: true
            },
            sections: [
                { id: "overview", title: "Overview", severity, body: customerSummary },
                { id: "artifacts", title: "Available Files", severity: "success", body: `Found ${artifactList.length} downloadable files.` },
                { id: "findings", title: "Findings", severity: (criticalCount > 0 ? "error" : (warningCount > 0 ? "warning" : "success")), body: `Found ${processedFindings.length} findings.` },
                { id: "next_action", title: "Recommended Next Action", severity: "info", body: recommendedNextAction.description }
            ],
            artifacts: artifactList
        };

    } catch (err) {
        console.error('[HUMAN-REPORT] Failed to generate human report:', err);
        return {
            ok: false,
            error: err.message
        };
    }
}

module.exports = {
    getPreflightHumanReport
};
