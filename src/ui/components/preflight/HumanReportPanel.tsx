import React from 'react';
import { useAdminQuery } from "../../hooks/useAdminData";
import { getAdminPreflightHumanReport } from "../../lib/adminApi";
import { 
    CheckCircleIcon, 
    ExclamationTriangleIcon, 
    InformationCircleIcon, 
    XCircleIcon, 
    ArrowDownTrayIcon, 
    DocumentTextIcon, 
    ClipboardDocumentIcon 
} from "@heroicons/react/24/outline";

interface HumanReportPanelProps {
    jobId: string;
}

export const HumanReportPanel: React.FC<HumanReportPanelProps> = ({ jobId }) => {
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
                </div>
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
                        {artifact_recommendations.length > 0 ? artifact_recommendations.map((art: any, i: number) => (
                            <div key={i} className={`p-3 border ppos-border flex flex-col gap-2 ${art.is_primary ? 'bg-primary/5 border-primary/20' : 'ppos-surface-muted'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <DocumentTextIcon className="w-4 h-4 text-slate-400" />
                                        <span className="text-xs font-bold text-slate-800 dark:text-[#ECECF1]">{art.filename}</span>
                                        {art.is_primary && (
                                            <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest">Primary</span>
                                        )}
                                        {art.is_customer_safe ? (
                                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest">Customer Safe</span>
                                        ) : (
                                            <span className="px-1.5 py-0.5 bg-slate-500/20 text-slate-600 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest">{art.customer_visible ? 'Operator' : 'Internal Only'}</span>
                                        )}
                                    </div>
                                    {art.downloadable && (
                                        <button 
                                            onClick={() => handleDownload(art.download_id, art.filename)}
                                            className="text-primary hover:text-primary/80 transition-colors p-1"
                                            title="Download File"
                                        >
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                
                                {art.secondary_aliases && art.secondary_aliases.length > 0 && (
                                    <p className="text-[9px] text-slate-400 font-mono">Also available as: {art.secondary_aliases.join(', ')}</p>
                                )}

                                <p className="text-[10px] text-slate-500 font-bold">{art.recommended_use}</p>
                                
                                {art.warning && (
                                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-bold bg-amber-500/10 px-2 py-1 mt-1 border border-amber-500/20">{art.warning}</p>
                                )}
                            </div>
                        )) : (
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
        </div>
    );
};
