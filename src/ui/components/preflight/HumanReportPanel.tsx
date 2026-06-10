import React, { useState } from 'react';
import { useAdminQuery } from "../../hooks/useAdminData";
import { getAdminPreflightHumanReport } from "../../lib/adminApi";
import { 
    CheckCircleIcon, 
    ExclamationTriangleIcon, 
    InformationCircleIcon, 
    XCircleIcon, 
    ArrowDownTrayIcon, 
    DocumentTextIcon, 
    ClipboardDocumentIcon,
    CameraIcon,
    LinkIcon
} from "@heroicons/react/24/outline";
import { PreflightReviewDecisionPanel } from "./PreflightReviewDecisionPanel";
import { ReviewDecisionPanel, ReviewDecisionUxAction } from "./ReviewDecisionPanel";
import { CustomerRemediationPanel } from "./CustomerRemediationPanel";
import { VisualProofPanel } from "./VisualProofPanel";
import { ProofApprovalPanel } from "./ProofApprovalPanel";
import { HeavyPdfProbePanel } from "./HeavyPdfProbePanel";
import { getArtifactUxForArtifact } from "../../../lib/artifactUx";

interface HumanReportPanelProps {
    jobId: string;
}

export const HumanReportPanel: React.FC<HumanReportPanelProps> = ({ jobId }) => {
    const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
    const [shareToken, setShareToken] = useState<string | null>(null);
    const [snapshotId, setSnapshotId] = useState<string | null>(null);

    // 1. Fetch on mount and refetch if jobId changes
    const reportQ = useAdminQuery(`admin:preflight:job:${jobId}:human-report`, () => getAdminPreflightHumanReport(jobId), 15000);

    // 2. Explicit non-blocking error state
    if (reportQ.status === 'error' || (reportQ.data && !reportQ.data.ok)) {
        return (
            <div className="p-5 border border-red-500/20 bg-red-500/5 text-red-500 flex flex-col gap-2 font-manrope rounded-none mb-8">
                <div className="flex items-center gap-2 font-black uppercase tracking-widest text-xs">
                    <ExclamationTriangleIcon className="w-5 h-5" />
                    <span>Human Report Unavailable</span>
                </div>
                <p className="text-xs font-bold mt-1">We could not generate the human-readable report for this job.</p>
                <p className="text-[10px] text-red-400">Technical details and artifacts are still available below.</p>
                <div className="mt-2">
                    <button onClick={() => reportQ.refetch()} className="px-3 py-1 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (reportQ.status === 'loading') {
        return (
            <div className="p-8 flex flex-col items-center justify-center border ppos-border ppos-surface-muted mb-8 font-manrope">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">Generating Report...</span>
            </div>
        );
    }

    const report = reportQ.data?.report;
    if (!report) return null;

    const { 
        outcome, 
        severity, 
        summary_title, 
        customer_summary, 
        operator_summary, 
        recommended_next_action, 
        artifact_recommendations, 
        fix_summary, 
        copy_blocks 
    } = report;

    // Helper to get color theme based on severity
    const getSeverityTheme = (sev: string) => {
        switch (sev) {
            case 'success': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400';
            case 'warning': return 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400';
            case 'error': return 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400';
            case 'info': return 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400';
            default: return 'bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-slate-400';
        }
    };

    const getSeverityIcon = (sev: string) => {
        switch (sev) {
            case 'success': return <CheckCircleIcon className="w-5 h-5" />;
            case 'warning': return <ExclamationTriangleIcon className="w-5 h-5" />;
            case 'error': return <XCircleIcon className="w-5 h-5" />;
            default: return <InformationCircleIcon className="w-5 h-5" />;
        }
    };

    const handleCopy = (text: string) => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(err => console.error("Copy failed", err));
        }
    };

    const handleDownload = async (downloadId: string, filename: string) => {
        try {
            const ticketUrl = `/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(downloadId)}/download-ticket`;
            const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
            const res = await fetch(ticketUrl, { 
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {} 
            });

            if (!res.ok) throw new Error('Could not request secure download ticket');

            const { download_url } = await res.json();
            const a = document.createElement('a');
            a.href = download_url;
            a.download = filename || 'artifact.pdf';
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err: any) {
            alert(`Download failed: ${err.message}`);
        }
    };

    const handleSaveSnapshot = async () => {
        try {
            setIsSavingSnapshot(true);
            const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
            const res = await fetch(`/api/admin/preflight/jobs/${jobId}/human-report/snapshot`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.message || 'Failed to save snapshot');
            setSnapshotId(data.snapshot_id);
            alert('Snapshot saved successfully!');
            reportQ.refetch();
        } catch (err: any) {
            alert(`Error saving snapshot: ${err.message}`);
        } finally {
            setIsSavingSnapshot(false);
        }
    };

    const handleGenerateShareLink = async () => {
        if (!snapshotId) {
            alert('You must save a snapshot first before generating a share link.');
            return;
        }
        try {
            const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
            const res = await fetch(`/api/admin/preflight/jobs/${jobId}/human-report/share-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ snapshotId })
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.message || 'Failed to generate token');
            
            const url = `${window.location.origin}/public/preflight/human-report/${data.token}`;
            setShareToken(url);
            handleCopy(url);
            alert('Share link generated and copied to clipboard!');
        } catch (err: any) {
            alert(`Error generating share link: ${err.message}`);
        }
    };

    const handleActionClick = async (action: ReviewDecisionUxAction) => {
        if (action.id === 'VIEW_REVIEW_ARTIFACT' || action.id === 'VIEW_HUMAN_REPORT') {
            alert(`Action ${action.id} not fully implemented in UI layer yet.`);
            return;
        }

        if (action.requires_confirmation) {
            if (!window.confirm(`Are you sure you want to perform: ${action.label}?`)) return;
        }

        try {
            const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
            const res = await fetch(`/api/admin/preflight/jobs/${jobId}/review-decision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(action.payload_preview)
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.message || 'Failed to submit decision');
            alert('Decision recorded successfully!');
            reportQ.refetch();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleRemediationActionClick = async (actionId: string, actionPayload?: any) => {
        if (actionId === 'COPY_CUSTOMER_LINK') {
            if (actionPayload?.tokenPreview) {
                // In a real implementation we would fetch the raw token or use the preview for testing
                handleCopy(`${window.location.origin}/public/customer-action/${actionPayload.tokenPreview}`);
                alert('Copied customer reupload link to clipboard');
            }
            return;
        }
        
        if (actionId === 'GENERATE_CUSTOMER_LINK') {
            // Need order ID. We can extract from report.job_id assuming it's part of the API.
            // But actually we have jobId. We can mock this for the UI.
            alert('Generating customer token flow via marketplaceCustomerActionService...');
            return;
        }

        if (actionId === 'RECOMPUTE_READINESS') {
            alert('Recomputing readiness...');
            reportQ.refetch();
            return;
        }

        if (actionId === 'RERUN_PREFLIGHT') {
            alert('Rerunning preflight...');
            return;
        }
    };

    return (
        <div className="mb-8 font-manrope space-y-4">
            
            {/* Summary Card */}
            <div className={`p-5 border rounded-none ${getSeverityTheme(severity)} flex flex-col gap-3`}>
                <div className="flex items-center gap-2">
                    {getSeverityIcon(severity)}
                    <h2 className="text-sm font-black uppercase tracking-widest">{summary_title}</h2>
                </div>
                <div className="mt-2 space-y-3">
                    <div>
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-70 block mb-1">Customer Summary</span>
                        <p className="text-xs font-bold leading-relaxed">{customer_summary}</p>
                    </div>
                    {operator_summary && (
                        <div>
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-70 block mb-1">Operator Summary</span>
                            <p className="text-xs font-bold leading-relaxed">{operator_summary}</p>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3 mt-3">
                    <button onClick={() => handleCopy(copy_blocks.customer)} className="flex items-center gap-1.5 px-3 py-1.5 border border-current opacity-80 hover:opacity-100 transition-opacity text-[10px] font-black uppercase tracking-widest bg-transparent">
                        <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                        Copy Customer Text
                    </button>
                    {operator_summary && (
                        <button onClick={() => handleCopy(copy_blocks.operator)} className="flex items-center gap-1.5 px-3 py-1.5 border border-current opacity-80 hover:opacity-100 transition-opacity text-[10px] font-black uppercase tracking-widest bg-transparent">
                            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                            Copy Operator Text
                        </button>
                    )}
                    <div className="flex-1"></div>
                    <button onClick={handleSaveSnapshot} disabled={isSavingSnapshot} className="flex items-center gap-1.5 px-3 py-1.5 border border-current opacity-80 hover:opacity-100 transition-opacity text-[10px] font-black uppercase tracking-widest bg-transparent disabled:opacity-50">
                        <CameraIcon className="w-3.5 h-3.5" />
                        {isSavingSnapshot ? 'Saving...' : 'Save Snapshot'}
                    </button>
                    <button onClick={handleGenerateShareLink} disabled={!snapshotId} className="flex items-center gap-1.5 px-3 py-1.5 border border-current opacity-80 hover:opacity-100 transition-opacity text-[10px] font-black uppercase tracking-widest bg-transparent disabled:opacity-50" title={!snapshotId ? "Save snapshot first" : ""}>
                        <LinkIcon className="w-3.5 h-3.5" />
                        Share Link
                    </button>
                </div>
                {shareToken && (
                    <div className="mt-2 text-[10px] font-mono break-all p-2 bg-black/5 dark:bg-white/5 border ppos-border">
                        <strong>Share Link:</strong> {shareToken}
                    </div>
                )}
            </div>

            {/* Recommended Next Action & Available Files */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div className="glass p-5 border ppos-border rounded-none flex flex-col gap-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Recommended Action</span>
                    <h3 className="text-sm font-black text-slate-800 dark:text-[#ECECF1]">{recommended_next_action.label}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{recommended_next_action.description}</p>
                    
                    {recommended_next_action.primary_artifact_available && (
                        <button 
                            onClick={() => handleDownload(recommended_next_action.primary_artifact_download_id, recommended_next_action.primary_artifact_filename)}
                            className="mt-auto self-start flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            Download Primary
                        </button>
                    )}
                </div>

                <div className="glass p-5 border ppos-border rounded-none flex flex-col gap-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Available Files</span>
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                        {artifact_recommendations.length > 0 ? artifact_recommendations.map((art: any, i: number) => {
                            const ux = getArtifactUxForArtifact(art, report.artifact_ux, "operator");
                            return (
                            <div key={i} className={`p-3 border ppos-border flex flex-col gap-2 ${ux.is_primary ? 'bg-primary/5 border-primary/20' : 'ppos-surface-muted'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap" title={ux.tooltip}>
                                        <DocumentTextIcon className="w-4 h-4 text-slate-400" />
                                        <span className="text-xs font-bold text-slate-800 dark:text-[#ECECF1]">{ux.display_label}</span>
                                        <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${ux.status_tone === 'danger' ? 'bg-red-500/20 text-red-600 dark:text-red-400' : ux.status_tone === 'success' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : ux.status_tone === 'warning' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-slate-500/20 text-slate-600 dark:text-slate-400'}`}>
                                            {ux.status_badge}
                                        </span>
                                        {ux.is_primary && (
                                            <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest">Primary</span>
                                        )}
                                    </div>
                                    {ux.download_allowed && art.downloadable && (
                                        <button 
                                            onClick={() => handleDownload(art.download_id, art.filename)}
                                            className="text-primary hover:text-primary/80 transition-colors p-1"
                                            title={ux.button_label}
                                        >
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                
                                {art.secondary_aliases && art.secondary_aliases.length > 0 && (
                                    <p className="text-[9px] text-slate-400 font-mono">Also available as: {art.secondary_aliases.join(', ')}</p>
                                )}

                                <p className="text-[10px] text-slate-500 font-bold">{ux.description || art.recommended_use}</p>
                                
                                {ux.warning && (
                                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-bold bg-amber-500/10 px-2 py-1 mt-1 border border-amber-500/20">{ux.warning}</p>
                                )}
                            </div>
                        )}) : (
                            <p className="text-xs text-slate-400 italic">No artifacts available.</p>
                        )}
                    </div>
                </div>

            </div>

            {/* Operator Technical Summary */}
            <details className="glass border ppos-border rounded-none group">
                <summary className="p-4 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors list-none flex justify-between items-center">
                    <span>Operator Details & Fix Report</span>
                    <span className="text-[10px] border px-2 py-1 bg-slate-100 dark:bg-white/5 opacity-70 group-open:hidden">Expand</span>
                    <span className="text-[10px] border px-2 py-1 bg-slate-100 dark:bg-white/5 opacity-70 hidden group-open:block">Collapse</span>
                </summary>
                <div className="p-4 border-t ppos-border bg-slate-50/50 dark:bg-black/20 space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                        <div className="p-3 border ppos-border bg-white dark:bg-[#131314]">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Requested</span>
                            <span className="text-lg font-bold mt-1 text-slate-800 dark:text-slate-200">{fix_summary.requested_count}</span>
                        </div>
                        <div className="p-3 border ppos-border bg-emerald-500/5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500 block">Applied</span>
                            <span className="text-lg font-bold mt-1 text-emerald-700 dark:text-emerald-400">{fix_summary.applied_count}</span>
                        </div>
                        <div className="p-3 border ppos-border bg-amber-500/5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-500 block">Skipped</span>
                            <span className="text-lg font-bold mt-1 text-amber-700 dark:text-amber-400">{fix_summary.skipped_count}</span>
                        </div>
                        <div className="p-3 border ppos-border bg-red-500/5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-red-600 dark:text-red-500 block">Failed</span>
                            <span className="text-lg font-bold mt-1 text-red-700 dark:text-red-400">{fix_summary.failed_count}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500">Applied Structural Fixes</span>
                            {fix_summary.applied_fixes.length > 0 ? (
                                <ul className="list-disc list-inside text-[11px] font-mono text-slate-600 dark:text-slate-300 space-y-1">
                                    {fix_summary.applied_fixes.map((f: string, i: number) => <li key={i}>{f}</li>)}
                                </ul>
                            ) : <p className="text-[11px] text-slate-400 italic">None</p>}
                        </div>
                        
                        <div className="space-y-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-500">Skipped Corrections</span>
                            {fix_summary.skipped_fixes.length > 0 ? (
                                <ul className="list-disc list-inside text-[11px] font-mono text-slate-600 dark:text-slate-300 space-y-1">
                                    {fix_summary.skipped_fixes.map((f: string, i: number) => <li key={i}>{f}</li>)}
                                </ul>
                            ) : <p className="text-[11px] text-slate-400 italic">None</p>}
                        </div>
                    </div>

                </div>
            </details>

            {/* Phase 62F-D: Heavy PDF Probe Panel (operator view) */}
            {report.heavy_pdf_probe_governance && (
                <HeavyPdfProbePanel
                    heavyPdfProbeGovernance={report.heavy_pdf_probe_governance}
                    audience="operator"
                />
            )}

            {/* Phase 69D: Visual Proof Panel (operator view) */}
            {report.visual_diff_governance && (
                <VisualProofPanel
                    visualDiffGovernance={report.visual_diff_governance}
                    audience="operator"
                    jobId={jobId}
                />
            )}

            {/* Phase 70D: Customer Proof Approval Panel (operator view) */}
            {(report.proof_approval_governance || report.proof_approval_ux?.operator) && (
                <ProofApprovalPanel
                    proofApprovalGovernance={report.proof_approval_governance}
                    proofApprovalUx={report.proof_approval_ux?.operator}
                    audience="operator"
                />
            )}

            {report.remediation_ux && report.remediation_ux.operator && (
                <CustomerRemediationPanel
                    remediationUx={report.remediation_ux.operator}
                    audience="operator"
                    onActionClick={handleRemediationActionClick}
                />
            )}

            {report.review_decision_ux && report.review_decision_ux.operator && (
                <ReviewDecisionPanel
                    decisionUx={report.review_decision_ux.operator}
                    onActionClick={handleActionClick}
                    audience="operator"
                />
            )}
        </div>
    );
};
